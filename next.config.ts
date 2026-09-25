import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The dev server and tests use 127.0.0.1 rather than localhost.
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
