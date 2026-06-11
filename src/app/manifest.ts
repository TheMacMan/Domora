import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Domora – Die Mietverwaltung",
    short_name: "Domora",
    description: "Self-hosted Mietverwaltung",
    start_url: "/",
    display: "standalone",
    background_color: "#fcfcfc",
    theme_color: "#1E6E76",
    orientation: "portrait",
    icons: [
      // PNG-Icons für Chrome/Edge PWA-Installer (macOS Dock, Windows Taskbar,
      // Android Homescreen). Ohne sie generieren die Installer einen Buchstaben-
      // Fallback statt unser Logo zu nutzen.
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // SVG für moderne Browser-Tabs/Bookmarks.
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      // iOS / macOS Apple-Touch-Icon (Safari „Im Dock ablegen", Homescreen).
      {
        src: "/apple-icon",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
