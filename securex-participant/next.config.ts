import type { NextConfig } from "next";
import path from "path";

// ============================================================
// SECUREX — Next.js Configuration
//
// PROXY STRATEGY
// All /api/* requests are rewritten to the Express backend.
// This avoids CORS issues in development and keeps frontend
// call-sites clean (they just use /api/...).
//
// Development:  NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
// Production:   NEXT_PUBLIC_BACKEND_URL=https://<render-backend-domain>
// ============================================================

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Proxy all /api/* requests to the Express backend.
  // The rewrite strips nothing — /api/users/me → http://localhost:4000/api/users/me
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
