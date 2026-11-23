export type Bin = {
  label: string;
  min: number;
  max: number;
  count: number;
};

export type TermStats = {
  mean: number | null;
  median: number | null;
  stdev: number | null;
  passRate: number | null;
  approximate: boolean;
};

export type TermDistribution = {
  termId: string;
  year: number;
  semester: 1 | 2 | 3;
  label: string;
  courseName?: string;
  departmentName?: string;
  n: number;
  bins: Bin[];
  raw?: { grade: number; count: number }[];
  stats: TermStats;
  status: "ok" | "empty" | "suppressed" | "error";
  errorMessage?: string;
  /** Lecturers of the lecture groups (שעור) in this semester, from the course catalog. */
  lecturers?: string[];
};

/** A course as identified by BGU: department.degree.course, e.g. 361.1.2251 */
export type CourseRef = {
  dept: string;
  degree: string;
  course: string;
};

export type CourseSearchResult = CourseRef & {
  /** Display number, e.g. "361.1.2251" */
  number: string;
  nameHe: string;
  nameEn: string;
  /** Last term the course was offered, e.g. "2026-2" */
  lastActive: string;
};

export type TermResponse = TermDistribution;

export const SUPPRESSION_THRESHOLD = 5;
