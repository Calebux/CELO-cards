"use client";

import { LandingWalletSection } from "./LandingWalletSection";
import { ResumeMatchBanner } from "./ResumeMatchBanner";
import { LandingWebProviders } from "./LandingWebProviders";
import { LandingMiniPayProviders } from "./LandingMiniPayProviders";

export function LandingWalletHud({ isMiniPay }: { isMiniPay: boolean }) {
  const Provider = isMiniPay ? LandingMiniPayProviders : LandingWebProviders;

  return (
    <Provider>
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 21,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: isMiniPay ? 17 : 11,
            right: isMiniPay ? 34 : 40,
            pointerEvents: "auto",
          }}
        >
          <LandingWalletSection />
        </div>
        <div style={{ pointerEvents: "auto" }}>
          <ResumeMatchBanner isMiniPay={isMiniPay} />
        </div>
      </div>
    </Provider>
  );
}
