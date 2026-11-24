export type TrackType = 'IT' | 'CORE';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'od' | 'unmarked';

export type BatchSessionStatus = 'completed' | 'in-session' | 'pending' | 'core';

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

export type DashboardView = 'overview' | 'students' | 'directory' | 'schedule';
