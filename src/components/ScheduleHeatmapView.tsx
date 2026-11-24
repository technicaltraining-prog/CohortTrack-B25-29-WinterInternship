import React, { useMemo } from 'react';
import { CalendarDays, Sparkles } from 'lucide-react';
import {
  AttendanceStatus,
  BatchRecord,
  InternshipDay,
  SessionPeriod,
  StudentRecord,
} from '../types/internship';
import { compareLex, makeSessionKey } from '../utils/csvParser';

interface ScheduleHeatmapViewProps {
  batches: BatchRecord[];
  students: StudentRecord[];
  days: InternshipDay[];
  selectedDateKey: string;
  activeSession: SessionPeriod;
  onChangeSession: (session: SessionPeriod) => void;
  dailyAttendance: Record<string, Record<string, AttendanceStatus>>;
  canPopulateWeekLogs: boolean;
  onJumpToDayBatch: (dateKey: string, batchId: string) => void;
  onSelectDay: (dateKey: string) => void;
  onPopulateWeekPreview: () => void;
}

export const ScheduleHeatmapView: React.FC<ScheduleHeatmapViewProps> = ({
  batches,
  students,
  days,
  selectedDateKey,
  activeSession,
  onChangeSession,
  dailyAttendance,
  canPopulateWeekLogs,
  onJumpToDayBatch,
  onSelectDay,
  onPopulateWeekPreview,
}) => {
  const workingDays = useMemo(() => days.filter((d) => !d.isSunday), [days]);

  const studentsByBatch = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    students.forEach((s) => {
      const list = map.get(s.batchId) || [];
      list.push(s);
      map.set(s.batchId, list);
    });
    return map;
  }, [students]);

  const itBatches = useMemo(
    () =>
      batches
        .filter((b) => b.trackType === 'IT')
        .sort((a, b) => compareLex(a.department, b.department)),
    [batches]
  );

  const getCellStyle = (pct: number | null) => {
    if (pct === null) {
      return 'bg-slate-100/70 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 border-slate-200/70 dark:border-slate-800';
    }
    if (pct >= 90) {
      return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70';
    }
    if (pct >= 75) {
      return 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/70';
    }
    return 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/70';
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
            17-Day {activeSession} Attendance Matrix (24.11.2026 – 12.12.2026)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Switch between Forenoon (FN) and Afternoon (AN) sessions, or click any cell to inspect that batch&apos;s roll call.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
            role="group"
            aria-label="Session period"
          >
            {(['FN', 'AN'] as SessionPeriod[]).map((sess) => (
              <button
                key={sess}
                type="button"
                onClick={() => onChangeSession(sess)}
                className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors whitespace-nowrap ${
                  activeSession === sess
                    ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {sess === 'FN' ? 'FN · Forenoon' : 'AN · Afternoon'}
              </button>
            ))}
          </div>

          {canPopulateWeekLogs && (
            <button
              type="button"
              onClick={onPopulateWeekPreview}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Generate Week 1 FN &amp; AN Logs
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/60">
                <th className="py-3 px-4 text-xs font-semibold text-slate-600 dark:text-slate-300 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 min-w-[140px]">
                  Department
                </th>
                {workingDays.map((day) => {
                  const isActive = day.dateKey === selectedDateKey;
                  return (
                    <th key={day.dateKey} className="py-2 px-1.5 text-center min-w-[64px]">
                      <button
                        type="button"
                        onClick={() => onSelectDay(day.dateKey)}
                        className={`w-full px-1.5 py-1 rounded-md text-center transition-colors ${
                          isActive
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="text-[10px] font-mono uppercase opacity-80">
                          {day.dayLabel}
                        </div>
                        <div className="text-[11px] font-medium whitespace-nowrap">
                          {day.label}
                        </div>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {itBatches.map((batch) => {
                const batchStudents = studentsByBatch.get(batch.id) || [];
                return (
                  <tr
                    key={batch.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    <td className="py-2.5 px-4 sticky left-0 bg-white dark:bg-[#111827] z-10 border-r border-slate-100 dark:border-slate-800">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {batch.department}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                        {batch.studentCount} · {batch.organisation}
                      </div>
                    </td>
                    {workingDays.map((day) => {
                      const dayMap =
                        dailyAttendance[makeSessionKey(day.dateKey, activeSession)] || {};
                      let marked = 0;
                      let attended = 0;
                      batchStudents.forEach((s) => {
                        const st = dayMap[s.id];
                        if (st && st !== 'unmarked') {
                          marked++;
                          if (st === 'present' || st === 'late' || st === 'od') {
                            attended++;
                          }
                        }
                      });
                      const pct =
                        marked > 0 && batch.studentCount > 0
                          ? Math.round((attended / batch.studentCount) * 100)
                          : null;

                      return (
                        <td key={day.dateKey} className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => onJumpToDayBatch(day.dateKey, batch.id)}
                            title={`${batch.department} (${activeSession}) on ${day.label}: ${
                              pct === null
                                ? 'No roll call recorded'
                                : `${pct}% (${attended}/${batch.studentCount})`
                            }`}
                            className={`w-full py-1.5 px-1 rounded-md border font-mono tabular-nums text-[11px] font-medium transition-transform hover:scale-[1.03] ${getCellStyle(
                              pct
                            )}`}
                          >
                            {pct === null ? '—' : `${pct}%`}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="inline-flex items-center gap-2">
            <CalendarDays className="w-3.5 h-3.5" />
            <span>
              Viewing {activeSession === 'FN' ? 'Forenoon (FN)' : 'Afternoon (AN)'} session · Sundays excluded.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 font-mono text-[11px]">
            <span className="text-emerald-700 dark:text-emerald-400">≥90% Optimal</span>
            <span className="text-amber-700 dark:text-amber-400">75–89% Watch</span>
            <span className="text-rose-700 dark:text-rose-400">&lt;75% Alert</span>
            <span>— Unmarked</span>
          </div>
        </div>
      </div>
    </div>
  );
};
