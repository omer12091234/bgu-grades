"use client";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

export type TourStep = {
  /** CSS selector(s) of the element to highlight; the first visible match is used, and steps with none are skipped. */
  target: string;
  title: string;
  body: string;
};

type Rect = { top: number; left: number; width: number; height: number };

/** First element matching the selector that is actually on screen (not display:none). */
function findVisible(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

const PAD = 6;

/** Step-by-step walkthrough: dims the page, highlights one element and explains it. */
export default function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [available] = useState(() => steps.filter((s) => findVisible(s.target)));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vw, setVw] = useState(() => window.innerWidth);
  const step = available[i];

  const measure = useCallback(() => {
    setVw(window.innerWidth);
    const el = step && findVisible(step.target);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step]);

  // Bring the step's element into view, then measure it once scrolling settles.
  useLayoutEffect(() => {
    const el = step && findVisible(step.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fits = r.top >= 70 && r.bottom <= window.innerHeight - 220;
    if (!fits) {
      // Tall elements go near the top (leaving room for the highlight frame); short ones to the middle.
      const target =
        r.height > window.innerHeight * 0.5
          ? window.scrollY + r.top - 16
          : window.scrollY + r.top - (window.innerHeight - r.height) / 2 + 60;
      window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }
    const raf = requestAnimationFrame(measure);
    const t = setTimeout(measure, 450);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [step, measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // RTL: the left arrow moves forward
      if (e.key === "ArrowLeft") setI((n) => Math.min(n + 1, available.length - 1));
      if (e.key === "ArrowRight") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [available.length, measure, onClose]);

  if (!step) return null;
  const last = i === available.length - 1;

  // Phones: the bubble sits at the bottom of the screen. Wider screens: below the element, or above if there's no room.
  const narrow = vw <= 600;
  const bubbleStyle: React.CSSProperties = {};
  if (!narrow && rect) {
    const below = rect.top + rect.height + 12;
    const fitsBelow = below + 200 < window.innerHeight;
    const width = Math.min(360, vw - 32);
    bubbleStyle.width = width;
    bubbleStyle.left = Math.max(16, Math.min(rect.left + rect.width - width, vw - width - 16));
    if (fitsBelow) bubbleStyle.top = below;
    else bubbleStyle.bottom = Math.max(16, window.innerHeight - rect.top + 12);
  }

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div className="tour-spot" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className={`tour-bubble ${narrow ? "docked" : ""}`} style={bubbleStyle}>
        <div className="tour-count">
          {i + 1} מתוך {available.length}
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="btn link" onClick={onClose}>
            {last ? "סגירה" : "דילוג על הסיור"}
          </button>
          <div className="tour-nav">
            {i > 0 && (
              <button className="btn" onClick={() => setI(i - 1)}>
                הקודם
              </button>
            )}
            <button className="btn primary" onClick={() => (last ? onClose() : setI(i + 1))} autoFocus>
              {last ? "סיום" : "הבא"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
