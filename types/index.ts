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
};

export type SeriesResponse = {
  terms: TermDistribution[];
  combined: TermDistribution;
  meta: {
    dept: string;
    degree: string;
    course: string;
    lookback: number;
    semesterFilter: number | null;
    fetchedAt: string;
    failures: { termId: string; reason: string }[];
  };
};

export const SUPPRESSION_THRESHOLD = 5;
