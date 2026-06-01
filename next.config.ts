import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Lease PDFs, bank statements, and other docs uploaded through
      // Server Actions (e.g. /leases/[id]/turnover) routinely exceed
      // the 1MB default. Bumped to give headroom for multi-page scans.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
