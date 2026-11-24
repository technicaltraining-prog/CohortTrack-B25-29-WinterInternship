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
  Lock,
  LogIn,
  LogOut,
  Menu,
  Minus,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sun,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { AccessControlView } from './components/AccessControlView';
import { AttendanceCharts } from './components/AttendanceCharts';
import { AuthModal, type PublicFacultyEntry } from './components/AuthModal';
import { BatchDetailDrawer } from './components/BatchDetailDrawer';
import { DailySummaryModal } from './components/DailySummaryModal';
import { DirectoryView } from './components/DirectoryView';
import { ScheduleHeatmapView } from './components/ScheduleHeatmapView';
import { StudentRosterView } from './components/StudentRosterView';
import type {
  AttendanceStatus,
  AuthUser,
  BatchRecord,
  BatchSessionMeta,
  BatchSessionStatus,
  DashboardView,
  SessionPeriod,
  StudentRecord,
} from './types/internship';
import {
  buildBatchSummaryCsv,
  buildStudentRollCallCsv,
  compareLex,
  deduplicateAndSortStudents,
  generateInternshipDays,
  generateStudentsForBatches,
  makeSessionKey,
} from './utils/csvParser';
import {
  DAILY_CHECKPOINTS,
  type DailyCheckpoint,
  getNextCheckpointInfo,
  getReachedCheckpointsForDate,
  type ScheduleSyncState,
} from './utils/scheduledSync';

