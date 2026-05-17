import type { NextConfig } from "next";

const ONE_YEAR = 60 * 60 * 24 * 365;

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  compress: true,
  poweredByHeader: false,
  experimental: {
    // Tree-shake large web3 packages — only bundle actually-used exports
    optimizePackageImports: ["wagmi", "viem", "@rainbow-me/rainbowkit", "@tanstack/react-query"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // MiniPayImage requests /_next/image with widths derived from minipayWidth.
    // All 12 direct minipayWidth values < 640 are listed first (these are used
    // in the src attr — must succeed). Remaining 13 slots cover the most common
    // srcSet 0.5x variants. Next.js hard-caps imageSizes at 25 entries.
    imageSizes: [
      64, 80, 84, 110, 120, 140, 160, 168, 170, 180,
      210, 220, 240, 260, 272, 280, 320, 340, 360, 380,
      390, 420, 480, 510, 540,
    ],
    deviceSizes: [640, 720, 750, 760, 828, 960, 1080, 1140, 1200, 1280, 1440, 1920, 2048, 3840],
  },
  async headers() {
    return [
      // Static game assets — immutable, cache 1 year
      {
        source: "/new-assets/:path*",
        headers: [{ key: "Cache-Control", value: `public, max-age=${ONE_YEAR}, immutable` }],
      },
      {
        source: "/arena-backgrounds/:path*",
        headers: [{ key: "Cache-Control", value: `public, max-age=${ONE_YEAR}, immutable` }],
      },
      {
        source: "/characters/:path*",
        headers: [{ key: "Cache-Control", value: `public, max-age=${ONE_YEAR}, immutable` }],
      },
      {
        source: "/Characters standing/:path*",
        headers: [{ key: "Cache-Control", value: `public, max-age=${ONE_YEAR}, immutable` }],
      },
      {
        source: "/Sounds/:path*",
        headers: [{ key: "Cache-Control", value: `public, max-age=${ONE_YEAR}, immutable` }],
      },
      // Cards and other static images
      {
        source: "/:path*.webp",
        headers: [{ key: "Cache-Control", value: `public, max-age=${ONE_YEAR}, immutable` }],
      },
      {
        source: "/:path*.webm",
        headers: [{ key: "Cache-Control", value: `public, max-age=${ONE_YEAR}, immutable` }],
      },
      {
        source: "/:path*.png",
        headers: [{ key: "Cache-Control", value: `public, max-age=${ONE_YEAR}, immutable` }],
      },
      {
        source: "/:path*.jpeg",
        headers: [{ key: "Cache-Control", value: `public, max-age=${ONE_YEAR}, immutable` }],
      },
      // Self-hosted fonts
      {
        source: "/:path*.woff2",
        headers: [{ key: "Cache-Control", value: `public, max-age=${ONE_YEAR}, immutable` }],
      },
    ];
  },
};

export default nextConfig;
