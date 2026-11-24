import type {
  AttendanceStatus,
  BatchRecord,
  BatchSessionMeta,
  InternshipDay,
  ParsedCohortData,
  SessionPeriod,
  StudentRecord,
} from '../types/internship.ts';

export const SOURCE_CSV_URL = '/assets/aistudio/B2025-2029_Internship_ATTENDANCE_ddabe17c';

export function compareLex(a: string, b: string): number {
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

export function makeSessionKey(dateKey: string, session: SessionPeriod): string {
  return `${dateKey}::${session}`;
}

export function normalizeRollNumberKey(rawKey: string): string {
  const idx = rawKey.indexOf('::');
  const roll = idx >= 0 ? rawKey.slice(idx + 2) : rawKey;
  return roll.trim().toUpperCase();
}

export function migrateAttendanceKeys(
  rawAttendance: Record<string, Record<string, AttendanceStatus>>,
  rawMeta: Record<string, Record<string, BatchSessionMeta>>
): {
  dailyAttendance: Record<string, Record<string, AttendanceStatus>>;
  sessionMeta: Record<string, Record<string, BatchSessionMeta>>;
} {
  const dailyAttendance: Record<string, Record<string, AttendanceStatus>> = {};
  const sessionMeta: Record<string, Record<string, BatchSessionMeta>> = {};

  Object.entries(rawAttendance || {}).forEach(([k, val]) => {
    const sessKey =
      k.includes('::FN') || k.includes('::AN') ? k : makeSessionKey(k, 'FN');
    const normalizedMap: Record<string, AttendanceStatus> = {
      ...(dailyAttendance[sessKey] || {}),
    };
    Object.entries(val || {}).forEach(([studentKey, status]) => {
      const rollKey = normalizeRollNumberKey(studentKey);
      if (rollKey) {
        normalizedMap[rollKey] = status;
      }
    });
    dailyAttendance[sessKey] = normalizedMap;
  });

  Object.entries(rawMeta || {}).forEach(([k, val]) => {
    const sessKey =
      k.includes('::FN') || k.includes('::AN') ? k : makeSessionKey(k, 'FN');
    sessionMeta[sessKey] = val;
  });

  return { dailyAttendance, sessionMeta };
}

export const FALLBACK_CSV_TEXT = `,"Fullstack Internship B2025-2029 - II Year
(24.11.2026 - 12.12.2026)",,,,,,,,
Organisation,Department,College Internship (IT),Venue,Expert Name,Room Number,Gender,Contact Number,Mail ID,Faculty Incharge (Fullstack)
Aptitude Guru,AIDS-A,67,AI -301,Mr. Imran Khan,702,Male,9894741712,imrankhan.cse05@gmail.com,Mr.Sam Peter/AIDS
Better Tomorrow,AIDS-B,66,AI -302,Mr. Karthik Mahadev,703,Male,9361298454,karthikmahadev2001@gmail.com,Dr.Rajesh Kumar/AIDS
Innatetalent,AIDS-C,68,AI -303,Mr. Bharath,712,Male,8072295598,sm.prabhakaran@innatetalent.in,Ms.Pooranam/AIDS
Rampex,AIDS-D,61,AI -307,Mr. Prabhu,704,Male,8825608155,prabhuponnusamy35703@gmail.com,Ms.Geetha Rajakumari/AIDS
AlgoTutor,AIML-A,54,AI-103,Mr. Venkat Prasad,709,Male,9391312653," venkataprasad939@gmail.com\r",Dr. PD Mahendhiran/AIML
Better Tomorrow,AIML-B,64,AI-201,Mr. Sachin,703,Male,8147188428,sachin.kumar14397@gmail.com,Mr. R. Vikkram/AIML
AlgoTutor,CCE,67,CCE lab,Mr. Praveen Kumar P,709,Male,7095392139,praveenpkumar.2025@gmail.com,Ms.R.Megala/CCE
Yellowmatics,CSBS,67,SF10,Ms. Prathoshini,223,Female,9095750096,prathoshini.yellowmatics@gmail.com,Ms.E.Saranya/CSBS
Better Tomorrow,CSE-A,70,SF03,Mr. Raja SK &Siva,703,Male,"7373083269
6382904160","krishnanraja05@gmail.com
nithisiva246@gmail.com",Mr.B.Saravanan & Ms.Rajeshwari /CSE
Upcurve Learing,CSE-B,61,SF04,Mr. Koushik,712,Male,9014377852,koushikdadiga7@gmail.com,Ms.N.Geetha & Ms.Gayathri /CSE
Smart,CSE-C,65,SF05,Mr. Abishek,706,Male,6302160783,abhishek.j3094@gmail.com,Ms.R.N.Danushree & Ms.E.Saranya /CSE
Aptitude Guru,CSE-D,67,SF06,Mr. M. Pradeep,702,Male,9640832335,pradeepmallela098@gmail.com,Dr.A.Sarfaraz Ahmed & Mr.Karthick Raja/CSE
Infoziant,CYS,53,AI309,Ms. Ajusha,225,Female,8870225989,praveena@icl.today,Ms.Thirisha S/CSE
Rampex,ECE-A,10,TF07,Mr. Vikram,704,Male,9361111689,vikraam17@gmail.com,"Dr.Rajesha/ECE
Mr.R.Hariharan"
,ECE-B,10,,,,,,,
,ECE-C,4,,,,,,,
,EEE,20,,,,,,,
Smart,IT,69,TF27,Mr. Rohan,706,Male,76710 64603,chrohankumar8504@gmail.com,Dr.R.Poongodi/ IT
,Mech,CORE,,,,,,,`;

export function parseRawCsvRows(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstNonEmptyLine =
    normalized
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) || '';
  const delimiter =
    firstNonEmptyLine.includes('\t') && !firstNonEmptyLine.includes(',')
      ? '\t'
      : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const next = normalized[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        row.push(cell.trim());
        cell = '';
      } else if (char === '\n') {
        row.push(cell.trim());
        if (row.some((c) => c.length > 0)) {
          rows.push(row);
        }
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function splitMultiValue(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/\n|,(?=\s*[A-Za-z0-9])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .sort(compareLex);
}

export function parseInternshipCsv(csvText: string): ParsedCohortData {
  const rows = parseRawCsvRows(csvText);

  let programTitle = 'Fullstack Internship B2025-2029 - II Year';
  let dateRange = '24.11.2026 - 12.12.2026';
  let headerIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const joined = rows[i].join(' ');
    if (joined.includes('Fullstack Internship')) {
      const bannerCell = rows[i].find((c) => c.includes('Fullstack Internship')) || '';
      const lines = bannerCell.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines[0]) programTitle = lines[0];
      if (lines[1]) dateRange = lines[1].replace(/[()]/g, '');
    }
    if (
      rows[i].some(
        (c) =>
          c.toLowerCase() === 'department' ||
          c.toLowerCase() === 'class' ||
          c.toLowerCase() === 'class name'
      )
    ) {
      headerIdx = i;
      break;
    }
  }

  const dataRows = headerIdx >= 0 ? rows.slice(headerIdx + 1) : rows;
  const batches: BatchRecord[] = [];

  dataRows.forEach((cols, idx) => {
    const organisation = (cols[0] || '').trim();
    const department = (cols[1] || '').trim();
    const rawCount = (cols[2] || '').trim();
    const venue = (cols[3] || '').trim();
    const expertName = (cols[4] || '').trim();
    const roomNumber = (cols[5] || '').trim();
    const gender = (cols[6] || '').trim();
    const contactRaw = (cols[7] || '').trim();
    const mailRaw = (cols[8] || '').trim();
    const facultyRaw = (cols[9] || '').trim();

    if (!department) return;

    const numericCount = parseInt(rawCount, 10);
    const isCore = rawCount.toUpperCase() === 'CORE' || Number.isNaN(numericCount);

    let allocationNote: string | undefined;
    if (isCore) {
      allocationNote = 'Core Engineering Track (Non-IT)';
    } else if (!organisation && !venue && !expertName) {
      allocationNote = 'Pending trainer & venue allocation in source sheet';
    }

    batches.push({
      id: `batch-${department.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${idx}`,
      department,
      organisation: organisation || (isCore ? 'Core Track' : 'Unassigned'),
      rawCount: rawCount || '0',
      studentCount: isCore ? 0 : numericCount,
      trackType: isCore ? 'CORE' : 'IT',
      venue,
      expertName,
      roomNumber,
      gender,
      contactNumbers: splitMultiValue(contactRaw),
      emails: splitMultiValue(mailRaw),
      facultyIncharge: splitMultiValue(facultyRaw),
      allocationNote,
    });
  });

  batches.sort((a, b) => compareLex(a.department, b.department));

  return {
    programTitle,
    dateRange,
    batches,
  };
}

function normalizeDeptLookupKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function inferDepartmentFromText(
  text: string,
  batches: BatchRecord[]
): string | undefined {
  if (!text) return undefined;
  const upper = text.toUpperCase();
  const ordered = [...batches].sort(
    (a, b) => b.department.length - a.department.length || compareLex(a.department, b.department)
  );
  for (const b of ordered) {
    const escaped = b.department.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`);
    if (regex.test(upper)) {
      return b.department;
    }
  }
  return undefined;
}

/**
 * Parses a student-level CSV/TSV exported or copied from Google Sheets
 * (Roll No, Student Name, optional Class Name / Department, optional Email)
 * and binds each unique student (keyed by rollNumber) to the matching class batch.
 */
export function parseStudentRosterCsv(
  csvText: string,
  batches: BatchRecord[],
  fallbackDepartment?: string
): { students: StudentRecord[]; matchedCount: number } | null {
  const rows = parseRawCsvRows(csvText);
  if (rows.length < 2) return null;

  let headerIdx = -1;
  let rollCol = -1;
  let nameCol = -1;
  let classCol = -1;
  let emailCol = -1;

  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const cols = rows[i].map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const rIdx = cols.findIndex(
      (c) =>
        c === 'rollno' ||
        c === 'rollnumber' ||
        c === 'roll' ||
        c === 'regno' ||
        c === 'registerno' ||
        c === 'registernumber' ||
        c === 'regdno' ||
        c === 'studentid' ||
        c === 'usn'
    );
    const nIdx = cols.findIndex(
      (c) =>
        c === 'studentname' ||
        c === 'name' ||
        c === 'fullname' ||
        c === 'candidatename' ||
        c === 'nameofthestudent' ||
        c === 'studentsname'
    );
    const cIdx = cols.findIndex(
      (c) =>
        c === 'class' ||
        c === 'classname' ||
        c === 'department' ||
        c === 'dept' ||
        c === 'section' ||
        c === 'batch' ||
        c === 'classsection' ||
        c === 'deptsec'
    );
    const eIdx = cols.findIndex(
      (c) => c === 'email' || c === 'mailid' || c === 'mail' || c === 'emailid'
    );

    if (rIdx >= 0 && nIdx >= 0) {
      headerIdx = i;
      rollCol = rIdx;
      nameCol = nIdx;
      classCol = cIdx;
      emailCol = eIdx;
      break;
    }
  }

  if (headerIdx < 0) return null;

  const batchByNormalizedDept = new Map<string, BatchRecord>();
  batches.forEach((b) => {
    batchByNormalizedDept.set(b.department.trim().toUpperCase(), b);
    batchByNormalizedDept.set(normalizeDeptLookupKey(b.department), b);
  });

  // If CSV has no class column, try detecting department from banner lines above header or fallbackDepartment
  let resolvedFallbackDept = fallbackDepartment;
  if (!resolvedFallbackDept && classCol < 0 && headerIdx > 0) {
    const bannerText = rows
      .slice(0, headerIdx)
      .map((r) => r.join(' '))
      .join(' ');
    resolvedFallbackDept = inferDepartmentFromText(bannerText, batches);
  }

  const fallbackBatch = resolvedFallbackDept
    ? batchByNormalizedDept.get(resolvedFallbackDept.trim().toUpperCase()) ||
      batchByNormalizedDept.get(normalizeDeptLookupKey(resolvedFallbackDept))
    : undefined;

  if (classCol < 0 && !fallbackBatch) {
    return null;
  }

  const uniqueByRoll = new Map<string, StudentRecord>();
  let matchedCount = 0;

  rows.slice(headerIdx + 1).forEach((cols) => {
    const rollNumber = (cols[rollCol] || '').trim().toUpperCase();
    const studentName = (cols[nameCol] || '').trim();
    const rawClass = classCol >= 0 ? (cols[classCol] || '').trim() : '';
    const rawEmail = emailCol >= 0 ? (cols[emailCol] || '').trim() : '';

    if (!rollNumber) return;

    const batch = rawClass
      ? batchByNormalizedDept.get(rawClass.toUpperCase()) ||
        batchByNormalizedDept.get(normalizeDeptLookupKey(rawClass))
      : fallbackBatch;
    if (!batch) return;

    matchedCount++;
    uniqueByRoll.set(rollNumber, {
      id: rollNumber,
      rollNumber,
      name: studentName || `${batch.department} · ${rollNumber}`,
      department: batch.department,
      batchId: batch.id,
      email: rawEmail || `${rollNumber.toLowerCase()}@sece.ac.in`,
    });
  });

  if (uniqueByRoll.size === 0) return null;

  return {
    students: deduplicateAndSortStudents(Array.from(uniqueByRoll.values())),
    matchedCount,
  };
}

export interface ExtractedFacultyAccount {
  username: string;
  displayName: string;
  assignedDepartments: string[];
}

function cleanFacultyDisplayName(rawPart: string): string {
  const withoutDept = rawPart.replace(/\/\s*[A-Za-z0-9-]+$/i, '').trim();
  return withoutDept
    .replace(/\b(Mr|Ms|Mrs|Dr)\.\s*/gi, (_, title: string) => {
      const normalized = title.charAt(0).toUpperCase() + title.slice(1).toLowerCase();
      return `${normalized}. `;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function facultyNameToUsername(displayName: string): string {
  const withoutTitle = displayName
    .replace(/^(Mr|Ms|Mrs|Dr)\.\s*/i, '')
    .trim();
  const slug = withoutTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return slug || 'faculty';
}

export function extractFacultyAccounts(batches: BatchRecord[]): ExtractedFacultyAccount[] {
  const map = new Map<string, ExtractedFacultyAccount>();

  batches.forEach((batch) => {
    batch.facultyIncharge.forEach((entry) => {
      const parts = entry.split(/\s*&\s*/);
      parts.forEach((part) => {
        const displayName = cleanFacultyDisplayName(part);
        if (!displayName) return;
        const username = facultyNameToUsername(displayName);
        const existing = map.get(username);
        if (existing) {
          if (!existing.assignedDepartments.includes(batch.department)) {
            existing.assignedDepartments.push(batch.department);
          }
        } else {
          map.set(username, {
            username,
            displayName,
            assignedDepartments: [batch.department],
          });
        }
      });
    });
  });

  const list = Array.from(map.values());
  list.forEach((item) => {
    item.assignedDepartments.sort(compareLex);
  });

  return list.sort(
    (a, b) => compareLex(a.displayName, b.displayName) || compareLex(a.username, b.username)
  );
}

export function generateInternshipDays(): InternshipDay[] {
  const start = new Date(2026, 10, 24);
  const end = new Date(2026, 11, 12);
  const days: InternshipDay[] = [];
  let sessionCount = 0;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const isSunday = d.getDay() === 0;
    if (!isSunday) {
      sessionCount++;
    }
    days.push({
      dateKey: `${yyyy}-${mm}-${dd}`,
      label: `${months[d.getMonth()]} ${dd}`,
      dayLabel: isSunday ? 'Holiday' : `Day ${String(sessionCount).padStart(2, '0')}`,
      weekday: weekdays[d.getDay()],
      isSunday,
    });
  }

  return days;
}

function getBaseDeptPrefix(dept: string): string {
  const clean = dept.trim().toUpperCase();
  if (clean === 'AIDS-A') return '25AD1';
  if (clean === 'AIDS-B') return '25AD2';
  if (clean === 'AIDS-C') return '25AD3';
  if (clean === 'AIDS-D') return '25AD4';
  if (clean === 'AIML-A') return '25AM1';
  if (clean === 'AIML-B') return '25AM2';
  if (clean === 'CCE') return '25CC0';
  if (clean === 'CSBS') return '25CB0';
  if (clean === 'CSE-A') return '25CS1';
  if (clean === 'CSE-B') return '25CS2';
  if (clean === 'CSE-C') return '25CS3';
  if (clean === 'CSE-D') return '25CS4';
  if (clean === 'CYS') return '25CY0';
  if (clean === 'ECE-A') return '25EC1';
  if (clean === 'ECE-B') return '25EC2';
  if (clean === 'ECE-C') return '25EC3';
  if (clean === 'EEE') return '25EE0';
  if (clean === 'IT') return '25IT0';
  if (clean === 'MECH') return '25ME0';
  const alnum = clean.replace(/[^A-Z0-9]/g, '');
  return `25${alnum.slice(0, 4) || 'CL'}`;
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function deduplicateAndSortStudents(students: StudentRecord[]): StudentRecord[] {
  const uniqueByRoll = new Map<string, StudentRecord>();
  students.forEach((s) => {
    const rollNumber = (s.rollNumber || s.id).trim().toUpperCase();
    if (!rollNumber) return;
    uniqueByRoll.set(rollNumber, {
      ...s,
      id: rollNumber,
      rollNumber,
    });
  });
  return Array.from(uniqueByRoll.values()).sort((a, b) =>
    compareLex(a.rollNumber, b.rollNumber)
  );
}

export function generateStudentsForBatches(batches: BatchRecord[]): StudentRecord[] {
  const orderedBatches = [...batches].sort((a, b) =>
    compareLex(a.department, b.department)
  );
  const usedPrefixes = new Set<string>();
  const uniqueStudents = new Map<string, StudentRecord>();

  orderedBatches.forEach((batch) => {
    let prefix = getBaseDeptPrefix(batch.department);
    if (usedPrefixes.has(prefix)) {
      let suffixIdx = 2;
      while (usedPrefixes.has(`${prefix}_${suffixIdx}`)) {
        suffixIdx++;
      }
      prefix = `${prefix}_${suffixIdx}`;
    }
    usedPrefixes.add(prefix);

    const width = batch.studentCount >= 100 ? 3 : 2;
    for (let i = 1; i <= batch.studentCount; i++) {
      const rollSuffix = String(i).padStart(width, '0');
      const rollNumber = `${prefix}${rollSuffix}`;
      if (uniqueStudents.has(rollNumber)) continue;

      uniqueStudents.set(rollNumber, {
        id: rollNumber,
        rollNumber,
        name: `${batch.department} Student ${rollSuffix}`,
        department: batch.department,
        batchId: batch.id,
        email: `${rollNumber.toLowerCase()}@sece.ac.in`,
      });
    }
  });

  return Array.from(uniqueStudents.values()).sort((a, b) =>
    compareLex(a.rollNumber, b.rollNumber)
  );
}

export function generateInitialAttendanceState(
  batches: BatchRecord[],
  students: StudentRecord[],
  days: InternshipDay[]
): {
  dailyAttendance: Record<string, Record<string, AttendanceStatus>>;
  sessionMeta: Record<string, Record<string, BatchSessionMeta>>;
} {
  const dailyAttendance: Record<string, Record<string, AttendanceStatus>> = {};
  const sessionMeta: Record<string, Record<string, BatchSessionMeta>> = {};

  const firstDay = days.find((d) => !d.isSunday);
  if (firstDay) {
    const fnKey = makeSessionKey(firstDay.dateKey, 'FN');
    const anKey = makeSessionKey(firstDay.dateKey, 'AN');

    const fnMap: Record<string, AttendanceStatus> = {};
    const anMap: Record<string, AttendanceStatus> = {};
    const fnMeta: Record<string, BatchSessionMeta> = {};
    const anMeta: Record<string, BatchSessionMeta> = {};

    batches.forEach((batch, bIdx) => {
      if (batch.trackType === 'CORE') {
        fnMeta[batch.id] = {
          status: 'core',
          updatedAt: '09:00 AM',
          note: 'Core Mechanical track monitored separately',
        };
        anMeta[batch.id] = {
          status: 'core',
          updatedAt: '01:30 PM',
          note: 'Core Mechanical track monitored separately',
        };
        return;
      }

      const batchStudents = students.filter((s) => s.batchId === batch.id);

      // FN (Forenoon) initial roll call
      const isFnPending =
        !batch.venue && (batch.department === 'ECE-C' || batch.department === 'EEE');
      if (isFnPending) {
        fnMeta[batch.id] = { status: 'pending', updatedAt: 'Awaiting FN roll call' };
        batchStudents.forEach((s) => {
          fnMap[s.id] = 'unmarked';
        });
      } else {
        const isInSession = bIdx % 5 === 2;
        fnMeta[batch.id] = {
          status: isInSession ? 'in-session' : 'completed',
          updatedAt: isInSession ? '10:05 AM' : '09:45 AM',
        };
        batchStudents.forEach((s, sIdx) => {
          const seed = hashSeed(`${firstDay.dateKey}-FN-${s.rollNumber}`);
          const roll = seed % 100;
          if (roll < 4) {
            fnMap[s.id] = 'absent';
          } else if (roll < 7) {
            fnMap[s.id] = 'late';
          } else if (roll === 11 && sIdx % 4 === 0) {
            fnMap[s.id] = 'od';
          } else {
            fnMap[s.id] = 'present';
          }
        });
      }

      // AN (Afternoon) initial roll call
      const isAnPending =
        !batch.venue || batch.department === 'CYS' || batch.department === 'AIML-A';
      if (isAnPending) {
        anMeta[batch.id] = { status: 'pending', updatedAt: 'Awaiting AN roll call' };
        batchStudents.forEach((s) => {
          anMap[s.id] = 'unmarked';
        });
      } else {
        const isAnInSession = bIdx % 3 === 1;
        anMeta[batch.id] = {
          status: isAnInSession ? 'in-session' : 'completed',
          updatedAt: isAnInSession ? '01:45 PM' : '02:15 PM',
        };
        batchStudents.forEach((s, sIdx) => {
          const seed = hashSeed(`${firstDay.dateKey}-AN-${s.rollNumber}`);
          const roll = seed % 100;
          if (roll < 5) {
            anMap[s.id] = 'absent';
          } else if (roll < 8) {
            anMap[s.id] = 'late';
          } else if (roll === 15 && sIdx % 5 === 0) {
            anMap[s.id] = 'od';
          } else {
            anMap[s.id] = 'present';
          }
        });
      }
    });

    dailyAttendance[fnKey] = fnMap;
    dailyAttendance[anKey] = anMap;
    sessionMeta[fnKey] = fnMeta;
    sessionMeta[anKey] = anMeta;
  }

  return { dailyAttendance, sessionMeta };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildBatchSummaryCsv(
  dateKey: string,
  batches: BatchRecord[],
  students: StudentRecord[],
  fnAttendance: Record<string, AttendanceStatus>,
  anAttendance: Record<string, AttendanceStatus>,
  activeSession: SessionPeriod
): string {
  const headers = [
    'Date',
    'Active Session',
    'Organisation',
    'Class Name',
    'Track',
    'Total Enrolled',
    'FN Attended',
    'FN %',
    'AN Attended',
    'AN %',
    `${activeSession} Present`,
    `${activeSession} Late`,
    `${activeSession} On-Duty`,
    `${activeSession} Absent`,
    `${activeSession} Unmarked`,
    'Venue',
    'Room Number',
    'Expert Name',
    'Contact Number',
    'Mail ID',
    'Faculty Incharge',
  ];

  const sortedBatches = [...batches].sort((a, b) =>
    compareLex(a.department, b.department)
  );

  const rows = sortedBatches.map((batch) => {
    const batchStudents = students.filter((s) => s.batchId === batch.id);
    const activeMap = activeSession === 'FN' ? fnAttendance : anAttendance;

    let fnAttended = 0;
    let anAttended = 0;
    let present = 0;
    let late = 0;
    let od = 0;
    let absent = 0;
    let unmarked = 0;

    batchStudents.forEach((s) => {
      const fnSt = fnAttendance[s.id] || 'unmarked';
      const anSt = anAttendance[s.id] || 'unmarked';
      if (fnSt === 'present' || fnSt === 'late' || fnSt === 'od') fnAttended++;
      if (anSt === 'present' || anSt === 'late' || anSt === 'od') anAttended++;

      const st = activeMap[s.id] || 'unmarked';
      if (st === 'present') present++;
      else if (st === 'late') late++;
      else if (st === 'od') od++;
      else if (st === 'absent') absent++;
      else unmarked++;
    });

    const fnPct =
      batch.studentCount > 0 ? `${((fnAttended / batch.studentCount) * 100).toFixed(1)}%` : 'CORE';
    const anPct =
      batch.studentCount > 0 ? `${((anAttended / batch.studentCount) * 100).toFixed(1)}%` : 'CORE';

    return [
      dateKey,
      activeSession,
      batch.organisation,
      batch.department,
      batch.trackType,
      batch.trackType === 'CORE' ? 'CORE' : batch.studentCount,
      batch.trackType === 'CORE' ? 'CORE' : fnAttended,
      fnPct,
      batch.trackType === 'CORE' ? 'CORE' : anAttended,
      anPct,
      present,
      late,
      od,
      absent,
      unmarked,
      batch.venue || 'Pending',
      batch.roomNumber || '-',
      batch.expertName || 'Unassigned',
      batch.contactNumbers.join(' / '),
      batch.emails.join(' / '),
      batch.facultyIncharge.join(' / '),
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
}

export function buildStudentRollCallCsv(
  dateKey: string,
  batches: BatchRecord[],
  students: StudentRecord[],
  fnAttendance: Record<string, AttendanceStatus>,
  anAttendance: Record<string, AttendanceStatus>
): string {
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const headers = [
    'Date',
    'Roll Number',
    'Student Name',
    'Class Name',
    'Organisation',
    'Venue',
    'Room',
    'FN Status',
    'AN Status',
    'Email',
  ];

  const sortedStudents = deduplicateAndSortStudents(students);

  const rows = sortedStudents.map((s) => {
    const batch = batchById.get(s.batchId);
    const fnSt = fnAttendance[s.id] || 'unmarked';
    const anSt = anAttendance[s.id] || 'unmarked';
    return [
      dateKey,
      s.rollNumber,
      s.name,
      s.department,
      batch?.organisation || '-',
      batch?.venue || '-',
      batch?.roomNumber || '-',
      fnSt.toUpperCase(),
      anSt.toUpperCase(),
      s.email,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
}
