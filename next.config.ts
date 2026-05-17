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
    // MiniPayImage calls /_next/image with arbitrary widths derived from
    // minipayWidth props. buildSrcSet generates 3 variants per image:
    //   [max(64, round(W/2)), W, round(W*1.5)]
    // Every possible output must be in imageSizes or deviceSizes or the
    // server returns 400. Values < 640 go in imageSizes, >= 640 in deviceSizes.
    imageSizes: [
      64, 80, 84, 110, 120, 130, 136, 140, 160, 168, 170, 180,
      210, 220, 240, 252, 260, 272, 280, 320, 330, 340, 360, 380,
      390, 408, 420, 480, 510, 540, 630,
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
