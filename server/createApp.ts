import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type {
  AccountSummary,
  AttendanceStatus,
  AuthUser,
  BatchRecord,
  BatchSessionMeta,
  BatchSessionStatus,
  SessionPeriod,
  StudentRecord,
  UserRole,
} from '../src/types/internship.ts';
import {
  compareLex,
  deduplicateAndSortStudents,
  extractFacultyAccounts,
  FALLBACK_CSV_TEXT,
  generateInitialAttendanceState,
  generateInternshipDays,
  generateStudentsForBatches,
  inferDepartmentFromText,
  makeSessionKey,
  migrateAttendanceKeys,
  parseInternshipCsv,
  parseStudentRosterCsv,
} from '../src/utils/csvParser.ts';
import {
  computeCheckpointAttendanceUpdate,
  DAILY_CHECKPOINTS,
  type CheckpointId,
  type ScheduleSyncState,
} from '../src/utils/scheduledSync.ts';

interface CohortState {
  programTitle: string;
  dateRange: string;
  batches: BatchRecord[];
  students: StudentRecord[];
  dailyAttendance: Record<string, Record<string, AttendanceStatus>>;
  sessionMeta: Record<string, Record<string, BatchSessionMeta>>;
  scheduleState: ScheduleSyncState;
}

interface StoredCredential {
  salt: string;
  hash: string;
  updatedAt: string;
}

interface AuthStore {
  credentials: Record<string, StoredCredential>;
}

interface TokenPayload {
  sub: string;
  role: Exclude<AuthUser['role'], 'guest'>;
  exp: number;
  jti: string;
}

interface AuthenticatedRequest extends Request {
  authUser?: AuthUser | null;
  authJti?: string | null;
}

const VALID_ATTENDANCE_STATUSES: AttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'od',
  'unmarked',
];
const VALID_SESSION_STATUSES: BatchSessionStatus[] = [
  'completed',
  'in-session',
  'pending',
  'core',
];

