import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  LayoutDashboard,
  Menu,
  Minus,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sun,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { AttendanceCharts } from './components/AttendanceCharts';
import { BatchDetailDrawer } from './components/BatchDetailDrawer';
import { DailySummaryModal } from './components/DailySummaryModal';
import { DirectoryView } from './components/DirectoryView';
import { ScheduleHeatmapView } from './components/ScheduleHeatmapView';
import { StudentRosterView } from './components/StudentRosterView';
import {
  AttendanceStatus,
  BatchRecord,
  BatchSessionMeta,
  BatchSessionStatus,
  DashboardView,
  StudentRecord,
} from './types/internship';
import {
  buildBatchSummaryCsv,
  buildStudentRollCallCsv,
  FALLBACK_CSV_TEXT,
  generateInitialAttendanceState,
  generateInternshipDays,
  generateStudentsForBatches,
  parseInternshipCsv,
  SOURCE_CSV_URL,
} from './utils/csvParser';
import {
  computeCheckpointAttendanceUpdate,
  DAILY_CHECKPOINTS,
  DailyCheckpoint,
  getNextCheckpointInfo,
  getReachedCheckpointsForDate,
  ScheduleSyncState,
} from './utils/scheduledSync';

const STORAGE_KEY = 'cohorttrack_b2025_state_v1';
const THEME_STORAGE_KEY = 'cohorttrack_theme_v1';
const SCHEDULE_STORAGE_KEY = 'cohorttrack_schedule_v1';

interface PersistedState {
  programTitle: string;
  dateRange: string;
  batches: BatchRecord[];
  dailyAttendance: Record<string, Record<string, AttendanceStatus>>;
  sessionMeta: Record<string, Record<string, BatchSessionMeta>>;
}

type SortKey = 'department' | 'enrolled' | 'attendance' | 'room';

