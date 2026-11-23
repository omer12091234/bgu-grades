"use client";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { TermDistribution } from "@/types";
import { BUCKETS, bucketShares } from "@/lib/stats";
import { useThemeColors } from "@/lib/useThemeColors";
import type { TermKey } from "@/lib/terms";
import { termLabel } from "@/lib/terms";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend);

const FONT = { family: "Heebo, system-ui, sans-serif" };

export type CompareSeries = {
  key: string;
  name: string;
  /** Index into the series palette, fixed per course so chips and lines match. */
  colorIndex: number;
  terms: TermDistribution[];
  combined: TermDistribution;
};

function baseOptions(c: ReturnType<typeof useThemeColors>) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        position: "bottom" as const,
        rtl: true,
        labels: { color: c.ink, font: { ...FONT, size: 12 }, boxWidth: 12, boxHeight: 2 },
      },
      tooltip: {
        rtl: true,
        backgroundColor: c.ink,
        titleColor: c.surface,
        bodyColor: c.surface,
        titleFont: FONT,
        bodyFont: FONT,
        padding: 10,
        cornerRadius: 4,
      },
    },
  };
}

export function CompareDistribution({ series }: { series: CompareSeries[] }) {
  const c = useThemeColors();
  const o = baseOptions(c);
  return (
    <div className="chart-box" role="img" aria-label="השוואת התפלגות ציונים בין קורסים">
      <Line
        data={{
          labels: BUCKETS.map((b) => b.label),
          datasets: series.map((s) => ({
            label: s.name,
            data: bucketShares(s.combined).map((v) => +(v * 100).toFixed(1)),
            borderColor: c.series[s.colorIndex % 4],
            backgroundColor: c.series[s.colorIndex % 4],
            borderWidth: 2,
            pointRadius: 2.5,
            tension: 0.25,
          })),
        }}
        options={{
          ...o,
          plugins: {
            ...o.plugins,
            tooltip: {
              ...o.plugins.tooltip,
              callbacks: {
                title: (items) => `ציונים ${items[0].label}`,
                label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}%`,
              },
            },
          },
          scales: {
            x: { grid: { display: false }, border: { color: c.line }, ticks: { color: c.muted, font: { ...FONT, size: 11 } } },
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

export function CompareTrend({ series, termList }: { series: CompareSeries[]; termList: TermKey[] }) {
  const c = useThemeColors();
  const o = baseOptions(c);
  const chrono = [...termList].reverse();
  const used = chrono.filter((t) => series.some((s) => s.terms.some((x) => x.termId === t.id && x.status === "ok")));
  return (
    <div className="chart-box" role="img" aria-label="השוואת ממוצעים לאורך הסמסטרים">
      <Line
        data={{
          labels: used.map((t) => termLabel(t.year, t.semester)),
          datasets: series.map((s) => ({
            label: s.name,
            data: used.map((t) => {
              const term = s.terms.find((x) => x.termId === t.id && x.status === "ok");
              return term?.stats.mean != null ? +term.stats.mean.toFixed(1) : null;
            }),
            borderColor: c.series[s.colorIndex % 4],
            backgroundColor: c.series[s.colorIndex % 4],
            borderWidth: 2,
            pointRadius: 3.5,
            spanGaps: true,
          })),
        }}
        options={{
          ...o,
          plugins: {
            ...o.plugins,
            tooltip: {
              ...o.plugins.tooltip,
              callbacks: {
                label: (ctx) => {
                  const s = series[ctx.datasetIndex];
                  const term = s.terms.find((x) => x.termId === used[ctx.dataIndex].id);
                  const who = term?.lecturers?.length ? ` (${term.lecturers.join(", ")})` : "";
                  return ` ${s.name}: ${ctx.parsed.y}${who}`;
                },
              },
            },
          },
          scales: {
            x: { grid: { display: false }, border: { color: c.line }, ticks: { color: c.muted, font: { ...FONT, size: 11 }, maxRotation: 0 } },
            y: {
              suggestedMin: 50,
              suggestedMax: 100,
              border: { display: false },
              grid: { color: c.line },
              title: { display: true, text: "ממוצע", color: c.muted, font: FONT },
              ticks: { color: c.muted, font: { ...FONT, size: 11 } },
            },
          },
        }}
      />
    </div>
  );
}
