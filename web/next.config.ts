import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";
const isDockerBuild = process.env.DOCKER_BUILD === "true";

const nextConfig: NextConfig = {
  typedRoutes: true,
  compress: true,
  poweredByHeader: false,
  ...(isCapacitorBuild
    ? {
        output: "export" as const,
        images: {
          unoptimized: true
        }
      }
    : isDockerBuild
      ? {
          output: "standalone" as const,
        }
      : {})
};

export default nextConfig;
