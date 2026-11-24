import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "dist",
  pageExtensions: ["next.tsx", "next.ts"],
  ...(isDev
    ? {
        experimental: {
          proxyTimeout: 300_000,
        },
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://127.0.0.1:4000/api/:path*",
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
