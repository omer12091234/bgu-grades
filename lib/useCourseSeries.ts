"use client";
import { useEffect, useRef, useState } from "react";
import type { CourseRef, TermResponse } from "@/types";
import { courseKey, termLabel, type TermKey } from "./terms";

// Per-tab memory cache, so switching tabs or toggling comparison doesn't refetch.
const memo = new Map<string, Promise<TermResponse>>();

export type Exam = "final" | "a" | "b" | "special";

function fetchTerm(c: CourseRef, t: TermKey, exam: Exam): Promise<TermResponse> {
  const key = `${courseKey(c)}:${t.id}:${exam}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const p = fetch(
    `/api/term?dept=${c.dept}&degree=${c.degree}&course=${c.course}&year=${t.year}&semester=${t.semester}` +
      (exam === "final" ? "" : `&exam=${exam}`)
  ).then(async (res) => {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`);
    return { ...(json as TermResponse), label: termLabel(t.year, t.semester) };
  });
  memo.set(key, p);
  p.then((r) => r.status === "error" && memo.delete(key)).catch(() => memo.delete(key));
  return p;
}

export type SeriesState = {
  terms: TermResponse[];
  loading: boolean;
  done: number;
  total: number;
  error: string | null;
};

/** Loads every term of every course, a few requests at a time (BGU's servers are slow and old). */
export function useCourseSeries(
  courses: CourseRef[],
  termList: TermKey[],
  reloadToken = 0,
  { exam = "final", concurrency = 3 }: { exam?: Exam; concurrency?: number } = {}
) {
  const [state, setState] = useState<Record<string, SeriesState>>({});
  const runId = useRef(0);
  const sig = courses.map(courseKey).join("|") + "#" + termList.map((t) => t.id).join(",") + "#" + reloadToken + "#" + exam;

  useEffect(() => {
    if (courses.length === 0) return;
    const id = ++runId.current;
    const jobs = courses.flatMap((c) => termList.map((t) => ({ c, t })));
    const results: Record<string, (TermResponse | undefined)[]> = {};
    const counts: Record<string, number> = {};
    const errors: Record<string, string | null> = {};
    for (const c of courses) {
      results[courseKey(c)] = new Array(termList.length);
      counts[courseKey(c)] = 0;
      errors[courseKey(c)] = null;
    }

    const publish = () => {
      if (id !== runId.current) return;
      const next: Record<string, SeriesState> = {};
      for (const c of courses) {
        const k = courseKey(c);
        next[k] = {
          terms: results[k].filter(Boolean) as TermResponse[],
          loading: counts[k] < termList.length,
          done: counts[k],
          total: termList.length,
          error: errors[k],
        };
      }
      setState(next);
    };
    publish();

    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length && id === runId.current) {
        const { c, t } = jobs[cursor++];
        const k = courseKey(c);
        try {
          results[k][termList.indexOf(t)] = await fetchTerm(c, t, exam);
        } catch (e) {
          errors[k] = e instanceof Error ? e.message : String(e);
        }
        counts[k]++;
        publish();
      }
    };
    Promise.all(Array.from({ length: concurrency }, worker));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return state;
}