const THEME_STORAGE_KEY = 'cohorttrack_theme_v1';

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

  // Auth state strictly held in React memory (never persisted to localStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [superAdminClaimed, setSuperAdminClaimed] = useState(true);
  const [facultyDirectory, setFacultyDirectory] = useState<PublicFacultyEntry[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Core data state loaded from backend API
  const [loading, setLoading] = useState(true);
  const [programTitle, setProgramTitle] = useState(
    'Fullstack Internship B2025-2029 - II Year'
  );
  const [dateRange, setDateRange] = useState('24.11.2026 - 12.12.2026');
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [serverStudents, setServerStudents] = useState<StudentRecord[]>([]);
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
  const [activeSession, setActiveSession] = useState<SessionPeriod>('FN');
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

  // Optional user-controlled live roll-call check-in simulation (Admin / Super Admin / Faculty own batch)
  const [isLiveSimulating, setIsLiveSimulating] = useState(false);
  const [lastLiveEvent, setLastLiveEvent] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Daily 3-slot auto-update schedule state
  const [clockNow, setClockNow] = useState<Date>(() => new Date());
  const [scheduleState, setScheduleState] = useState<ScheduleSyncState>({
    enabled: true,
    lastSyncSummary: null,
    completedSlots: {},
  });

  const isAdminOrSuper =
    currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const isAuthenticatedEditor = Boolean(authToken && currentUser && currentUser.role !== 'guest');

  const canMarkDepartment = useCallback(
    (department: string) => {
      if (!authToken || !currentUser || currentUser.role === 'guest') return false;
      if (currentUser.role === 'superadmin' || currentUser.role === 'admin') {
        return true;
      }
      return currentUser.assignedDepartments.includes(department);
    },
    [authToken, currentUser]
  );

  const showNotice = useCallback((msg: string) => {
    setActionFeedback(msg);
    window.setTimeout(() => {
      setActionFeedback((curr) => (curr === msg ? null : curr));
    }, 3500);
  }, []);

  const students: StudentRecord[] = useMemo(
    () =>
      serverStudents.length > 0
        ? deduplicateAndSortStudents(serverStudents)
        : generateStudentsForBatches(batches),
    [serverStudents, batches]
  );

  const applyServerCohortPayload = useCallback(
    (data: {
      programTitle?: string;
      dateRange?: string;
      batches?: BatchRecord[];
      students?: StudentRecord[];
      dailyAttendance?: Record<string, Record<string, AttendanceStatus>>;
      sessionMeta?: Record<string, Record<string, BatchSessionMeta>>;
      scheduleState?: ScheduleSyncState;
      facultyDirectory?: PublicFacultyEntry[];
    }) => {
      if (data.programTitle) setProgramTitle(data.programTitle);
      if (data.dateRange) setDateRange(data.dateRange);
      if (Array.isArray(data.batches)) setBatches(data.batches);
      if (Array.isArray(data.students)) {
        setServerStudents(deduplicateAndSortStudents(data.students));
      } else if (Array.isArray(data.batches)) {
        setServerStudents([]);
      }
      if (data.dailyAttendance) setDailyAttendance(data.dailyAttendance);
      if (data.sessionMeta) setSessionMeta(data.sessionMeta);
      if (data.scheduleState) setScheduleState(data.scheduleState);
      if (Array.isArray(data.facultyDirectory)) {
        setFacultyDirectory(data.facultyDirectory);
      }
    },
    []
  );

  // Initial load from Express backend API
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const [authRes, stateRes] = await Promise.all([
          fetch('/api/auth/status'),
          fetch('/api/state'),
        ]);
        if (!cancelled && authRes.ok) {
          const authData = await authRes.json();
          setSuperAdminClaimed(Boolean(authData.superAdminClaimed));
          if (Array.isArray(authData.facultyDirectory)) {
            setFacultyDirectory(authData.facultyDirectory);
          }
        }
        if (!cancelled && stateRes.ok) {
          const stateData = await stateRes.json();
          applyServerCohortPayload(stateData);
        }
      } catch {
        showNotice('Unable to reach server state endpoint.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [applyServerCohortPayload, showNotice]);

  // Redirect away from Access view if signed out or non-admin
  useEffect(() => {
    if (activeView === 'access' && !isAdminOrSuper) {
      setActiveView('overview');
    }
  }, [activeView, isAdminOrSuper]);

  const handleAuthenticated = useCallback((token: string, user: AuthUser) => {
    setAuthToken(token);
    setCurrentUser(user);
    setSuperAdminClaimed(true);
    setActionFeedback(null);
  }, []);

  const handleLogout = useCallback(async () => {
    setIsLiveSimulating(false);
    setLastLiveEvent(null);
    const tok = authToken;
    setAuthToken(null);
    setCurrentUser(null);
    if (activeView === 'access') {
      setActiveView('overview');
    }
    if (tok) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}` },
        });
      } catch {
        // ignore network errors on logout
      }
    }
  }, [authToken, activeView]);

  const currentDay = useMemo(
    () => workingDays.find((d) => d.dateKey === selectedDateKey) || workingDays[0],
    [workingDays, selectedDateKey]
  );

  const fnSessionKey = useMemo(
    () => makeSessionKey(selectedDateKey, 'FN'),
    [selectedDateKey]
  );
  const anSessionKey = useMemo(
    () => makeSessionKey(selectedDateKey, 'AN'),
    [selectedDateKey]
  );
  const activeSessionKey =
    activeSession === 'FN' ? fnSessionKey : anSessionKey;

  const fnAttendance = useMemo(
    () => dailyAttendance[fnSessionKey] || {},
    [dailyAttendance, fnSessionKey]
  );
  const anAttendance = useMemo(
    () => dailyAttendance[anSessionKey] || {},
    [dailyAttendance, anSessionKey]
  );

  const dayAttendance = activeSession === 'FN' ? fnAttendance : anAttendance;
  const pairedDayAttendance =
    activeSession === 'FN' ? anAttendance : fnAttendance;

  const daySessionMeta = useMemo(
    () => sessionMeta[activeSessionKey] || {},
    [sessionMeta, activeSessionKey]
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

  const batchById = useMemo(
    () => new Map(batches.map((b) => [b.id, b])),
    [batches]
  );

  // Update a single student's attendance via authenticated API
  const handleSetStudentSessionStatus = useCallback(
    async (studentId: string, session: SessionPeriod, status: AttendanceStatus) => {
      if (!authToken || !currentUser || currentUser.role === 'guest') {
        setIsAuthModalOpen(true);
        return;
      }
      const student = students.find((s) => s.id === studentId);
      if (!student || !canMarkDepartment(student.department)) {
        showNotice(`Only ${student?.department || 'assigned'} Faculty or Admin can mark this batch.`);
        return;
      }

      try {
        const res = await fetch('/api/attendance/mark', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            dateKey: selectedDateKey,
            session,
            studentId,
            status,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showNotice(data.error || 'Failed to update attendance.');
          return;
        }
        setDailyAttendance((prev) => ({
          ...prev,
          [data.sessKey]: data.dayAttendance,
        }));
        setSessionMeta((prev) => ({
          ...prev,
          [data.sessKey]: data.dayMeta,
        }));
      } catch {
        showNotice('Network error while saving attendance.');
      }
    },
    [authToken, currentUser, students, canMarkDepartment, selectedDateKey, showNotice]
  );

  const handleSetStudentStatus = useCallback(
    (studentId: string, status: AttendanceStatus) => {
      void handleSetStudentSessionStatus(studentId, activeSession, status);
    },
    [handleSetStudentSessionStatus, activeSession]
  );

  // Bulk update a batch's students in the active FN/AN session
  const handleBulkSetBatchStatus = useCallback(
    async (batchId: string, status: AttendanceStatus, onlyUnmarked = false) => {
      if (!authToken || !currentUser || currentUser.role === 'guest') {
        setIsAuthModalOpen(true);
        return;
      }
      const batch = batchById.get(batchId);
      if (!batch || !canMarkDepartment(batch.department)) {
        showNotice(`Not authorized to bulk update ${batch?.department || 'this batch'}.`);
        return;
      }

      try {
        const res = await fetch('/api/attendance/bulk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            dateKey: selectedDateKey,
            session: activeSession,
            batchId,
            status,
            onlyUnmarked,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showNotice(data.error || 'Bulk update failed.');
          return;
        }
        setDailyAttendance((prev) => ({
          ...prev,
          [data.sessKey]: data.dayAttendance,
        }));
        setSessionMeta((prev) => ({
          ...prev,
          [data.sessKey]: data.dayMeta,
        }));
      } catch {
        showNotice('Network error during bulk update.');
      }
    },
    [authToken, currentUser, batchById, canMarkDepartment, selectedDateKey, activeSession, showNotice]
  );

  // Quick +/- 1 present student adjustment right from the main batch table
  const handleQuickAdjustPresent = useCallback(
    (batchId: string, delta: 1 | -1) => {
      const list = studentsByBatch.get(batchId) || [];
      const currentMap = dailyAttendance[activeSessionKey] || {};

      if (delta === 1) {
        const target =
          list.find((s) => !currentMap[s.id] || currentMap[s.id] === 'unmarked') ||
          list.find((s) => currentMap[s.id] === 'absent') ||
          list.find((s) => currentMap[s.id] === 'late');
        if (target) {
          handleSetStudentStatus(target.id, 'present');
        }
      } else {
        const reversed = [...list].reverse();
        const target = reversed.find((s) => currentMap[s.id] === 'present');
        if (target) {
          handleSetStudentStatus(target.id, 'absent');
        }
      }
    },
    [dailyAttendance, activeSessionKey, handleSetStudentStatus, studentsByBatch]
  );

  const handleSetSessionStatus = useCallback(
    async (batchId: string, status: BatchSessionStatus) => {
      if (!authToken || !currentUser || currentUser.role === 'guest') {
        setIsAuthModalOpen(true);
        return;
      }
      const batch = batchById.get(batchId);
      if (!batch || !canMarkDepartment(batch.department)) {
        showNotice(`Not authorized to change status for ${batch?.department || 'this batch'}.`);
        return;
      }
      try {
        const res = await fetch('/api/attendance/session-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            dateKey: selectedDateKey,
            session: activeSession,
            batchId,
            status,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showNotice(data.error || 'Failed to update session status.');
          return;
        }
        setSessionMeta((prev) => ({
          ...prev,
          [data.sessKey]: data.dayMeta,
        }));
      } catch {
        showNotice('Network error updating session status.');
      }
    },
    [authToken, currentUser, batchById, canMarkDepartment, selectedDateKey, activeSession, showNotice]
  );

  const handleUpdateBatch = useCallback(
    async (updated: BatchRecord) => {
      if (!authToken || !isAdminOrSuper) {
        setIsAuthModalOpen(true);
        return;
      }
      try {
        const res = await fetch(`/api/batches/${encodeURIComponent(updated.id)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(updated),
        });
        const data = await res.json();
        if (!res.ok) {
          showNotice(data.error || 'Failed to save batch allocation.');
          return;
        }
        setBatches((prev) =>
          prev.map((b) => (b.id === updated.id ? data.batch : b))
        );
        if (Array.isArray(data.facultyDirectory)) {
          setFacultyDirectory(data.facultyDirectory);
        }
      } catch {
        showNotice('Network error saving batch allocation.');
      }
    },
    [authToken, isAdminOrSuper, showNotice]
  );

  // Optional live check-in simulator scoped to permitted batches
  useEffect(() => {
    if (!isLiveSimulating || !authToken || !currentUser || currentUser.role === 'guest') {
      return;
    }
    const timer = window.setInterval(() => {
      const permittedStudents = students.filter((s) =>
        canMarkDepartment(s.department)
      );
      if (permittedStudents.length === 0) return;

      const currentMap = dailyAttendance[activeSessionKey] || {};
      const unmarkedStudents = permittedStudents.filter(
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
          `${pick.rollNumber} (${pick.department} · ${activeSession}) marked ${status}`
        );
      } else {
        const pick =
          permittedStudents[Math.floor(Math.random() * permittedStudents.length)];
        const nextStatus: AttendanceStatus =
          currentMap[pick.id] === 'present' ? 'late' : 'present';
        handleSetStudentStatus(pick.id, nextStatus);
        setLastLiveEvent(
          `${pick.rollNumber} (${pick.department} · ${activeSession}) updated to ${nextStatus}`
        );
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [
    isLiveSimulating,
    authToken,
    currentUser,
    dailyAttendance,
    activeSessionKey,
    activeSession,
    students,
    canMarkDepartment,
    handleSetStudentStatus,
  ]);

  const handleRunCheckpoint = useCallback(
    async (checkpoint: DailyCheckpoint, targetDateKey = selectedDateKey) => {
      if (!authToken || !currentUser || currentUser.role === 'guest') {
        setIsAuthModalOpen(true);
        return;
      }
      try {
        const res = await fetch('/api/attendance/checkpoint', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            checkpointId: checkpoint.id,
            dateKey: targetDateKey,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showNotice(data.error || 'Scheduled sync failed.');
          return;
        }
        setDailyAttendance((prev) => ({
          ...prev,
          [data.sessKey]: data.dayAttendance,
        }));
        setSessionMeta((prev) => ({
          ...prev,
          [data.sessKey]: data.dayMeta,
        }));
        if (data.scheduleState) {
          setScheduleState(data.scheduleState);
        }
      } catch {
        showNotice('Network error running scheduled sync.');
      }
    },
    [authToken, currentUser, selectedDateKey, showNotice]
  );

  const handleToggleSchedule = useCallback(async () => {
    if (!authToken || !isAdminOrSuper) {
      setIsAuthModalOpen(true);
      return;
    }
    try {
      const res = await fetch('/api/schedule', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ enabled: !scheduleState.enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || 'Unable to update schedule state.');
        return;
      }
      setScheduleState(data.scheduleState);
    } catch {
      showNotice('Network error toggling schedule.');
    }
  }, [authToken, isAdminOrSuper, scheduleState.enabled, showNotice]);

  // Clock watcher for automatic 10:00 AM (FN), 01:00 PM (AN), and 03:00 PM (AN) daily updates
  useEffect(() => {
    const checkSchedule = () => {
      const now = new Date();
      setClockNow(now);

      // Only Admin or Super Admin clients automatically push global 3-slot checkpoints
      if (!scheduleState.enabled || loading || batches.length === 0 || !isAdminOrSuper || !authToken) {
        return;
      }

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
        const latestDue = due[due.length - 1];
        void handleRunCheckpoint(latestDue, todayKey);
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
    isAdminOrSuper,
    authToken,
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

  // Populate Week 1 realistic FN & AN logs on demand (Admin / Super Admin)
  const handlePopulateWeekPreview = useCallback(async () => {
    if (!authToken || !isAdminOrSuper) {
      setIsAuthModalOpen(true);
      return;
    }
    try {
      const res = await fetch('/api/schedule/populate-week', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || 'Failed to populate Week 1 logs.');
        return;
      }
      setDailyAttendance(data.dailyAttendance || {});
      setSessionMeta(data.sessionMeta || {});
      showNotice('Populated Week 1 FN & AN attendance logs.');
    } catch {
      showNotice('Network error populating Week 1 logs.');
    }
  }, [authToken, isAdminOrSuper, showNotice]);

  // Compute global KPI stats for selected date + FN & AN comparison
  const kpiStats = useMemo(() => {
    const itBatches = batches.filter((b) => b.trackType === 'IT');
    const totalEnrolled = itBatches.reduce((sum, b) => sum + b.studentCount, 0);
    let present = 0;
    let late = 0;
    let od = 0;
    let absent = 0;
    let unmarked = 0;
    let fnAttended = 0;
    let anAttended = 0;
    let fullDayStreaks = 0;

    students.forEach((s) => {
      const st = dayAttendance[s.id] || 'unmarked';
      if (st === 'present') present++;
      else if (st === 'late') late++;
      else if (st === 'od') od++;
      else if (st === 'absent') absent++;
      else unmarked++;

      const fnSt = fnAttendance[s.id] || 'unmarked';
      const anSt = anAttendance[s.id] || 'unmarked';
      const fnOk = fnSt === 'present' || fnSt === 'late' || fnSt === 'od';
      const anOk = anSt === 'present' || anSt === 'late' || anSt === 'od';
      if (fnOk) fnAttended++;
      if (anOk) anAttended++;
      if (fnOk && anOk) fullDayStreaks++;
    });

    const attended = present + late + od;
    const attendanceRate =
      totalEnrolled > 0 ? ((attended / totalEnrolled) * 100).toFixed(1) : '0.0';
    const fnRate =
      totalEnrolled > 0 ? ((fnAttended / totalEnrolled) * 100).toFixed(1) : '0.0';
    const anRate =
      totalEnrolled > 0 ? ((anAttended / totalEnrolled) * 100).toFixed(1) : '0.0';
    const fullDayRate =
      totalEnrolled > 0
        ? ((fullDayStreaks / totalEnrolled) * 100).toFixed(1)
        : '0.0';

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
      fnAttended,
      fnRate,
      anAttended,
      anRate,
      fullDayStreaks,
      fullDayRate,
      pendingBatches,
      activePartners,
      assignedRooms,
    };
  }, [
    batches,
    students,
    dayAttendance,
    fnAttendance,
    anAttendance,
    daySessionMeta,
    studentsByBatch,
  ]);

  // Enrich batches with live FN & AN counts for the main table
  const enrichedBatches = useMemo(() => {
    return batches.map((batch) => {
      const list = studentsByBatch.get(batch.id) || [];
      let present = 0;
      let late = 0;
      let od = 0;
      let absent = 0;
      let unmarked = 0;
      let fnAttended = 0;
      let anAttended = 0;

      list.forEach((s) => {
        const st = dayAttendance[s.id] || 'unmarked';
        if (st === 'present') present++;
        else if (st === 'late') late++;
        else if (st === 'od') od++;
        else if (st === 'absent') absent++;
        else unmarked++;

        const fnSt = fnAttendance[s.id] || 'unmarked';
        const anSt = anAttendance[s.id] || 'unmarked';
        if (fnSt === 'present' || fnSt === 'late' || fnSt === 'od') fnAttended++;
        if (anSt === 'present' || anSt === 'late' || anSt === 'od') anAttended++;
      });

      const attended = present + late + od;
      const pct =
        batch.studentCount > 0 ? (attended / batch.studentCount) * 100 : 0;
      const fnPct =
        batch.studentCount > 0 ? (fnAttended / batch.studentCount) * 100 : 0;
      const anPct =
        batch.studentCount > 0 ? (anAttended / batch.studentCount) * 100 : 0;

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
        fnPct,
        anPct,
        sessionStatus: resolvedStatus,
        updatedAt:
          explicitMeta?.updatedAt ||
          (resolvedStatus === 'pending'
            ? `Awaiting ${activeSession} roll call`
            : '—'),
      };
    });
  }, [
    batches,
    studentsByBatch,
    dayAttendance,
    fnAttendance,
    anAttendance,
    daySessionMeta,
    activeSession,
  ]);

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
        cmp = compareLex(a.batch.department, b.batch.department);
      } else if (sortKey === 'enrolled') {
        cmp =
          a.batch.studentCount - b.batch.studentCount ||
          compareLex(a.batch.department, b.batch.department);
      } else if (sortKey === 'attendance') {
        cmp =
          a.pct - b.pct ||
          compareLex(a.batch.department, b.batch.department);
      } else if (sortKey === 'room') {
        cmp =
          compareLex(
            a.batch.roomNumber || '~~~',
            b.batch.roomNumber || '~~~'
          ) || compareLex(a.batch.department, b.batch.department);
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
      fnAttendance,
      anAttendance,
      activeSession
    );
    triggerDownload(
      `B2025-2029_Batch_Attendance_${selectedDateKey}_${activeSession}.csv`,
      csv
    );
  };

  const handleExportStudentsCsv = () => {
    const csv = buildStudentRollCallCsv(
      selectedDateKey,
      batches,
      students,
      fnAttendance,
      anAttendance
    );
    triggerDownload(
      `B2025-2029_Student_RollCall_${selectedDateKey}.csv`,
      csv
    );
  };

  const handleImportRosterPayload = useCallback(
    async (
      csvText: string,
      defaultDepartment?: string,
      fileName?: string
    ): Promise<{ ok: boolean; message: string }> => {
      if (!authToken || !isAdminOrSuper) {
        setIsAuthModalOpen(true);
        return { ok: false, message: 'Admin or Super Admin sign-in required.' };
      }
      try {
        const res = await fetch('/api/cohort/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            csvText,
            defaultDepartment: defaultDepartment || undefined,
            fileName: fileName || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = data.error || 'CSV import failed.';
          showNotice(msg);
          return { ok: false, message: msg };
        }
        applyServerCohortPayload(data);
        if (data.importMode === 'students') {
          const msg = `Imported ${data.importedCount} unique students from Google Sheet roster.`;
          showNotice(msg);
          return { ok: true, message: msg };
        }
        setSelectedDateKey(workingDays[0]?.dateKey || '2026-11-24');
        const msg = 'Imported batch allocation sheet across cohort.';
        showNotice(msg);
        return { ok: true, message: msg };
      } catch {
        const msg = 'Network error importing CSV.';
        showNotice(msg);
        return { ok: false, message: msg };
      }
    },
    [authToken, isAdminOrSuper, applyServerCohortPayload, showNotice, workingDays]
  );

  const handleImportCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!authToken || !isAdminOrSuper) {
      setIsAuthModalOpen(true);
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      await handleImportRosterPayload(reader.result, undefined, file.name);
    };
    reader.readAsText(file);
  };

  const handleResetToSource = async () => {
    if (!authToken || !isAdminOrSuper) {
      setIsAuthModalOpen(true);
      return;
    }
    setIsLiveSimulating(false);
    setLastLiveEvent(null);
    try {
      const res = await fetch('/api/cohort/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || 'Reset failed.');
        return;
      }
      applyServerCohortPayload(data);
      setSelectedDateKey(workingDays[0]?.dateKey || '2026-11-24');
      showNotice('Cohort data reset to source sheet.');
    } catch {
      showNotice('Network error resetting cohort data.');
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

  const navItems = useMemo(() => {
    const base: {
      id: DashboardView;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
    }[] = [
      { id: 'overview', label: 'Overview & Tracking', icon: LayoutDashboard },
      { id: 'students', label: 'Student Roster', icon: Users },
      { id: 'directory', label: 'Partners & Venues', icon: Building2 },
      { id: 'schedule', label: '17-Day Schedule', icon: CalendarDays },
    ];
    if (isAdminOrSuper) {
      base.push({
        id: 'access',
        label: 'Access & Credentials',
        icon: ShieldCheck,
      });
    }
    return base;
  }, [isAdminOrSuper]);

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

  const roleBadgeLabel = useMemo(() => {
    if (!currentUser || currentUser.role === 'guest') {
      return 'Guest · View Only';
    }
    if (currentUser.role === 'superadmin') {
      return 'Super Admin · Full Access';
    }
    if (currentUser.role === 'admin') {
      return 'Admin · Full Access';
    }
    return `Faculty · ${[...currentUser.assignedDepartments].sort(compareLex).join(', ')}`;
  }, [currentUser]);

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

          {/* Signed-in Session Card */}
          <div className="mx-3 mt-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Active Role
              </span>
              {!isAuthenticatedEditor && (
                <Lock className="w-3 h-3 text-slate-400" />
              )}
            </div>
            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
              {currentUser ? currentUser.displayName : 'Guest Viewer'}
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
              {roleBadgeLabel}
            </div>
            {isAuthenticatedEditor ? (
              <button
                type="button"
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out (Guest Mode)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                {!superAdminClaimed
                  ? 'Setup / Staff Sign In'
                  : 'Faculty / Admin Sign In'}
              </button>
            )}
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

          {/* Daily 3-Slot Auto-Update Schedule (10 AM -> FN, 1 PM & 3 PM -> AN) */}
          <div className="mx-3 mt-1 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Daily Auto-Update
              </span>
              {isAdminOrSuper ? (
                <button
                  type="button"
                  onClick={handleToggleSchedule}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    scheduleState.enabled
                      ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {scheduleState.enabled ? 'Active' : 'Paused'}
                </button>
              ) : (
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {scheduleState.enabled ? 'Active' : 'Paused'}
                </span>
              )}
            </div>

            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {scheduleState.enabled ? (
                <>
                  Next: {nextScheduleInfo.isTomorrow ? 'Tomorrow ' : ''}
                  {nextScheduleInfo.checkpoint.timeLabel} ({nextScheduleInfo.checkpoint.session} ·{' '}
                  {nextScheduleInfo.countdownLabel})
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
                        {cp.session}
                      </span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {cp.timeLabel}
                      </span>
                    </div>
                    {isAuthenticatedEditor ? (
                      <button
                        type="button"
                        onClick={() => handleRunCheckpoint(cp)}
                        title={`Run ${cp.label} ${cp.session} (${cp.timeLabel}) attendance update now`}
                        className={`px-2 py-0.5 rounded border text-[10px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                          doneTime
                            ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {doneTime ? `Done ${doneTime}` : 'Run Now'}
                      </button>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                        {doneTime ? `Done ${doneTime}` : 'Scheduled'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Check-in Simulator Control (Staff Only) */}
          {isAuthenticatedEditor && (
            <div className="mx-3 mt-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Live Check-In ({activeSession})
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
                  ? lastLiveEvent || `Recording live ${activeSession} check-ins...`
                  : `Stream simulated ${activeSession} check-ins across your permitted batches.`}
              </p>
            </div>
          )}
        </div>

        {/* Bottom Workspace Utilities: Theme Switcher & Admin CSV Actions */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
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

          {isAdminOrSuper && (
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
          )}
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
                {currentDay?.dayLabel} · {activeSession}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* FN / AN Session Switcher */}
            <div
              className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200/80 dark:border-slate-700"
              role="group"
              aria-label="Session switcher"
            >
              {(['FN', 'AN'] as SessionPeriod[]).map((sess) => (
                <button
                  key={sess}
                  type="button"
                  onClick={() => setActiveSession(sess)}
                  className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md transition-colors whitespace-nowrap ${
                    activeSession === sess
                      ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {sess}
                </button>
              ))}
            </div>

            {/* Quick Day Selector */}
            <select
              value={selectedDateKey}
              onChange={(e) => setSelectedDateKey(e.target.value)}
              aria-label="Select internship session day"
              className="hidden md:block text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() =>
                isAuthenticatedEditor ? handleLogout() : setIsAuthModalOpen(true)
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                isAuthenticatedEditor
                  ? 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800'
                  : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white'
              }`}
            >
              {isAuthenticatedEditor ? (
                <>
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Main Workspace Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-6">
          {/* First-Run Setup / Role Notice Banner */}
          {!superAdminClaimed && (
            <div className="bg-white dark:bg-[#111827] border border-blue-300 dark:border-blue-800/70 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-700 dark:text-slate-200">
                <strong className="text-slate-900 dark:text-white">
                  First-Run Setup Available:
                </strong>{' '}
                Initialize the Super Admin password to manage Admin credentials and generate login passwords for all {facultyDirectory.length} Faculty Incharges.
              </div>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap shrink-0"
              >
                Initialize Super Admin
              </button>
            </div>
          )}

          {actionFeedback && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-xl px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3">
              <span>{actionFeedback}</span>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                className="text-xs font-medium hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
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
                        <span>
                          Active Session:{' '}
                          <strong className="text-slate-800 dark:text-slate-200">
                            {activeSession === 'FN'
                              ? 'FN (Forenoon)'
                              : 'AN (Afternoon)'}
                          </strong>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                          {roleBadgeLabel}
                        </span>
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
                      <div className="md:hidden flex-1">
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
                        Scheduled Sync (10:00 AM FN · 01:00 PM AN · 03:00 PM AN)
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {scheduleState.lastSyncSummary
                          ? scheduleState.lastSyncSummary
                          : scheduleState.enabled
                          ? `Next automatic pass: ${nextScheduleInfo.isTomorrow ? 'Tomorrow ' : ''}${nextScheduleInfo.checkpoint.timeLabel} (${nextScheduleInfo.checkpoint.session} · ${nextScheduleInfo.countdownLabel})`
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
                            disabled={!isAuthenticatedEditor}
                            onClick={() => handleRunCheckpoint(cp)}
                            title={
                              isAuthenticatedEditor
                                ? `Run ${cp.label} ${cp.session} sync now`
                                : 'Sign in as Faculty or Admin to run scheduled sync'
                            }
                            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                              doneTime
                                ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            } ${!isAuthenticatedEditor ? 'opacity-70 cursor-default' : ''}`}
                          >
                            {cp.session} · {cp.timeLabel}
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
                        {kpiStats.activePartners} training partners · Mech CORE
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {activeSession} Attended ({currentDay?.label})
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
                        FN: {kpiStats.fnRate}% · AN: {kpiStats.anRate}%
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Full-Day (FN + AN) Streaks
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <span className="text-3xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400">
                          {kpiStats.fullDayStreaks}
                        </span>
                        <span className="text-sm font-semibold font-mono tabular-nums text-blue-700 dark:text-blue-400">
                          {kpiStats.fullDayRate}%
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {activeSession} Absent: {kpiStats.absent} · Unmarked: {kpiStats.unmarked}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {activeSession} Roll Call Completion
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

                  {/* Interactive Session Day Strip + FN/AN Switch */}
                  <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-1 min-w-0">
                      {workingDays.map((day) => {
                        const isSelected = day.dateKey === selectedDateKey;
                        const fnMarked = Object.values(
                          dailyAttendance[makeSessionKey(day.dateKey, 'FN')] || {}
                        ).some((v) => v !== 'unmarked');
                        const anMarked = Object.values(
                          dailyAttendance[makeSessionKey(day.dateKey, 'AN')] || {}
                        ).some((v) => v !== 'unmarked');
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
                              {(fnMarked || anMarked) && !isSelected && (
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

                    <div
                      className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0"
                      role="group"
                      aria-label="Session period"
                    >
                      {(['FN', 'AN'] as SessionPeriod[]).map((sess) => (
                        <button
                          key={sess}
                          type="button"
                          onClick={() => setActiveSession(sess)}
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
                    <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
                          Live Batch Attendance Tracker ({activeSession})
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Showing {activeSession === 'FN' ? 'Forenoon (FN)' : 'Afternoon (AN)'} status with comparative FN % and AN % ·{' '}
                          {currentUser?.role === 'faculty'
                            ? `Editable for: ${[...currentUser.assignedDepartments].sort(compareLex).join(', ')}`
                            : isAdminOrSuper
                            ? 'Full editing enabled'
                            : 'View-only in Guest mode'}
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
                                Venue &amp; Room
                                <ArrowUpDown className="w-3 h-3" />
                              </button>
                            </th>
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
                            <th className="py-3 px-3 text-right">FN %</th>
                            <th className="py-3 px-3 text-right">AN %</th>
                            <th className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => toggleSort('attendance')}
                                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                              >
                                {activeSession} Live Count
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
                                colSpan={9}
                                className="py-10 px-4 text-center text-sm text-slate-500 dark:text-slate-400"
                              >
                                No batches match your current search or filter.
                              </td>
                            </tr>
                          ) : (
                            filteredTableRows.map((row) => {
                              const { batch } = row;
                              const isCore = batch.trackType === 'CORE';
                              const canMarkThisBatch = canMarkDepartment(batch.department);
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
                                  <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                    {isCore ? 'CORE' : batch.studentCount}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono tabular-nums text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {isCore ? '—' : `${Math.round(row.fnPct)}%`}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono tabular-nums text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {isCore ? '—' : `${Math.round(row.anPct)}%`}
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
                                        {canMarkThisBatch && (
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
                                        )}
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
                                      {canMarkThisBatch && !isCore && row.unmarked > 0 && (
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
                                            isCore && isAdminOrSuper ? 'allocation' : 'rollcall'
                                          );
                                          setDrawerBatchId(batch.id);
                                        }}
                                        className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                      >
                                        {isCore
                                          ? isAdminOrSuper
                                            ? 'Edit Track'
                                            : 'Details'
                                          : canMarkThisBatch
                                          ? 'Roll Call'
                                          : 'Inspect'}
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
                  fnAttendance={fnAttendance}
                  anAttendance={anAttendance}
                  dayLabel={currentDay?.dayLabel || 'Day 01'}
                  dateKey={selectedDateKey}
                  canMarkDepartment={canMarkDepartment}
                  canImportRoster={isAdminOrSuper}
                  onImportRoster={handleImportRosterPayload}
                  onSetStudentSessionStatus={handleSetStudentSessionStatus}
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
                  canEditAllocations={isAdminOrSuper}
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
                  activeSession={activeSession}
                  onChangeSession={setActiveSession}
                  dailyAttendance={dailyAttendance}
                  canPopulateWeekLogs={isAdminOrSuper}
                  onSelectDay={(dk) => setSelectedDateKey(dk)}
                  onJumpToDayBatch={(dk, batchId) => {
                    setSelectedDateKey(dk);
                    setDrawerInitialTab('rollcall');
                    setDrawerBatchId(batchId);
                  }}
                  onPopulateWeekPreview={handlePopulateWeekPreview}
                />
              )}

              {/* Access & Faculty Credentials View (Admin & Super Admin) */}
              {activeView === 'access' && isAdminOrSuper && currentUser && authToken && (
                <AccessControlView
                  currentUser={currentUser}
                  authToken={authToken}
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
        activeSession={activeSession}
        onChangeSession={setActiveSession}
        dayAttendance={dayAttendance}
        pairedDayAttendance={pairedDayAttendance}
        sessionStatus={drawerSessionStatus}
        initialTab={drawerInitialTab}
        canMarkAttendance={drawerBatch ? canMarkDepartment(drawerBatch.department) : false}
        canEditAllocation={isAdminOrSuper}
        onClose={() => setDrawerBatchId(null)}
        onSetStudentStatus={handleSetStudentStatus}
        onBulkSetBatchStatus={handleBulkSetBatchStatus}
        onSetSessionStatus={handleSetSessionStatus}
        onUpdateBatch={handleUpdateBatch}
      />

      {/* Daily Attendance Summary Modal (Accessible to Guests & All Roles) */}
      <DailySummaryModal
        isOpen={isDailySummaryOpen}
        onClose={() => setIsDailySummaryOpen(false)}
        programTitle={programTitle}
        dayLabel={currentDay?.dayLabel || 'Day 01'}
        dateKey={selectedDateKey}
        initialSession={activeSession}
        batches={batches}
        students={students}
        fnAttendance={fnAttendance}
        anAttendance={anAttendance}
        onExportCsv={handleExportBatchCsv}
        onSelectBatch={(batchId, sess) => {
          setIsDailySummaryOpen(false);
          setActiveSession(sess);
          const target = batches.find((b) => b.id === batchId);
          setDrawerInitialTab(
            target?.trackType === 'CORE' && isAdminOrSuper ? 'allocation' : 'rollcall'
          );
          setDrawerBatchId(batchId);
        }}
      />

      {/* Staff / Faculty / First-Run Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        superAdminClaimed={superAdminClaimed}
        facultyDirectory={facultyDirectory}
        currentUser={currentUser}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
        onContinueAsGuest={() => {
          if (isAuthenticatedEditor) {
            void handleLogout();
          }
        }}
      />
    </div>
  );
}
