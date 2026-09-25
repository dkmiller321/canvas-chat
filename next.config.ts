import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The dev server and tests use 127.0.0.1 rather than localhost.
  allowedDevOrigins: ["127.0.0.1"],
  // Playwright loads files (e.g. browsers.json) dynamically, which output tracing misses;
  // the Dockerfile copies both packages whole.
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
