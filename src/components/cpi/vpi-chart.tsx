"use client";

import { useState } from "react";

export type VpiPoint = { yearMonth: string; value: number };
export type VpiMark = {
  yearMonth: string;
  label: string;
  color: "primary" | "orange";
};

type Props = {
  points: VpiPoint[];
  marks: VpiMark[];
};

const W = 900, H = 240;
const PAD = { top: 24, right: 24, bottom: 36, left: 56 };
const CW = W - PAD.left - PAD.right;
const CH = H - PAD.top - PAD.bottom;

function ymToNum(ym: string) {
  const [y = "2020", m = "01"] = ym.split("-");
  return parseInt(y) * 12 + parseInt(m);
}

function fmtLong(ym: string) {
  const [y, m] = ym.split("-");
  const d = new Date(parseInt(y ?? "2020"), parseInt(m ?? "1") - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

export function VpiChart({ points, marks }: Props) {
  const [hovered, setHovered] = useState<VpiPoint | null>(null);

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground rounded-xl border border-dashed">
        Zu wenige Datenpunkte für Diagramm.
      </div>
    );
  }

  const sorted = [...points].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  const values = sorted.map((p) => p.value);
  const minN = ymToNum(sorted[0]!.yearMonth);
  const maxN = ymToNum(sorted[sorted.length - 1]!.yearMonth);
  const span = maxN - minN || 1;

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin) * 0.12 || 1;
  const minV = rawMin - pad;
  const maxV = rawMax + pad;
  const vSpan = maxV - minV;

  function xOf(ym: string) {
    return ((ymToNum(ym) - minN) / span) * CW;
  }
  function yOf(v: number) {
    return CH - ((v - minV) / vSpan) * CH;
  }

  // Path
  const linePts = sorted.map((p) => `${xOf(p.yearMonth).toFixed(1)},${yOf(p.value).toFixed(1)}`);
  const d = `M ${linePts.join(" L ")}`;
  const areaD = `M ${linePts.join(" L ")} L ${xOf(sorted[sorted.length - 1]!.yearMonth).toFixed(1)},${CH} L ${xOf(sorted[0]!.yearMonth).toFixed(1)},${CH} Z`;

  // Y-axis ticks (5 steps)
  const yStep = Math.ceil(vSpan / 5 / 0.5) * 0.5;
  const yTicks: number[] = [];
  for (let v = Math.ceil(minV / yStep) * yStep; v <= maxV; v += yStep) {
    yTicks.push(Math.round(v * 10) / 10);
  }

  // X-axis ticks — adaptive density based on year span
  const startY = parseInt(sorted[0]!.yearMonth.slice(0, 4));
  const endY   = parseInt(sorted[sorted.length - 1]!.yearMonth.slice(0, 4));
  const yearSpan = endY - startY + 1;
  const yearStep = yearSpan <= 8 ? 1 : yearSpan <= 20 ? 5 : 10;
  const xTicks: string[] = [];
  for (let y = Math.ceil(startY / yearStep) * yearStep; y <= endY; y += yearStep) {
    const x = xOf(`${y}-01`);
    if (x >= 0 && x <= CW) xTicks.push(`${y}-01`);
  }
  // Always include the first year if it's not already in the list
  if (!xTicks.includes(`${startY}-01`) && xOf(`${startY}-01`) >= 0) {
    xTicks.unshift(`${startY}-01`);
  }

  const MARK_COLORS = {
    primary: "oklch(0.461 0.054 207)",
    orange: "oklch(0.65 0.18 45)",
  };

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="vpi-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.461 0.054 207)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="oklch(0.461 0.054 207)" stopOpacity="0" />
          </linearGradient>
          <clipPath id="vpi-clip">
            <rect x={0} y={0} width={CW} height={CH} />
          </clipPath>
        </defs>

        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Grid */}
          {yTicks.map((v) => (
            <line
              key={v}
              x1={0} y1={yOf(v)} x2={CW} y2={yOf(v)}
              stroke="currentColor" strokeOpacity={0.08} strokeWidth={1}
            />
          ))}

          {/* Y labels */}
          {yTicks.map((v) => (
            <text
              key={v}
              x={-8} y={yOf(v)}
              textAnchor="end" dominantBaseline="middle"
              fontSize={10} fill="currentColor" opacity={0.5}
            >
              {v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </text>
          ))}

          {/* X ticks + labels */}
          {xTicks.map((ym) => (
            <g key={ym}>
              <line
                x1={xOf(ym)} y1={CH} x2={xOf(ym)} y2={CH + 4}
                stroke="currentColor" strokeOpacity={0.3} strokeWidth={1}
              />
              <text
                x={xOf(ym)} y={CH + 16}
                textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.5}
              >
                {ym.slice(0, 4)}
              </text>
            </g>
          ))}

          {/* Reference marks */}
          {marks.map((mark, i) => {
            const x = xOf(mark.yearMonth);
            if (x < 0 || x > CW) return null;
            const color = MARK_COLORS[mark.color];
            return (
              <g key={i}>
                <line
                  x1={x} y1={0} x2={x} y2={CH}
                  stroke={color} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7}
                />
                <text
                  x={x + 4} y={10}
                  fontSize={9} fill={color} fontWeight={600}
                >
                  {mark.label}
                </text>
              </g>
            );
          })}

          {/* Area + line */}
          <g clipPath="url(#vpi-clip)">
            <path d={areaD} fill="url(#vpi-area)" />
            <path
              d={d}
              fill="none"
              stroke="oklch(0.461 0.054 207)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>

          {/* Hover targets */}
          {sorted.map((p) => (
            <rect
              key={p.yearMonth}
              x={xOf(p.yearMonth) - CW / sorted.length / 2}
              y={0}
              width={CW / sorted.length}
              height={CH}
              fill="transparent"
              onMouseEnter={() => setHovered(p)}
            />
          ))}

          {/* Hovered dot */}
          {hovered && (
            <circle
              cx={xOf(hovered.yearMonth)}
              cy={yOf(hovered.value)}
              r={4}
              fill="oklch(0.461 0.054 207)"
              stroke="white"
              strokeWidth={2}
            />
          )}

          {/* Axes */}
          <line x1={0} y1={0} x2={0} y2={CH} stroke="currentColor" strokeOpacity={0.15} />
          <line x1={0} y1={CH} x2={CW} y2={CH} stroke="currentColor" strokeOpacity={0.15} />
        </g>
      </svg>

      {/* Floating tooltip */}
      {hovered && (() => {
        const xPct = (xOf(hovered.yearMonth) + PAD.left) / W * 100;
        const yPct = (yOf(hovered.value) + PAD.top) / H * 100;
        return (
          <div
            className="pointer-events-none absolute z-10 bg-card border rounded-lg shadow-md px-3 py-2 text-xs -translate-x-1/2 -translate-y-full -mt-2"
            style={{ left: `${xPct}%`, top: `${yPct}%` }}
          >
            <p className="font-semibold tabular-nums">
              {hovered.value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </p>
            <p className="text-muted-foreground">{fmtLong(hovered.yearMonth)}</p>
          </div>
        );
      })()}
    </div>
  );
}
