"use client";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, type Plugin,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { TermDistribution } from "@/types";
import { lecturerKey } from "@/lib/stats";
import { useIsNarrow, useThemeColors } from "@/lib/useThemeColors";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend);

const FONT = { family: "Heebo, system-ui, sans-serif" };

/** Dashed vertical line wherever the lecturer changes between consecutive semesters. */
function lecturerChangePlugin(changes: number[], color: string): Plugin<"line"> {
  return {
    id: "lecturerChange",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const x = scales.x;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      for (const i of changes) {
        const px = (x.getPixelForValue(i - 1) + x.getPixelForValue(i)) / 2;
        ctx.beginPath();
        ctx.moveTo(px, chartArea.top);
        ctx.lineTo(px, chartArea.bottom);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/** `terms` must be in chronological order (oldest first). */
export default function TrendChart({ terms }: { terms: TermDistribution[] }) {
  const c = useThemeColors();
  const narrow = useIsNarrow();
  const ok = terms.filter((t) => t.status === "ok");

  const changes: number[] = [];
  ok.forEach((t, i) => {
    if (i > 0 && lecturerKey(t) && lecturerKey(ok[i - 1]) && lecturerKey(t) !== lecturerKey(ok[i - 1])) changes.push(i);
  });

  const data = {
    labels: ok.map((t) => (ok.length > 8 || narrow ? t.label : [t.label, ...(t.lecturers?.length ? [t.lecturers.join(", ")] : [])])),
    datasets: [
      {
        label: "ממוצע",
        data: ok.map((t) => (t.stats.mean !== null ? +t.stats.mean.toFixed(1) : null)),
        borderColor: c.accent,
        backgroundColor: c.accent,
        borderWidth: 2.5,
        pointRadius: narrow ? 3 : 4,
        yAxisID: "y",
      },
      {
        label: "חציון",
        data: ok.map((t) => t.stats.median),
        borderColor: c.accent,
        backgroundColor: c.surface,
        borderDash: [5, 4],
        borderWidth: 1.5,
        pointRadius: 3,
        yAxisID: "y",
      },
      {
        label: "% עוברים",
        data: ok.map((t) => (t.stats.passRate !== null ? +(t.stats.passRate * 100).toFixed(1) : null)),
        borderColor: c.series[2],
        backgroundColor: c.series[2],
        borderWidth: 2,
        pointRadius: 3,
        pointStyle: "rectRot" as const,
        yAxisID: "y2",
      },
    ],
  };

  return (
    <div className="chart-box tall" role="img" aria-label="מגמת ממוצע ואחוז עוברים לאורך הסמסטרים">
      <Line
        data={data}
        plugins={[lecturerChangePlugin(changes, c.muted)]}
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
              rtl: true,
              backgroundColor: c.ink,
              titleColor: c.surface,
              bodyColor: c.surface,
              titleFont: FONT,
              bodyFont: FONT,
              padding: 10,
              cornerRadius: 4,
              callbacks: {
                title: (items) => {
                  const t = ok[items[0].dataIndex];
                  return `${t.label} · ${t.n} נבחנים`;
                },
                afterTitle: (items) => {
                  const t = ok[items[0].dataIndex];
                  return t.lecturers?.length ? `מרצה: ${t.lecturers.join(", ")}` : "";
                },
                label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}${ctx.dataset.yAxisID === "y2" ? "%" : ""}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              border: { color: c.line },
              ticks: { color: c.muted, font: { ...FONT, size: 11 }, maxRotation: 0, autoSkip: ok.length > 8 || narrow },
            },
            y: {
              position: "left",
              suggestedMin: 50,
              suggestedMax: 100,
              border: { display: false },
              grid: { color: c.line },
              title: { display: !narrow, text: "ציון", color: c.muted, font: FONT },
              ticks: { color: c.muted, font: { ...FONT, size: 11 } },
            },
            y2: {
              position: "right",
              min: 0,
              max: 100,
              border: { display: false },
              grid: { display: false },
              title: { display: !narrow, text: "% עוברים", color: c.muted, font: FONT },
              ticks: { color: c.muted, font: { ...FONT, size: 11 }, callback: (v) => `${v}%` },
            },
          },
        }}
      />
    </div>
  );
}
