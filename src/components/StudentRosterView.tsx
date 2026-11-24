import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Search, Upload, X } from 'lucide-react';
import {
  AttendanceStatus,
  BatchRecord,
  SessionPeriod,
  StudentRecord,
} from '../types/internship';
import { compareLex } from '../utils/csvParser';

interface StudentRosterViewProps {
  batches: BatchRecord[];
  students: StudentRecord[];
  fnAttendance: Record<string, AttendanceStatus>;
  anAttendance: Record<string, AttendanceStatus>;
  dayLabel: string;
  dateKey: string;
  canMarkDepartment: (department: string) => boolean;
  canImportRoster?: boolean;
  onImportRoster?: (
    csvText: string,
    defaultDepartment?: string,
    fileName?: string
  ) => Promise<{ ok: boolean; message: string }>;
  onSetStudentSessionStatus: (
    studentId: string,
    session: SessionPeriod,
    status: AttendanceStatus
  ) => void;
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
  fnAttendance,
  anAttendance,
  dayLabel,
  dateKey,
  canMarkDepartment,
  canImportRoster = false,
  onImportRoster,
  onSetStudentSessionStatus,
  onSelectBatch,
  onExportStudentsCsv,
}) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [sessionFilterTarget, setSessionFilterTarget] = useState<SessionPeriod>('FN');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AttendanceStatus>('ALL');
  const [page, setPage] = useState(1);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [importTargetDept, setImportTargetDept] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const rosterFileRef = useRef<HTMLInputElement | null>(null);

  const batchMap = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);

  const departments = useMemo(
    () =>
      batches
        .filter((b) => b.trackType === 'IT')
        .map((b) => b.department)
        .sort(compareLex),
    [batches]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const targetMap = sessionFilterTarget === 'FN' ? fnAttendance : anAttendance;
    return students
      .filter((s) => {
        if (deptFilter !== 'ALL' && s.department !== deptFilter) return false;
        const st = targetMap[s.id] || 'unmarked';
        if (statusFilter !== 'ALL' && st !== statusFilter) return false;
        if (!q) return true;
        return (
          s.rollNumber.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.department.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => compareLex(a.rollNumber, b.rollNumber));
  }, [
    students,
    fnAttendance,
    anAttendance,
    sessionFilterTarget,
    search,
    deptFilter,
    statusFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const summary = useMemo(() => {
    let fnAttended = 0;
    let anAttended = 0;
    let bothAttended = 0;
    students.forEach((s) => {
      const fnSt = fnAttendance[s.id] || 'unmarked';
      const anSt = anAttendance[s.id] || 'unmarked';
      const fnOk = fnSt === 'present' || fnSt === 'late' || fnSt === 'od';
      const anOk = anSt === 'present' || anSt === 'late' || anSt === 'od';
      if (fnOk) fnAttended++;
      if (anOk) anAttended++;
      if (fnOk && anOk) bothAttended++;
    });
    return { fnAttended, anAttended, bothAttended };
  }, [students, fnAttendance, anAttendance]);

  const handleCycleStatus = (studentId: string, session: SessionPeriod) => {
    const map = session === 'FN' ? fnAttendance : anAttendance;
    const current = map[studentId] || 'unmarked';
    const nextIdx = (STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length;
    onSetStudentSessionStatus(studentId, session, STATUS_CYCLE[nextIdx]);
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
              Full Cohort Student Roster (FN & AN)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
              {dayLabel} · {dateKey} · {students.length} IT students · FN Attended{' '}
              {summary.fnAttended} · AN Attended {summary.anAttended} · Full-Day{' '}
              {summary.bothAttended}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canImportRoster && onImportRoster && (
              <button
                type="button"
                onClick={() => {
                  setImportError(null);
                  setIsImportOpen(true);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                Import Sheet Roster
              </button>
            )}
            <button
              type="button"
              onClick={onExportStudentsCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export Student CSV
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="pt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search roll no, name, department..."
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
            value={sessionFilterTarget}
            onChange={(e) => {
              setSessionFilterTarget(e.target.value as SessionPeriod);
              setPage(1);
            }}
            aria-label="Filter session period"
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="FN">Filter by FN</option>
            <option value="AN">Filter by AN</option>
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
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="od">On-Duty</option>
            <option value="absent">Absent</option>
            <option value="unmarked">Unmarked</option>
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
                <th className="py-3 px-4">Class Name</th>
                <th className="py-3 px-4">Partner &amp; Venue</th>
                <th className="py-3 px-4 text-right">FN (Forenoon)</th>
                <th className="py-3 px-4 text-right">AN (Afternoon)</th>
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
                  const fnSt = fnAttendance[student.id] || 'unmarked';
                  const anSt = anAttendance[student.id] || 'unmarked';
                  const fnBadge = statusStyles(fnSt);
                  const anBadge = statusStyles(anSt);
                  const canEdit = canMarkDepartment(student.department);
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
                        <span>
                          {batch?.venue || 'Venue pending'}
                          {batch?.roomNumber ? ` (${batch.roomNumber})` : ''}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => handleCycleStatus(student.id, 'FN')}
                          title={
                            canEdit
                              ? 'Click to cycle FN attendance status'
                              : `View-only: sign in as ${student.department} Faculty or Admin to edit`
                          }
                          className={`inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium rounded-md border transition-colors min-w-[84px] ${fnBadge.cls} ${
                            !canEdit ? 'opacity-80 cursor-default' : ''
                          }`}
                        >
                          {fnBadge.label}
                        </button>
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => handleCycleStatus(student.id, 'AN')}
                          title={
                            canEdit
                              ? 'Click to cycle AN attendance status'
                              : `View-only: sign in as ${student.department} Faculty or Admin to edit`
                          }
                          className={`inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium rounded-md border transition-colors min-w-[84px] ${anBadge.cls} ${
                            !canEdit ? 'opacity-80 cursor-default' : ''
                          }`}
                        >
                          {anBadge.label}
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

      {/* Google Sheet Student Roster Import Modal */}
      {isImportOpen && onImportRoster && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="roster-import-title"
        >
          <div className="w-full max-w-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3
                  id="roster-import-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Import Google Sheet Student Roster
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Upload a section CSV or paste rows copied directly from Google Sheets (Roll No, Student Name, optional Class Name).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close import modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <input
                ref={rosterFileRef}
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setImportError(null);
                  const reader = new FileReader();
                  reader.onload = async () => {
                    if (typeof reader.result !== 'string') return;
                    setImportBusy(true);
                    const result = await onImportRoster(
                      reader.result,
                      importTargetDept || undefined,
                      file.name
                    );
                    setImportBusy(false);
                    if (result.ok) {
                      setPasteText('');
                      setIsImportOpen(false);
                    } else {
                      setImportError(result.message);
                    }
                  };
                  reader.readAsText(file);
                }}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label
                    htmlFor="roster-target-class"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Target Class (optional if sheet has a Class column)
                  </label>
                  <select
                    id="roster-target-class"
                    value={importTargetDept}
                    onChange={(e) => setImportTargetDept(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Auto-detect from CSV / Filename</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-5">
                  <button
                    type="button"
                    disabled={importBusy}
                    onClick={() => rosterFileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Choose CSV / TSV File
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="roster-paste-box"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Or Paste Copied Google Sheet Rows (include header row)
                </label>
                <textarea
                  id="roster-paste-box"
                  rows={7}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={'Roll No\tStudent Name\tClass\n25CS401\tAarav S\tCSE-D\n25CS402\tDivya R\tCSE-D'}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {importError && (
                <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 rounded-lg px-3 py-2">
                  {importError}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importBusy || !pasteText.trim()}
                onClick={async () => {
                  setImportError(null);
                  setImportBusy(true);
                  const result = await onImportRoster(
                    pasteText,
                    importTargetDept || undefined
                  );
                  setImportBusy(false);
                  if (result.ok) {
                    setPasteText('');
                    setIsImportOpen(false);
                  } else {
                    setImportError(result.message);
                  }
                }}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {importBusy ? 'Importing...' : 'Import Pasted Roster'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
