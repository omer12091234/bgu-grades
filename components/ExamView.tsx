"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { CourseRef, TermDistribution } from "@/types";
import { combinedDistribution } from "@/lib/stats";
import { useCourseSeries, type Exam } from "@/lib/useCourseSeries";
import type { TermKey } from "@/lib/terms";
import type { CompareSeries } from "./CompareCharts";

const CompareDistribution = dynamic(() => import("./CompareCharts").then((m) => m.CompareDistribution), { ssr: false });

const EXAMS: { exam: Exam; name: string }[] = [
  { exam: "a", name: "מועד א׳" },
  { exam: "b", name: "מועד ב׳" },
  { exam: "special", name: "מועד מיוחד" },
];

const fmt1 = (n: number | null) => (n === null ? "–" : n.toFixed(1));
const pct = (n: number | null) => (n === null ? "–" : (n * 100).toFixed(0) + "%");

interface Props {
  course: CourseRef;
  /** The semesters currently selected in the rail (only ones with data). */
  terms: TermDistribution[];
  /** Final grades of all students for the same semesters, shown as the reference row. */
  overall: TermDistribution;
}

/** Grade distribution split by exam session (מועד א׳ / ב׳ / מיוחד) for the selected semesters. */
// Each semester gets its own line pattern; the colour stays the exam session's.
const DASHES: number[][] = [[], [6, 4], [2, 3], [10, 3, 2, 3], [1, 5]];