export default function App() {
  const days = useMemo(() => generateInternshipDays(), []);
  const workingDays = useMemo(() => days.filter((d) => !d.isSunday), [days]);

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore storage access errors
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Core data state
  const [loading, setLoading] = useState(true);
  const [programTitle, setProgramTitle] = useState(
    'Fullstack Internship B2025-2029 - II Year'
  );
  const [dateRange, setDateRange] = useState('24.11.2026 - 12.12.2026');
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [dailyAttendance, setDailyAttendance] = useState<
    Record<string, Record<string, AttendanceStatus>>
  >({});
  const [sessionMeta, setSessionMeta] = useState<
    Record<string, Record<string, BatchSessionMeta>>
  >({});

  // UI state
  const [activeView, setActiveView] = useState<DashboardView>('overview');
  const [selectedDateKey, setSelectedDateKey] = useState<string>(
    workingDays[0]?.dateKey || '2026-11-24'
  );
  const [drawerBatchId, setDrawerBatchId] = useState<string | null>(null);
  const [drawerInitialTab, setDrawerInitialTab] = useState<'rollcall' | 'allocation'>(
    'rollcall'
  );
  const [isDailySummaryOpen, setIsDailySummaryOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Filters & sorting in Overview table
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BatchSessionStatus>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('department');
  const [sortAsc, setSortAsc] = useState(true);

  // Optional user-controlled live roll-call check-in simulation
  const [isLiveSimulating, setIsLiveSimulating] = useState(false);
  const [lastLiveEvent, setLastLiveEvent] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Daily 3-slot scheduled auto-update state (10:00 AM, 01:00 PM, 03:00 PM)
  const [clockNow, setClockNow] = useState<Date>(() => new Date());
  const [scheduleState, setScheduleState] = useState<ScheduleSyncState>(() => {
    try {
      const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ScheduleSyncState;
        if (typeof parsed?.enabled === 'boolean') {
          return {
            enabled: parsed.enabled,
            lastSyncSummary: parsed.lastSyncSummary || null,
            completedSlots: parsed.completedSlots || {},
          };
        }
      }
    } catch {
      // ignore storage errors
    }
    return {
      enabled: true,
      lastSyncSummary: null,
      completedSlots: {},
    };
  });

  const students: StudentRecord[] = useMemo(
    () => generateStudentsForBatches(batches),
    [batches]
  );

  const initializeFromCsvText = useCallback(
    (csvText: string) => {
      const parsed = parseInternshipCsv(csvText);
      const genStudents = generateStudentsForBatches(parsed.batches);
      const initial = generateInitialAttendanceState(
        parsed.batches,
        genStudents,
        days
      );
      setProgramTitle(parsed.programTitle);
      setDateRange(parsed.dateRange);
      setBatches(parsed.batches);
      setDailyAttendance(initial.dailyAttendance);
      setSessionMeta(initial.sessionMeta);
      setSelectedDateKey(workingDays[0]?.dateKey || '2026-11-24');
    },
    [days, workingDays]
  );

  // Initial load from localStorage or attached CSV file
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const rawSaved = localStorage.getItem(STORAGE_KEY);
        if (rawSaved) {
          const parsedSaved = JSON.parse(rawSaved) as PersistedState;
          if (parsedSaved?.batches?.length > 0) {
            if (!cancelled) {
              setProgramTitle(parsedSaved.programTitle);
              setDateRange(parsedSaved.dateRange);
              setBatches(parsedSaved.batches);
              setDailyAttendance(parsedSaved.dailyAttendance || {});
              setSessionMeta(parsedSaved.sessionMeta || {});
              setLoading(false);
            }
            return;
          }
        }
      } catch {
        // Fallback to CSV fetch
      }

      try {
        const res = await fetch(SOURCE_CSV_URL);
        const text = res.ok ? await res.text() : FALLBACK_CSV_TEXT;
        if (!cancelled) {
          initializeFromCsvText(text);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          initializeFromCsvText(FALLBACK_CSV_TEXT);
          setLoading(false);
        }
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [initializeFromCsvText]);

  // Persist changes to localStorage
  useEffect(() => {
    if (loading || batches.length === 0) return;
    try {
      const payload: PersistedState = {
        programTitle,
        dateRange,
        batches,
        dailyAttendance,
        sessionMeta,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage quota errors
    }
  }, [loading, programTitle, dateRange, batches, dailyAttendance, sessionMeta]);

  const currentDay = useMemo(
    () => workingDays.find((d) => d.dateKey === selectedDateKey) || workingDays[0],
    [workingDays, selectedDateKey]
  );

  const dayAttendance = useMemo(
    () => dailyAttendance[selectedDateKey] || {},
    [dailyAttendance, selectedDateKey]
  );

  const daySessionMeta = useMemo(
    () => sessionMeta[selectedDateKey] || {},
    [sessionMeta, selectedDateKey]
  );

  const studentsByBatch = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    students.forEach((s) => {
      const list = map.get(s.batchId) || [];
      list.push(s);
      map.set(s.batchId, list);
    });
    return map;
  }, [students]);

  const formatTimeNow = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Update a single student's attendance
  const handleSetStudentStatus = useCallback(
    (studentId: string, status: AttendanceStatus) => {
      const student = students.find((s) => s.id === studentId);
      setDailyAttendance((prev) => ({
        ...prev,
        [selectedDateKey]: {
          ...(prev[selectedDateKey] || {}),
          [studentId]: status,
        },
      }));
      if (student) {
        setSessionMeta((prev) => {
          const dayMeta = prev[selectedDateKey] || {};
          const existing = dayMeta[student.batchId];
          if (existing?.status === 'pending' || !existing) {
            return {
              ...prev,
              [selectedDateKey]: {
                ...dayMeta,
                [student.batchId]: {
                  status: 'in-session',
                  updatedAt: formatTimeNow(),
                },
              },
            };
          }
          return {
            ...prev,
            [selectedDateKey]: {
              ...dayMeta,
              [student.batchId]: {
                ...existing,
                updatedAt: formatTimeNow(),
              },
            },
          };
        });
      }
    },
    [selectedDateKey, students]
  );

  // Bulk update a batch's students
  const handleBulkSetBatchStatus = useCallback(
    (batchId: string, status: AttendanceStatus, onlyUnmarked = false) => {
      const list = studentsByBatch.get(batchId) || [];
      setDailyAttendance((prev) => {
        const nextDay = { ...(prev[selectedDateKey] || {}) };
        list.forEach((s) => {
          if (!onlyUnmarked || !nextDay[s.id] || nextDay[s.id] === 'unmarked') {
            nextDay[s.id] = status;
          }
        });
        return { ...prev, [selectedDateKey]: nextDay };
      });
      setSessionMeta((prev) => ({
        ...prev,
        [selectedDateKey]: {
          ...(prev[selectedDateKey] || {}),
          [batchId]: {
            status: status === 'unmarked' ? 'pending' : 'completed',
            updatedAt: status === 'unmarked' ? 'Awaiting roll call' : formatTimeNow(),
          },
        },
      }));
    },
    [selectedDateKey, studentsByBatch]
  );

  // Quick +/- 1 present student adjustment right from the main batch table
  const handleQuickAdjustPresent = useCallback(
    (batchId: string, delta: 1 | -1) => {
      const list = studentsByBatch.get(batchId) || [];
      const currentMap = dailyAttendance[selectedDateKey] || {};

      if (delta === 1) {
        // Find first unmarked or absent student and mark present
        const target =
          list.find((s) => !currentMap[s.id] || currentMap[s.id] === 'unmarked') ||
          list.find((s) => currentMap[s.id] === 'absent') ||
          list.find((s) => currentMap[s.id] === 'late');
        if (target) {
          handleSetStudentStatus(target.id, 'present');
        }
      } else {
        // Find last present student and mark absent
        const reversed = [...list].reverse();
        const target = reversed.find((s) => currentMap[s.id] === 'present');
        if (target) {
          handleSetStudentStatus(target.id, 'absent');
        }
      }
    },
    [dailyAttendance, handleSetStudentStatus, selectedDateKey, studentsByBatch]
  );

  const handleSetSessionStatus = useCallback(
    (batchId: string, status: BatchSessionStatus) => {
      setSessionMeta((prev) => ({
        ...prev,
        [selectedDateKey]: {
          ...(prev[selectedDateKey] || {}),
          [batchId]: {
            status,
            updatedAt: status === 'pending' ? 'Awaiting roll call' : formatTimeNow(),
          },
        },
      }));
    },
    [selectedDateKey]
  );

  const handleUpdateBatch = useCallback((updated: BatchRecord) => {
    setBatches((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }, []);

  // Optional live check-in simulator
  useEffect(() => {
    if (!isLiveSimulating) return;
    const timer = window.setInterval(() => {
      const currentMap = dailyAttendance[selectedDateKey] || {};
      const unmarkedStudents = students.filter(
        (s) => !currentMap[s.id] || currentMap[s.id] === 'unmarked'
      );

      if (unmarkedStudents.length > 0) {
        const pick =
          unmarkedStudents[Math.floor(Math.random() * unmarkedStudents.length)];
        const roll = Math.random();
        const status: AttendanceStatus =
          roll < 0.88 ? 'present' : roll < 0.95 ? 'late' : 'absent';
        handleSetStudentStatus(pick.id, status);
        setLastLiveEvent(
          `${pick.rollNumber} (${pick.department}) marked ${status}`
        );
      } else {
        // Cycle a random student between present and late/od if everyone is marked
        const itStudents = students;
        if (itStudents.length === 0) return;
        const pick = itStudents[Math.floor(Math.random() * itStudents.length)];
        const nextStatus: AttendanceStatus =
          currentMap[pick.id] === 'present' ? 'late' : 'present';
        handleSetStudentStatus(pick.id, nextStatus);
        setLastLiveEvent(
          `${pick.rollNumber} (${pick.department}) updated to ${nextStatus}`
        );
      }
    }, 1800);

    return () => window.clearInterval(timer);
  }, [
    isLiveSimulating,
    dailyAttendance,
    selectedDateKey,
    students,
    handleSetStudentStatus,
  ]);

  // Persist scheduled sync state
  useEffect(() => {
    try {
      localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(scheduleState));
    } catch {
      // ignore
    }
  }, [scheduleState]);

  const handleRunCheckpoint = useCallback(
    (checkpoint: DailyCheckpoint, targetDateKey = selectedDateKey) => {
      if (batches.length === 0 || students.length === 0) return;

      const currentDayAtt = dailyAttendance[targetDateKey] || {};
      const currentDayMeta = sessionMeta[targetDateKey] || {};

      const { nextDayAttendance, nextDayMeta, updatedStudentsCount } =
        computeCheckpointAttendanceUpdate({
          checkpoint,
          dateKey: targetDateKey,
          batches,
          students,
          currentDayAttendance: currentDayAtt,
          currentDayMeta,
        });

      setDailyAttendance((prev) => ({
        ...prev,
        [targetDateKey]: nextDayAttendance,
      }));
      setSessionMeta((prev) => ({
        ...prev,
        [targetDateKey]: nextDayMeta,
      }));

      const stamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      setScheduleState((prev) => ({
        ...prev,
        lastSyncSummary: `${checkpoint.label} (${checkpoint.timeLabel}) ran at ${stamp} · ${updatedStudentsCount} records synced`,
        completedSlots: {
          ...prev.completedSlots,
          [targetDateKey]: {
            ...(prev.completedSlots[targetDateKey] || {}),
            [checkpoint.id]: stamp,
          },
        },
      }));
    },
    [batches, students, dailyAttendance, sessionMeta, selectedDateKey]
  );

  // Clock watcher for automatic 10:00 AM, 01:00 PM, and 03:00 PM daily updates
  useEffect(() => {
    const checkSchedule = () => {
      const now = new Date();
      setClockNow(now);

      if (!scheduleState.enabled || loading || batches.length === 0) return;

      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayKey = `${yyyy}-${mm}-${dd}`;
      const isWorkingInternshipDay = workingDays.some(
        (d) => d.dateKey === todayKey
      );
      if (!isWorkingInternshipDay) return;

      const reached = getReachedCheckpointsForDate(now, todayKey);
      const completedToday = scheduleState.completedSlots[todayKey] || {};
      const due = reached.filter((cp) => !completedToday[cp.id]);

      if (due.length > 0) {
        // Execute the latest due checkpoint for today
        const latestDue = due[due.length - 1];
        handleRunCheckpoint(latestDue, todayKey);
      }
    };

    checkSchedule();
    const interval = window.setInterval(checkSchedule, 20000);
    return () => window.clearInterval(interval);
  }, [
    scheduleState.enabled,
    scheduleState.completedSlots,
    loading,
    batches.length,
    workingDays,
    handleRunCheckpoint,
  ]);

  const nextScheduleInfo = useMemo(
    () => getNextCheckpointInfo(clockNow),
    [clockNow]
  );

  const activeDayCompletedSlots = useMemo(
    () => scheduleState.completedSlots[selectedDateKey] || {},
    [scheduleState.completedSlots, selectedDateKey]
  );

  // Populate Week 1 realistic logs on demand in Schedule Heatmap view
  const handlePopulateWeekPreview = useCallback(() => {
    const firstFive = workingDays.slice(0, 5);
    setDailyAttendance((prev) => {
      const next = { ...prev };
      firstFive.forEach((day, dIdx) => {
        if (next[day.dateKey] && Object.keys(next[day.dateKey]).length > 0) {
          return;
        }
        const dayMap: Record<string, AttendanceStatus> = {};
        students.forEach((s, sIdx) => {
          const v = (sIdx * 17 + dIdx * 31 + s.rollNumber.charCodeAt(4)) % 100;
          if (v < 5 + dIdx) dayMap[s.id] = 'absent';
          else if (v < 8 + dIdx) dayMap[s.id] = 'late';
          else if (v === 11) dayMap[s.id] = 'od';
          else dayMap[s.id] = 'present';
        });
        next[day.dateKey] = dayMap;
      });
      return next;
    });
    setSessionMeta((prev) => {
      const next = { ...prev };
      firstFive.forEach((day) => {
        const metaMap: Record<string, BatchSessionMeta> = {
          ...(next[day.dateKey] || {}),
        };
        batches.forEach((b) => {
          if (!metaMap[b.id]) {
            metaMap[b.id] = {
              status: b.trackType === 'CORE' ? 'core' : 'completed',
              updatedAt: '09:30 AM',
            };
          }
        });
        next[day.dateKey] = metaMap;
      });
      return next;
    });
  }, [batches, students, workingDays]);

  // Compute global KPI stats for selected date
  const kpiStats = useMemo(() => {
    const itBatches = batches.filter((b) => b.trackType === 'IT');
    const totalEnrolled = itBatches.reduce((sum, b) => sum + b.studentCount, 0);
    let present = 0;
    let late = 0;
    let od = 0;
    let absent = 0;
    let unmarked = 0;

    students.forEach((s) => {
      const st = dayAttendance[s.id] || 'unmarked';
      if (st === 'present') present++;
      else if (st === 'late') late++;
      else if (st === 'od') od++;
      else if (st === 'absent') absent++;
      else unmarked++;
    });

    const attended = present + late + od;
    const attendanceRate =
      totalEnrolled > 0 ? ((attended / totalEnrolled) * 100).toFixed(1) : '0.0';

    let pendingBatches = 0;
    itBatches.forEach((b) => {
      const meta = daySessionMeta[b.id];
      const list = studentsByBatch.get(b.id) || [];
      const anyMarked = list.some(
        (s) => dayAttendance[s.id] && dayAttendance[s.id] !== 'unmarked'
      );
      if (meta?.status === 'pending' || (!meta && !anyMarked)) {
        pendingBatches++;
      }
    });

    const activePartners = new Set(
      itBatches
        .map((b) => b.organisation)
        .filter((o) => o && o !== 'Unassigned')
    ).size;

    const assignedRooms = new Set(
      itBatches.map((b) => b.roomNumber).filter(Boolean)
    ).size;

    return {
      totalEnrolled,
      totalBatches: batches.length,
      itBatchCount: itBatches.length,
      present,
      late,
      od,
      absent,
      unmarked,
      attended,
      attendanceRate,
      pendingBatches,
      activePartners,
      assignedRooms,
    };
  }, [batches, students, dayAttendance, daySessionMeta, studentsByBatch]);

  // Enrich batches with live counts for the main table
  const enrichedBatches = useMemo(() => {
    return batches.map((batch) => {
      const list = studentsByBatch.get(batch.id) || [];
      let present = 0;
      let late = 0;
      let od = 0;
      let absent = 0;
      let unmarked = 0;

      list.forEach((s) => {
        const st = dayAttendance[s.id] || 'unmarked';
        if (st === 'present') present++;
        else if (st === 'late') late++;
        else if (st === 'od') od++;
        else if (st === 'absent') absent++;
        else unmarked++;
      });

      const attended = present + late + od;
      const pct =
        batch.studentCount > 0 ? (attended / batch.studentCount) * 100 : 0;

      const explicitMeta = daySessionMeta[batch.id];
      let resolvedStatus: BatchSessionStatus = 'pending';
      if (batch.trackType === 'CORE') {
        resolvedStatus = 'core';
      } else if (explicitMeta) {
        resolvedStatus = explicitMeta.status;
      } else if (unmarked === batch.studentCount) {
        resolvedStatus = 'pending';
      } else if (unmarked === 0) {
        resolvedStatus = 'completed';
      } else {
        resolvedStatus = 'in-session';
      }

      return {
        batch,
        present,
        late,
        od,
        absent,
        unmarked,
        attended,
        pct,
        sessionStatus: resolvedStatus,
        updatedAt: explicitMeta?.updatedAt || (resolvedStatus === 'pending' ? 'Awaiting roll call' : '—'),
      };
    });
  }, [batches, studentsByBatch, dayAttendance, daySessionMeta]);

  const filteredTableRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = enrichedBatches.filter((row) => {
      if (selectedOrg !== 'ALL' && row.batch.organisation !== selectedOrg) {
        return false;
      }
      if (statusFilter !== 'ALL' && row.sessionStatus !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        row.batch.department.toLowerCase().includes(q) ||
        row.batch.organisation.toLowerCase().includes(q) ||
        row.batch.venue.toLowerCase().includes(q) ||
        row.batch.roomNumber.toLowerCase().includes(q) ||
        row.batch.expertName.toLowerCase().includes(q) ||
        row.batch.facultyIncharge.some((f) => f.toLowerCase().includes(q))
      );
    });

    return list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'department') {
        cmp = a.batch.department.localeCompare(b.batch.department);
      } else if (sortKey === 'enrolled') {
        cmp = a.batch.studentCount - b.batch.studentCount;
      } else if (sortKey === 'attendance') {
        cmp = a.pct - b.pct;
      } else if (sortKey === 'room') {
        cmp = (a.batch.roomNumber || 'zzz').localeCompare(
          b.batch.roomNumber || 'zzz'
        );
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [enrichedBatches, selectedOrg, statusFilter, searchQuery, sortKey, sortAsc]);

  const drawerBatch = useMemo(
    () => batches.find((b) => b.id === drawerBatchId) || null,
    [batches, drawerBatchId]
  );

  const drawerSessionStatus: BatchSessionStatus = useMemo(() => {
    if (!drawerBatch) return 'pending';
    const found = enrichedBatches.find((r) => r.batch.id === drawerBatch.id);
    return found?.sessionStatus || 'pending';
  }, [drawerBatch, enrichedBatches]);

  const triggerDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportBatchCsv = () => {
    const csv = buildBatchSummaryCsv(
      selectedDateKey,
      batches,
      students,
      dayAttendance
    );
    triggerDownload(`B2025-2029_Batch_Attendance_${selectedDateKey}.csv`, csv);
  };

  const handleExportStudentsCsv = () => {
    const csv = buildStudentRollCallCsv(
      selectedDateKey,
      batches,
      students,
      dayAttendance
    );
    triggerDownload(`B2025-2029_Student_RollCall_${selectedDateKey}.csv`, csv);
  };

  const handleImportCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        initializeFromCsvText(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleResetToSource = async () => {
    setIsLiveSimulating(false);
    setLastLiveEvent(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SCHEDULE_STORAGE_KEY);
    setScheduleState({
      enabled: true,
      lastSyncSummary: null,
      completedSlots: {},
    });
    try {
      const res = await fetch(SOURCE_CSV_URL);
      const text = res.ok ? await res.text() : FALLBACK_CSV_TEXT;
      initializeFromCsvText(text);
    } catch {
      initializeFromCsvText(FALLBACK_CSV_TEXT);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const navItems: {
    id: DashboardView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'overview', label: 'Overview & Tracking', icon: LayoutDashboard },
    { id: 'students', label: 'Student Roster', icon: Users },
    { id: 'directory', label: 'Partners & Venues', icon: Building2 },
    { id: 'schedule', label: '17-Day Schedule', icon: CalendarDays },
  ];

  const renderSessionStatus = (st: BatchSessionStatus) => {
    switch (st) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case 'in-session':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400">
            <Clock className="w-3.5 h-3.5" />
            In Session
          </span>
        );
      case 'core':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            CORE Track
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5" />
            Pending
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 flex transition-colors duration-150">
      {/* Hidden CSV file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleImportCsvFile}
        className="hidden"
      />

      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 shrink-0 bg-white dark:bg-[#111827] border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex-1 overflow-y-auto pb-4">
          {/* Brand Header */}
          <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              CohortTrack
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Primary Views */}
          <nav className="p-3 space-y-1" aria-label="Primary sections">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveView(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Daily 3-Slot Auto-Update Schedule (10 AM, 1 PM, 3 PM) */}
          <div className="mx-3 mt-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Daily Auto-Update
              </span>
              <button
                type="button"
                onClick={() =>
                  setScheduleState((prev) => ({ ...prev, enabled: !prev.enabled }))
                }
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  scheduleState.enabled
                    ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {scheduleState.enabled ? 'Active' : 'Paused'}
              </button>
            </div>

            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {scheduleState.enabled ? (
                <>
                  Next: {nextScheduleInfo.isTomorrow ? 'Tomorrow ' : ''}
                  {nextScheduleInfo.checkpoint.timeLabel} ({nextScheduleInfo.countdownLabel})
                </>
              ) : (
                'Scheduled updates paused'
              )}
            </div>

            <div className="space-y-1.5 pt-0.5">
              {DAILY_CHECKPOINTS.map((cp) => {
                const doneTime = activeDayCompletedSlots[cp.id];
                return (
                  <div
                    key={cp.id}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {cp.label}
                      </span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {cp.timeLabel}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRunCheckpoint(cp)}
                      title={`Run ${cp.label} (${cp.timeLabel}) attendance update now`}
                      className={`px-2 py-0.5 rounded border text-[10px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                        doneTime
                          ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {doneTime ? `Done ${doneTime}` : 'Run Now'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Check-in Simulator Control */}
          <div className="mx-3 mt-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Live Check-In Stream
              </span>
              <button
                type="button"
                onClick={() => setIsLiveSimulating((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  isLiveSimulating
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {isLiveSimulating ? (
                  <>
                    <Pause className="w-3 h-3" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    Start
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {isLiveSimulating
                ? lastLiveEvent || 'Recording live roll-call check-ins...'
                : 'Stream simulated student check-ins across active venues.'}
            </p>
          </div>
        </div>

        {/* Bottom Workspace Utilities: Theme Switcher & CSV Actions */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
          {/* Light / Dark Theme Segmented Control */}
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-1 mb-1.5">
              Appearance
            </div>
            <div
              className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
              role="group"
              aria-label="Theme switcher"
            >
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                Light
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  theme === 'dark'
                    ? 'bg-[#1E293B] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                Dark
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              Import CSV
            </button>
            <button
              type="button"
              onClick={handleResetToSource}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Data
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-6 lg:px-8 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
              <span className="font-medium text-slate-900 dark:text-white truncate">
                B2025-2029 Fullstack
              </span>
              <span aria-hidden="true">/</span>
              <span className="truncate">
                {navItems.find((n) => n.id === activeView)?.label}
              </span>
              <span aria-hidden="true" className="hidden sm:inline">
                /
              </span>
              <span className="hidden sm:inline font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {currentDay?.dayLabel} ({currentDay?.label})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Quick Day Selector */}
            <select
              value={selectedDateKey}
              onChange={(e) => setSelectedDateKey(e.target.value)}
              aria-label="Select internship session day"
              className="hidden sm:block text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {workingDays.map((d) => (
                <option key={d.dateKey} value={d.dateKey}>
                  {d.dayLabel} · {d.label} ({d.weekday})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExportBatchCsv}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </header>

        {/* Main Workspace Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-6">
          {loading ? (
            /* Skeleton Loading State */
            <div className="space-y-6 animate-pulse">
              <div className="h-20 rounded-xl bg-slate-200/70 dark:bg-slate-800/60" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl bg-slate-200/70 dark:bg-slate-800/60"
                  />
                ))}
              </div>
              <div className="h-72 rounded-xl bg-slate-200/70 dark:bg-slate-800/60" />
            </div>
          ) : (
            <>
              {/* Overview & Live Tracking View */}
              {activeView === 'overview' && (
                <div className="space-y-6">
                  {/* Program Context Header */}
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight text-balance">
                        {programTitle}
                      </h1>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                        <span className="font-mono tabular-nums">{dateRange}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {kpiStats.totalEnrolled} IT Students
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{kpiStats.totalBatches} Department Batches (18 IT + 1 CORE)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setIsDailySummaryOpen(true)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        <ClipboardList className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        Daily Summary
                      </button>

                      {/* Mobile Day Picker */}
                      <div className="sm:hidden flex-1">
                      <select
                        value={selectedDateKey}
                        onChange={(e) => setSelectedDateKey(e.target.value)}
                        aria-label="Select internship session day"
                        className="w-full text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-3 py-2"
                      >
                        {workingDays.map((d) => (
                          <option key={d.dateKey} value={d.dateKey}>
                            {d.dayLabel} · {d.label} ({d.weekday})
                          </option>
                        ))}
                      </select>
                      </div>
                    </div>
                  </div>

                  {/* Daily 3-Slot Auto-Update Bar */}
                  <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                        <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        Scheduled Daily Sync (10:00 AM · 01:00 PM · 03:00 PM)
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {scheduleState.lastSyncSummary
                          ? scheduleState.lastSyncSummary
                          : scheduleState.enabled
                          ? `Next automatic pass: ${nextScheduleInfo.isTomorrow ? 'Tomorrow ' : ''}${nextScheduleInfo.checkpoint.timeLabel} (${nextScheduleInfo.countdownLabel})`
                          : 'Auto-schedule paused'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {DAILY_CHECKPOINTS.map((cp) => {
                        const doneTime = activeDayCompletedSlots[cp.id];
                        return (
                          <button
                            key={cp.id}
                            type="button"
                            onClick={() => handleRunCheckpoint(cp)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                              doneTime
                                ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {cp.label} {cp.timeLabel}
                            {doneTime ? ` · ${doneTime}` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 4-Column KPI Strip */}
                  <section
                    aria-label="Daily attendance summary"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                  >
                    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Total Cohort Enrolled
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <span className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          {kpiStats.totalEnrolled}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {kpiStats.itBatchCount} IT batches
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Plus Mech (CORE Track) · {kpiStats.activePartners} partners
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Attended ({currentDay?.label})
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <span className="text-3xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {kpiStats.attended}
                        </span>
                        <span className="text-sm font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {kpiStats.attendanceRate}%
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        Present {kpiStats.present} · Late {kpiStats.late} · OD {kpiStats.od}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Absent & Unmarked
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <span className="text-3xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
                          {kpiStats.absent}
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {kpiStats.unmarked} unmarked
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Across {kpiStats.itBatchCount} tracked IT sections
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Roll Call Completion
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <span className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          {kpiStats.itBatchCount - kpiStats.pendingBatches}/{kpiStats.itBatchCount}
                        </span>
                        <span className="text-xs font-mono tabular-nums text-amber-700 dark:text-amber-400">
                          {kpiStats.pendingBatches} pending
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {kpiStats.assignedRooms} active training rooms
                      </div>
                    </div>
                  </section>

                  {/* Interactive Session Day Strip */}
                  <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {workingDays.map((day) => {
                        const isSelected = day.dateKey === selectedDateKey;
                        const hasMarks =
                          dailyAttendance[day.dateKey] &&
                          Object.values(dailyAttendance[day.dateKey]).some(
                            (v) => v !== 'unmarked'
                          );
                        return (
                          <button
                            key={day.dateKey}
                            type="button"
                            onClick={() => setSelectedDateKey(day.dateKey)}
                            className={`px-3 py-1.5 rounded-lg text-left transition-colors shrink-0 border ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase opacity-80">
                              <span>{day.dayLabel}</span>
                              {hasMarks && !isSelected && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                  ·
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-medium whitespace-nowrap">
                              {day.label}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Interactive Visualizations */}
                  <AttendanceCharts
                    batches={batches}
                    students={students}
                    dayAttendance={dayAttendance}
                    selectedOrg={selectedOrg}
                    onSelectBatch={(batchId) => {
                      setDrawerInitialTab('rollcall');
                      setDrawerBatchId(batchId);
                    }}
                    onSelectOrg={setSelectedOrg}
                  />

                  {/* Live Batch Tracking Table */}
                  <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {/* Table Toolbar */}
                    <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
                          Live Batch Attendance Tracker
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Adjust live headcounts directly or open any batch for student-by-student roll call
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                        <div className="relative flex-1 sm:w-64">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search dept, room, trainer..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <select
                          value={statusFilter}
                          onChange={(e) =>
                            setStatusFilter(
                              e.target.value as 'ALL' | BatchSessionStatus
                            )
                          }
                          aria-label="Filter by session status"
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="ALL">All Statuses</option>
                          <option value="completed">Completed</option>
                          <option value="in-session">In Session</option>
                          <option value="pending">Pending</option>
                          <option value="core">CORE Track</option>
                        </select>
                      </div>
                    </div>

                    {/* Data Grid */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <th className="py-3 px-4">
                              <button
                                type="button"
                                onClick={() => toggleSort('department')}
                                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                              >
                                Department
                                <ArrowUpDown className="w-3 h-3" />
                              </button>
                            </th>
                            <th className="py-3 px-4">Organisation</th>
                            <th className="py-3 px-4">
                              <button
                                type="button"
                                onClick={() => toggleSort('room')}
                                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                              >
                                Venue & Room
                                <ArrowUpDown className="w-3 h-3" />
                              </button>
                            </th>
                            <th className="py-3 px-4">Expert & Faculty</th>
                            <th className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => toggleSort('enrolled')}
                                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                              >
                                Enrolled
                                <ArrowUpDown className="w-3 h-3" />
                              </button>
                            </th>
                            <th className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => toggleSort('attendance')}
                                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                              >
                                Live Attendance
                                <ArrowUpDown className="w-3 h-3" />
                              </button>
                            </th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                          {filteredTableRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={8}
                                className="py-10 px-4 text-center text-sm text-slate-500 dark:text-slate-400"
                              >
                                No batches match your current search or filter.
                              </td>
                            </tr>
                          ) : (
                            filteredTableRows.map((row) => {
                              const { batch } = row;
                              const isCore = batch.trackType === 'CORE';
                              return (
                                <tr
                                  key={batch.id}
                                  className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors"
                                >
                                  <td className="py-3 px-4 whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDrawerInitialTab('rollcall');
                                        setDrawerBatchId(batch.id);
                                      }}
                                      className="font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                                    >
                                      {batch.department}
                                    </button>
                                  </td>
                                  <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {batch.organisation}
                                  </td>
                                  <td className="py-3 px-4 text-xs whitespace-nowrap">
                                    <div className="font-medium text-slate-800 dark:text-slate-200">
                                      {batch.venue || (
                                        <span className="text-amber-600 dark:text-amber-400">
                                          Pending venue
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] font-mono tabular-nums text-slate-400">
                                      {batch.roomNumber
                                        ? `Room ${batch.roomNumber}`
                                        : '—'}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-xs max-w-[240px]">
                                    <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                      {batch.expertName || 'Unassigned'}
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                      {batch.facultyIncharge.join(', ') ||
                                        'No faculty assigned'}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                    {isCore ? 'CORE' : batch.studentCount}
                                  </td>
                                  <td className="py-3 px-4 text-right whitespace-nowrap">
                                    {isCore ? (
                                      <span className="font-mono text-xs text-slate-400">
                                        —
                                      </span>
                                    ) : (
                                      <div className="inline-flex items-center justify-end gap-2">
                                        <div className="text-right">
                                          <div className="font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100">
                                            {row.attended}/{batch.studentCount}{' '}
                                            <span className="text-slate-500 dark:text-slate-400">
                                              ({Math.round(row.pct)}%)
                                            </span>
                                          </div>
                                          <div className="text-[10px] font-mono tabular-nums text-slate-400">
                                            A:{row.absent} · U:{row.unmarked}
                                          </div>
                                        </div>
                                        <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleQuickAdjustPresent(batch.id, -1)
                                            }
                                            title="Decrement present count"
                                            aria-label={`Mark one student absent in ${batch.department}`}
                                            className="p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-600 dark:hover:text-rose-400"
                                          >
                                            <Minus className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleQuickAdjustPresent(batch.id, 1)
                                            }
                                            title="Increment present count"
                                            aria-label={`Mark one student present in ${batch.department}`}
                                            className="p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400 border-l border-slate-200 dark:border-slate-700"
                                          >
                                            <Plus className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 whitespace-nowrap">
                                    <div>{renderSessionStatus(row.sessionStatus)}</div>
                                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                      {row.updatedAt}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-right whitespace-nowrap">
                                    <div className="inline-flex items-center gap-2">
                                      {!isCore && row.unmarked > 0 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleBulkSetBatchStatus(
                                              batch.id,
                                              'present',
                                              true
                                            )
                                          }
                                          className="px-2.5 py-1 text-xs font-medium rounded-md border border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                                        >
                                          Mark All
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDrawerInitialTab(
                                            isCore ? 'allocation' : 'rollcall'
                                          );
                                          setDrawerBatchId(batch.id);
                                        }}
                                        className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                      >
                                        {isCore ? 'Edit Track' : 'Roll Call'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {/* Student Roster View */}
              {activeView === 'students' && (
                <StudentRosterView
                  batches={batches}
                  students={students}
                  dayAttendance={dayAttendance}
                  dayLabel={currentDay?.dayLabel || 'Day 01'}
                  dateKey={selectedDateKey}
                  onSetStudentStatus={handleSetStudentStatus}
                  onSelectBatch={(batchId) => {
                    setDrawerInitialTab('rollcall');
                    setDrawerBatchId(batchId);
                  }}
                  onExportStudentsCsv={handleExportStudentsCsv}
                />
              )}

              {/* Partners & Venues Directory View */}
              {activeView === 'directory' && (
                <DirectoryView
                  batches={batches}
                  onEditBatchAllocation={(batchId) => {
                    setDrawerInitialTab('allocation');
                    setDrawerBatchId(batchId);
                  }}
                />
              )}

              {/* 17-Day Multi-Day Schedule Matrix View */}
              {activeView === 'schedule' && (
                <ScheduleHeatmapView
                  batches={batches}
                  students={students}
                  days={days}
                  selectedDateKey={selectedDateKey}
                  dailyAttendance={dailyAttendance}
                  onSelectDay={(dk) => setSelectedDateKey(dk)}
                  onJumpToDayBatch={(dk, batchId) => {
                    setSelectedDateKey(dk);
                    setDrawerInitialTab('rollcall');
                    setDrawerBatchId(batchId);
                  }}
                  onPopulateWeekPreview={handlePopulateWeekPreview}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Batch Roll-Call & Allocation Slide-Over Drawer */}
      <BatchDetailDrawer
        batch={drawerBatch}
        students={students}
        dayLabel={currentDay?.dayLabel || 'Day 01'}
        dateKey={selectedDateKey}
        dayAttendance={dayAttendance}
        sessionStatus={drawerSessionStatus}
        initialTab={drawerInitialTab}
        onClose={() => setDrawerBatchId(null)}
        onSetStudentStatus={handleSetStudentStatus}
        onBulkSetBatchStatus={handleBulkSetBatchStatus}
        onSetSessionStatus={handleSetSessionStatus}
        onUpdateBatch={handleUpdateBatch}
      />

      {/* Daily Attendance Summary Modal */}
      <DailySummaryModal
        isOpen={isDailySummaryOpen}
        onClose={() => setIsDailySummaryOpen(false)}
        programTitle={programTitle}
        dayLabel={currentDay?.dayLabel || 'Day 01'}
        dateKey={selectedDateKey}
        batches={batches}
        students={students}
        dayAttendance={dayAttendance}
        onExportCsv={handleExportBatchCsv}
        onSelectBatch={(batchId) => {
          setIsDailySummaryOpen(false);
          const target = batches.find((b) => b.id === batchId);
          setDrawerInitialTab(target?.trackType === 'CORE' ? 'allocation' : 'rollcall');
          setDrawerBatchId(batchId);
        }}
      />
    </div>
  );
}
