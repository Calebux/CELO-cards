"use client";

import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { isMiniPay } from "../lib/minipay";
import { useMobileViewportMode } from "../lib/mobile";

type MiniPayImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  minipayWidth?: number;
  minipayQuality?: number;
  minipaySizes?: string;
  priority?: boolean;
};

function buildOptimizedSrc(src: string, width: number, quality: number): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}

function buildSrcSet(src: string, width: number, quality: number): string {
  const widths = Array.from(new Set([
    Math.max(64, Math.round(width / 2)),
    width,
    Math.round(width * 1.5),
  ])).sort((a, b) => a - b);
  return widths.map((current) => `${buildOptimizedSrc(src, current, quality)} ${current}w`).join(", ");
}

export function MiniPayImage({
  src,
  loading,
  decoding,
  fetchPriority,
  sizes,
  onError,
  minipayWidth = 960,
  minipayQuality = 60,
  minipaySizes,
  priority = false,
  ...props
}: MiniPayImageProps) {
  const srcValue = typeof src === "string" ? src : "";
  const isMobileViewport = useMobileViewportMode();
  const [preferOptimized, setPreferOptimized] = useState(false);
  const optimizeForMiniPay = preferOptimized && srcValue.startsWith("/");
  const effectiveMiniPaySizes =
    minipaySizes ?? (minipayWidth <= 480 ? `${Math.max(96, Math.round(minipayWidth / 2))}px` : "100vw");

  useEffect(() => {
    setPreferOptimized(srcValue.startsWith("/") && (isMiniPay() || isMobileViewport));
  }, [isMobileViewport, srcValue]);

  return (
    <img
      {...props}
      src={optimizeForMiniPay ? buildOptimizedSrc(srcValue, minipayWidth, minipayQuality) : srcValue}
      srcSet={optimizeForMiniPay ? buildSrcSet(srcValue, minipayWidth, minipayQuality) : undefined}
      sizes={optimizeForMiniPay ? effectiveMiniPaySizes : sizes}
      loading={loading ?? (priority ? "eager" : "lazy")}
      decoding={decoding ?? (optimizeForMiniPay ? "async" : "auto")}
      fetchPriority={fetchPriority ?? (priority ? "high" : "auto")}
      onError={(event) => {
        if (optimizeForMiniPay) {
          setPreferOptimized(false);
          return;
        }
        onError?.(event);
      }}
      suppressHydrationWarning
    />
  );
}
