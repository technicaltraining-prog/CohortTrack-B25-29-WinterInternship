import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { AttendanceStatus, BatchRecord, StudentRecord } from '../types/internship';

interface StudentRosterViewProps {
  batches: BatchRecord[];
  students: StudentRecord[];
  dayAttendance: Record<string, AttendanceStatus>;
  dayLabel: string;
  dateKey: string;
  onSetStudentStatus: (studentId: string, status: AttendanceStatus) => void;
  onSelectBatch: (batchId: string) => void;
  onExportStudentsCsv: () => void;
}

const PAGE_SIZE = 40;

const STATUS_CYCLE: AttendanceStatus[] = ['present', 'late', 'od', 'absent', 'unmarked'];

function statusStyles(status: AttendanceStatus): { label: string; cls: string } {
  switch (status) {
    case 'present':
      return {
        label: 'Present',
        cls: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/70',
      };
    case 'late':
      return {
        label: 'Late',
        cls: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/70',
      };
    case 'od':
      return {
        label: 'On-Duty',
        cls: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/70',
      };
    case 'absent':
      return {
        label: 'Absent',
        cls: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/70',
      };
    default:
      return {
        label: 'Unmarked',
        cls: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700',
      };
  }
}

export const StudentRosterView: React.FC<StudentRosterViewProps> = ({
  batches,
  students,
  dayAttendance,
  dayLabel,
  dateKey,
  onSetStudentStatus,
  onSelectBatch,
  onExportStudentsCsv,
}) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AttendanceStatus>('ALL');
  const [page, setPage] = useState(1);

  const batchMap = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);

  const departments = useMemo(
    () => batches.filter((b) => b.trackType === 'IT').map((b) => b.department),
    [batches]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (deptFilter !== 'ALL' && s.department !== deptFilter) return false;
      const st = dayAttendance[s.id] || 'unmarked';
      if (statusFilter !== 'ALL' && st !== statusFilter) return false;
      if (!q) return true;
      return (
        s.rollNumber.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      );
    });
  }, [students, dayAttendance, search, deptFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const summary = useMemo(() => {
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
    return { present, late, od, absent, unmarked };
  }, [students, dayAttendance]);

  const handleCycleStatus = (studentId: string) => {
    const current = dayAttendance[studentId] || 'unmarked';
    const nextIdx = (STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length;
    onSetStudentStatus(studentId, STATUS_CYCLE[nextIdx]);
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
              Full Cohort Student Roster
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
              {dayLabel} · {dateKey} · {students.length} IT students · Present {summary.present} · Late {summary.late} · OD {summary.od} · Absent {summary.absent} · Unmarked {summary.unmarked}
            </p>
          </div>
          <button
            type="button"
            onClick={onExportStudentsCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export Student CSV
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="pt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search roll number, student name, department, or email..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by department"
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Departments (18)</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'ALL' | AttendanceStatus);
              setPage(1);
            }}
            aria-label="Filter by attendance status"
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="present">Present ({summary.present})</option>
            <option value="late">Late ({summary.late})</option>
            <option value="od">On-Duty ({summary.od})</option>
            <option value="absent">Absent ({summary.absent})</option>
            <option value="unmarked">Unmarked ({summary.unmarked})</option>
          </select>
        </div>
      </div>

      {/* High-Density Student Table */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Roll No</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Partner & Venue</th>
                <th className="py-3 px-4">Room</th>
                <th className="py-3 px-4 text-right">Attendance Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 px-4 text-center text-slate-500 dark:text-slate-400"
                  >
                    No students match your current search or filter criteria.
                  </td>
                </tr>
              ) : (
                pageRows.map((student) => {
                  const batch = batchMap.get(student.batchId);
                  const st = dayAttendance[student.id] || 'unmarked';
                  const badge = statusStyles(st);
                  return (
                    <tr
                      key={student.id}
                      className="h-10 hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2 px-4 font-mono tabular-nums text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {student.rollNumber}
                      </td>
                      <td className="py-2 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {student.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          {student.email}
                        </div>
                      </td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => batch && onSelectBatch(batch.id)}
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {student.department}
                        </button>
                      </td>
                      <td className="py-2 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {batch?.organisation || 'Unassigned'}
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span>{batch?.venue || 'Venue pending'}</span>
                      </td>
                      <td className="py-2 px-4 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400">
                        {batch?.roomNumber || '—'}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleCycleStatus(student.id)}
                          title="Click to cycle attendance status"
                          className={`inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium rounded-md border transition-colors min-w-[84px] ${badge.cls}`}
                        >
                          {badge.label}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono tabular-nums">
            Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} students
            (click any status button to update)
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <span className="font-mono tabular-nums px-2">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
