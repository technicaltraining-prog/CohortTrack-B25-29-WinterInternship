import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Mail,
  MapPin,
  Phone,
  Search,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import {
  AttendanceStatus,
  BatchRecord,
  BatchSessionStatus,
  StudentRecord,
} from '../types/internship';

interface BatchDetailDrawerProps {
  batch: BatchRecord | null;
  students: StudentRecord[];
  dayLabel: string;
  dateKey: string;
  dayAttendance: Record<string, AttendanceStatus>;
  sessionStatus: BatchSessionStatus;
  initialTab?: 'rollcall' | 'allocation';
  onClose: () => void;
  onSetStudentStatus: (studentId: string, status: AttendanceStatus) => void;
  onBulkSetBatchStatus: (batchId: string, status: AttendanceStatus, onlyUnmarked?: boolean) => void;
  onSetSessionStatus: (batchId: string, status: BatchSessionStatus) => void;
  onUpdateBatch: (updated: BatchRecord) => void;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'od', label: 'OD' },
  { value: 'absent', label: 'Absent' },
];

export const BatchDetailDrawer: React.FC<BatchDetailDrawerProps> = ({
  batch,
  students,
  dayLabel,
  dateKey,
  dayAttendance,
  sessionStatus,
  initialTab = 'rollcall',
  onClose,
  onSetStudentStatus,
  onBulkSetBatchStatus,
  onSetSessionStatus,
  onUpdateBatch,
}) => {
  const [activeTab, setActiveTab] = useState<'rollcall' | 'allocation'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Allocation form state
  const [orgInput, setOrgInput] = useState('');
  const [venueInput, setVenueInput] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [expertInput, setExpertInput] = useState('');
  const [genderInput, setGenderInput] = useState('');
  const [contactsInput, setContactsInput] = useState('');
  const [emailsInput, setEmailsInput] = useState('');
  const [facultyInput, setFacultyInput] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, batch?.id]);

  useEffect(() => {
    if (!batch) return;
    setOrgInput(batch.organisation);
    setVenueInput(batch.venue);
    setRoomInput(batch.roomNumber);
    setExpertInput(batch.expertName);
    setGenderInput(batch.gender);
    setContactsInput(batch.contactNumbers.join(', '));
    setEmailsInput(batch.emails.join(', '));
    setFacultyInput(batch.facultyIncharge.join(', '));
    setSearchQuery('');
    setStatusFilter('all');
    setSaveMessage(null);
  }, [batch]);

  useEffect(() => {
    if (!batch) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [batch, onClose]);

  const batchStudents = useMemo(() => {
    if (!batch) return [];
    return students.filter((s) => s.batchId === batch.id);
  }, [batch, students]);

  const counts = useMemo(() => {
    let present = 0;
    let late = 0;
    let od = 0;
    let absent = 0;
    let unmarked = 0;
    batchStudents.forEach((s) => {
      const st = dayAttendance[s.id] || 'unmarked';
      if (st === 'present') present++;
      else if (st === 'late') late++;
      else if (st === 'od') od++;
      else if (st === 'absent') absent++;
      else unmarked++;
    });
    return { present, late, od, absent, unmarked };
  }, [batchStudents, dayAttendance]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return batchStudents.filter((s) => {
      const st = dayAttendance[s.id] || 'unmarked';
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (!q) return true;
      return (
        s.rollNumber.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      );
    });
  }, [batchStudents, dayAttendance, searchQuery, statusFilter]);

  if (!batch) return null;

  const handleCopy = (val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedText(val);
    setTimeout(() => setCopiedText(null), 1500);
  };

  const handleSaveAllocation = (e: React.FormEvent) => {
    e.preventDefault();
    const parseList = (raw: string) =>
      raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

    onUpdateBatch({
      ...batch,
      organisation: orgInput.trim() || 'Unassigned',
      venue: venueInput.trim(),
      roomNumber: roomInput.trim(),
      expertName: expertInput.trim(),
      gender: genderInput.trim(),
      contactNumbers: parseList(contactsInput),
      emails: parseList(emailsInput),
      facultyIncharge: parseList(facultyInput),
      allocationNote:
        !venueInput.trim() && batch.trackType === 'IT'
          ? 'Pending trainer & venue allocation'
          : undefined,
    });
    setSaveMessage('Allocation updated');
    setTimeout(() => setSaveMessage(null), 2200);
  };

  const attended = counts.present + counts.late + counts.od;
  const pct =
    batch.studentCount > 0 ? Math.round((attended / batch.studentCount) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 dark:bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${batch.department} Batch Details`}
    >
      <div
        className="w-full max-w-2xl h-full bg-white dark:bg-[#111827] border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{dayLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{dateKey}</span>
              <span aria-hidden="true">·</span>
              <span>{batch.organisation}</span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight mt-0.5 truncate">
              {batch.department} — {batch.trackType === 'CORE' ? 'Core Track' : `${batch.studentCount} Students`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Batch Metadata Strip */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-medium">
                {batch.venue ? `${batch.venue}` : 'Venue pending'}
              </span>
              {batch.roomNumber && (
                <>
                  <span className="text-slate-400">·</span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Room {batch.roomNumber}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                {batch.expertName || 'Expert unassigned'}
                {batch.gender ? ` (${batch.gender})` : ''}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 flex-wrap">
              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {batch.contactNumbers.length > 0 ? (
                batch.contactNumbers.map((phone) => (
                  <button
                    key={phone}
                    type="button"
                    onClick={() => handleCopy(phone)}
                    className="inline-flex items-center gap-1 font-mono tabular-nums hover:text-blue-600 dark:hover:text-blue-400"
                    title="Copy phone number"
                  >
                    {phone}
                    {copiedText === phone ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3 opacity-50" />
                    )}
                  </button>
                ))
              ) : (
                <span className="text-slate-400">No contact listed</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 truncate">
              <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">
                {batch.facultyIncharge.length > 0
                  ? `Faculty: ${batch.facultyIncharge.join(', ')}`
                  : 'Faculty incharge unassigned'}
              </span>
            </div>
          </div>
        </div>

        {/* Drawer Tabs + Session State Control */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('rollcall')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'rollcall'
                  ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Student Roll Call
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('allocation')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'allocation'
                  ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Edit Allocation
            </button>
          </div>

          {batch.trackType === 'IT' && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="drawer-session-status"
                className="text-xs text-slate-500 dark:text-slate-400"
              >
                Session:
              </label>
              <select
                id="drawer-session-status"
                value={sessionStatus}
                onChange={(e) =>
                  onSetSessionStatus(batch.id, e.target.value as BatchSessionStatus)
                }
                className="text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="completed">Completed</option>
                <option value="in-session">In Session</option>
                <option value="pending">Pending Roll Call</option>
              </select>
            </div>
          )}
        </div>

        {/* Main Drawer Body */}
        {activeTab === 'rollcall' ? (
          batch.trackType === 'CORE' ? (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
              <div className="max-w-sm space-y-3">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Mechanical — CORE Internship Track
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  In the source roster, Mechanical students are assigned to Core Engineering
                  rather than the IT Fullstack track. Use Edit Allocation if you want to assign
                  a room or faculty coordinator.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('allocation')}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Edit Allocation Details
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Live Summary + Bulk Actions */}
              <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {pct}% Attended
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    P: {counts.present}
                  </span>
                  <span className="text-amber-700 dark:text-amber-400">
                    L: {counts.late}
                  </span>
                  <span className="text-blue-700 dark:text-blue-400">
                    OD: {counts.od}
                  </span>
                  <span className="text-rose-700 dark:text-rose-400">
                    A: {counts.absent}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Unmarked: {counts.unmarked}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onBulkSetBatchStatus(batch.id, 'present', false)}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors whitespace-nowrap shrink-0"
                  >
                    Mark All Present
                  </button>
                  <button
                    type="button"
                    onClick={() => onBulkSetBatchStatus(batch.id, 'unmarked', false)}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    Reset Day
                  </button>
                </div>
              </div>

              {/* Search & Status Filter */}
              <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search roll number or student name..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'all' | AttendanceStatus)
                  }
                  aria-label="Filter students by attendance status"
                  className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All ({batchStudents.length})</option>
                  <option value="present">Present ({counts.present})</option>
                  <option value="late">Late ({counts.late})</option>
                  <option value="od">On-Duty ({counts.od})</option>
                  <option value="absent">Absent ({counts.absent})</option>
                  <option value="unmarked">Unmarked ({counts.unmarked})</option>
                </select>
              </div>

              {/* Student Roll Call List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredStudents.length === 0 ? (
                  <div className="py-12 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    No students match the current filter.
                  </div>
                ) : (
                  filteredStudents.map((student) => {
                    const current = dayAttendance[student.id] || 'unmarked';
                    return (
                      <div
                        key={student.id}
                        className="px-6 py-2.5 flex items-center justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <span className="font-mono tabular-nums text-xs font-medium text-slate-500 dark:text-slate-400 w-16 shrink-0">
                            {student.rollNumber}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {student.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 truncate">
                              {student.email}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {STATUS_OPTIONS.map((opt) => {
                            const active = current === opt.value;
                            let activeCls = '';
                            if (active && opt.value === 'present') {
                              activeCls =
                                'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500';
                            } else if (active && opt.value === 'late') {
                              activeCls =
                                'bg-amber-500 text-white border-amber-500';
                            } else if (active && opt.value === 'od') {
                              activeCls =
                                'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500';
                            } else if (active && opt.value === 'absent') {
                              activeCls =
                                'bg-rose-600 text-white border-rose-600 dark:bg-rose-500 dark:border-rose-500';
                            }

                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() =>
                                  onSetStudentStatus(
                                    student.id,
                                    active ? 'unmarked' : opt.value
                                  )
                                }
                                className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                                  active
                                    ? activeCls
                                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )
        ) : (
          /* Allocation Edit Form */
          <form
            onSubmit={handleSaveAllocation}
            className="flex-1 overflow-y-auto p-6 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Training Organisation
                </label>
                <input
                  type="text"
                  value={orgInput}
                  onChange={(e) => setOrgInput(e.target.value)}
                  placeholder="e.g. Rampex, Better Tomorrow"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Venue / Lab
                </label>
                <input
                  type="text"
                  value={venueInput}
                  onChange={(e) => setVenueInput(e.target.value)}
                  placeholder="e.g. TF07, AI-301"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Room Number
                </label>
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  placeholder="e.g. 704"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Expert Name
                </label>
                <input
                  type="text"
                  value={expertInput}
                  onChange={(e) => setExpertInput(e.target.value)}
                  placeholder="e.g. Mr. Vikram"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Trainer Gender
                </label>
                <select
                  value={genderInput}
                  onChange={(e) => setGenderInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Unspecified</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Contact Number(s)
                </label>
                <input
                  type="text"
                  value={contactsInput}
                  onChange={(e) => setContactsInput(e.target.value)}
                  placeholder="Comma-separated numbers"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Trainer Email ID(s)
              </label>
              <input
                type="text"
                value={emailsInput}
                onChange={(e) => setEmailsInput(e.target.value)}
                placeholder="Comma-separated emails"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Faculty Incharge (Fullstack)
              </label>
              <input
                type="text"
                value={facultyInput}
                onChange={(e) => setFacultyInput(e.target.value)}
                placeholder="e.g. Dr. Rajesha / ECE"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="pt-3 flex items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                {saveMessage || ''}
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0"
              >
                Save Allocation
              </button>
            </div>
          </form>
        )}

        {/* Quick Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="inline-flex items-center gap-2">
            {counts.absent > 0 ? (
              <UserX className="w-3.5 h-3.5 text-rose-500" />
            ) : (
              <Clock className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>
              {batch.trackType === 'CORE'
                ? 'Core Engineering Track'
                : `${attended} of ${batch.studentCount} students marked present/late/OD`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-medium text-slate-700 dark:text-slate-200 hover:underline"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
