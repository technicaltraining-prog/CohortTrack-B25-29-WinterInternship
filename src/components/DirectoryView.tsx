import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Search,
  UserCheck,
} from 'lucide-react';
import { BatchRecord } from '../types/internship';

interface DirectoryViewProps {
  batches: BatchRecord[];
  onEditBatchAllocation: (batchId: string) => void;
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  batches,
  onEditBatchAllocation,
}) => {
  const [search, setSearch] = useState('');
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const pendingAllocations = useMemo(
    () =>
      batches.filter(
        (b) =>
          b.trackType === 'CORE' ||
          !b.venue ||
          !b.expertName ||
          b.organisation === 'Unassigned'
      ),
    [batches]
  );

  const assignedBatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return batches.filter((b) => {
      if (!q) return true;
      return (
        b.department.toLowerCase().includes(q) ||
        b.organisation.toLowerCase().includes(q) ||
        b.expertName.toLowerCase().includes(q) ||
        b.venue.toLowerCase().includes(q) ||
        b.roomNumber.toLowerCase().includes(q) ||
        b.facultyIncharge.some((f) => f.toLowerCase().includes(q))
      );
    });
  }, [batches, search]);

  const handleCopy = (val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedValue(val);
    setTimeout(() => setCopiedValue(null), 1500);
  };

  return (
    <div className="space-y-6">
      {/* Unassigned / Core Alert Section */}
      {pendingAllocations.length > 0 && (
        <section className="bg-white dark:bg-[#111827] border border-amber-300/80 dark:border-amber-800/60 rounded-xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Batches Pending Venue / Trainer Assignment ({pendingAllocations.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  These rows had blank trainer or venue cells in the uploaded CSV (or CORE track). Assign details directly below.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pendingAllocations.map((b) => (
              <div
                key={b.id}
                className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      {b.department}
                    </span>
                    <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                      {b.trackType === 'CORE' ? 'CORE' : `${b.studentCount} students`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {b.allocationNote || 'Missing venue / trainer details'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEditBatchAllocation(b.id)}
                  className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Assign Allocation
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Search Bar */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
              Trainers, Venues & Faculty Incharge Directory
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Direct contacts, room numbers, and faculty coordinators across all {batches.length} batches
            </p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by dept, trainer, room, partner..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Directory Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {assignedBatches.map((b) => (
          <div
            key={b.id}
            className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {b.organisation}
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {b.trackType === 'CORE' ? 'CORE' : `${b.studentCount} students`}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                    {b.department}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onEditBatchAllocation(b.id)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Edit allocation"
                  aria-label={`Edit ${b.department} allocation`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-medium">{b.venue || 'Venue pending'}</span>
                  {b.roomNumber && (
                    <>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        Room {b.roomNumber}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    {b.expertName || 'Unassigned'}
                    {b.gender ? ` · ${b.gender}` : ''}
                  </span>
                </div>

                {b.contactNumbers.length > 0 && (
                  <div className="flex items-start gap-2 text-slate-700 dark:text-slate-200">
                    <Phone className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {b.contactNumbers.map((phone) => (
                        <button
                          key={phone}
                          type="button"
                          onClick={() => handleCopy(phone)}
                          className="inline-flex items-center gap-1 font-mono tabular-nums hover:text-blue-600 dark:hover:text-blue-400"
                          title="Copy contact number"
                        >
                          {phone}
                          {copiedValue === phone ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 opacity-40" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {b.emails.length > 0 && (
                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <Mail className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0 space-y-0.5">
                      {b.emails.map((email) => (
                        <a
                          key={email}
                          href={`mailto:${email}`}
                          className="block truncate hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                        >
                          {email}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Faculty Incharge:{' '}
              </span>
              {b.facultyIncharge.length > 0
                ? b.facultyIncharge.join(' · ')
                : 'Unassigned'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