export default function ExamView({ course, terms, overall }: Props) {
  const [split, setSplit] = useState<"pooled" | "by-term">("pooled");
  // Lines hidden from the per-semester chart via its legend.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggleHidden = (k: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const keys: TermKey[] = terms.map((t) => ({ year: t.year, semester: t.semester, id: t.termId }));
  const courses = [course];
  // One request at a time per session, so the three sessions together stay gentle on BGU's servers.
  const a = useCourseSeries(courses, keys, 0, { exam: "a", concurrency: 1 });
  const b = useCourseSeries(courses, keys, 0, { exam: "b", concurrency: 1 });
  const sp = useCourseSeries(courses, keys, 0, { exam: "special", concurrency: 1 });
  const states = [a, b, sp].map((s) => Object.values(s)[0]);

  const done = states.reduce((n, s) => n + (s?.done ?? 0), 0);
  const total = keys.length * 3;
  const loading = states.some((s) => !s || s.loading);

  const series: (CompareSeries & { perTerm: Map<string, TermDistribution> })[] = EXAMS.map(({ name }, i) => {
    const ok = (states[i]?.terms ?? []).filter((t) => t.status === "ok" || t.status === "suppressed");
    const withGrades = ok.filter((t) => t.status === "ok");
    return {
      key: name,
      name,
      colorIndex: i,
      terms: withGrades,
      combined: combinedDistribution(withGrades),
      perTerm: new Map(ok.map((t) => [t.termId, t])),
    };
  });
  const charted = series.filter((s) => s.combined.n > 0);

  if (loading) {
    return (
      <div className="exam-loading">
        <span className="spinner" aria-hidden /> טוען ציונים לפי מועד · {done} מתוך {total}
      </div>
    );
  }

  if (charted.length === 0) {
    return <div className="empty">אין פירוט לפי מועדים לסמסטרים שנבחרו.</div>;
  }

  // Every exam session in every semester, newest semester boldest.
  const termStyle = (ti: number) => ({
    opacity: terms.length === 1 ? 1 : 1 - (ti / (terms.length - 1)) * 0.55,
    dash: DASHES[ti % DASHES.length],
  });
  const byTerm: CompareSeries[] = terms.flatMap((t, ti) =>
    series.flatMap((s) => {
      const x = s.perTerm.get(t.termId);
      if (!x || x.status !== "ok" || hidden.has(s.key) || hidden.has(t.termId)) return [];
      return [{
        key: `${s.key}-${t.termId}`,
        name: `${s.name} · ${t.label}`,
        colorIndex: s.colorIndex,
        terms: [x],
        combined: x,
        ...termStyle(ti),
      }];
    })
  );
  const showSplit = terms.length > 1;

  return (
    <>
      {showSplit && (
        <div className="exam-split">
          <div className="seg" role="group" aria-label="איך להציג את הסמסטרים">
            <button className={split === "pooled" ? "active" : ""} onClick={() => setSplit("pooled")}>כל הסמסטרים יחד</button>
            <button className={split === "by-term" ? "active" : ""} onClick={() => setSplit("by-term")}>כל סמסטר בנפרד</button>
          </div>
        </div>
      )}
      {split === "by-term" && showSplit && (
        <div className="line-legend" aria-label="מקרא: לחיצה מסתירה או מציגה">
          <div className="row">
            <span className="muted">מועד (צבע):</span>
            {charted.map((s) => (
              <button key={s.key} aria-pressed={!hidden.has(s.key)} onClick={() => toggleHidden(s.key)}>
                <i style={{ background: `var(--series-${s.colorIndex + 1})` }} />
                {s.name}
              </button>
            ))}
          </div>
          <div className="row">
            <span className="muted">סמסטר (קו):</span>
            {terms.map((t, ti) => {
              const st = termStyle(ti);
              return (
                <button key={t.termId} aria-pressed={!hidden.has(t.termId)} onClick={() => toggleHidden(t.termId)}>
                  <svg width="26" height="8" aria-hidden>
                    <line x1="1" y1="4" x2="25" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={st.dash.join(" ")} opacity={st.opacity} />
                  </svg>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <CompareDistribution
        series={split === "by-term" && showSplit ? byTerm : charted}
        tall={split === "by-term" && showSplit}
        hideLegend={split === "by-term" && showSplit}
      />
      <div className="table-wrap" style={{ marginTop: "1.25rem" }}>
        <table>
          <thead>
            <tr><th>מועד</th><th>נבחנים</th><th>ממוצע</th><th>חציון</th><th className="hide-sm">סטיית תקן</th><th>עברו</th></tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.key} className={s.combined.n === 0 ? "dim" : ""}>
                <td><span className="swatch" style={{ background: `var(--series-${s.colorIndex + 1})` }} />{s.name}</td>
                <td>{s.combined.n || "–"}</td>
                <td>{fmt1(s.combined.stats.mean)}</td>
                <td>{fmt1(s.combined.stats.median)}</td>
                <td className="hide-sm">{fmt1(s.combined.stats.stdev)}</td>
                <td>{pct(s.combined.stats.passRate)}</td>
              </tr>
            ))}
            <tr className="total">
              <td className="wrap">ציון סופי, כל הנבחנים</td>
              <td>{overall.n}</td>
              <td>{fmt1(overall.stats.mean)}</td>
              <td>{fmt1(overall.stats.median)}</td>
              <td className="hide-sm">{fmt1(overall.stats.stdev)}</td>
              <td>{pct(overall.stats.passRate)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {terms.length > 1 && (
        <div className="table-wrap" style={{ marginTop: "1.25rem" }}>
          <div className="small muted" style={{ marginBottom: ".35rem" }}>ממוצע בכל מועד לפי סמסטר, ולידו מספר הנבחנים</div>
          <table>
            <thead>
              <tr>
                <th>סמסטר</th>
                {series.map((s) => <th key={s.key}>{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.termId}>
                  <td>{t.label}</td>
                  {series.map((s) => {
                    const x = s.perTerm.get(t.termId);
                    return (
                      <td key={s.key} className="exam-cell">
                        {!x ? (
                          "–"
                        ) : x.status === "suppressed" ? (
                          "מוסתר"
                        ) : (
                          <>
                            <bdi>{fmt1(x.stats.mean)}</bdi> <span className="muted n"><bdi>{x.n}</bdi> נבחנים</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="small muted" style={{ marginTop: ".9rem" }}>
        סטודנט שניגש לשני מועדים נספר בשניהם,
        ולכן מספרי הנבחנים במועדים לא מסתכמים למספר הנבחנים בקורס. לקבוצה השלישית אין שם בנתונים; לפי המספרים זה המועד המיוחד.
      </p>
    </>
  );
}
