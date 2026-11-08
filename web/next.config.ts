import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating Next.js "N" badge so it doesn't show up in the demo recording.
  devIndicators: false,
  // Lets a verification build run beside a live `next dev` without the two trampling .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
