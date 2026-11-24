import {
  AttendanceStatus,
  BatchRecord,
  BatchSessionMeta,
  InternshipDay,
  ParsedCohortData,
  StudentRecord,
} from '../types/internship';

export const SOURCE_CSV_URL = '/assets/aistudio/B2025-2029_Internship_ATTENDANCE_ddabe17c';

// Embedded copy of the attached CSV used only as an instant offline fallback if fetch fails
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

/**
 * RFC-4180 compliant CSV parser handling quoted multi-line fields and CRLF.
 */
export function parseRawCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

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
      } else if (char === ',') {
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
    .filter(Boolean);
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
    if (rows[i].some((c) => c.toLowerCase() === 'department')) {
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

  return {
    programTitle,
    dateRange,
    batches,
  };
}

export function generateInternshipDays(): InternshipDay[] {
  // 24.11.2026 to 12.12.2026 (inclusive)
  const start = new Date(2026, 10, 24); // Nov 24, 2026
  const end = new Date(2026, 11, 12);   // Dec 12, 2026
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

const FIRST_NAMES = [
  'Aarav', 'Abhinav', 'Adhithya', 'Aishwarya', 'Akash', 'Ananya', 'Arjun', 'Aravind',
  'Ashwin', 'Bala', 'Bhavana', 'Charan', 'Deepak', 'Devika', 'Dhanush', 'Divya',
  'Gokul', 'Harini', 'Harish', 'Ishwarya', 'Janani', 'Jayasurya', 'Kailash', 'Kamalesh',
  'Karthikeyan', 'Kavya', 'Keerthana', 'Kiran', 'Kishore', 'Kowsalya', 'Lakshmi', 'Lavanya',
  'Madhan', 'Mahesh', 'Meenakshi', 'Mithun', 'Monika', 'Nandhini', 'Naveen', 'Neha',
  'Nikhil', 'Nithya', 'Pavithra', 'Pranav', 'Praveen', 'Priya', 'Rahul', 'Rajesh',
  'Rakshitha', 'Ramya', 'Ranjith', 'Reshma', 'Rithika', 'Rohan', 'Rohini', 'Sabarish',
  'Sadhana', 'Sanjay', 'Santhosh', 'Saranya', 'Sathish', 'Shalini', 'Shanthi', 'Shiva',
  'Shreya', 'Siddharth', 'Sindhu', 'Sneha', 'Sowmya', 'Srinidhi', 'Subash', 'Sudharsan',
  'Surya', 'Swathi', 'Tamilselvan', 'Tharun', 'Vaishnavi', 'Varun', 'Vignesh', 'Vijay',
  'Vikram', 'Vinoth', 'Vishal', 'Yamini', 'Yogesh', 'Yuvaraj',
];

const LAST_INITIALS = ['K', 'S', 'R', 'M', 'P', 'V', 'N', 'A', 'B', 'G', 'T', 'D', 'C', 'J'];

function getDeptPrefix(dept: string): string {
  const clean = dept.toUpperCase();
  if (clean.startsWith('AIDS-A')) return '25AD1';
  if (clean.startsWith('AIDS-B')) return '25AD2';
  if (clean.startsWith('AIDS-C')) return '25AD3';
  if (clean.startsWith('AIDS-D')) return '25AD4';
  if (clean.startsWith('AIML-A')) return '25AM1';
  if (clean.startsWith('AIML-B')) return '25AM2';
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
  return '25ME0';
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function generateStudentsForBatches(batches: BatchRecord[]): StudentRecord[] {
  const students: StudentRecord[] = [];
  batches.forEach((batch) => {
    const prefix = getDeptPrefix(batch.department);
    for (let i = 1; i <= batch.studentCount; i++) {
      const rollSuffix = String(i).padStart(2, '0');
      const rollNumber = `${prefix}${rollSuffix}`;
      const seed = hashSeed(`${batch.department}-${i}`);
      const firstName = FIRST_NAMES[seed % FIRST_NAMES.length];
      const lastInitial = LAST_INITIALS[(seed >> 4) % LAST_INITIALS.length];
      const name = `${firstName} ${lastInitial}.`;
      students.push({
        id: `${batch.id}::${rollNumber}`,
        rollNumber,
        name,
        department: batch.department,
        batchId: batch.id,
        email: `${rollNumber.toLowerCase()}@sece.ac.in`,
      });
    }
  });
  return students;
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

  // Populate Day 01 (2026-11-24) as active opening day so the dashboard immediately displays live metrics
  const firstDay = days.find((d) => !d.isSunday);
  if (firstDay) {
    const dayMap: Record<string, AttendanceStatus> = {};
    const metaMap: Record<string, BatchSessionMeta> = {};

    batches.forEach((batch, bIdx) => {
      if (batch.trackType === 'CORE') {
        metaMap[batch.id] = {
          status: 'core',
          updatedAt: '09:00 AM',
          note: 'Core Mechanical track monitored separately',
        };
        return;
      }

      // Leave 2 unassigned batches pending roll-call so user can immediately see pending vs marked workflow
      const isPendingBatch = !batch.venue && (batch.department === 'ECE-C' || batch.department === 'EEE');
      if (isPendingBatch) {
        metaMap[batch.id] = {
          status: 'pending',
          updatedAt: 'Awaiting roll call',
        };
        const batchStudents = students.filter((s) => s.batchId === batch.id);
        batchStudents.forEach((s) => {
          dayMap[s.id] = 'unmarked';
        });
        return;
      }

      const isInSession = bIdx % 4 === 1;
      metaMap[batch.id] = {
        status: isInSession ? 'in-session' : 'completed',
        updatedAt: isInSession ? '09:42 AM' : '09:18 AM',
      };

      const batchStudents = students.filter((s) => s.batchId === batch.id);
      batchStudents.forEach((s, sIdx) => {
        const seed = hashSeed(`${firstDay.dateKey}-${s.id}`);
        const roll = seed % 100;
        if (roll < 4) {
          dayMap[s.id] = 'absent';
        } else if (roll < 7) {
          dayMap[s.id] = 'late';
        } else if (roll === 8 && sIdx % 5 === 0) {
          dayMap[s.id] = 'od';
        } else {
          dayMap[s.id] = 'present';
        }
      });
    });

    dailyAttendance[firstDay.dateKey] = dayMap;
    sessionMeta[firstDay.dateKey] = metaMap;
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
  dayAttendance: Record<string, AttendanceStatus>
): string {
  const headers = [
    'Date',
    'Organisation',
    'Department',
    'Track',
    'Total Enrolled',
    'Present',
    'Late',
    'On-Duty',
    'Absent',
    'Unmarked',
    'Attendance %',
    'Venue',
    'Room Number',
    'Expert Name',
    'Contact Number',
    'Mail ID',
    'Faculty Incharge',
  ];

  const rows = batches.map((batch) => {
    const batchStudents = students.filter((s) => s.batchId === batch.id);
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

    const attended = present + late + od;
    const pct = batch.studentCount > 0 ? ((attended / batch.studentCount) * 100).toFixed(1) : 'N/A';

    return [
      dateKey,
      batch.organisation,
      batch.department,
      batch.trackType,
      batch.trackType === 'CORE' ? 'CORE' : batch.studentCount,
      present,
      late,
      od,
      absent,
      unmarked,
      pct === 'N/A' ? 'CORE' : `${pct}%`,
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
  dayAttendance: Record<string, AttendanceStatus>
): string {
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const headers = [
    'Date',
    'Roll Number',
    'Student Name',
    'Department',
    'Organisation',
    'Venue',
    'Room',
    'Status',
    'Email',
  ];

  const rows = students.map((s) => {
    const batch = batchById.get(s.batchId);
    const st = dayAttendance[s.id] || 'unmarked';
    return [
      dateKey,
      s.rollNumber,
      s.name,
      s.department,
      batch?.organisation || '-',
      batch?.venue || '-',
      batch?.roomNumber || '-',
      st.toUpperCase(),
      s.email,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
}
