import { ImageResponse } from "next/og";

export const size = { width: 1024, height: 1024 };
export const contentType = "image/png";

// Apple Touch Icon — wird auf dem iPhone-Homescreen UND von Safari „Im Dock
// ablegen" auf macOS verwendet. iOS/macOS skaliert das automatisch auf die
// jeweilige Zielgröße (60 px bis 1024 px auf Retina-Dock) und rundet die Ecken.
// 1024 × 1024 liefert maximale Schärfe; wir geben absichtlich KEINE eigenen
// Rundungen vor.
export default function AppleIcon() {
  return new ImageResponse(
    (
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
        <svg width="1024" height="1024" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
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
    ),
    size,
  );
}
