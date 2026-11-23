// Client-safe helpers for terms and course identifiers.
import type { CourseRef } from "@/types";

export const SEM_LETTER: Record<number, string> = { 1: "א׳", 2: "ב׳", 3: "קיץ" };

export function currentAcademicYear(now = new Date()): number {
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

export type TermKey = { year: number; semester: number; id: string };

/** Newest first. */
export function buildTermList(lookback: number, semesterFilter: string): TermKey[] {
  const cur = currentAcademicYear();
  const years = Array.from({ length: lookback }, (_, i) => cur - i);
  const sems = semesterFilter === "all" ? [2, 1] : [Number(semesterFilter)];
  return years.flatMap((y) => sems.map((s) => ({ year: y, semester: s, id: `${y}-${s}` })));
}

const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];

/** 2025 → תשפ״ה (the Hebrew academic year that ends in that Gregorian year). */
export function hebrewYear(year: number): string {
  const n = (year + 3760) % 1000;
  let s = HUNDREDS[Math.floor(n / 100)];
  const rest = n % 100;
  if (rest === 15) s += "טו";
  else if (rest === 16) s += "טז";
  else s += TENS[Math.floor(rest / 10)] + ONES[rest % 10];
  return s.length > 1 ? `${s.slice(0, -1)}״${s.slice(-1)}` : `${s}׳`;
}

export function termLabel(year: number, semester: number): string {
  return `${SEM_LETTER[semester] ?? semester} ${hebrewYear(year)}`;
}

/** e.g. "סמסטר א׳ תשפ״ה (2025)" */
export function termLongLabel(year: number, semester: number): string {
  return semester === 3 ? `קיץ ${hebrewYear(year)}` : `סמסטר ${SEM_LETTER[semester]} ${hebrewYear(year)}`;
}

export function courseKey(c: CourseRef): string {
  return `${c.dept}.${c.degree}.${c.course}`;
}

export function formatCourseNumber(c: CourseRef): string {
  return `${c.dept.padStart(3, "0")}.${c.degree}.${c.course.padStart(4, "0")}`;
}

/** Accepts "361.1.2251", "361-1-2251", "361 1 2251", "36112251". */
export function parseCourseNumber(input: string): CourseRef | null {
  const s = input.trim();
  const parts = s.split(/[.\-\s/]+/).filter(Boolean);
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p)) && parts[1].length <= 2) {
    return { dept: String(Number(parts[0])), degree: String(Number(parts[1])), course: String(Number(parts[2])) };
  }
  const compact = s.match(/^(\d{3})(\d)(\d{4})$/);
  if (compact) return { dept: String(Number(compact[1])), degree: compact[2], course: String(Number(compact[3])) };
  return null;
}
