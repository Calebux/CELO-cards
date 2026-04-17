"use client";
import { useEffect, useState } from "react";

/** Shows a "rotate your device" screen whenever width < height (portrait)
 *  and the viewport is narrow (< 600 px). Uses actual pixel dimensions
 *  rather than matchMedia so it works reliably in MiniPay WebViews.
 *  Tapping "Play anyway" dismisses the overlay. */
export function PortraitOverlay() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function check() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isPortrait = w < h;
      const isNarrow   = w < 600;
      setShow(isPortrait && isNarrow);
      // If device rotated to landscape, reset dismissed so overlay can show again next time
      if (!isPortrait) setDismissed(false);
    }

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!show || dismissed) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "linear-gradient(160deg, #050810 0%, #0a1428 50%, #060c1e 100%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 28,
    }}>
      {/* Animated phone + rotate arrow */}
      <div style={{ position: "relative", width: 90, height: 90 }}>
        {/* Rotating ring */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          border: "2px solid rgba(86,164,203,0.25)",
          boxShadow: "0 0 24px rgba(86,164,203,0.15)",
          animation: "po-spin 3s linear infinite",
        }} />
        <div style={{
          position: "absolute", inset: 8, borderRadius: "50%",
          border: "1.5px dashed rgba(86,164,203,0.18)",
          animation: "po-spin 4s linear infinite reverse",
        }} />
        {/* Phone icon (portrait → tilts to landscape) */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "po-tilt 3s ease-in-out infinite",
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
            stroke="#56a4cb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </div>
      </div>

      {/* Text */}
      <div style={{ textAlign: "center", padding: "0 40px" }}>
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase",
          color: "#56a4cb", marginBottom: 10,
        }}>Rotate Your Device</p>
        <p style={{
          fontSize: 14, fontWeight: 500, color: "rgba(185,231,244,0.6)",
          lineHeight: 1.6, letterSpacing: 0.3,
        }}>
          Action Order is designed for<br />landscape mode
        </p>
      </div>

      {/* Decorative lines */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, width: 220 }}>
        <div style={{ flex: 1, height: 1, background: "rgba(86,164,203,0.2)" }} />
        <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#56a4cb", boxShadow: "0 0 6px #56a4cb" }} />
        <div style={{ flex: 1, height: 1, background: "rgba(86,164,203,0.2)" }} />
      </div>

      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: "none", border: "1px solid rgba(86,164,203,0.2)",
          borderRadius: 6, padding: "8px 24px",
          color: "rgba(185,231,244,0.35)", fontSize: 11,
          fontWeight: 600, letterSpacing: 2, textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        Play anyway
      </button>

      <style>{`
        @keyframes po-spin  { to { transform: rotate(360deg); } }
        @keyframes po-tilt  {
          0%,100% { transform: rotate(0deg); }
          40%     { transform: rotate(90deg) scale(1.08); }
          60%     { transform: rotate(90deg) scale(1.08); }
          80%     { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
