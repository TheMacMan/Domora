import { ImageResponse } from "next/og";

export const dynamic = "force-static";

// PWA-Icon 512×512. Wird vom Chrome-Installer für hochaufgelöste Plattformen
// (macOS Retina Dock, Splash-Screens) genutzt.
export function GET() {
  return new ImageResponse(<DomoraIcon />, { width: 512, height: 512 });
}

function DomoraIcon() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1E6E76",
      }}
    >
      <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
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
    </div>
  );
}
