"use client";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import type { TermDistribution } from "@/types";
import { CANONICAL_BINS, FAIL_THRESHOLD } from "@/lib/parser";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const COLOR_FAIL = "rgba(224, 82, 82, 0.85)";
const COLOR_PASS = "rgba(79, 127, 255, 0.85)";

const TERM_COLORS_PASS = [
  "rgba(79,127,255,0.8)",
  "rgba(124,95,245,0.8)",
  "rgba(46,196,182,0.8)",
  "rgba(244,162,97,0.8)",
  "rgba(90,200,150,0.8)",
];
const TERM_COLORS_FAIL = [
  "rgba(224,82,82,0.8)",
  "rgba(200,60,180,0.8)",
  "rgba(220,100,60,0.8)",
  "rgba(210,70,70,0.8)",
  "rgba(230,90,90,0.8)",
];

interface Props {
  terms: TermDistribution[];
  mode: "combined" | "per-semester";
  combined: TermDistribution;
}

export default function GradeChart({ terms, mode, combined }: Props) {
  const labels = CANONICAL_BINS.map((b) => b.label);

  const datasets =
    mode === "combined"
      ? [
          {
            label: "סה״כ",
            data: combined.bins.map((b) => b.count),
            backgroundColor: CANONICAL_BINS.map((b) =>
              b.min < FAIL_THRESHOLD ? COLOR_FAIL : COLOR_PASS
            ),
            borderRadius: 2,
            borderSkipped: false,
          },
        ]
      : terms
          .filter((t) => t.status === "ok")
          .map((term, idx) => ({
            label: term.label,
            data: term.bins.map((b) => b.count),
            // Per-semester: still color fail/pass by grade position
            backgroundColor: CANONICAL_BINS.map((b) =>
              b.min < FAIL_THRESHOLD
                ? TERM_COLORS_FAIL[idx % TERM_COLORS_FAIL.length]
                : TERM_COLORS_PASS[idx % TERM_COLORS_PASS.length]
            ),
            borderRadius: 2,
            borderSkipped: false,
          }));

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: mode === "per-semester",
        labels: { color: "#e8eaf6", font: { family: "Heebo, sans-serif", size: 12 } },
      },
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) => {
            const grade = ctx.dataIndex + 1;
            const count = ctx.parsed.y;
            const status = grade < FAIL_THRESHOLD ? "נכשל" : "עבר";
            return `ציון ${grade} (${status}): ${count} סטודנטים`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#8b90b8",
          font: { family: "Heebo, sans-serif", size: 9 },
          // Show every 5th label to avoid crowding 100 labels
          callback: (_: unknown, index: number) =>
            (index + 1) % 5 === 0 || index === 0 ? String(index + 1) : "",
          maxRotation: 0,
        },
        grid: { color: "#2d3150" },
      },
      y: {
        ticks: { color: "#8b90b8", font: { family: "Heebo, sans-serif", size: 11 }, stepSize: 1 },
        grid: { color: "#2d3150" },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="chart-wrap" role="img" aria-label="גרף התפלגות ציונים">
      <div className="chart-legend-inline">
        <span className="legend-dot fail"></span><span>כישלון (מתחת ל-{FAIL_THRESHOLD})</span>
        <span className="legend-dot pass"></span><span>עובר</span>
      </div>
      <Bar data={{ labels, datasets }} options={options} />
    </div>
  );
}
