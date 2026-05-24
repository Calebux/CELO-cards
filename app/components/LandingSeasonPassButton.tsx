"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { LandingWebProviders } from "./LandingWebProviders";
import { LandingMiniPayProviders } from "./LandingMiniPayProviders";

const SeasonPassModal = dynamic(() => import("./SeasonPassModal").then(m => ({ default: m.SeasonPassModal })), { ssr: false });

export function LandingSeasonPassButton({ isCompact, isMiniPay }: { isCompact: boolean; isMiniPay: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const Provider = isMiniPay ? LandingMiniPayProviders : LandingWebProviders;

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: isCompact ? 12 : 8,
          padding: isCompact ? "15px 30px" : "10px 24px",
          background: "linear-gradient(135deg, rgba(40,28,5,0.95), rgba(80,55,0,0.88))",
          border: "1.5px solid rgba(251,204,92,0.85)",
          borderRadius: 6,
          color: "#fbbf24",
          fontSize: isCompact ? 17 : 13,
          fontWeight: 800,
          letterSpacing: 2,
          textTransform: "uppercase",
          animation: "ko-tournament-blink 1.4s ease-in-out infinite",
          clipPath: "polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)",
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        ⚡ SEASON PASS
      </button>
      {open && mounted
        ? createPortal(
            <Provider>
              <SeasonPassModal onClose={() => setOpen(false)} onActivated={() => setOpen(false)} />
            </Provider>,
            document.body,
          )
        : null}
    </>
  );
}
