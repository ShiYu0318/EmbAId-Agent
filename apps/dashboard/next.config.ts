import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dashboard renders the real embeddable widget straight from its TypeScript source.
  transpilePackages: ["@embaid/widget"],
  eslint: {
    dirs: ["src"],
  },
};

export default nextConfig;
