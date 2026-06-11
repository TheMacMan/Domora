import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.239"],
  serverExternalPackages: ["@react-pdf/renderer"],

  // Redirects für deutsche Alt-URLs auf das englische Schema.
  // Permanent (308), damit Browser-/Bookmark-Caches die neuen URLs übernehmen.
  async redirects() {
    return [
      { source: "/einstellungen",             destination: "/settings",               permanent: true },
      { source: "/einstellungen/:path*",      destination: "/settings/:path*",        permanent: true },
      { source: "/vpi",                       destination: "/cpi",                    permanent: true },
      { source: "/vpi/:path*",                destination: "/cpi/:path*",             permanent: true },
      { source: "/nk-abrechnungen",           destination: "/service-charges",        permanent: true },
      { source: "/nk-abrechnungen/:path*",    destination: "/service-charges/:path*", permanent: true },
      { source: "/weg-abrechnungen",          destination: "/weg-statements",         permanent: true },
      { source: "/weg-abrechnungen/:path*",   destination: "/weg-statements/:path*",  permanent: true },
      // Sub-Segmente (auf mehreren Top-Level-Routen)
      { source: "/:base*/wohneinheiten/:rest*",   destination: "/:base*/units/:rest*",            permanent: true },
      { source: "/:base*/mietanpassungen/:rest*", destination: "/:base*/rent-adjustments/:rest*", permanent: true },
      { source: "/expenses/abos/:rest*",          destination: "/expenses/recurring/:rest*",      permanent: true },
      { source: "/:base*/bearbeiten",             destination: "/:base*/edit",                    permanent: true },
      { source: "/:base*/neu",                    destination: "/:base*/new",                     permanent: true },
      { source: "/loans/auswertung",              destination: "/loans/analysis",                 permanent: true },
      { source: "/api/nk-abrechnungen/:path*",    destination: "/api/service-charges/:path*",     permanent: true },
    ];
  },
};

export default nextConfig;
