import React, { useEffect, useMemo } from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';
import { AttendanceStatus, BatchRecord, StudentRecord } from '../types/internship';
import { downloadDailyAttendancePdf } from '../utils/pdfReport';

interface DailySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  programTitle: string;
  dayLabel: string;
  dateKey: string;
  batches: BatchRecord[];
  students: StudentRecord[];
  dayAttendance: Record<string, AttendanceStatus>;
  onExportCsv: () => void;
  onSelectBatch: (batchId: string) => void;
}

interface BatchBreakdownRow {
  batch: BatchRecord;
  present: number;
  late: number;
  od: number;
  absent: number;
  unmarked: number;
  attended: number;
  rate: number;
}

export const DailySummaryModal: React.FC<DailySummaryModalProps> = ({
  isOpen,
  onClose,
  programTitle,
  dayLabel,
  dateKey,
  batches,
  students,
  dayAttendance,
  onExportCsv,
  onSelectBatch,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const studentsByBatch = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    students.forEach((s) => {
      const list = map.get(s.batchId) || [];
      list.push(s);
      map.set(s.batchId, list);
    });
    return map;
  }, [students]);

  const { rows, totals } = useMemo(() => {
    let totalEnrolled = 0;
    let totalPresent = 0;
    let totalLate = 0;
    let totalOd = 0;
    let totalAbsent = 0;
    let totalUnmarked = 0;

    const batchRows: BatchBreakdownRow[] = batches.map((batch) => {
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
      const rate =
        batch.studentCount > 0
          ? Math.round((attended / batch.studentCount) * 1000) / 10
          : 0;

      if (batch.trackType === 'IT') {
        totalEnrolled += batch.studentCount;
        totalPresent += present;
        totalLate += late;
        totalOd += od;
        totalAbsent += absent;
        totalUnmarked += unmarked;
      }

      return {
        batch,
        present,
        late,
        od,
        absent,
        unmarked,
        attended,
        rate,
      };
    });

    const totalAttended = totalPresent + totalLate + totalOd;
    const overallRate =
      totalEnrolled > 0
        ? Math.round((totalAttended / totalEnrolled) * 1000) / 10
        : 0;

    return {
      rows: batchRows,
      totals: {
        enrolled: totalEnrolled,
        present: totalPresent,
        late: totalLate,
        od: totalOd,
        absent: totalAbsent,
        unmarked: totalUnmarked,
        attended: totalAttended,
        rate: overallRate,
      },
    };
  }, [batches, studentsByBatch, dayAttendance]);

  if (!isOpen) return null;

  const pctOf = (count: number) =>
    totals.enrolled > 0 ? ((count / totals.enrolled) * 100).toFixed(1) : '0.0';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/50 dark:bg-black/70 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Daily Attendance Summary"
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{programTitle}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {dayLabel} ({dateKey})
              </span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight mt-0.5">
              Daily Attendance Summary
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                downloadDailyAttendancePdf({
                  programTitle,
                  dayLabel,
                  dateKey,
                  rows,
                  totals,
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white transition-colors whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              Download PDF Report
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export Summary CSV
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close daily summary modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Summary Breakdown Strip */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Total Enrolled
              </div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {totals.enrolled}
              </div>
              <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {totals.rate}% attended
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                Present
              </div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {totals.present}
              </div>
              <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {pctOf(totals.present)}% of cohort
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                Late
              </div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
                {totals.late}
              </div>
              <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {pctOf(totals.late)}% of cohort
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-medium text-blue-700 dark:text-blue-400">
                On-Duty (OD)
              </div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400">
                {totals.od}
              </div>
              <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {pctOf(totals.od)}% of cohort
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-medium text-rose-700 dark:text-rose-400">
                Absent
              </div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
                {totals.absent}
              </div>
              <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {pctOf(totals.absent)}% of cohort
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Unmarked
              </div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-700 dark:text-slate-200">
                {totals.unmarked}
              </div>
              <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {pctOf(totals.unmarked)}% pending
              </div>
            </div>
          </div>

          {/* Cohort Distribution Proportion Bar */}
          <div>
            <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-800">
              {totals.enrolled > 0 && (
                <>
                  <div
                    style={{ width: `${(totals.present / totals.enrolled) * 100}%` }}
                    className="bg-emerald-600 dark:bg-emerald-500 transition-all duration-200"
                    title={`Present: ${totals.present}`}
                  />
                  <div
                    style={{ width: `${(totals.late / totals.enrolled) * 100}%` }}
                    className="bg-amber-500 transition-all duration-200"
                    title={`Late: ${totals.late}`}
                  />
                  <div
                    style={{ width: `${(totals.od / totals.enrolled) * 100}%` }}
                    className="bg-blue-600 dark:bg-blue-500 transition-all duration-200"
                    title={`OD: ${totals.od}`}
                  />
                  <div
                    style={{ width: `${(totals.absent / totals.enrolled) * 100}%` }}
                    className="bg-rose-600 dark:bg-rose-500 transition-all duration-200"
                    title={`Absent: ${totals.absent}`}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Batch-by-Batch Breakdown Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 px-5">Department</th>
                <th className="py-3 px-4">Partner</th>
                <th className="py-3 px-3 text-right">Enrolled</th>
                <th className="py-3 px-3 text-right text-emerald-700 dark:text-emerald-400">
                  Present
                </th>
                <th className="py-3 px-3 text-right text-amber-700 dark:text-amber-400">
                  Late
                </th>
                <th className="py-3 px-3 text-right text-blue-700 dark:text-blue-400">
                  OD
                </th>
                <th className="py-3 px-3 text-right text-rose-700 dark:text-rose-400">
                  Absent
                </th>
                <th className="py-3 px-3 text-right">Unmarked</th>
                <th className="py-3 px-4 text-right">Attended %</th>
                <th className="py-3 px-4 text-right">Roll Call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {rows.map((row) => {
                const isCore = row.batch.trackType === 'CORE';
                return (
                  <tr
                    key={row.batch.id}
                    className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {row.batch.department}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {row.batch.organisation}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                      {isCore ? 'CORE' : row.batch.studentCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      {isCore ? '—' : row.present}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                      {isCore ? '—' : row.late}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-blue-700 dark:text-blue-400">
                      {isCore ? '—' : row.od}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-700 dark:text-rose-400">
                      {isCore ? '—' : row.absent}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {isCore ? '—' : row.unmarked}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {isCore ? '—' : `${row.rate.toFixed(1)}%`}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectBatch(row.batch.id)}
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        {isCore ? 'Details' : 'Inspect'}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs font-semibold">
              <tr>
                <td className="py-3 px-5 text-slate-900 dark:text-white">
                  Total IT Cohort ({batches.filter((b) => b.trackType === 'IT').length} Batches)
                </td>
                <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                  All Partners
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                  {totals.enrolled}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  {totals.present}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                  {totals.late}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-blue-700 dark:text-blue-400">
                  {totals.od}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-700 dark:text-rose-400">
                  {totals.absent}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {totals.unmarked}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                  {totals.rate.toFixed(1)}%
                </td>
                <td className="py-3 px-4" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
