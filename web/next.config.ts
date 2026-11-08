import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a verification build run beside a live `next dev` without the two trampling .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
