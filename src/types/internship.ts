export type TrackType = 'IT' | 'CORE';

export type SessionPeriod = 'FN' | 'AN';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'od' | 'unmarked';

export type BatchSessionStatus = 'completed' | 'in-session' | 'pending' | 'core';

export type UserRole = 'guest' | 'faculty' | 'admin' | 'superadmin';

export interface AuthUser {
  username: string;
  displayName: string;
  role: UserRole;
  assignedDepartments: string[];
}

export interface AccountSummary {
  username: string;
  displayName: string;
  role: Exclude<UserRole, 'guest'>;
  assignedDepartments: string[];
  hasPassword: boolean;
}

export interface BatchRecord {
  id: string;
  department: string;
  organisation: string;
  rawCount: string;
  studentCount: number;
  trackType: TrackType;
  venue: string;
  expertName: string;
  roomNumber: string;
  gender: string;
  contactNumbers: string[];
  emails: string[];
  facultyIncharge: string[];
  allocationNote?: string;
}

export interface StudentRecord {
  id: string;
  rollNumber: string;
  name: string;
  department: string;
  batchId: string;
  email: string;
}

export interface BatchSessionMeta {
  status: BatchSessionStatus;
  updatedAt: string;
  note?: string;
}

export interface InternshipDay {
  dateKey: string; // YYYY-MM-DD
  label: string;   // e.g. "Nov 24"
  dayLabel: string; // e.g. "Day 01"
  weekday: string; // e.g. "Tue"
  isSunday: boolean;
}

export interface ParsedCohortData {
  programTitle: string;
  dateRange: string;
  batches: BatchRecord[];
}

export type DashboardView =
  | 'overview'
  | 'students'
  | 'directory'
  | 'schedule'
  | 'access';
