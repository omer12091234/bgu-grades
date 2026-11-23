"use client";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import type { TermDistribution } from "@/types";
import { BUCKETS, CANONICAL_BINS, FAIL_THRESHOLD, bucketShares } from "@/lib/stats";
import { alpha, useThemeColors } from "@/lib/useThemeColors";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler);

const FONT = { family: "Heebo, system-ui, sans-serif" };

interface Props {
  terms: TermDistribution[];
  mode: "combined" | "per-semester";
  combined: TermDistribution;
}

export default function GradeChart({ terms, mode, combined }: Props) {
  const c = useThemeColors();

  const tooltip = {
    rtl: true,
    backgroundColor: c.ink,
    titleColor: c.surface,
    bodyColor: c.surface,
    titleFont: FONT,
    bodyFont: FONT,
    padding: 10,
    cornerRadius: 4,
    displayColors: mode === "per-semester",
  };

  if (mode === "combined") {
    const data = {
      labels: CANONICAL_BINS.map((b) => b.label),
      datasets: [
        {
          label: "סטודנטים",
          data: combined.bins.map((b) => b.count),
          backgroundColor: CANONICAL_BINS.map((b) => (b.min < FAIL_THRESHOLD ? c.fail : c.accent)),
          borderRadius: 1,
          barPercentage: 0.9,
          categoryPercentage: 1,
        },
      ],
    };
    return (
      <div className="chart-box" role="img" aria-label="התפלגות ציונים משולבת">
        <Bar
          data={data}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            plugins: {
              legend: { display: false },
              tooltip: {
                ...tooltip,
                callbacks: {
                  title: (items) => `ציון ${items[0].label}`,
                  label: (ctx) => `${ctx.parsed.y} סטודנטים`,
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                border: { color: c.line },
                ticks: {
                  color: c.muted,
                  font: { ...FONT, size: 11 },
                  maxRotation: 0,
                  autoSkip: false,
                  callback: (_v, i) => ((i + 1) % 10 === 0 || i === 0 ? String(i + 1) : ""),
                },
              },
              y: {
                beginAtZero: true,
                border: { display: false },
                grid: { color: c.line },
                ticks: { color: c.muted, font: { ...FONT, size: 11 }, precision: 0 },
              },
            },
          }}
        />
      </div>
    );
  }

  // Per-semester: share of students per 5-point bucket, newest semester darkest.
  const ok = terms.filter((t) => t.status === "ok");
  const data = {
    labels: BUCKETS.map((b) => b.label),
    datasets: ok.map((t, i) => {
      const a = ok.length === 1 ? 1 : 1 - (i / (ok.length - 1)) * 0.7;
      return {
        label: t.label,
        data: bucketShares(t).map((v) => +(v * 100).toFixed(1)),
        borderColor: alpha(c.accent, a),
        backgroundColor: alpha(c.accent, a),
        borderWidth: i === 0 ? 2.5 : 1.5,
        pointRadius: 2,
        tension: 0.25,
      };
    }),
  };
  return (
    <div className="chart-box" role="img" aria-label="התפלגות ציונים לפי סמסטר">
      <Line
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 250 },
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              position: "bottom",
              rtl: true,
              labels: { color: c.ink, font: { ...FONT, size: 12 }, boxWidth: 12, boxHeight: 2 },
            },
            tooltip: {
              ...tooltip,
              callbacks: {
                title: (items) => `ציונים ${items[0].label}`,
                label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}%`,
              },
            },
          },
          scales: {
            x: { grid: { display: false }, border: { color: c.line }, ticks: { color: c.muted, font: { ...FONT, size: 11 }, maxRotation: 0, autoSkip: true } },
            y: {
              beginAtZero: true,
              border: { display: false },
              grid: { color: c.line },
              ticks: { color: c.muted, font: { ...FONT, size: 11 }, callback: (v) => `${v}%` },
            },
          },
        }}
      />
    </div>
  );
}
