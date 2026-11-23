"use client";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { SeriesResponse, TermDistribution } from "@/types";
import StatsTable from "@/components/StatsTable";
import { combinedDistribution } from "@/lib/parser";

const GradeChart = dynamic(() => import("@/components/GradeChart"), { ssr: false });

function fmt1(n: number | null) {
  if (n === null) return "–";
  return n.toFixed(1);
}

function currentAcademicYear() {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

// Build the full list of year+semester combos for a given lookback+semesterFilter
function buildTermList(lookback: number, semesterFilter: string) {
  const curYear = currentAcademicYear();
  const years = Array.from({ length: lookback }, (_, i) => curYear - i);
  const sems = semesterFilter === "all" ? [1, 2] : [Number(semesterFilter)];
  return years.flatMap(y => sems.map(s => ({ year: y, semester: s, id: `${y}-${s}` })));
}

const SEM_LABELS: Record<number, string> = { 1: "א׳", 2: "ב׳", 3: "ג׳" };

function GradeApp() {
  const router = useRouter();
  const params = useSearchParams();

  // ── Search bar state ────────────────────────────────────────────────────
  const [dept,     setDept]     = useState(params.get("dept")   ?? "");
  const [degree,   setDegree]   = useState(params.get("degree") ?? "");
  const [course,   setCourse]   = useState(params.get("course") ?? "");
  const [lookback, setLookback] = useState(Number(params.get("lookback") ?? 3));
  const [semester, setSemester] = useState(params.get("semester") ?? "all");

  // ── Display state ───────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"combined" | "per-semester">(
    (params.get("view") as "combined" | "per-semester") ?? "combined"
  );

  // ── Sidebar: which specific terms are checked ───────────────────────────
  // null = not yet initialised (use all terms from response)
  const [checkedTerms, setCheckedTerms] = useState<Set<string> | null>(null);

  // ── Fetch state ─────────────────────────────────────────────────────────
  const [data,    setData]    = useState<SeriesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [queried, setQueried] = useState(false);

  // ── URL sync ────────────────────────────────────────────────────────────
  const updateUrl = useCallback((d: string, deg: string, c: string, lb: number, sem: string, view: string) => {
    if (!d || !deg || !c) return;
    const p = new URLSearchParams({ dept: d, degree: deg, course: c, lookback: String(lb), semester: sem, view });
    router.replace("?" + p.toString(), { scroll: false });
  }, [router]);

  // ── Fetch ───────────────────────────────────────────────────────────────
  const doFetch = useCallback(async (d: string, deg: string, c: string, lb: number, sem: string) => {
    if (!d || !deg || !c) return;
    setLoading(true); setError(null); setQueried(true); setCheckedTerms(null);
    try {
      const semParam = sem === "all" ? "" : `&semester=${sem}`;
      const res = await fetch(`/api/series?dept=${d}&degree=${deg}&course=${c}&lookback=${lb}${semParam}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `שגיאה ${res.status}`);
      }
      const json: SeriesResponse = await res.json();
      setData(json);
      // Default: all ok terms checked
      setCheckedTerms(new Set(json.terms.filter(t => t.status === "ok").map(t => t.termId)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on load if URL has params
  useEffect(() => {
    const d   = params.get("dept")   ?? "";
    const deg = params.get("degree") ?? "";
    const c   = params.get("course") ?? "";
    const lb  = Number(params.get("lookback") ?? 3);
    const sem = params.get("semester") ?? "all";
    if (d && deg && c) doFetch(d, deg, c, lb, sem);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    updateUrl(dept, degree, course, lookback, semester, viewMode);
    doFetch(dept, degree, course, lookback, semester);
  };

  const handlePrefill = () => {
    setDept("361"); setDegree("1"); setCourse("2251");
    updateUrl("361", "1", "2251", lookback, semester, viewMode);
    doFetch("361", "1", "2251", lookback, semester);
  };

  const handleView = (v: "combined" | "per-semester") => {
    setViewMode(v);
    updateUrl(dept, degree, course, lookback, semester, v);
  };

  const toggleTerm = (id: string) => {
    setCheckedTerms(prev => {
      const next = new Set(prev ?? []);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const toggleAll = (ids: string[], allChecked: boolean) => {
    setCheckedTerms(prev => {
      const next = new Set(prev ?? []);
      if (allChecked) { ids.forEach(id => next.delete(id)); }
      else            { ids.forEach(id => next.add(id)); }
      return next;
    });
  };

  // ── Derived data ─────────────────────────────────────────────────────────
  const allTerms = data?.terms ?? [];
  const okTerms  = allTerms.filter(t => t.status === "ok");

  // Terms visible after sidebar filter
  const visibleTerms: TermDistribution[] = useMemo(() => {
    if (!checkedTerms) return okTerms;
    return okTerms.filter(t => checkedTerms.has(t.termId));
  }, [okTerms, checkedTerms]);

  // Recompute combined from visible terms only
  const visibleCombined: TermDistribution = useMemo(
    () => combinedDistribution(visibleTerms),
    [visibleTerms]
  );

  const anyOk    = okTerms.length > 0;
  const anySupp  = allTerms.some(t => t.status === "suppressed");
  const failures = data?.meta.failures ?? [];

  // Sidebar term list: all possible terms in the lookback window
  const sidebarTerms = useMemo(
    () => buildTermList(lookback, semester),
    [lookback, semester]
  );

  // Group sidebar by year for display
  const sidebarByYear = useMemo(() => {
    const map = new Map<number, { semester: number; id: string }[]>();
    for (const { year, semester: s, id } of sidebarTerms) {
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push({ semester: s, id });
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [sidebarTerms]);

  const termHasData = (id: string) => okTerms.some(t => t.termId === id);
  const allSidebarIds = sidebarTerms.filter(t => termHasData(t.id)).map(t => t.id);
  const allChecked = allSidebarIds.length > 0 && allSidebarIds.every(id => checkedTerms?.has(id));

  return (
    <>
      {/* ── Header ── */}
      <header className="site-header">
        <div className="container">
          <div className="inner">
            <div className="logo">התפלגות ציונים <span>BGU</span></div>
            <div className="query-bar">
              <div className="field">
                <label htmlFor="dept">מחלקה</label>
                <input id="dept" className="ltr" placeholder="361" value={dept}
                  onChange={e => setDept(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()} maxLength={6} />
              </div>
              <div className="field">
                <label htmlFor="degree">תואר</label>
                <input id="degree" className="ltr" placeholder="1" value={degree}
                  onChange={e => setDegree(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()} maxLength={2} />
              </div>
              <div className="field">
                <label htmlFor="course">קורס</label>
                <input id="course" className="ltr" placeholder="2251" value={course}
                  onChange={e => setCourse(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()} maxLength={6} />
              </div>
              {/* ── Lookback selector in header ── */}
              <div className="field">
                <label>שנים אחורה</label>
                <div className="seg" role="group" aria-label="שנים אחורה">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} className={lookback === n ? "active" : ""}
                      onClick={() => setLookback(n)}>{n}</button>
                  ))}
                </div>
              </div>
              {/* ── Semester filter in header ── */}
              <div className="field">
                <label>סמסטר</label>
                <div className="seg" role="group" aria-label="סמסטר">
                  <button className={semester === "all" ? "active" : ""} onClick={() => setSemester("all")}>הכל</button>
                  <button className={semester === "1"   ? "active" : ""} onClick={() => setSemester("1")}>א׳</button>
                  <button className={semester === "2"   ? "active" : ""} onClick={() => setSemester("2")}>ב׳</button>
                </div>
              </div>
              <button className="btn" onClick={handleSubmit}
                disabled={!dept || !degree || !course || loading}>
                {loading ? "טוען…" : "הצג"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main>
        <div className="container">

          {/* Empty state */}
          {!queried && !loading && (
            <div className="empty-state">
              <h2>הכנס פרטי קורס להצגת התפלגות הציונים</h2>
              <p className="muted">לפי מחלקה, תואר ומספר קורס</p>
              <button className="prefill-btn" onClick={handlePrefill}>
                נסה דוגמה: מחלקה 361 / תואר 1 / קורס 2251
              </button>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="page-layout">
              <aside className="sidebar">
                <div className="skeleton" style={{ height: 300, borderRadius: 10 }} />
              </aside>
              <div className="main-content">
                <div className="loading-grid">
                  {[1,2,3,4].map(i => <div key={i} className="skeleton" />)}
                </div>
                <div className="chart-section">
                  <div className="skeleton" style={{ height: 320 }} />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="banner err">
              <span>⚠</span>
              <span>{error} —{" "}
                <button className="btn btn-ghost small" style={{padding:"0 .5rem"}} onClick={handleSubmit}>נסה שוב</button>
              </span>
            </div>
          )}

          {/* Results */}
          {!loading && data && (
            <div className="page-layout">

              {/* ── Sidebar ── */}
              <aside className="sidebar">
                <div className="sidebar-header">
                  <span>סינון סמסטרים</span>
                  <button className="sidebar-toggle-all"
                    onClick={() => toggleAll(allSidebarIds, allChecked)}
                    disabled={allSidebarIds.length === 0}>
                    {allChecked ? "בטל הכל" : "בחר הכל"}
                  </button>
                </div>

                {sidebarByYear.map(([year, sems]) => (
                  <div key={year} className="sidebar-year-group">
                    <div className="sidebar-year-label">{year}</div>
                    {sems.map(({ semester: s, id }) => {
                      const hasData = termHasData(id);
                      const checked = checkedTerms?.has(id) ?? false;
                      const term = okTerms.find(t => t.termId === id);
                      return (
                        <label key={id} className={`sidebar-item ${!hasData ? "no-data" : ""} ${checked ? "checked" : ""}`}>
                          <input
                            type="checkbox"
                            checked={hasData && checked}
                            disabled={!hasData}
                            onChange={() => hasData && toggleTerm(id)}
                          />
                          <span className="sidebar-item-label">
                            סמסטר {SEM_LABELS[s] ?? s}
                          </span>
                          {hasData && term ? (
                            <span className="sidebar-item-n">{term.n} נבחנים</span>
                          ) : (
                            <span className="sidebar-item-nodata">אין נתונים</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                ))}
              </aside>

              {/* ── Main content ── */}
              <div className="main-content">

                {/* Course hero */}
                {anyOk && (
                  <div className="course-hero">
                    <h1>
                      {data.combined.courseName
                        ? `${data.combined.courseName} (${data.meta.course})`
                        : `קורס ${data.meta.course}`}
                    </h1>
                    <div className="subtitle">
                      מחלקה {data.meta.dept}
                      {data.combined.departmentName ? ` – ${data.combined.departmentName}` : ""}
                      {" • "}תואר {data.meta.degree}
                      {" • "}עודכן {new Date(data.meta.fetchedAt).toLocaleDateString("he-IL")}
                    </div>
                  </div>
                )}

                {/* Banners */}
                {failures.length > 0 && (
                  <div className="banner warn">
                    <span>⚠</span>
                    <span>חלק מהסמסטרים לא נטענו ({failures.map(f => f.termId).join(", ")}).{" "}
                      <button className="btn btn-ghost small" style={{padding:"0 .5rem"}} onClick={handleSubmit}>נסה שוב</button>
                    </span>
                  </div>
                )}
                {anySupp && (
                  <div className="banner info">
                    <span>ℹ</span>
                    <span>חלק מהסמסטרים מוסתרים בשל מספר נבחנים נמוך מדי (הגנת פרטיות).</span>
                  </div>
                )}

                {/* No data */}
                {!anyOk && (
                  <div className="empty-state" style={{ paddingTop: "3rem" }}>
                    <h2>לא נמצאו נתונים</h2>
                    <p className="muted">לא קיימים ציונים לקורס זה בטווח הסמסטרים שנבחר.</p>
                  </div>
                )}

                {anyOk && (
                  <>
                    {/* Stats bar — based on visible (filtered) terms */}
                    <div className="stats-bar">
                      <div className="stat-card">
                        <div className="val">{visibleCombined.n}</div>
                        <div className="lbl">סה״כ נבחנים</div>
                      </div>
                      <div className="stat-card">
                        <div className="val">{fmt1(visibleCombined.stats.mean)}</div>
                        <div className="lbl">ממוצע</div>
                      </div>
                      <div className="stat-card">
                        <div className="val">{fmt1(visibleCombined.stats.median)}</div>
                        <div className="lbl">חציון</div>
                      </div>
                      <div className="stat-card">
                        <div className="val">
                          {visibleCombined.stats.passRate !== null
                            ? (visibleCombined.stats.passRate * 100).toFixed(1) + "%"
                            : "–"}
                        </div>
                        <div className="lbl">% עוברים</div>
                      </div>
                      <div className="stat-card">
                        <div className="val">{visibleTerms.length}</div>
                        <div className="lbl">סמסטרים מוצגים</div>
                      </div>
                    </div>

                    {/* View toggle */}
                    <div className="controls">
                      <div className="control-group">
                        <label>תצוגה:</label>
                        <div className="seg" role="group" aria-label="בחר תצוגה">
                          <button className={viewMode === "combined" ? "active" : ""} onClick={() => handleView("combined")}>משולב</button>
                          <button className={viewMode === "per-semester" ? "active" : ""} onClick={() => handleView("per-semester")}>לפי סמסטר</button>
                        </div>
                      </div>
                      {visibleTerms.length === 0 && (
                        <span className="muted small">אין סמסטרים נבחרים — סמן לפחות אחד בסרגל הצד</span>
                      )}
                    </div>

                    {/* Chart */}
                    {visibleTerms.length > 0 && (
                      <div className="chart-section">
                        <h2>
                          {viewMode === "combined"
                            ? `התפלגות משולבת — ${visibleTerms.map(t => t.label).join(", ")}`
                            : "השוואה בין סמסטרים"}
                        </h2>
                        <GradeChart
                          terms={visibleTerms}
                          mode={viewMode}
                          combined={visibleCombined}
                        />
                      </div>
                    )}

                    {/* Accessible chart table */}
                    {visibleTerms.length > 0 && (
                      <details style={{ marginBottom: "1rem" }}>
                        <summary className="muted small" style={{ cursor: "pointer", padding: ".5rem 0" }}>
                          הצג טבלת נתוני הגרף (נגישות)
                        </summary>
                        <div className="stats-table-wrap" style={{ marginTop: ".5rem" }}>
                          <table aria-label="נתוני התפלגות ציונים">
                            <thead>
                              <tr>
                                <th>ציון</th>
                                {viewMode === "combined"
                                  ? <th>מספר סטודנטים</th>
                                  : visibleTerms.map(t => <th key={t.termId}>{t.label}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleCombined.bins.map((bin, i) => (
                                (viewMode === "combined" ? bin.count > 0 : true) && (
                                  <tr key={bin.label}>
                                    <td className="ltr">{bin.label}</td>
                                    {viewMode === "combined"
                                      ? <td>{bin.count}</td>
                                      : visibleTerms.map(t => <td key={t.termId}>{t.bins[i].count}</td>)}
                                  </tr>
                                )
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}

                    {/* Stats table */}
                    <StatsTable terms={visibleTerms} combined={visibleCombined} />

                    {/* Footnotes */}
                    <div className="footnotes">
                      מקור נתונים: מערכת הדוחות של אוניברסיטת בן-גוריון בנגב (SCRR016w) •{" "}
                      ציון מעבר: 56 •{" "}
                      {visibleTerms.length < okTerms.length && `מוצגים ${visibleTerms.length} מתוך ${okTerms.length} סמסטרים זמינים`}
                      {visibleCombined.stats.approximate && " • ¹ נתונים סטטיסטיים משוערים"}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
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
