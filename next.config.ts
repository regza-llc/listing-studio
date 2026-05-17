import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["roka-listing-test.loca.lt", "*.loca.lt"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
