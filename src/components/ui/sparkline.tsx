// Lightweight reine-SVG-Sparkline für Mietentwicklung-Karten.
// Keine Client-State, keine Tooltips — nur statische Labels & visuelle Marker.
// Idee: kompakte Visualisierung, die ohne Interaktion auskommt.

type Point = { x: number; y: number };

type HLine = { y: number; color: string; label?: string };
type Marker = { x: number; y: number; color: string; label?: string };

type SparklineProps = {
  height?: number;                // px
  // Hauptserie
  points: Point[];
  step?: boolean;                 // Treppenfunktion
  lineColor?: string;             // CSS-Farbe der Hauptlinie
  fillBelow?: boolean;            // Fläche unter der Linie schattiert
  // Optionale gestrichelte Fortsetzung (künftige Anpassung)
  plannedPoints?: Point[];
  plannedLineColor?: string;
  // Horizontale Bezugslinien (Kappung, Vergleichsmiete, …)
  hLines?: HLine[];
  // Markierte Punkte (Referenz, heute, …)
  markers?: Marker[];
  // Vertikale Bezugslinie (z.B. heute)
  vLine?: { x: number; color: string };
  // Y-Bereich (optional, sonst auto)
  yMin?: number;
  yMax?: number;
  // Start-/End-Wert-Labels (links/rechts) — frei formatiert
  startLabel?: string;
  endLabel?: string;
  // Aria-Label für Screen Reader
  ariaLabel?: string;
};

const VIEWBOX_W = 600; // konstante interne Breite; SVG skaliert per CSS
const PAD_X = 8;
const PAD_Y = 6;

export function Sparkline({
  height = 48,
  points,
  step = false,
  lineColor = "oklch(0.461 0.054 207)", // primary violet
  fillBelow = true,
  plannedPoints,
  plannedLineColor,
  hLines = [],
  markers = [],
  vLine,
  yMin,
  yMax,
  startLabel,
  endLabel,
  ariaLabel,
}: SparklineProps) {
  if (points.length === 0) return null;

  // Achsen-Bereich ermitteln (Hauptserie + planned + hLines + markers + vLine)
  const allX = [
    ...points.map((p) => p.x),
    ...(plannedPoints?.map((p) => p.x) ?? []),
    ...(vLine ? [vLine.x] : []),
    ...markers.map((m) => m.x),
  ];
  const allY = [
    ...points.map((p) => p.y),
    ...(plannedPoints?.map((p) => p.y) ?? []),
    ...hLines.map((h) => h.y),
    ...markers.map((m) => m.y),
  ];
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const dataYMin = Math.min(...allY);
  const dataYMax = Math.max(...allY);
  // 8 % Y-Padding
  const yRange = dataYMax - dataYMin || 1;
  const lo = yMin ?? dataYMin - yRange * 0.08;
  const hi = yMax ?? dataYMax + yRange * 0.08;
  const xRange = xMax - xMin || 1;

  const W = VIEWBOX_W;
  const H = height;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const sx = (x: number) => PAD_X + ((x - xMin) / xRange) * innerW;
  const sy = (y: number) => PAD_Y + (1 - (y - lo) / (hi - lo)) * innerH;

  function buildPath(pts: Point[], stepped: boolean): string {
    if (pts.length === 0) return "";
    const cmds: string[] = [`M ${sx(pts[0]!.x).toFixed(2)} ${sy(pts[0]!.y).toFixed(2)}`];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (stepped) {
        cmds.push(`H ${sx(b.x).toFixed(2)}`);
        cmds.push(`V ${sy(b.y).toFixed(2)}`);
      } else {
        cmds.push(`L ${sx(b.x).toFixed(2)} ${sy(b.y).toFixed(2)}`);
      }
      void a;
    }
    return cmds.join(" ");
  }

  const linePath = buildPath(points, step);
  const lastPt = points[points.length - 1]!;
  const areaPath = fillBelow
    ? `${linePath} L ${sx(lastPt.x).toFixed(2)} ${(H - PAD_Y).toFixed(2)} L ${sx(points[0]!.x).toFixed(2)} ${(H - PAD_Y).toFixed(2)} Z`
    : null;

  // Falls planned existiert, Übergang von Haupt-Ende zur planned-Linie
  let plannedPath = "";
  if (plannedPoints && plannedPoints.length > 0) {
    const bridge: Point[] = [lastPt, ...plannedPoints];
    plannedPath = buildPath(bridge, step);
  }

  return (
    <div className="relative w-full" aria-label={ariaLabel}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: `${H}px` }}
        role="img"
      >
        {/* horizontale Bezugslinien */}
        {hLines.map((h, i) => (
          <line
            key={`h-${i}`}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={sy(h.y)}
            y2={sy(h.y)}
            stroke={h.color}
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.8}
          />
        ))}

        {/* vertikale Bezugslinie (z. B. heute) */}
        {vLine && (
          <line
            x1={sx(vLine.x)}
            x2={sx(vLine.x)}
            y1={PAD_Y}
            y2={H - PAD_Y}
            stroke={vLine.color}
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.6}
          />
        )}

        {/* Fläche unter der Hauptlinie */}
        {areaPath && (
          <path d={areaPath} fill={lineColor} opacity={0.1} />
        )}

        {/* Hauptlinie */}
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* gestrichelte Fortsetzung */}
        {plannedPath && (
          <path
            d={plannedPath}
            fill="none"
            stroke={plannedLineColor ?? lineColor}
            strokeWidth={1.75}
            strokeDasharray="4 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.85}
          />
        )}

        {/* Marker */}
        {markers.map((m, i) => (
          <circle
            key={`m-${i}`}
            cx={sx(m.x)}
            cy={sy(m.y)}
            r={3}
            fill={m.color}
            stroke="white"
            strokeWidth={1.5}
          />
        ))}
      </svg>

      {/* Start-/End-Wert-Labels unter Sparkline.
          Auf Mobile fest umbrechen (unterhalb der x-Linie) statt nebeneinander quetschen. */}
      {(startLabel || endLabel) && (
        <div className="flex flex-col gap-0 text-[10px] text-muted-foreground tabular-nums mt-0.5 px-1
                        sm:flex-row sm:justify-between sm:gap-2 sm:items-baseline">
          <span className="truncate">{startLabel ?? ""}</span>
          <span className="truncate sm:text-right">{endLabel ?? ""}</span>
        </div>
      )}
    </div>
  );
}
