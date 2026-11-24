import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import type { AccountSummary, AuthUser } from '../types/internship';
import { compareLex } from '../utils/csvParser';

interface ProvisionedCredential {
  username: string;
  displayName: string;
  assignedDepartments: string[];
  temporaryPassword: string;
}

interface AccessControlViewProps {
  currentUser: AuthUser;
  authToken: string;
}

export const AccessControlView: React.FC<AccessControlViewProps> = ({
  currentUser,
  authToken,
}) => {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<AccountSummary | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [provisionedList, setProvisionedList] = useState<ProvisionedCredential[]>([]);
  const [provisioning, setProvisioning] = useState(false);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/accounts', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to load account directory.');
        return;
      }
      setAccounts(data.accounts || []);
    } catch {
      setErrorMsg('Network error loading account credentials.');
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setErrorMsg(null);
    setStatusMsg(null);

    const minLen = editingUser.username === 'superadmin' ? 8 : 6;
    if (newPassword.length < minLen) {
      setErrorMsg(`Password must be at least ${minLen} characters.`);
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/admin/set-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          username: editingUser.username,
          password: newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to update password.');
        return;
      }
      setAccounts(data.accounts || []);
      setStatusMsg(`Updated password for ${editingUser.displayName} (${editingUser.username}).`);
      setEditingUser(null);
      setNewPassword('');
    } catch {
      setErrorMsg('Network error saving password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleProvisionFaculty = async (mode: 'missing' | 'all') => {
    setProvisioning(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setConfirmResetAll(false);
    try {
      const res = await fetch('/api/admin/provision-faculty', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to provision faculty credentials.');
        return;
      }
      setAccounts(data.accounts || []);
      const list = (data.provisioned || []) as ProvisionedCredential[];
      setProvisionedList(list);
      if (list.length === 0) {
        setStatusMsg('All faculty accounts already have active passwords configured.');
      } else {
        setStatusMsg(
          `Generated ${list.length} temporary faculty login ${
            list.length === 1 ? 'credential' : 'credentials'
          }. Copy or export the CSV below before dismissing.`
        );
      }
    } catch {
      setErrorMsg('Network error provisioning faculty credentials.');
    } finally {
      setProvisioning(false);
    }
  };

  const handleCopyCredentials = () => {
    if (provisionedList.length === 0) return;
    const text = provisionedList
      .map(
        (p) =>
          `${p.displayName} | Dept: ${p.assignedDepartments.join(', ')} | Username: ${p.username} | Password: ${p.temporaryPassword}`
      )
      .join('\n');
    navigator.clipboard?.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1800);
  };

  const handleDownloadCredentialsCsv = () => {
    if (provisionedList.length === 0) return;
    const esc = (v: string) =>
      v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    const header = 'Faculty Name,Assigned Departments,Username,Temporary Password';
    const rows = provisionedList.map((p) =>
      [
        p.displayName,
        p.assignedDepartments.join(' / '),
        p.username,
        p.temporaryPassword,
      ]
        .map(esc)
        .join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'B2025-2029_Faculty_Credentials.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const adminAccounts = accounts
    .filter((a) => a.role !== 'faculty')
    .sort((a, b) => compareLex(a.displayName, b.displayName));
  const facultyAccounts = accounts
    .filter((a) => a.role === 'faculty')
    .sort((a, b) => compareLex(a.displayName, b.displayName));
  const missingFacultyCount = facultyAccounts.filter((f) => !f.hasPassword).length;

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Access Control &amp; Faculty Credentials
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Signed in as <strong className="text-slate-800 dark:text-slate-200">{currentUser.displayName}</strong> · Faculty logins are extracted from the sheet&apos;s Faculty Incharge column and restricted to their assigned department batch(es).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={provisioning || missingFacultyCount === 0}
            onClick={() => handleProvisionFaculty('missing')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {missingFacultyCount > 0
              ? `Generate ${missingFacultyCount} Unset Faculty Passwords`
              : 'All Faculty Passwords Set'}
          </button>

          {!confirmResetAll ? (
            <button
              type="button"
              disabled={provisioning}
              onClick={() => setConfirmResetAll(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate All Faculty
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleProvisionFaculty('all')}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors whitespace-nowrap"
              >
                Confirm Reset All ({facultyAccounts.length})
              </button>
              <button
                type="button"
                onClick={() => setConfirmResetAll(false)}
                className="px-2.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 text-xs text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {statusMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 text-xs text-emerald-700 dark:text-emerald-300">
          {statusMsg}
        </div>
      )}

      {/* One-time Provisioned Credentials Sheet */}
      {provisionedList.length > 0 && (
        <section className="bg-white dark:bg-[#111827] border border-blue-300 dark:border-blue-800/70 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-blue-50/70 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-900/60 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Generated Faculty Credentials (Shown Once)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Passwords are stored as one-way hashes on the server. Copy or download this CSV before clearing.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {copiedAll ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy All
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadCredentialsCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
              <button
                type="button"
                onClick={() => setProvisionedList([])}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800"
              >
                Dismiss
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">Faculty Name</th>
                  <th className="py-2.5 px-4">Assigned Batch(es)</th>
                  <th className="py-2.5 px-4">Username</th>
                  <th className="py-2.5 px-4">Temporary Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {provisionedList.map((item) => (
                  <tr key={item.username}>
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">
                      {item.displayName}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                      {item.assignedDepartments.join(', ')}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-blue-700 dark:text-blue-400">
                      {item.username}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-white select-all">
                      {item.temporaryPassword}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Inline Password Reset Drawer/Form */}
      {editingUser && (
        <form
          onSubmit={handleSetPassword}
          className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl p-5 flex flex-wrap items-end justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Set Password for {editingUser.role.toUpperCase()}
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              {editingUser.displayName}{' '}
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                ({editingUser.username})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 flex-1 justify-end">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={
                editingUser.username === 'superadmin'
                  ? 'New password (min 8 chars)'
                  : 'New password (min 6 chars)'
              }
              autoComplete="new-password"
              className="w-full sm:w-64 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={savingPassword}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white whitespace-nowrap"
            >
              {savingPassword ? 'Saving...' : 'Save Password'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingUser(null);
                setNewPassword('');
              }}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Admin & Super Admin Accounts */}
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <UserCog className="w-4 h-4 text-slate-500" />
            Administration Accounts
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Full cohort view &amp; edit permissions
          </span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {adminAccounts.map((acc) => {
            const canEdit = currentUser.role === 'superadmin';
            return (
              <div
                key={acc.username}
                className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-sm"
              >
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {acc.displayName}
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    Username: {acc.username} · Scope: All {acc.assignedDepartments.length} Batches
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-mono ${
                      acc.hasPassword
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {acc.hasPassword ? 'Configured' : 'Not Set'}
                  </span>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUser(acc);
                        setNewPassword('');
                        setErrorMsg(null);
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      {acc.hasPassword ? 'Reset Password' : 'Set Password'}
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      Super Admin only
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Faculty Accounts Table */}
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Faculty Incharge Accounts ({facultyAccounts.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Each faculty member can mark FN &amp; AN attendance solely for their assigned department(s).
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {facultyAccounts.length - missingFacultyCount}/{facultyAccounts.length} Configured
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Loading faculty accounts...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Faculty Name</th>
                  <th className="py-3 px-4">Login Username</th>
                  <th className="py-3 px-4">Assigned Department(s)</th>
                  <th className="py-3 px-4">Credential Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {facultyAccounts.map((acc) => (
                  <tr
                    key={acc.username}
                    className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                      {acc.displayName}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-blue-700 dark:text-blue-400">
                      {acc.username}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {acc.assignedDepartments.join(', ')}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-mono">
                      <span
                        className={
                          acc.hasPassword
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }
                      >
                        {acc.hasPassword ? 'Configured' : 'Not Set'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUser(acc);
                          setNewPassword('');
                          setErrorMsg(null);
                        }}
                        className="px-3 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {acc.hasPassword ? 'Reset' : 'Set Password'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
