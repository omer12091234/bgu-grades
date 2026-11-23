"use client";
import { useMemo, useSyncExternalStore } from "react";

export type ThemeColors = {
  ink: string;
  muted: string;
  line: string;
  accent: string;
  fail: string;
  surface: string;
  series: string[];
};

const FALLBACK: ThemeColors = {
  ink: "#1d1c19",
  muted: "#75726a",
  line: "#e2dfd6",
  accent: "#1d5c86",
  fail: "#c2410c",
  surface: "#ffffff",
  series: ["#1d5c86", "#c2410c", "#3d7a38", "#7b4c99"],
};

function read(): ThemeColors {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => s.getPropertyValue(name).trim() || fb;
  return {
    ink: v("--ink", FALLBACK.ink),
    muted: v("--muted", FALLBACK.muted),
    line: v("--line", FALLBACK.line),
    accent: v("--accent", FALLBACK.accent),
    fail: v("--fail", FALLBACK.fail),
    surface: v("--surface", FALLBACK.surface),
    series: [1, 2, 3, 4].map((i) => v(`--series-${i}`, FALLBACK.series[i - 1])),
  };
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Chart.js can't read CSS variables, so resolve them and follow light/dark changes. */
export function useThemeColors(): ThemeColors {
  const snap = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(read()),
    () => JSON.stringify(FALLBACK)
  );
  return useMemo(() => JSON.parse(snap) as ThemeColors, [snap]);
}

/** Hex colour with alpha. */
export function alpha(hex: string, a: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const n = parseInt(m, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
