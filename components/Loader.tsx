"use client";
import { useEffect, useState } from "react";

const MESSAGES = [
  "פונה למערכת הדוחות של האוניברסיטה…",
  "שולף את ציוני הסמסטרים…",
  "מאתר את המרצים בכל סמסטר…",
  "מחשב ממוצעים והתפלגות…",
];

export default function Loader({ done, total, courseName }: { done: number; total: number; courseName?: string }) {
  const [msg, setMsg] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMsg((m) => (m + 1) % MESSAGES.length), 2200);
    return () => clearInterval(t);
  }, []);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="loader-bars" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <h2>המערכת טוענת את המידע{courseName ? ` על ${courseName}` : ""}</h2>
      <div className="step">{MESSAGES[msg]}</div>
      <div className="progress" aria-hidden>
        <div style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <div className="small muted">
        {done} מתוך {total} סמסטרים נטענו · טעינה ראשונה של קורס יכולה לקחת כמה שניות, אחר כך היא נשמרת
      </div>
    </div>
  );
}
