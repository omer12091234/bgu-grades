"use client";
import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import Shell from "@/components/Shell";
import type { CourseRef, TermDistribution } from "@/types";
import CourseSearch, { type PickedCourse } from "@/components/CourseSearch";
import type { TourStep } from "@/components/Tour";
import Loader from "@/components/Loader";
import StatsTable from "@/components/StatsTable";
import { combinedDistribution, summariseByLecturer, FAIL_THRESHOLD } from "@/lib/stats";
import { buildTermList, courseKey, formatCourseNumber, hebrewYear, MAX_LOOKBACK, parseCourseNumber, semesterName } from "@/lib/terms";
import { useCourseSeries, type SeriesState } from "@/lib/useCourseSeries";
import type { CompareSeries } from "@/components/CompareCharts";

const ExamView = dynamic(() => import("@/components/ExamView"), { ssr: false });
const Tour = dynamic(() => import("@/components/Tour"), { ssr: false });
const GradeChart = dynamic(() => import("@/components/GradeChart"), { ssr: false });
const TrendChart = dynamic(() => import("@/components/TrendChart"), { ssr: false });
const CompareDistribution = dynamic(() => import("@/components/CompareCharts").then((m) => m.CompareDistribution), { ssr: false });
const CompareTrend = dynamic(() => import("@/components/CompareCharts").then((m) => m.CompareTrend), { ssr: false });

const MAX_COMPARE = 4;

const EXAMPLES: PickedCourse[] = [
  { dept: "361", degree: "1", course: "1021", nameHe: "מבוא להנדסת חשמל" },
  { dept: "214", degree: "1", course: "9711", nameHe: "חדו״א 1 להנדסה" },
  { dept: "201", degree: "1", course: "1211", nameHe: "אלגברה לינארית 1" },
];

type Tab = "dist" | "trend" | "compare";

const TOUR_STEPS: TourStep[] = [
  { target: '[data-tour="search"]', title: "חיפוש קורס", body: "מקלידים חלק משם הקורס ובוחרים מהרשימה, או מקלידים מספר קורס כמו 361.1.1021." },
  { target: '[data-tour="filters"]', title: "טווח וסמסטר", body: "כמה שנים אחורה להציג (עד 8), ואיזה סמסטר: א׳, ב׳, קיץ או כולם." },
  { target: '[data-tour="tabs"]', title: "שלוש תצוגות", body: "התפלגות הציונים, מגמה לאורך השנים לפי מרצה, והשוואה בין קורסים." },
  { target: '[data-tour="lecturers"]', title: "סינון לפי מרצה", body: "לחיצה על מרצה משאירה רק את הסמסטרים שהוא לימד. ״כולם״ מחזיר הכל." },
  { target: '[data-tour="semesters"], [data-tour="semesters-toggle"]', title: "בחירת סמסטרים", body: "כאן בוחרים אילו סמסטרים ייכללו בחישוב. ליד כל סמסטר מופיעים מספר הנבחנים והמרצה. בטלפון לוחצים על השורה כדי לפתוח את הרשימה." },
  { target: '[data-tour="stats"]', title: "המספרים המרכזיים", body: "נבחנים, ממוצע, חציון ואחוז העוברים (56 ומעלה) בסמסטרים שנבחרו." },
  { target: '[data-tour="views"]', title: "סוג הגרף", body: "משולב: כל הציונים יחד. לפי סמסטר: קו לכל סמסטר. לפי מועד: מועד א׳, ב׳ ומיוחד, יחד או בכל סמסטר בנפרד." },
  { target: '[data-tour="chart"]', title: "הגרף", body: "מעבר עם העכבר או נגיעה בגרף מציגים את המספרים המדויקים. עמודות כתומות הן ציון נכשל. בטלפון אפשר לסובב לרוחב לגרף גדול יותר." },
  { target: '[data-tour="table"]', title: "טבלה לפי סמסטר", body: "כל סמסטר בשורה, עם המרצה והנתונים. אפשר להוריד אותה כקובץ CSV." },
  { target: '[data-tour="tab-trend"]', title: "מגמה ומרצים", body: "איך הממוצע ואחוז העוברים השתנו לאורך השנים, עם סימון כשהמרצה התחלף, וטבלה לפי מרצה." },
  { target: '[data-tour="tab-compare"]', title: "השוואה בין קורסים", body: "מוסיפים עד שלושה קורסים נוספים ורואים את ההתפלגות והממוצעים שלהם על אותו גרף." },
  { target: '[data-tour="guide"]', title: "רוצים לדעת עוד?", body: "בעמוד ״איך זה עובד״ יש הסבר מלא על כל תצוגה ועל המושגים. אפשר להפעיל את הסיור שוב מהכפתור ״סיור מודרך״." },
];
const TOUR_SEEN_KEY = "tour-seen-v1";

function readTourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked: don't nag
  }
}
function markTourSeen() {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {}
}
type View = "combined" | "per-semester" | "exam";

const fmt1 = (n: number | null) => (n === null ? "–" : n.toFixed(1));
const pct = (n: number | null) => (n === null ? "–" : (n * 100).toFixed(0) + "%");

function readCourse(params: URLSearchParams): CourseRef | null {
  const c = params.get("c");
  if (c) return parseCourseNumber(c);
  // Links from the first version of the site
  const dept = params.get("dept"), degree = params.get("degree"), course = params.get("course");
  if (dept && degree && course && [dept, degree, course].every((v) => /^\d{1,6}$/.test(v))) return { dept, degree, course };
  return null;
}

function GradeApp() {
  const router = useRouter();
  const params = useSearchParams();

  const course = useMemo(() => readCourse(new URLSearchParams(params.toString())), [params]);
  const compare = useMemo(
    () =>
      (params.get("cmp") ?? "")
        .split(",")
        .map((s) => parseCourseNumber(s))
        .filter((c): c is CourseRef => !!c)
        .slice(0, MAX_COMPARE - 1),
    [params]
  );
  const lookback = Math.min(MAX_LOOKBACK, Math.max(1, Number(params.get("y") ?? params.get("lookback") ?? 3) || 3));
  const semester = ["1", "2", "3"].includes(params.get("sem") ?? params.get("semester") ?? "") ? (params.get("sem") ?? params.get("semester"))! : "all";
  const tab = (["dist", "trend", "compare"].includes(params.get("tab") ?? "") ? params.get("tab") : "dist") as Tab;
  const view = (["per-semester", "exam"].includes(params.get("view") ?? "") ? params.get("view") : "combined") as View;

  const [names, setNames] = useState<Record<string, { he?: string; en?: string }>>({});
  const [excluded, setExcluded] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  const [reload, setReload] = useState(0);
  // On phones the semester list starts collapsed so the chart is visible first.
  const [railOpen, setRailOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  // GradeApp only renders in the browser (useSearchParams), so localStorage is readable here.
  const [tourSeen, setTourSeen] = useState(readTourSeen);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const p = new URLSearchParams(params.toString());
      for (const k of ["dept", "degree", "course", "lookback", "semester"]) p.delete(k);
      if (course && !p.get("c")) p.set("c", formatCourseNumber(course));
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") p.delete(k);
        else p.set(k, v);
      }
      router.push("?" + p.toString(), { scroll: false });
    },
    [params, router, course]
  );

  const rememberName = (c: PickedCourse) => {
    if (c.nameHe) setNames((n) => ({ ...n, [courseKey(c)]: { he: c.nameHe, en: c.nameEn } }));
  };

  const openCourse = (c: PickedCourse, withTour = false) => {
    rememberName(c);
    const p = new URLSearchParams();
    p.set("c", formatCourseNumber(c));
    if (withTour) p.set("tour", "1");
    if (lookback !== 3) p.set("y", String(lookback));
    if (semester !== "all") p.set("sem", semester);
    router.push("?" + p.toString(), { scroll: false });
  };

  const addCompare = (c: PickedCourse) => {
    rememberName(c);
    const list = [...compare.map(formatCourseNumber), formatCourseNumber(c)];
    setParams({ cmp: [...new Set(list)].slice(0, MAX_COMPARE - 1).join(","), tab: "compare" });
  };
  const removeCompare = (key: string) => {
    setParams({ cmp: compare.filter((c) => courseKey(c) !== key).map(formatCourseNumber).join(",") });
  };

  const termList = useMemo(() => buildTermList(lookback, semester), [lookback, semester]);
  const allCourses = useMemo(() => (course ? [course, ...compare] : []), [course, compare]);
  const series = useCourseSeries(allCourses, termList, reload);

  if (!course) {
    return (
      <Shell>
        <div className="container">
          <section className="landing">
            <h1>התפלגות ציונים בקורסים של אוניברסיטת בן-גוריון</h1>
            <p className="lead">
              חפשו קורס לפי שם או מספר וראו איך התפלגו הציונים בכל סמסטר, מי לימד, ואיך הממוצע השתנה לאורך השנים.
            </p>
            <CourseSearch onPick={openCourse} large autoFocus />
            <div className="examples">
              <span className="muted">לדוגמה:</span>
              {EXAMPLES.map((e) => (
                <button key={courseKey(e)} className="chip" onClick={() => openCourse(e)}>
                  {e.nameHe}
                </button>
              ))}
            </div>
            <div className="howto">
              <div>
                <h3>התפלגות</h3>
                <p>כל הציונים מ־1 עד 100, בכל סמסטר או בכולם יחד, עם ממוצע, חציון ואחוז עוברים.</p>
              </div>
              <div>
                <h3>מגמה ומרצים</h3>
                <p>איך השתנו הציונים לאורך השנים, ומה קרה כשהמרצה התחלף.</p>
              </div>
              <div>
                <h3>השוואה</h3>
                <p>עד ארבעה קורסים על אותו גרף — למשל קורס בחירה מול חלופה שלו.</p>
              </div>
            </div>
            <p className="guide-link">
              <button className="btn link" onClick={() => openCourse(EXAMPLES[0], true)}>סיור מודרך על קורס לדוגמה</button>
              {" · "}
              <Link href="/guide">הסבר מלא על מה אפשר לראות באתר</Link>
            </p>
          </section>
        </div>
      </Shell>
    );
  }

  const key = courseKey(course);
  const main: SeriesState | undefined = series[key];
  const terms = main?.terms ?? [];
  const okTerms = terms.filter((t) => t.status === "ok");
  const anyName = names[key]?.he ?? terms.find((t) => t.courseName)?.courseName;
  const deptName = terms.find((t) => t.departmentName)?.departmentName;
  const failures = terms.filter((t) => t.status === "error");
  const loadingMain = !main || main.loading;

  const exclIds = excluded.key === key + lookback + semester ? excluded.ids : new Set<string>();
  const visible = okTerms.filter((t) => !exclIds.has(t.termId));
  const visibleCombined = combinedDistribution(visible);
  const toggleTerm = (id: string) => {
    const next = new Set(exclIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExcluded({ key: key + lookback + semester, ids: next });
  };
  const allOn = exclIds.size === 0;
  const setAll = () =>
    setExcluded({ key: key + lookback + semester, ids: allOn ? new Set(okTerms.map((t) => t.termId)) : new Set() });

  // Lecturer filter: pick a lecturer to keep only the semesters they taught.
  const lecturerOptions = [...new Set(okTerms.flatMap((t) => t.lecturers ?? []))];
  const termsOf = (name: string) => okTerms.filter((t) => t.lecturers?.includes(name)).map((t) => t.termId);
  const activeLecturer = allOn
    ? null
    : (lecturerOptions.find((name) => {
        const ids = new Set(termsOf(name));
        return ids.size === visible.length && visible.every((t) => ids.has(t.termId));
      }) ?? null);
  const pickLecturer = (name: string | null) => {
    const keep = new Set(name ? termsOf(name) : okTerms.map((t) => t.termId));
    setExcluded({ key: key + lookback + semester, ids: new Set(okTerms.map((t) => t.termId).filter((id) => !keep.has(id))) });
  };
  const formerNumbers = [...new Set(terms.map((t) => t.sourceNumber).filter(Boolean))] as string[];

  const termById = new Map(terms.map((t) => [t.termId, t]));
  const years = [...new Set(termList.map((t) => t.year))];
  const lecturersNow = okTerms[0]?.lecturers;

  // The tour walks the distribution tab, so it starts there; ?tour=1 (from the home page) starts it once data is in.
  const startTour = () => {
    if (tab !== "dist" || view !== "combined") setParams({ tab: null, view: null });
    setTourOpen(true);
  };
  const closeTour = () => {
    setTourOpen(false);
    setTourSeen(true);
    markTourSeen();
    if (params.get("tour")) setParams({ tour: null });
  };
  const canTour = !loadingMain && okTerms.length > 0 && tab === "dist";
  const showTour = canTour && (tourOpen || params.get("tour") === "1");
  const showInvite = canTour && !showTour && !tourSeen;

  return (
    <Shell headerSearch={<CourseSearch onPick={openCourse} placeholder="חיפוש קורס אחר…" />}>
      {showTour && <Tour steps={TOUR_STEPS} onClose={closeTour} />}
      {showInvite && (
        <div className="tour-invite" role="status">
          <p>פעם ראשונה כאן? סיור קצר יראה לכם מה אפשר לעשות בעמוד.</p>
          <div className="row">
            <button className="btn primary" onClick={startTour}>התחלת סיור</button>
            <button className="btn link" onClick={() => { setTourSeen(true); markTourSeen(); }}>לא תודה</button>
          </div>
        </div>
      )}
      <div className="container">
        <div className="course-head">
          <div>
            <h1>{anyName ?? `קורס ${formatCourseNumber(course)}`}</h1>
            <div className="meta">
              <span className="ltr">{formatCourseNumber(course)}</span>
              {names[key]?.en && <span className="ltr">{names[key]?.en}</span>}
              {deptName && <span>{deptName}</span>}
              {lecturersNow?.length ? <span>מרצה אחרון: {lecturersNow.join(", ")}</span> : null}
            </div>
          </div>
          <button className="btn" onClick={startTour} disabled={loadingMain}>סיור מודרך</button>
        </div>

        <div className="toolbar" data-tour="filters">
          <div className="group">
            <span>טווח</span>
            <select
              className="select"
              aria-label="מספר שנים אחורה"
              value={lookback}
              onChange={(e) => setParams({ y: e.target.value === "3" ? null : e.target.value })}
            >
              {Array.from({ length: MAX_LOOKBACK }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n === 1 ? "שנה אחרונה" : `${n} שנים אחרונות`}</option>
              ))}
            </select>
          </div>
          <div className="group">
            <span>סמסטר</span>
            <div className="seg" role="group" aria-label="סמסטר">
              {[["all", "הכל"], ["1", "א׳"], ["2", "ב׳"], ["3", "קיץ"]].map(([v, l]) => (
                <button key={v} className={semester === v ? "active" : ""} onClick={() => setParams({ sem: v === "all" ? null : v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <nav className="tabs" aria-label="תצוגות" data-tour="tabs">
          <button className={tab === "dist" ? "active" : ""} onClick={() => setParams({ tab: null })}>התפלגות</button>
          <button data-tour="tab-trend" className={tab === "trend" ? "active" : ""} onClick={() => setParams({ tab: "trend" })}>מגמה ומרצים</button>
          <button data-tour="tab-compare" className={tab === "compare" ? "active" : ""} onClick={() => setParams({ tab: "compare" })}>
            השוואה בין קורסים{compare.length > 0 && <span className="count">{compare.length + 1}</span>}
          </button>
        </nav>

        {loadingMain ? (
          <Loader done={main?.done ?? 0} total={termList.length} courseName={anyName} />
        ) : (
          <>
            {main?.error && failures.length === 0 && okTerms.length === 0 && (
              <div className="notice error">
                {main.error} · <button className="btn link" onClick={() => setReload((r) => r + 1)}>נסו שוב</button>
              </div>
            )}
            {failures.length > 0 && (
              <div className="notice warn">
                לא הצלחנו לטעון {failures.length} סמסטרים ({failures.map((f) => f.label).join(", ")}). ·{" "}
                <button className="btn link" onClick={() => setReload((r) => r + 1)}>נסו שוב</button>
              </div>
            )}

            {formerNumbers.length > 0 && (
              <div className="notice">
                הקורס עבר ממחלקה 201 ל־212 בתשפ״ו ושמר על מספרו. הציונים של הסמסטרים שנרשמו במספר{" "}
                {formerNumbers.map((n) => <span key={n} className="ltr">{n}</span>)} מוצגים כאן יחד, ומסומנים ברשימת הסמסטרים.
              </div>
            )}

            {okTerms.length === 0 ? (
              <div className="empty">
                <h2>אין ציונים לקורס הזה בטווח שנבחר</h2>
                <p>ייתכן שהקורס לא נלמד בשנים האלה, או שמספר הנבחנים היה קטן מדי לפרסום. נסו להרחיב את הטווח.</p>
              </div>
            ) : tab === "dist" ? (
              <div className="with-rail">
                <aside className="rail" aria-label="בחירת סמסטרים">
                  {lecturerOptions.length > 1 && (
                    <div className="rail-filter" data-tour="lecturers">
                      <div className="rail-head"><span>מרצה</span></div>
                      <div className="lecturer-chips" role="group" aria-label="סינון לפי מרצה">
                        <button className={activeLecturer === null && allOn ? "active" : ""} onClick={() => pickLecturer(null)}>
                          כולם
                        </button>
                        {lecturerOptions.map((name) => (
                          <button key={name} className={activeLecturer === name ? "active" : ""} onClick={() => pickLecturer(name)}>
                            {name} <span className="n">{termsOf(name).length}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button className="rail-toggle" data-tour="semesters-toggle" aria-expanded={railOpen} onClick={() => setRailOpen((o) => !o)}>
                    <span>סמסטרים</span>
                    <span className="muted">
                      {visible.length} מתוך {okTerms.length} נבחרו
                    </span>
                    <span className="chev" aria-hidden>▾</span>
                  </button>
                  <div className={`rail-terms ${railOpen ? "open" : ""}`} data-tour="semesters">
                  <div className="rail-head">
                    <span>סמסטרים</span>
                    <button className="btn link small" onClick={setAll}>{allOn ? "נקה הכל" : "בחר הכל"}</button>
                  </div>
                  <div className="rail-years">
                    {years.map((y) => (
                      <div key={y}>
                        <div className="rail-year">
                          {hebrewYear(y)} · <span className="ltr">{y - 1}–{String(y).slice(2)}</span>
                        </div>
                        {termList
                          .filter((t) => t.year === y)
                          // Most courses have no summer session; list summer only when it has grades.
                          .filter((t) => t.semester !== 3 || semester === "3" || (termById.get(t.id)?.status ?? "empty") !== "empty")
                          .map((t) => {
                            const d = termById.get(t.id);
                            const has = d?.status === "ok";
                            return (
                              <label key={t.id} className={`rail-item ${has ? "" : "disabled"}`}>
                                <input type="checkbox" checked={has && !exclIds.has(t.id)} disabled={!has} onChange={() => toggleTerm(t.id)} />
                                <span>{semesterName(t.semester)}</span>
                                <span className="n">
                                  {has ? d!.n : d?.status === "suppressed" ? "מוסתר" : d?.status === "error" ? "שגיאה" : "—"}
                                </span>
                                {d?.lecturers?.length || d?.sourceNumber ? (
                                  <span className="lect">
                                    {d.lecturers?.join(", ")}
                                    {d.sourceNumber && <span className="muted"> · <span className="ltr">{d.sourceNumber}</span></span>}
                                  </span>
                                ) : null}
                              </label>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                </div>
                </aside>

                <div>
                  <StatsLine combined={visibleCombined} termsCount={visible.length} />
                  {visible.length === 0 ? (
                    <div className="empty">סמנו לפחות סמסטר אחד ברשימה.</div>
                  ) : (
                    <>
                      <section className="panel" data-tour="chart">
                        <div className="panel-head">
                          <div>
                            <h2>{view === "combined" ? "התפלגות הציונים" : view === "exam" ? "התפלגות לפי מועד" : "התפלגות לפי סמסטר"}</h2>
                            <div className="sub">
                              {view === "exam"
                                ? `אחוז הסטודנטים בכל טווח ציונים, בכל מועד · ${visible.length === 1 ? visible[0].label : `${visible.length} סמסטרים יחד`}`
                                : view === "combined"
                                ? `${activeLecturer ? `${activeLecturer} · ` : ""}${visible.length === 1 ? "סמסטר אחד" : `${visible.length} סמסטרים יחד`} · מתחת ל־${FAIL_THRESHOLD} מסומן ככישלון`
                                : "אחוז הסטודנטים בכל טווח ציונים · הסמסטר האחרון בצבע הכהה"}
                            </div>
                          </div>
                          <div className="seg" role="group" aria-label="סוג תצוגה" data-tour="views">
                            <button className={view === "combined" ? "active" : ""} onClick={() => setParams({ view: null })}>משולב</button>
                            <button className={view === "per-semester" ? "active" : ""} onClick={() => setParams({ view: "per-semester" })}>לפי סמסטר</button>
                            <button className={view === "exam" ? "active" : ""} onClick={() => setParams({ view: "exam" })}>לפי מועד</button>
                          </div>
                        </div>
                        {view === "exam" ? (
                          <ExamView course={course} terms={visible} overall={visibleCombined} />
                        ) : (
                          <GradeChart terms={visible} mode={view} combined={visibleCombined} />
                        )}
                      </section>
                      <StatsTable terms={visible} combined={visibleCombined} fileName={`grades-${formatCourseNumber(course)}`} />
                    </>
                  )}
                </div>
              </div>
            ) : tab === "trend" ? (
              <TrendTab terms={okTerms} />
            ) : (
              <CompareTab
                main={course}
                compare={compare}
                series={series}
                names={names}
                termList={termList}
                onAdd={addCompare}
                onRemove={removeCompare}
              />
            )}
          </>
        )}
      </div>
    </Shell>
  );
}

function StatsLine({ combined, termsCount }: { combined: TermDistribution; termsCount: number }) {
  return (
    <div className="stats-line" data-tour="stats">
      <div><div className="stat-value">{combined.n}</div><div className="stat-label">נבחנים</div></div>
      <div><div className="stat-value">{fmt1(combined.stats.mean)}</div><div className="stat-label">ממוצע</div></div>
      <div><div className="stat-value">{fmt1(combined.stats.median)}</div><div className="stat-label">חציון</div></div>
      <div><div className="stat-value">{pct(combined.stats.passRate)}</div><div className="stat-label">עברו</div></div>
      <div><div className="stat-value">{termsCount}</div><div className="stat-label">סמסטרים</div></div>
    </div>
  );
}

function TrendTab({ terms }: { terms: TermDistribution[] }) {
  const chrono = [...terms].sort((a, b) => a.year * 10 + a.semester - (b.year * 10 + b.semester));
  const byLecturer = summariseByLecturer(terms);
  if (chrono.length < 2) {
    return <div className="empty">כדי לראות מגמה צריך לפחות שני סמסטרים עם נתונים — נסו להרחיב את הטווח.</div>;
  }
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>ממוצע ואחוז עוברים לאורך הסמסטרים</h2>
            <div className="sub">קו מקווקו אנכי מסמן החלפת מרצה</div>
          </div>
        </div>
        <TrendChart terms={chrono} />
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>לפי מרצה</h2>
            <div className="sub">הציונים של כל הסמסטרים שהמרצה לימד, יחד</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>מרצה</th><th>סמסטרים</th><th>נבחנים</th><th>ממוצע</th><th className="hide-sm">חציון</th><th>עברו</th></tr>
            </thead>
            <tbody>
              {byLecturer.map((g) => (
                <tr key={g.lecturer}>
                  <td>{g.lecturer}</td>
                  <td className="lecturer">{g.terms.map((t) => t.label).join(", ")}</td>
                  <td>{g.combined.n}</td>
                  <td>{fmt1(g.combined.stats.mean)}</td>
                  <td className="hide-sm">{fmt1(g.combined.stats.median)}</td>
                  <td>{pct(g.combined.stats.passRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function CompareTab(props: {
  main: CourseRef;
  compare: CourseRef[];
  series: Record<string, SeriesState>;
  names: Record<string, { he?: string; en?: string }>;
  termList: ReturnType<typeof buildTermList>;
  onAdd: (c: PickedCourse) => void;
  onRemove: (key: string) => void;
}) {
  const { main, compare, series, names, termList, onAdd, onRemove } = props;
  const all = [main, ...compare];
  const nameOf = (c: CourseRef) =>
    names[courseKey(c)]?.he ?? series[courseKey(c)]?.terms.find((t) => t.courseName)?.courseName ?? formatCourseNumber(c);

  const ready: CompareSeries[] = [];
  const pending: CourseRef[] = [];
  const noData: CourseRef[] = [];
  for (const [colorIndex, c] of all.entries()) {
    const s = series[courseKey(c)];
    if (!s || s.loading) {
      pending.push(c);
      continue;
    }
    const ok = s.terms.filter((t) => t.status === "ok");
    if (ok.length === 0) {
      noData.push(c);
      continue;
    }
    ready.push({ key: courseKey(c), name: nameOf(c), colorIndex, terms: ok, combined: combinedDistribution(ok) });
  }

  return (
    <>
      <div className="compare-list">
        {all.map((c, i) => (
          <span key={courseKey(c)} className="compare-chip">
            <span className="swatch" style={{ background: `var(--series-${(i % 4) + 1})` }} />
            {nameOf(c)}
            {nameOf(c) !== formatCourseNumber(c) && <span className="muted ltr small">{formatCourseNumber(c)}</span>}
            {i > 0 && (
              <button aria-label={`הסר את ${nameOf(c)}`} onClick={() => onRemove(courseKey(c))}>×</button>
            )}
          </span>
        ))}
        {all.length < MAX_COMPARE && (
          <div className="compare-add">
            <CourseSearch onPick={onAdd} placeholder="הוספת קורס להשוואה…" exclude={all.map(formatCourseNumber)} />
          </div>
        )}
      </div>

      {compare.length === 0 && (
        <div className="notice">הוסיפו קורס אחד או יותר כדי להשוות התפלגות, ממוצעים ואחוזי מעבר.</div>
      )}
      {pending.length > 0 && (
        <div className="notice">
          <span className="spinner" aria-hidden /> טוען את {pending.map(nameOf).join(", ")}…
        </div>
      )}

      {noData.length > 0 && (
        <div className="notice warn">
          אין ציונים בטווח שנבחר עבור {noData.map((c) => `${nameOf(c)} (${formatCourseNumber(c)})`).join(", ")} — נסו להרחיב את הטווח.
        </div>
      )}

      {ready.length > 0 && (
        <>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>התפלגות הציונים</h2>
                <div className="sub">אחוז הסטודנטים בכל טווח ציונים, כל הסמסטרים בטווח יחד</div>
              </div>
            </div>
            <CompareDistribution series={ready} />
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>ממוצע לאורך הסמסטרים</h2>
                <div className="sub">מעבר עם העכבר מציג גם את המרצה</div>
              </div>
            </div>
            <CompareTrend series={ready} termList={termList} />
          </section>
          <section className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>קורס</th><th className="hide-sm">סמסטרים</th><th>נבחנים</th><th>ממוצע</th><th>חציון</th><th className="hide-sm">סטיית תקן</th><th>עברו</th></tr>
                </thead>
                <tbody>
                  {ready.map((s) => (
                    <tr key={s.key}>
                      <td>
                        <span className="swatch" style={{ background: `var(--series-${(s.colorIndex % 4) + 1})` }} />
                        {s.name}
                      </td>
                      <td className="hide-sm">{s.terms.length}</td>
                      <td>{s.combined.n}</td>
                      <td>{fmt1(s.combined.stats.mean)}</td>
                      <td>{fmt1(s.combined.stats.median)}</td>
                      <td className="hide-sm">{fmt1(s.combined.stats.stdev)}</td>
                      <td>{pct(s.combined.stats.passRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <GradeApp />
    </Suspense>
  );
}
