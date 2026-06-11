// Domora Logo-Lockup — App-Icon + Wortmarke "domora".
// Verwendet auf Login/Splash. Höhe via className; Wortmarke ist als <text>
// gesetzt, braucht also eine Web-Font (Poppins/Helvetica Neue) — fällt sonst
// auf System-Sans zurück.

export function DomoraLockup(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 740 220"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Domora"
      {...props}
    >
      <rect x="20" y="20" width="180" height="180" rx="40" fill="#1E6E76" />
      <circle cx="110" cy="128" r="40" fill="none" stroke="#FFFFFF" strokeWidth="17" />
      <path
        d="M62 88 L110 56 L158 88"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="17"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="240"
        y="142"
        fontFamily="'Poppins','Helvetica Neue',Arial,sans-serif"
        fontSize="96"
        fontWeight="500"
        letterSpacing="2"
        fill="#2A2723"
      >
        d
        <tspan fill="#1E6E76">o</tspan>
        m
        <tspan fill="#1E6E76">o</tspan>
        ra
      </text>
    </svg>
  );
}
