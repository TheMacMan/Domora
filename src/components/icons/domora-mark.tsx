// Domora App-Icon — Quadrat mit teal Hintergrund + Haus-Symbol (Dach + Tür/Fenster-Kreis).
// Verwendet als kompaktes App-Logo (Sidebar, Login, KPI-Header).
// Größe via className (z.B. "size-7"). Behält Aspect-Ratio durch viewBox.

export function DomoraMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Domora"
      {...props}
    >
      <rect x="0" y="0" width="512" height="512" rx="115" fill="#1E6E76" />
      <circle cx="256" cy="300" r="86" fill="none" stroke="#FFFFFF" strokeWidth="36" />
      <path
        d="M150 206 L256 130 L362 206"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="36"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
