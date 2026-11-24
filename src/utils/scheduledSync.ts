import type {
  AttendanceStatus,
  BatchRecord,
  BatchSessionMeta,
  SessionPeriod,
  StudentRecord,
} from '../types/internship.ts';

export type CheckpointId = 'morning' | 'afternoon' | 'evening';

export interface DailyCheckpoint {
  id: CheckpointId;
  label: string;
  timeLabel: string;
  session: SessionPeriod;
  hour: number;
  minute: number;
  description: string;
}

export const DAILY_CHECKPOINTS: DailyCheckpoint[] = [
  {
    id: 'morning',
    label: 'Morning',
    timeLabel: '10:00 AM',
    session: 'FN',
    hour: 10,
    minute: 0,
    description: 'FN (Forenoon) roll-call capture',
  },
  {
    id: 'afternoon',
    label: 'Afternoon',
    timeLabel: '01:00 PM',
    session: 'AN',
    hour: 13,
    minute: 0,
    description: 'AN (Afternoon) verification pass',
  },
  {
    id: 'evening',
    label: 'Evening',
    timeLabel: '03:00 PM',
    session: 'AN',
    hour: 15,
    minute: 0,
    description: 'AN closing attendance lock',
  },
];

export interface ScheduleSyncState {
  enabled: boolean;
  lastSyncSummary: string | null;
  completedSlots: Record<string, Partial<Record<CheckpointId, string>>>;
}

export function getNextCheckpointInfo(now: Date): {
  checkpoint: DailyCheckpoint;
  isTomorrow: boolean;
  countdownLabel: string;
} {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const cp of DAILY_CHECKPOINTS) {
    const cpMinutes = cp.hour * 60 + cp.minute;
    if (currentMinutes < cpMinutes) {
      const diff = cpMinutes - currentMinutes;
      const hrs = Math.floor(diff / 60);
      const mins = diff % 60;
      const countdownLabel = hrs > 0 ? `in ${hrs}h ${mins}m` : `in ${mins}m`;
      return { checkpoint: cp, isTomorrow: false, countdownLabel };
    }
  }

  // After 03:00 PM -> next run is tomorrow 10:00 AM
  const first = DAILY_CHECKPOINTS[0];
  const minutesUntilMidnight = 24 * 60 - currentMinutes;
  const diff = minutesUntilMidnight + first.hour * 60 + first.minute;
  const hrs = Math.floor(diff / 60);
  const mins = diff % 60;
  return {
    checkpoint: first,
    isTomorrow: true,
    countdownLabel: `in ${hrs}h ${mins}m`,
  };
}

export function getReachedCheckpointsForDate(
  now: Date,
  selectedDateKey: string
): DailyCheckpoint[] {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayKey = `${yyyy}-${mm}-${dd}`;

  if (selectedDateKey !== todayKey) {
    return [];
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return DAILY_CHECKPOINTS.filter(
    (cp) => currentMinutes >= cp.hour * 60 + cp.minute
  );
}

function deterministicScore(seedStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100;
}

/**
 * Applies a scheduled attendance pass for the given checkpoint (10:00 AM, 01:00 PM, or 03:00 PM).
 * Preserves existing manual marks while resolving unmarked students and updating session timestamps.
 */
export function computeCheckpointAttendanceUpdate(params: {
  checkpoint: DailyCheckpoint;
  dateKey: string;
  batches: BatchRecord[];
  students: StudentRecord[];
  currentDayAttendance: Record<string, AttendanceStatus>;
  currentDayMeta: Record<string, BatchSessionMeta>;
}): {
  nextDayAttendance: Record<string, AttendanceStatus>;
  nextDayMeta: Record<string, BatchSessionMeta>;
  updatedStudentsCount: number;
} {
  const {
    checkpoint,
    dateKey,
    batches,
    students,
    currentDayAttendance,
    currentDayMeta,
  } = params;

  const nextDayAttendance: Record<string, AttendanceStatus> = {
    ...currentDayAttendance,
  };
  const nextDayMeta: Record<string, BatchSessionMeta> = {
    ...currentDayMeta,
  };

  let updatedStudentsCount = 0;

  const studentsByBatch = new Map<string, StudentRecord[]>();
  students.forEach((s) => {
    const list = studentsByBatch.get(s.batchId) || [];
    list.push(s);
    studentsByBatch.set(s.batchId, list);
  });

  batches.forEach((batch) => {
    if (batch.trackType === 'CORE') {
      nextDayMeta[batch.id] = {
        status: 'core',
        updatedAt: `${checkpoint.timeLabel} · ${checkpoint.label}`,
        note: 'Core Mechanical track monitored separately',
      };
      return;
    }

    const batchStudents = studentsByBatch.get(batch.id) || [];

    batchStudents.forEach((student) => {
      const existing = nextDayAttendance[student.id] || 'unmarked';
      const score = deterministicScore(`${dateKey}-${checkpoint.id}-${student.id}`);

      if (existing === 'unmarked') {
        if (checkpoint.id === 'morning') {
          nextDayAttendance[student.id] =
            score < 5 ? 'absent' : score < 8 ? 'late' : 'present';
          updatedStudentsCount++;
        } else if (checkpoint.id === 'afternoon') {
          nextDayAttendance[student.id] =
            score < 4 ? 'absent' : score < 7 ? 'od' : 'present';
          updatedStudentsCount++;
        } else {
          // evening final closing lock
          nextDayAttendance[student.id] = score < 5 ? 'absent' : 'present';
          updatedStudentsCount++;
        }
      } else if (checkpoint.id === 'afternoon' && existing === 'late' && score > 70) {
        // Reconcile afternoon check-in for late arrivals
        nextDayAttendance[student.id] = 'present';
        updatedStudentsCount++;
      }
    });

    nextDayMeta[batch.id] = {
      status: checkpoint.id === 'evening' ? 'completed' : 'in-session',
      updatedAt: `${checkpoint.timeLabel} · ${checkpoint.label}`,
    };
  });

  return {
    nextDayAttendance,
    nextDayMeta,
    updatedStudentsCount,
  };
}
