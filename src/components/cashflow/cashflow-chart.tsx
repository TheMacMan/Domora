"use client";

import dynamic from "next/dynamic";

const Chart = dynamic(() => import("./cashflow-chart-inner").then((m) => m.CashflowChart), {
  loading: () => <div className="h-80 rounded-xl border bg-card animate-pulse" />,
});

const MiniChart = dynamic(() => import("./cashflow-chart-inner").then((m) => m.CashflowMiniChart), {
  loading: () => <div className="h-40 rounded-md bg-muted/40 animate-pulse" />,
});

export { Chart as CashflowChart, MiniChart as CashflowMiniChart };
export type { CashflowMode } from "./cashflow-chart-inner";
