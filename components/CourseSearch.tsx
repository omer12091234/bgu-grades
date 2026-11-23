"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { CourseRef, CourseSearchResult } from "@/types";
import { formatCourseNumber, parseCourseNumber } from "@/lib/terms";

export type PickedCourse = CourseRef & { nameHe?: string; nameEn?: string };

interface Props {
  onPick: (c: PickedCourse) => void;
  placeholder?: string;
  large?: boolean;
  autoFocus?: boolean;
  /** Course numbers to hide from the list (e.g. already in comparison). */
  exclude?: string[];
}

// Client-side cache of query → results for this tab.
const queryCache = new Map<string, { results: CourseSearchResult[]; total: number }>();

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export default function CourseSearch({ onPick, placeholder, large, autoFocus, exclude = [] }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState<{ q: string; error?: string } | null>(null);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const trimmed = q.trim();
  const asNumber = parseCourseNumber(trimmed);
  const isNumeric = /^[\d.\-\s/]+$/.test(trimmed);

  const searchable = trimmed.length >= 2 && !isNumeric;
  const cached = searchable ? queryCache.get(trimmed) : undefined;
  const results = cached?.results ?? [];
  const total = cached?.total ?? 0;
  const error = fetched?.q === trimmed ? fetched.error ?? null : null;
  const loading = searchable && !cached && !error;

  useEffect(() => {
    if (!searchable || queryCache.has(trimmed)) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/courses?q=${encodeURIComponent(trimmed)}`, { signal: ctrl.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "שגיאה בחיפוש");
        queryCache.set(trimmed, { results: json.results, total: json.total });
        setFetched({ q: trimmed });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFetched({ q: trimmed, error: (e as Error).message });
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [trimmed, searchable]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const visible = results.filter((r) => !exclude.includes(r.number));

  const pick = (c: PickedCourse) => {
    onPick(c);
    setQ("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (asNumber) pick(asNumber);
      else if (visible[active]) pick(visible[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && trimmed.length >= 2;

  return (
    <div className={`search ${large ? "large" : ""}`} ref={boxRef}>
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="חיפוש קורס לפי שם או מספר"
        placeholder={placeholder ?? "שם קורס או מספר, למשל: מבוא להנדסת חשמל"}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <div className="search-list" id={listId} role="listbox">
          {isNumeric ? (
            asNumber ? (
              <div className="search-item" role="option" aria-selected onMouseDown={() => pick(asNumber)}>
                <span className="he">הצג קורס {formatCourseNumber(asNumber)}</span>
                <span className="no">Enter ↵</span>
              </div>
            ) : (
              <div className="search-status">מספר קורס בפורמט מחלקה.תואר.קורס — למשל 361.1.1021</div>
            )
          ) : loading ? (
            <div className="search-status">
              <span className="spinner" aria-hidden /> מחפש בקובץ הקורסים…
            </div>
          ) : error ? (
            <div className="search-status">{error}</div>
          ) : visible.length === 0 ? (
            <div className="search-status">לא נמצאו קורסים בשם הזה</div>
          ) : (
            <>
              {visible.map((r, i) => (
                <div
                  key={r.number}
                  className="search-item"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(r);
                  }}
                >
                  <span className="he">
                    <Highlight text={r.nameHe} q={trimmed} />
                  </span>
                  <span className="no">{r.number}</span>
                  <span className="en">{r.nameEn}</span>
                  <span className="last">{r.lastActive ? `נלמד לאחרונה ${r.lastActive.replace("-", "/")}` : ""}</span>
                </div>
              ))}
              {total > results.length && (
                <div className="search-foot">
                  מוצגות {results.length} מתוך {total} תוצאות — כדאי לחדד את החיפוש
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
