import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, UserCheck, X } from 'lucide-react';
import type { AuthUser } from '../types/internship';
import { compareLex } from '../utils/csvParser';

export interface PublicFacultyEntry {
  username: string;
  displayName: string;
  assignedDepartments: string[];
  hasPassword: boolean;
}

interface AuthModalProps {
  isOpen: boolean;
  superAdminClaimed: boolean;
  facultyDirectory: PublicFacultyEntry[];
  currentUser: AuthUser | null;
  onClose: () => void;
  onAuthenticated: (token: string, user: AuthUser) => void;
  onContinueAsGuest: () => void;
}

type AuthTab = 'faculty' | 'admin' | 'setup';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  superAdminClaimed,
  facultyDirectory,
  currentUser,
  onClose,
  onAuthenticated,
  onContinueAsGuest,
}) => {
  const canClaimSuperAdmin = !superAdminClaimed;
  const [tab, setTab] = useState<AuthTab>(canClaimSuperAdmin ? 'setup' : 'faculty');

  // Faculty login state
  const [selectedFaculty, setSelectedFaculty] = useState<string>(
    facultyDirectory[0]?.username || ''
  );
  const [facultyFilter, setFacultyFilter] = useState('');
  const [adminRole, setAdminRole] = useState<'admin' | 'superadmin'>('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    if (canClaimSuperAdmin) {
      setTab('setup');
    } else if (tab === 'setup') {
      setTab('faculty');
    }
  }, [isOpen, canClaimSuperAdmin]);

  useEffect(() => {
    if (!selectedFaculty && facultyDirectory.length > 0) {
      setSelectedFaculty(facultyDirectory[0].username);
    }
  }, [facultyDirectory, selectedFaculty]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const filteredFaculty = useMemo(() => {
    const q = facultyFilter.trim().toLowerCase();
    const list = !q
      ? facultyDirectory
      : facultyDirectory.filter(
          (f) =>
            f.displayName.toLowerCase().includes(q) ||
            f.username.toLowerCase().includes(q) ||
            f.assignedDepartments.some((d) => d.toLowerCase().includes(q))
        );
    return [...list].sort((a, b) => compareLex(a.displayName, b.displayName));
  }, [facultyDirectory, facultyFilter]);

  useEffect(() => {
    if (
      filteredFaculty.length > 0 &&
      !filteredFaculty.some((f) => f.username === selectedFaculty)
    ) {
      setSelectedFaculty(filteredFaculty[0].username);
    }
  }, [filteredFaculty, selectedFaculty]);

  if (!isOpen) return null;

  const activeFacultyEntry = facultyDirectory.find(
    (f) => f.username === selectedFaculty
  );

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const username = tab === 'faculty' ? selectedFaculty : adminRole;
    if (!username) {
      setErrorMsg('Select a faculty account before signing in.');
      return;
    }
    if (!password) {
      setErrorMsg('Enter your password to sign in.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Sign in failed.');
        return;
      }
      onAuthenticated(data.token, data.user);
      onClose();
    } catch {
      setErrorMsg('Network error while contacting authentication service.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetupSuperAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (password.length < 8) {
      setErrorMsg('Super Admin password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/setup-superadmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to initialize Super Admin account.');
        return;
      }
      onAuthenticated(data.token, data.user);
      onClose();
    } catch {
      setErrorMsg('Network error while initializing Super Admin account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 dark:bg-black/70 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to CohortTrack"
    >
      <div
        className="w-full max-w-md bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
              {tab === 'setup' ? 'Initialize Super Admin' : 'Staff & Faculty Sign In'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {currentUser
                ? `Signed in as ${currentUser.displayName}`
                : 'Guests can browse & download summaries · Staff login required to edit'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close sign in dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-6 pt-4">
          <div className="grid grid-flow-col auto-cols-fr gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
            {canClaimSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  setTab('setup');
                  setErrorMsg(null);
                }}
                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  tab === 'setup'
                    ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                First-Run Setup
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setTab('faculty');
                setErrorMsg(null);
              }}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'faculty'
                  ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Faculty Incharge
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('admin');
                setErrorMsg(null);
              }}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'admin'
                  ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Admin / Super Admin
            </button>
          </div>
        </div>

        {/* Form Body */}
        {tab === 'setup' ? (
          <form onSubmit={handleSetupSuperAdmin} className="p-6 space-y-4">
            <div className="p-3.5 rounded-lg border border-blue-200 dark:border-blue-900/70 bg-blue-50/70 dark:bg-blue-950/30 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              Create the initial <strong>Super Admin</strong> password to unlock full dashboard controls, set the <strong>Admin</strong> password, and batch-generate login credentials for all {facultyDirectory.length} Faculty Incharges.
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Super Admin Username
              </label>
              <input
                type="text"
                readOnly
                value="superadmin"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="setup-superadmin-pw"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Choose Super Admin Password (min 8 chars)
              </label>
              <div className="relative">
                <input
                  id="setup-superadmin-pw"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter strong password"
                  autoComplete="new-password"
                  className="w-full pl-3 pr-9 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="setup-superadmin-confirm"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Confirm Password
              </label>
              <input
                id="setup-superadmin-confirm"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 text-xs text-rose-700 dark:text-rose-300">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              {submitting ? 'Setting Up...' : 'Claim Super Admin & Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
            {tab === 'faculty' ? (
              <>
                <div>
                  <label
                    htmlFor="faculty-filter-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Filter Faculty or Department
                  </label>
                  <input
                    id="faculty-filter-input"
                    type="text"
                    value={facultyFilter}
                    onChange={(e) => setFacultyFilter(e.target.value)}
                    placeholder="Search e.g. CSE-A, Saranya, Sam Peter..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="faculty-account-select"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Faculty Account ({filteredFaculty.length})
                  </label>
                  <select
                    id="faculty-account-select"
                    value={selectedFaculty}
                    onChange={(e) => {
                      setSelectedFaculty(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {filteredFaculty.map((f) => (
                      <option key={f.username} value={f.username}>
                        {f.displayName} · {f.assignedDepartments.join(', ')} ({f.username})
                      </option>
                    ))}
                  </select>
                  {activeFacultyEntry && !activeFacultyEntry.hasPassword && (
                    <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      Password not provisioned yet — ask Admin or Super Admin to generate faculty credentials.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Administrator Account
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAdminRole('admin');
                      setErrorMsg(null);
                    }}
                    className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      adminRole === 'admin'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Admin (admin)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdminRole('superadmin');
                      setErrorMsg(null);
                    }}
                    className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      adminRole === 'superadmin'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Super Admin
                  </button>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="login-password-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  className="w-full pl-3 pr-9 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 text-xs text-rose-700 dark:text-rose-300">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors"
            >
              <Lock className="w-4 h-4" />
              {submitting ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* Guest Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Guest mode allows viewing &amp; PDF/CSV downloads.
          </span>
          <button
            type="button"
            onClick={() => {
              onContinueAsGuest();
              onClose();
            }}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
          >
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
};
