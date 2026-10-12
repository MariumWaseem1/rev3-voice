import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  devIndicators: false,
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  poweredByHeader: false,
  async redirects() {return [{source:"/privacy.html",destination:"/company/privacy",permanent:true},{source:"/terms.html",destination:"/company/terms",permanent:true}]},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=(self)",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' wss://*.livekit.cloud https://*.livekit.cloud; media-src 'self' blob:; frame-src https://www.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};
export default config;
