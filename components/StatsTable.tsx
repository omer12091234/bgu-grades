"use client";
import type { TermDistribution } from "@/types";

function fmt(n: number | null): string {
  return n === null ? "–" : n.toFixed(1);
}
function pct(n: number | null): string {
  return n === null ? "–" : (n * 100).toFixed(1) + "%";
}

interface Props {
  terms: TermDistribution[];
  combined: TermDistribution;
  fileName?: string;
}

export default function StatsTable({ terms, combined, fileName = "grade-stats" }: Props) {
  const rows = terms.filter((t) => t.status === "ok" || t.status === "suppressed");

  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ["סמסטר", "מרצה", "נבחנים", "ממוצע", "חציון", "סטיית תקן", "אחוז עוברים"],
      ...rows.map((t) => [
        t.label,
        t.lecturers?.join(" / ") ?? "",
        t.n,
        fmt(t.stats.mean),
        fmt(t.stats.median),
        fmt(t.stats.stdev),
        pct(t.stats.passRate),
      ]),
      ["כל הסמסטרים", "", combined.n, fmt(combined.stats.mean), fmt(combined.stats.median), fmt(combined.stats.stdev), pct(combined.stats.passRate)],
    ];
    const csv = lines.map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel" data-tour="table">
      <div className="panel-head">
        <h2>לפי סמסטר</h2>
        <button className="btn" onClick={exportCsv}>הורדת CSV</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>סמסטר</th>
              <th>מרצה</th>
              <th>נבחנים</th>
              <th>ממוצע</th>
              <th className="hide-sm">חציון</th>
              <th className="hide-sm">סטיית תקן</th>
              <th>עוברים</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.termId} className={t.status === "suppressed" ? "dim" : ""}>
                <td>{t.label}</td>
                <td className="lecturer">{t.lecturers?.length ? t.lecturers.join(", ") : "–"}</td>
                <td>{t.status === "suppressed" ? `פחות מ־5 (מוסתר)` : t.n}</td>
                <td>{fmt(t.stats.mean)}</td>
                <td className="hide-sm">{fmt(t.stats.median)}</td>
                <td className="hide-sm">{fmt(t.stats.stdev)}</td>
                <td>{pct(t.stats.passRate)}</td>
              </tr>
            ))}
            {combined.n > 0 && (
              <tr className="total">
                <td>סה״כ</td>
                <td></td>
                <td>{combined.n}</td>
                <td>{fmt(combined.stats.mean)}</td>
                <td className="hide-sm">{fmt(combined.stats.median)}</td>
                <td className="hide-sm">{fmt(combined.stats.stdev)}</td>
                <td>{pct(combined.stats.passRate)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
