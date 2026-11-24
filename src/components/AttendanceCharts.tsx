import React, { useMemo, useState } from 'react';
import { AttendanceStatus, BatchRecord, StudentRecord } from '../types/internship';

interface AttendanceChartsProps {
  batches: BatchRecord[];
  students: StudentRecord[];
  dayAttendance: Record<string, AttendanceStatus>;
  selectedOrg: string;
  onSelectBatch: (batchId: string) => void;
  onSelectOrg: (org: string) => void;
}

interface DeptBarDatum {
  batch: BatchRecord;
  present: number;
  lateOrOd: number;
  absent: number;
  unmarked: number;
  total: number;
  rate: number;
}

export const AttendanceCharts: React.FC<AttendanceChartsProps> = ({
  batches,
  students,
  dayAttendance,
  selectedOrg,
  onSelectBatch,
  onSelectOrg,
}) => {
  const [hoveredDeptId, setHoveredDeptId] = useState<string | null>(null);

  const studentsByBatch = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    students.forEach((s) => {
      const list = map.get(s.batchId) || [];
      list.push(s);
      map.set(s.batchId, list);
    });
    return map;
  }, [students]);

  const deptData: DeptBarDatum[] = useMemo(() => {
    return batches
      .filter((b) => b.trackType === 'IT')
      .map((batch) => {
        const list = studentsByBatch.get(batch.id) || [];
        let present = 0;
        let lateOrOd = 0;
        let absent = 0;
        let unmarked = 0;
        list.forEach((s) => {
          const st = dayAttendance[s.id] || 'unmarked';
          if (st === 'present') present++;
          else if (st === 'late' || st === 'od') lateOrOd++;
          else if (st === 'absent') absent++;
          else unmarked++;
        });
        const total = batch.studentCount;
        const attended = present + lateOrOd;
        const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
        return { batch, present, lateOrOd, absent, unmarked, total, rate };
      });
  }, [batches, studentsByBatch, dayAttendance]);

  const maxBatchSize = useMemo(() => {
    return Math.max(70, ...deptData.map((d) => d.total));
  }, [deptData]);

  const partnerData = useMemo(() => {
    const map = new Map<
      string,
      { org: string; total: number; present: number; batches: number }
    >();

    deptData.forEach((d) => {
      const org = d.batch.organisation || 'Unassigned';
      const entry = map.get(org) || { org, total: 0, present: 0, batches: 0 };
      entry.total += d.total;
      entry.present += d.present + d.lateOrOd;
      entry.batches += 1;
      map.set(org, entry);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [deptData]);

  const hoveredDatum = useMemo(
    () => deptData.find((d) => d.batch.id === hoveredDeptId) || null,
    [deptData, hoveredDeptId]
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Department Attendance Breakdown */}
      <section className="xl:col-span-8 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 tracking-tight">
              Department Attendance Distribution
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Click any department column to open individual student roll call
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 dark:bg-emerald-500" />
              Present
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
              Late / OD
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-600 dark:bg-rose-500" />
              Absent
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 dark:bg-slate-700" />
              Unmarked
            </span>
          </div>
        </div>

        {/* Interactive Stacked Column Chart */}
        <div className="relative overflow-x-auto pb-2">
          <div className="min-w-[640px]">
            {/* Y-axis scale lines + bars */}
            <div className="relative h-56 flex items-end gap-2 pl-9 pr-2 pt-4 border-b border-slate-200 dark:border-slate-800">
              {/* Horizontal gridlines */}
              {[0, 20, 40, 60, 75].map((tick) => {
                const bottomPct = (tick / maxBatchSize) * 100;
                if (bottomPct > 100) return null;
                return (
                  <div
                    key={tick}
                    style={{ bottom: `${bottomPct}%` }}
                    className="absolute left-0 right-0 flex items-center pointer-events-none"
                  >
                    <span className="w-7 text-right pr-1.5 text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                      {tick}
                    </span>
                    <div className="flex-1 border-t border-dashed border-slate-200/80 dark:border-slate-800/80" />
                  </div>
                );
              })}

              {deptData.map((d) => {
                const totalHeightPct = Math.max(4, (d.total / maxBatchSize) * 100);
                const presentPct = d.total > 0 ? (d.present / d.total) * 100 : 0;
                const latePct = d.total > 0 ? (d.lateOrOd / d.total) * 100 : 0;
                const absentPct = d.total > 0 ? (d.absent / d.total) * 100 : 0;
                const unmarkedPct = Math.max(0, 100 - presentPct - latePct - absentPct);
                const isDimmed =
                  selectedOrg !== 'ALL' && d.batch.organisation !== selectedOrg;

                return (
                  <button
                    key={d.batch.id}
                    type="button"
                    onClick={() => onSelectBatch(d.batch.id)}
                    onMouseEnter={() => setHoveredDeptId(d.batch.id)}
                    onMouseLeave={() => setHoveredDeptId(null)}
                    className={`group relative flex-1 h-full flex flex-col justify-end items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-t transition-opacity duration-150 ${
                      isDimmed ? 'opacity-30' : 'opacity-100'
                    }`}
                    aria-label={`${d.batch.department}: ${d.present + d.lateOrOd} of ${d.total} attended`}
                  >
                    <div
                      style={{ height: `${totalHeightPct}%` }}
                      className="w-full max-w-[26px] rounded-t-sm overflow-hidden flex flex-col justify-end bg-slate-200 dark:bg-slate-800 group-hover:ring-2 group-hover:ring-blue-500/70 transition-all duration-150"
                    >
                      {unmarkedPct > 0 && (
                        <div
                          style={{ height: `${unmarkedPct}%` }}
                          className="w-full bg-slate-300 dark:bg-slate-700"
                        />
                      )}
                      {absentPct > 0 && (
                        <div
                          style={{ height: `${absentPct}%` }}
                          className="w-full bg-rose-600 dark:bg-rose-500"
                        />
                      )}
                      {latePct > 0 && (
                        <div
                          style={{ height: `${latePct}%` }}
                          className="w-full bg-amber-500"
                        />
                      )}
                      {presentPct > 0 && (
                        <div
                          style={{ height: `${presentPct}%` }}
                          className="w-full bg-emerald-600 dark:bg-emerald-500"
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* X-axis department labels */}
            <div className="flex items-start gap-2 pl-9 pr-2 pt-2">
              {deptData.map((d) => (
                <button
                  key={d.batch.id}
                  type="button"
                  onClick={() => onSelectBatch(d.batch.id)}
                  className="flex-1 text-center text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                  title={d.batch.department}
                >
                  {d.batch.department}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Hover / Focus Inspection Readout */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs min-h-[28px]">
          {hoveredDatum ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700 dark:text-slate-200">
              <span className="font-semibold text-slate-900 dark:text-white">
                {hoveredDatum.batch.department}
              </span>
              <span className="text-slate-400">·</span>
              <span>{hoveredDatum.batch.organisation}</span>
              <span className="text-slate-400">·</span>
              <span className="font-mono tabular-nums">
                Present {hoveredDatum.present} · Late/OD {hoveredDatum.lateOrOd} · Absent{' '}
                {hoveredDatum.absent} · Unmarked {hoveredDatum.unmarked}
              </span>
              <span className="text-slate-400">·</span>
              <span className="font-mono tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                {hoveredDatum.rate}% attendance
              </span>
            </div>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">
              Hover over a department column to inspect headcount breakdown or click to take roll call.
            </span>
          )}
        </div>
      </section>

      {/* Training Partner Allocation */}
      <section className="xl:col-span-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 tracking-tight">
              Training Partners
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Filter cohort table by partner
            </p>
          </div>
          {selectedOrg !== 'ALL' && (
            <button
              type="button"
              onClick={() => onSelectOrg('ALL')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
            >
              Clear filter
            </button>
          )}
        </div>

        <div className="space-y-2.5 flex-1 overflow-y-auto pr-1">
          {partnerData.map((p) => {
            const pct = p.total > 0 ? Math.round((p.present / p.total) * 100) : 0;
            const isSelected = selectedOrg === p.org;
            return (
              <button
                key={p.org}
                type="button"
                onClick={() => onSelectOrg(isSelected ? 'ALL' : p.org)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                  isSelected
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
                    : 'border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                  <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {p.org}
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                    {p.present}/{p.total} ({pct}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${pct}%` }}
                    className={`h-full rounded-full transition-all duration-200 ${
                      p.org === 'Unassigned'
                        ? 'bg-amber-500'
                        : 'bg-blue-600 dark:bg-blue-500'
                    }`}
                  />
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {p.batches} {p.batches === 1 ? 'batch' : 'batches'} · {p.total} students
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