export function createApiApp(): express.Express {
  const ROOT_DIR = process.cwd();
  const IS_VERCEL = Boolean(process.env.VERCEL);
  const DATA_DIR = IS_VERCEL
    ? path.join('/tmp', 'cohorttrack-data')
    : path.resolve(ROOT_DIR, '.data');
  const COHORT_FILE = path.join(DATA_DIR, 'cohort-state.json');
  const AUTH_FILE = path.join(DATA_DIR, 'auth-store.json');
  const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
  const SOURCE_CSV_PATH = path.resolve(
    ROOT_DIR,
    'public/assets/aistudio/B2025-2029_Internship_ATTENDANCE_ddabe17c'
  );

  const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
  const revokedJtis = new Set<string>();

  function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  function resolveSessionSecret(): string {
    const fromEnv = process.env.AUTH_SESSION_SECRET?.trim();
    if (fromEnv) return fromEnv;

    ensureDataDir();
    try {
      if (fs.existsSync(SECRET_FILE)) {
        const stored = fs.readFileSync(SECRET_FILE, 'utf8').trim();
        if (stored.length >= 32) return stored;
      }
      const generated = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(SECRET_FILE, generated, 'utf8');
      return generated;
    } catch {
      return crypto.randomBytes(32).toString('hex');
    }
  }

  const SESSION_SECRET = resolveSessionSecret();

  function readSourceCsvText(): string {
    try {
      if (fs.existsSync(SOURCE_CSV_PATH)) {
        return fs.readFileSync(SOURCE_CSV_PATH, 'utf8');
      }
    } catch {
      // Fall back to embedded CSV
    }
    return FALLBACK_CSV_TEXT;
  }

  function buildCohortStateFromCsv(csvText: string): CohortState {
    const parsed = parseInternshipCsv(csvText);
    const days = generateInternshipDays();
    const batches = [...parsed.batches].sort((a, b) =>
      compareLex(a.department, b.department)
    );
    const students = generateStudentsForBatches(batches);
    const initial = generateInitialAttendanceState(batches, students, days);
    return {
      programTitle: parsed.programTitle,
      dateRange: parsed.dateRange,
      batches,
      students,
      dailyAttendance: initial.dailyAttendance,
      sessionMeta: initial.sessionMeta,
      scheduleState: {
        enabled: true,
        lastSyncSummary: null,
        completedSlots: {},
      },
    };
  }

  function saveCohortState(state: CohortState): void {
    ensureDataDir();
    const tmpFile = `${COHORT_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpFile, COHORT_FILE);
  }

  function loadOrInitCohortState(): CohortState {
    ensureDataDir();
    if (fs.existsSync(COHORT_FILE)) {
      try {
        const raw = fs.readFileSync(COHORT_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<CohortState>;
        if (parsed?.batches && Array.isArray(parsed.batches) && parsed.batches.length > 0) {
          const batches = [...parsed.batches].sort((a, b) =>
            compareLex(a.department, b.department)
          );
          const students =
            Array.isArray(parsed.students) && parsed.students.length > 0
              ? deduplicateAndSortStudents(parsed.students)
              : generateStudentsForBatches(batches);
          const migrated = migrateAttendanceKeys(
            parsed.dailyAttendance || {},
            parsed.sessionMeta || {}
          );
          return {
            programTitle:
              parsed.programTitle || 'Fullstack Internship B2025-2029 - II Year',
            dateRange: parsed.dateRange || '24.11.2026 - 12.12.2026',
            batches,
            students,
            dailyAttendance: migrated.dailyAttendance,
            sessionMeta: migrated.sessionMeta,
            scheduleState: parsed.scheduleState || {
              enabled: true,
              lastSyncSummary: null,
              completedSlots: {},
            },
          };
        }
      } catch {
        // Re-initialize below if state file is corrupted
      }
    }
    const fresh = buildCohortStateFromCsv(readSourceCsvText());
    saveCohortState(fresh);
    return fresh;
  }

  function saveAuthStore(store: AuthStore): void {
    ensureDataDir();
    const tmpFile = `${AUTH_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmpFile, AUTH_FILE);
  }

  function loadOrInitAuthStore(): AuthStore {
    ensureDataDir();
    if (fs.existsSync(AUTH_FILE)) {
      try {
        const raw = fs.readFileSync(AUTH_FILE, 'utf8');
        const parsed = JSON.parse(raw) as AuthStore;
        if (parsed && typeof parsed.credentials === 'object' && parsed.credentials !== null) {
          return parsed;
        }
      } catch {
        // Fallback below
      }
    }
    const initial: AuthStore = { credentials: {} };
    saveAuthStore(initial);
    return initial;
  }

  let cohortState: CohortState = loadOrInitCohortState();
  const authStore: AuthStore = loadOrInitAuthStore();

  function hashPassword(
    password: string,
    salt = crypto.randomBytes(16).toString('hex')
  ): StoredCredential {
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return {
      salt,
      hash: derived,
      updatedAt: new Date().toISOString(),
    };
  }

  function verifyStoredPassword(password: string, cred: StoredCredential): boolean {
    const derived = crypto.scryptSync(password, cred.salt, 64);
    const storedBuf = Buffer.from(cred.hash, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  }

  function generateTempPasscode(length = 10): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  }

  function signToken(payload: TokenPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${sig}`;
  }

  function verifyToken(token: string): TokenPayload | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    if (!encoded || !sig) return null;

    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(encoded)
      .digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8')
      ) as TokenPayload;
      if (!parsed?.sub || !parsed?.role || !parsed?.exp || !parsed?.jti) {
        return null;
      }
      if (Date.now() > parsed.exp || revokedJtis.has(parsed.jti)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function isSuperAdminClaimed(): boolean {
    return Boolean(authStore.credentials['superadmin']);
  }

  function resolveAuthUser(username: string): AuthUser | null {
    const clean = username.trim().toLowerCase();
    const allDepts = cohortState.batches
      .map((b) => b.department)
      .sort(compareLex);
    if (clean === 'superadmin') {
      return {
        username: 'superadmin',
        displayName: 'Super Administrator',
        role: 'superadmin',
        assignedDepartments: allDepts,
      };
    }
    if (clean === 'admin') {
      return {
        username: 'admin',
        displayName: 'Program Administrator',
        role: 'admin',
        assignedDepartments: allDepts,
      };
    }
    const facultyList = extractFacultyAccounts(cohortState.batches);
    const found = facultyList.find((f) => f.username === clean);
    if (!found) return null;
    return {
      username: found.username,
      displayName: found.displayName,
      role: 'faculty',
      assignedDepartments: [...found.assignedDepartments].sort(compareLex),
    };
  }

  function buildPublicFacultyDirectory(): {
    username: string;
    displayName: string;
    assignedDepartments: string[];
    hasPassword: boolean;
  }[] {
    return extractFacultyAccounts(cohortState.batches).map((f) => ({
      username: f.username,
      displayName: f.displayName,
      assignedDepartments: [...f.assignedDepartments].sort(compareLex),
      hasPassword: Boolean(authStore.credentials[f.username]),
    }));
  }

  function buildAccountSummaries(): AccountSummary[] {
    const allDepts = cohortState.batches
      .map((b) => b.department)
      .sort(compareLex);

    const core: AccountSummary[] = [
      {
        username: 'admin',
        displayName: 'Program Administrator',
        role: 'admin',
        assignedDepartments: allDepts,
        hasPassword: Boolean(authStore.credentials['admin']),
      },
      {
        username: 'superadmin',
        displayName: 'Super Administrator',
        role: 'superadmin',
        assignedDepartments: allDepts,
        hasPassword: Boolean(authStore.credentials['superadmin']),
      },
    ];
    core.sort((a, b) => compareLex(a.displayName, b.displayName));

    const faculty: AccountSummary[] = extractFacultyAccounts(cohortState.batches).map((f) => ({
      username: f.username,
      displayName: f.displayName,
      role: 'faculty',
      assignedDepartments: [...f.assignedDepartments].sort(compareLex),
      hasPassword: Boolean(authStore.credentials[f.username]),
    }));

    return [...core, ...faculty];
  }

  function canMutateDepartment(user: AuthUser, department: string): boolean {
    if (user.role === 'superadmin' || user.role === 'admin') return true;
    if (user.role === 'faculty') {
      return user.assignedDepartments.includes(department);
    }
    return false;
  }

  function formatServerTimeNow(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function attachUser(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const token = header.slice(7).trim();
      const payload = verifyToken(token);
      if (payload) {
        const user = resolveAuthUser(payload.sub);
        if (user && user.role === payload.role) {
          req.authUser = user;
          req.authJti = payload.jti;
          next();
          return;
        }
      }
    }
    req.authUser = null;
    req.authJti = null;
    next();
  }

  function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (!req.authUser || req.authUser.role === 'guest') {
      res.status(401).json({
        error: 'Authentication required. Guests have view-only access.',
      });
      return;
    }
    next();
  }

  function requireRole(roles: Exclude<UserRole, 'guest'>[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.authUser || req.authUser.role === 'guest') {
        res.status(401).json({
          error: 'Authentication required. Guests have view-only access.',
        });
        return;
      }
      if (!roles.includes(req.authUser.role)) {
        res.status(403).json({
          error: 'You do not have permission to perform this action.',
        });
        return;
      }
      next();
    };
  }

  function isValidDateKey(val: unknown): val is string {
    return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val);
  }

  function isValidSession(val: unknown): val is SessionPeriod {
    return val === 'FN' || val === 'AN';
  }

  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use(attachUser);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, vercel: IS_VERCEL });
  });

  // Auth status
  app.get('/api/auth/status', (req: AuthenticatedRequest, res: Response) => {
    res.json({
      superAdminClaimed: isSuperAdminClaimed(),
      currentUser: req.authUser || null,
      facultyDirectory: buildPublicFacultyDirectory(),
    });
  });

  // First-run Super Admin setup
  app.post('/api/auth/setup-superadmin', (req: Request, res: Response) => {
    if (authStore.credentials['superadmin']) {
      res.status(409).json({
        error: 'Super Admin account has already been claimed.',
      });
      return;
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 8) {
      res.status(400).json({
        error: 'Super Admin password must be at least 8 characters long.',
      });
      return;
    }

    authStore.credentials['superadmin'] = hashPassword(password);
    saveAuthStore(authStore);

    const user = resolveAuthUser('superadmin');
    if (!user || user.role !== 'superadmin') {
      res.status(500).json({ error: 'Unable to initialize Super Admin session.' });
      return;
    }

    const jti = crypto.randomUUID();
    const token = signToken({
      sub: user.username,
      role: 'superadmin',
      exp: Date.now() + TOKEN_TTL_MS,
      jti,
    });

    res.json({ token, user });
  });

  // Login for Super Admin, Admin, and Faculty Incharge accounts
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const username = rawUsername.trim().toLowerCase();
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    const user = resolveAuthUser(username);
    if (!user || user.role === 'guest') {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    const cred = authStore.credentials[username];
    if (!cred) {
      if (username === 'superadmin') {
        res.status(403).json({
          error:
            'Super Admin account has not been initialized yet. Complete first-run setup first.',
        });
      } else if (username === 'admin') {
        res.status(403).json({
          error:
            'Admin password has not been set yet. Ask the Super Admin to set it in Access & Credentials.',
        });
      } else {
        res.status(403).json({
          error:
            'Faculty password has not been provisioned yet. Ask an Admin or Super Admin to provision it in Access & Credentials.',
        });
      }
      return;
    }

    const valid = verifyStoredPassword(password, cred);
    if (!valid) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    const jti = crypto.randomUUID();
    const token = signToken({
      sub: user.username,
      role: user.role,
      exp: Date.now() + TOKEN_TTL_MS,
      jti,
    });

    res.json({ token, user });
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res: Response) => {
    if (req.authJti) {
      revokedJtis.add(req.authJti);
    }
    res.json({ ok: true });
  });

  // Public/Guest read-only state endpoint
  app.get('/api/state', (_req: Request, res: Response) => {
    res.json({
      programTitle: cohortState.programTitle,
      dateRange: cohortState.dateRange,
      batches: cohortState.batches,
      students: cohortState.students,
      dailyAttendance: cohortState.dailyAttendance,
      sessionMeta: cohortState.sessionMeta,
      scheduleState: cohortState.scheduleState,
      facultyDirectory: buildPublicFacultyDirectory(),
    });
  });

  // Mark individual student attendance (uniquely keyed by rollNumber)
  app.post('/api/attendance/mark', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { dateKey, session, studentId, status } = req.body || {};
    if (
      !isValidDateKey(dateKey) ||
      !isValidSession(session) ||
      typeof studentId !== 'string' ||
      !VALID_ATTENDANCE_STATUSES.includes(status)
    ) {
      res.status(400).json({ error: 'Invalid attendance payload.' });
      return;
    }

    const normalizedRoll = studentId.trim().toUpperCase();
    const student = cohortState.students.find(
      (s) => s.id === normalizedRoll || s.rollNumber === normalizedRoll
    );
    if (!student) {
      res.status(404).json({ error: 'Student record not found.' });
      return;
    }

    const batch = cohortState.batches.find((b) => b.id === student.batchId);
    if (!batch || batch.trackType === 'CORE') {
      res.status(400).json({ error: 'Cannot mark attendance for this batch.' });
      return;
    }

    if (!canMutateDepartment(req.authUser!, batch.department)) {
      res.status(403).json({
        error: `Access denied: you are only authorized to mark attendance for ${
          req.authUser!.assignedDepartments.join(', ') || 'your assigned department(s)'
        }.`,
      });
      return;
    }

    const sessKey = makeSessionKey(dateKey, session);
    const dayMap = {
      ...(cohortState.dailyAttendance[sessKey] || {}),
      [student.rollNumber]: status,
    };
    cohortState.dailyAttendance[sessKey] = dayMap;

    const existingMeta = cohortState.sessionMeta[sessKey]?.[batch.id];
    const nextBatchMeta: BatchSessionMeta = {
      status:
        !existingMeta || existingMeta.status === 'pending'
          ? 'in-session'
          : existingMeta.status,
      updatedAt: `${formatServerTimeNow()} · ${req.authUser!.displayName}`,
    };
    cohortState.sessionMeta[sessKey] = {
      ...(cohortState.sessionMeta[sessKey] || {}),
      [batch.id]: nextBatchMeta,
    };

    saveCohortState(cohortState);
    res.json({
      sessKey,
      dayAttendance: cohortState.dailyAttendance[sessKey],
      dayMeta: cohortState.sessionMeta[sessKey],
    });
  });

  // Bulk mark batch attendance
  app.post('/api/attendance/bulk', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { dateKey, session, batchId, status, onlyUnmarked } = req.body || {};
    if (
      !isValidDateKey(dateKey) ||
      !isValidSession(session) ||
      typeof batchId !== 'string' ||
      !VALID_ATTENDANCE_STATUSES.includes(status)
    ) {
      res.status(400).json({ error: 'Invalid bulk attendance payload.' });
      return;
    }

    const batch = cohortState.batches.find((b) => b.id === batchId);
    if (!batch || batch.trackType === 'CORE') {
      res.status(404).json({ error: 'Batch not found or not an IT attendance batch.' });
      return;
    }

    if (!canMutateDepartment(req.authUser!, batch.department)) {
      res.status(403).json({
        error: `Access denied: you are not assigned as Faculty Incharge for ${batch.department}.`,
      });
      return;
    }

    const sessKey = makeSessionKey(dateKey, session);
    const nextDay = { ...(cohortState.dailyAttendance[sessKey] || {}) };
    const batchStudents = cohortState.students.filter((s) => s.batchId === batch.id);
    const filterUnmarked = Boolean(onlyUnmarked);

    batchStudents.forEach((s) => {
      if (
        !filterUnmarked ||
        !nextDay[s.rollNumber] ||
        nextDay[s.rollNumber] === 'unmarked'
      ) {
        nextDay[s.rollNumber] = status;
      }
    });

    cohortState.dailyAttendance[sessKey] = nextDay;
    cohortState.sessionMeta[sessKey] = {
      ...(cohortState.sessionMeta[sessKey] || {}),
      [batch.id]: {
        status: status === 'unmarked' ? 'pending' : 'completed',
        updatedAt:
          status === 'unmarked'
            ? `Awaiting ${session} roll call`
            : `${formatServerTimeNow()} · ${req.authUser!.displayName}`,
      },
    };

    saveCohortState(cohortState);
    res.json({
      sessKey,
      dayAttendance: cohortState.dailyAttendance[sessKey],
      dayMeta: cohortState.sessionMeta[sessKey],
    });
  });

  // Update batch session status
  app.post(
    '/api/attendance/session-status',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const { dateKey, session, batchId, status } = req.body || {};
      if (
        !isValidDateKey(dateKey) ||
        !isValidSession(session) ||
        typeof batchId !== 'string' ||
        !VALID_SESSION_STATUSES.includes(status)
      ) {
        res.status(400).json({ error: 'Invalid session status payload.' });
        return;
      }

      const batch = cohortState.batches.find((b) => b.id === batchId);
      if (!batch) {
        res.status(404).json({ error: 'Batch not found.' });
        return;
      }

      if (!canMutateDepartment(req.authUser!, batch.department)) {
        res.status(403).json({
          error: `Access denied for ${batch.department}.`,
        });
        return;
      }

      const sessKey = makeSessionKey(dateKey, session);
      cohortState.sessionMeta[sessKey] = {
        ...(cohortState.sessionMeta[sessKey] || {}),
        [batch.id]: {
          status,
          updatedAt:
            status === 'pending'
              ? `Awaiting ${session} roll call`
              : `${formatServerTimeNow()} · ${req.authUser!.displayName}`,
        },
      };

      saveCohortState(cohortState);
      res.json({
        sessKey,
        dayMeta: cohortState.sessionMeta[sessKey],
      });
    }
  );

  // Run scheduled checkpoint (10:00 AM FN, 01:00 PM AN, 03:00 PM AN)
  app.post(
    '/api/attendance/checkpoint',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const checkpointId = req.body?.checkpointId as CheckpointId;
      const dateKey = req.body?.dateKey;
      const checkpoint = DAILY_CHECKPOINTS.find((c) => c.id === checkpointId);
      if (!checkpoint || !isValidDateKey(dateKey)) {
        res.status(400).json({ error: 'Invalid checkpoint or date key.' });
        return;
      }

      const user = req.authUser!;
      const permittedBatches =
        user.role === 'faculty'
          ? cohortState.batches.filter((b) =>
              user.assignedDepartments.includes(b.department)
            )
          : cohortState.batches;

      const permittedBatchIds = new Set(permittedBatches.map((b) => b.id));
      const permittedStudents = cohortState.students.filter((s) =>
        permittedBatchIds.has(s.batchId)
      );

      const sessKey = makeSessionKey(dateKey, checkpoint.session);
      const currentDayAtt = cohortState.dailyAttendance[sessKey] || {};
      const currentDayMeta = cohortState.sessionMeta[sessKey] || {};

      const { nextDayAttendance, nextDayMeta, updatedStudentsCount } =
        computeCheckpointAttendanceUpdate({
          checkpoint,
          dateKey,
          batches: permittedBatches,
          students: permittedStudents,
          currentDayAttendance: currentDayAtt,
          currentDayMeta,
        });

      cohortState.dailyAttendance[sessKey] = nextDayAttendance;
      cohortState.sessionMeta[sessKey] = nextDayMeta;

      const stamp = formatServerTimeNow();
      const scopeNote =
        user.role === 'faculty'
          ? ` (${[...user.assignedDepartments].sort(compareLex).join(', ')})`
          : '';
      cohortState.scheduleState = {
        ...cohortState.scheduleState,
        lastSyncSummary: `${checkpoint.label} ${checkpoint.session} (${checkpoint.timeLabel}) ran at ${stamp} by ${user.displayName}${scopeNote} · ${updatedStudentsCount} records synced`,
        completedSlots:
          user.role === 'admin' || user.role === 'superadmin'
            ? {
                ...cohortState.scheduleState.completedSlots,
                [dateKey]: {
                  ...(cohortState.scheduleState.completedSlots[dateKey] || {}),
                  [checkpoint.id]: stamp,
                },
              }
            : cohortState.scheduleState.completedSlots,
      };

      saveCohortState(cohortState);
      res.json({
        sessKey,
        dayAttendance: cohortState.dailyAttendance[sessKey],
        dayMeta: cohortState.sessionMeta[sessKey],
        scheduleState: cohortState.scheduleState,
      });
    }
  );

  // Admin / Super Admin schedule controls
  app.put(
    '/api/schedule',
    requireRole(['admin', 'superadmin']),
    (req: AuthenticatedRequest, res: Response) => {
      if (typeof req.body?.enabled !== 'boolean') {
        res.status(400).json({ error: 'Invalid schedule state.' });
        return;
      }
      cohortState.scheduleState = {
        ...cohortState.scheduleState,
        enabled: req.body.enabled,
      };
      saveCohortState(cohortState);
      res.json({ scheduleState: cohortState.scheduleState });
    }
  );

  app.post(
    '/api/schedule/populate-week',
    requireRole(['admin', 'superadmin']),
    (_req: AuthenticatedRequest, res: Response) => {
      const workingDays = generateInternshipDays().filter((d) => !d.isSunday);
      const firstFive = workingDays.slice(0, 5);

      firstFive.forEach((day, dIdx) => {
        (['FN', 'AN'] as SessionPeriod[]).forEach((sess, sOff) => {
          const sessKey = makeSessionKey(day.dateKey, sess);
          if (
            cohortState.dailyAttendance[sessKey] &&
            Object.keys(cohortState.dailyAttendance[sessKey]).length > 0
          ) {
            return;
          }
          const dayMap: Record<string, AttendanceStatus> = {};
          cohortState.students.forEach((s, sIdx) => {
            const tailChar = s.rollNumber.charCodeAt(s.rollNumber.length - 1) || 0;
            const v = (sIdx * 17 + dIdx * 31 + sOff * 13 + tailChar) % 100;
            if (v < 4 + dIdx + sOff) dayMap[s.rollNumber] = 'absent';
            else if (v < 7 + dIdx + sOff) dayMap[s.rollNumber] = 'late';
            else if (v === 11) dayMap[s.rollNumber] = 'od';
            else dayMap[s.rollNumber] = 'present';
          });
          cohortState.dailyAttendance[sessKey] = dayMap;

          const metaMap: Record<string, BatchSessionMeta> = {
            ...(cohortState.sessionMeta[sessKey] || {}),
          };
          cohortState.batches.forEach((b) => {
            if (!metaMap[b.id]) {
              metaMap[b.id] = {
                status: b.trackType === 'CORE' ? 'core' : 'completed',
                updatedAt: sess === 'FN' ? '10:00 AM' : '03:00 PM',
              };
            }
          });
          cohortState.sessionMeta[sessKey] = metaMap;
        });
      });

      saveCohortState(cohortState);
      res.json({
        dailyAttendance: cohortState.dailyAttendance,
        sessionMeta: cohortState.sessionMeta,
      });
    }
  );

  // Admin / Super Admin batch allocation edit
  app.put(
    '/api/batches/:batchId',
    requireRole(['admin', 'superadmin']),
    (req: AuthenticatedRequest, res: Response) => {
      const { batchId } = req.params;
      const idx = cohortState.batches.findIndex((b) => b.id === batchId);
      if (idx < 0) {
        res.status(404).json({ error: 'Batch not found.' });
        return;
      }

      const current = cohortState.batches[idx];
      const cleanStr = (v: unknown, fallback: string) =>
        typeof v === 'string' ? v.trim() : fallback;
      const cleanList = (v: unknown, fallback: string[]) =>
        Array.isArray(v)
          ? v.map((item) => String(item).trim()).filter(Boolean).sort(compareLex)
          : fallback;

      const updated: BatchRecord = {
        ...current,
        organisation:
          cleanStr(req.body?.organisation, current.organisation) || 'Unassigned',
        venue: cleanStr(req.body?.venue, current.venue),
        roomNumber: cleanStr(req.body?.roomNumber, current.roomNumber),
        expertName: cleanStr(req.body?.expertName, current.expertName),
        gender: cleanStr(req.body?.gender, current.gender),
        contactNumbers: cleanList(req.body?.contactNumbers, current.contactNumbers),
        emails: cleanList(req.body?.emails, current.emails),
        facultyIncharge: cleanList(req.body?.facultyIncharge, current.facultyIncharge),
        allocationNote:
          typeof req.body?.allocationNote === 'string'
            ? req.body.allocationNote.trim() || undefined
            : !cleanStr(req.body?.venue, current.venue) && current.trackType === 'IT'
            ? 'Pending trainer & venue allocation'
            : undefined,
      };

      cohortState.batches[idx] = updated;
      cohortState.batches.sort((a, b) => compareLex(a.department, b.department));
      saveCohortState(cohortState);
      res.json({
        batch: updated,
        facultyDirectory: buildPublicFacultyDirectory(),
      });
    }
  );

  // Admin / Super Admin CSV import (supports both Batch Allocation CSV & Student Roster CSV/TSV)
  app.post(
    '/api/cohort/import',
    requireRole(['admin', 'superadmin']),
    (req: AuthenticatedRequest, res: Response) => {
      const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
      const rawDefaultDept =
        typeof req.body?.defaultDepartment === 'string'
          ? req.body.defaultDepartment.trim()
          : '';
      const rawFileName =
        typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';

      if (!csvText.trim()) {
        res.status(400).json({ error: 'CSV content is empty.' });
        return;
      }

      const fallbackDepartment =
        rawDefaultDept ||
        inferDepartmentFromText(rawFileName, cohortState.batches);

      const studentRoster = parseStudentRosterCsv(
        csvText,
        cohortState.batches,
        fallbackDepartment
      );
      if (studentRoster && studentRoster.students.length > 0) {
        const importedBatchIds = new Set(studentRoster.students.map((s) => s.batchId));
        const keptOtherStudents = cohortState.students.filter(
          (s) => !importedBatchIds.has(s.batchId)
        );
        const mergedStudents = deduplicateAndSortStudents([
          ...keptOtherStudents,
          ...studentRoster.students,
        ]);
        const validRolls = new Set(mergedStudents.map((s) => s.id));

        const cleanedAttendance: Record<string, Record<string, AttendanceStatus>> = {};
        Object.entries(cohortState.dailyAttendance).forEach(([sessKey, map]) => {
          const nextMap: Record<string, AttendanceStatus> = {};
          Object.entries(map || {}).forEach(([rollKey, st]) => {
            if (validRolls.has(rollKey)) {
              nextMap[rollKey] = st;
            }
          });
          cleanedAttendance[sessKey] = nextMap;
        });

        const countByBatch = new Map<string, number>();
        mergedStudents.forEach((s) => {
          countByBatch.set(s.batchId, (countByBatch.get(s.batchId) || 0) + 1);
        });

        cohortState.batches = cohortState.batches
          .map((b) =>
            importedBatchIds.has(b.id)
              ? {
                  ...b,
                  studentCount: countByBatch.get(b.id) || 0,
                  rawCount: String(countByBatch.get(b.id) || 0),
                }
              : b
          )
          .sort((a, b) => compareLex(a.department, b.department));
        cohortState.students = mergedStudents;
        cohortState.dailyAttendance = cleanedAttendance;
        saveCohortState(cohortState);

        res.json({
          importMode: 'students',
          importedCount: studentRoster.students.length,
          programTitle: cohortState.programTitle,
          dateRange: cohortState.dateRange,
          batches: cohortState.batches,
          students: cohortState.students,
          dailyAttendance: cohortState.dailyAttendance,
          sessionMeta: cohortState.sessionMeta,
          scheduleState: cohortState.scheduleState,
          facultyDirectory: buildPublicFacultyDirectory(),
        });
        return;
      }

      const next = buildCohortStateFromCsv(csvText);
      if (next.batches.length === 0) {
        res.status(400).json({ error: 'No valid batch or student rows detected in CSV.' });
        return;
      }
      cohortState = next;
      saveCohortState(cohortState);
      res.json({
        importMode: 'batches',
        programTitle: cohortState.programTitle,
        dateRange: cohortState.dateRange,
        batches: cohortState.batches,
        students: cohortState.students,
        dailyAttendance: cohortState.dailyAttendance,
        sessionMeta: cohortState.sessionMeta,
        scheduleState: cohortState.scheduleState,
        facultyDirectory: buildPublicFacultyDirectory(),
      });
    }
  );

  app.post(
    '/api/cohort/reset',
    requireRole(['admin', 'superadmin']),
    (_req: AuthenticatedRequest, res: Response) => {
      cohortState = buildCohortStateFromCsv(readSourceCsvText());
      saveCohortState(cohortState);
      res.json({
        programTitle: cohortState.programTitle,
        dateRange: cohortState.dateRange,
        batches: cohortState.batches,
        students: cohortState.students,
        dailyAttendance: cohortState.dailyAttendance,
        sessionMeta: cohortState.sessionMeta,
        scheduleState: cohortState.scheduleState,
        facultyDirectory: buildPublicFacultyDirectory(),
      });
    }
  );

  // Admin / Super Admin account & credential management
  app.get(
    '/api/admin/accounts',
    requireRole(['admin', 'superadmin']),
    (_req: AuthenticatedRequest, res: Response) => {
      res.json({ accounts: buildAccountSummaries() });
    }
  );

  app.post(
    '/api/admin/set-password',
    requireRole(['admin', 'superadmin']),
    (req: AuthenticatedRequest, res: Response) => {
      const rawUsername = typeof req.body?.username === 'string' ? req.body.username : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const username = rawUsername.trim().toLowerCase();

      if (!username || password.length < 6) {
        res.status(400).json({
          error: 'Valid username and password (minimum 6 characters) are required.',
        });
        return;
      }

      const target = resolveAuthUser(username);
      if (!target || target.role === 'guest') {
        res.status(404).json({ error: 'Account not found.' });
        return;
      }

      if (target.role !== 'faculty' && req.authUser!.role !== 'superadmin') {
        res.status(403).json({
          error: 'Only the Super Admin can change Admin or Super Admin credentials.',
        });
        return;
      }

      if (username === 'superadmin' && password.length < 8) {
        res.status(400).json({
          error: 'Super Admin password must be at least 8 characters long.',
        });
        return;
      }

      authStore.credentials[username] = hashPassword(password);
      saveAuthStore(authStore);

      res.json({
        ok: true,
        accounts: buildAccountSummaries(),
      });
    }
  );

  app.post(
    '/api/admin/provision-faculty',
    requireRole(['admin', 'superadmin']),
    (req: AuthenticatedRequest, res: Response) => {
      const mode = req.body?.mode === 'all' ? 'all' : 'missing';
      const targetUsernames = Array.isArray(req.body?.usernames)
        ? new Set(req.body.usernames.map((u: unknown) => String(u).trim().toLowerCase()))
        : null;

      const facultyList = extractFacultyAccounts(cohortState.batches);
      const provisioned: {
        username: string;
        displayName: string;
        assignedDepartments: string[];
        temporaryPassword: string;
      }[] = [];

      facultyList.forEach((f) => {
        if (targetUsernames && !targetUsernames.has(f.username)) return;
        const alreadySet = Boolean(authStore.credentials[f.username]);
        if (mode === 'missing' && alreadySet) return;

        const temporaryPassword = generateTempPasscode(10);
        authStore.credentials[f.username] = hashPassword(temporaryPassword);
        provisioned.push({
          username: f.username,
          displayName: f.displayName,
          assignedDepartments: [...f.assignedDepartments].sort(compareLex),
          temporaryPassword,
        });
      });

      provisioned.sort((a, b) => compareLex(a.displayName, b.displayName));

      if (provisioned.length > 0) {
        saveAuthStore(authStore);
      }

      res.json({
        provisioned,
        accounts: buildAccountSummaries(),
      });
    }
  );

  return app;
}
