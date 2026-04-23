import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/export/proforma/**": ["./public/templates/**"],
  },
};

export default nextConfig;
