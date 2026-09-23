import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages quote personal-only Sources: keep every route out of search indexes.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
