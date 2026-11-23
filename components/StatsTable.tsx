"use client";
import type { TermDistribution } from "@/types";

interface Props {
  terms: TermDistribution[];
  combined: TermDistribution;
}

function fmt(n: number | null, decimals = 1): string {
  if (n === null) return "–";
  return n.toFixed(decimals);
}

function pct(n: number | null): string {
  if (n === null) return "–";
  return (n * 100).toFixed(1) + "%";
}

export default function StatsTable({ terms, combined }: Props) {
  const visibleTerms = terms.filter((t) => t.status === "ok" || t.status === "suppressed");
  const anyApprox = [combined, ...terms].some((t) => t.stats.approximate);

  const exportCsv = () => {
    const rows = [
      ["סמסטר", "מספר נבחנים", "ממוצע", "חציון", "סטיית תקן", "אחוז עוברים"],
      ...visibleTerms.map((t) => [
        t.label,
        t.n,
        fmt(t.stats.mean),
        fmt(t.stats.median),
        fmt(t.stats.stdev),
        pct(t.stats.passRate),
      ]),
      [
        "כל הסמסטרים",
        combined.n,
        fmt(combined.stats.mean),
        fmt(combined.stats.median),
        fmt(combined.stats.stdev),
        pct(combined.stats.passRate),
      ],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grade-stats.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stats-table-wrap">
      <h2>סטטיסטיקה לפי סמסטר</h2>
      <div className="export-row">
        <button className="btn btn-ghost small" onClick={exportCsv}>
          ייצא CSV
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table aria-label="טבלת סטטיסטיקה לפי סמסטר">
          <thead>
            <tr>
              <th>סמסטר</th>
              <th>נבחנים</th>
              <th>ממוצע{anyApprox ? "¹" : ""}</th>
              <th>חציון{anyApprox ? "¹" : ""}</th>
              <th>סטיית תקן{anyApprox ? "¹" : ""}</th>
              <th>% עוברים</th>
            </tr>
          </thead>
          <tbody>
            {visibleTerms.map((t) => (
              <tr key={t.termId} className={t.status === "suppressed" ? "fail-row" : ""}>
                <td>{t.label}</td>
                <td>{t.status === "suppressed" ? `<${t.n} (מוסתר)` : t.n}</td>
                <td>{fmt(t.stats.mean)}</td>
                <td>{fmt(t.stats.median)}</td>
                <td>{fmt(t.stats.stdev)}</td>
                <td>{pct(t.stats.passRate)}</td>
              </tr>
            ))}
            {combined.n > 0 && (
              <tr className="combined-row">
                <td>כל הסמסטרים</td>
                <td>{combined.n}</td>
                <td>{fmt(combined.stats.mean)}</td>
                <td>{fmt(combined.stats.median)}</td>
                <td>{fmt(combined.stats.stdev)}</td>
                <td>{pct(combined.stats.passRate)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {anyApprox && (
        <p className="footnotes">
          ¹ ערכים משוערים — מחושבים לפי מרכזי תחומים כאשר נתוני ציון גולמי אינם זמינים.
        </p>
      )}
    </div>
  );
}
