"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMiniPayMode } from "../../lib/premiumPayments";

// The agents lane is web-only. Deploying an agent runs GoodDollar face
// verification through the GoodAgent widget, and GoodDollar must not appear
// or operate anywhere in the MiniPay Mini App — MiniPay are blocking go-live
// on exactly that (see 96ed1d7). The landing page hides the MY AGENTS button
// in MiniPay, so this branch only catches a deep link.
//
// Loaded through next/dynamic rather than imported directly so the widget,
// RainbowKit and agents.css sit in a chunk MiniPay never fetches. That also
// keeps the page from crashing there: MiniPayProviders mounts a bare wagmi
// config with no RainbowKitProvider, and the deck's ConnectButton and
// useConnectModal both require one.
const AgentsCommandDeck = dynamic(
  () => import("./AgentsCommandDeck").then((m) => m.AgentsCommandDeck),
  { ssr: false },
);

export default function AgentsPage() {
  const isMp = useMiniPayMode();

  if (isMp) {
    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: 24,
          textAlign: "center",
          background: "#04121b",
          color: "#b9e7f4",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.3, color: "#fff" }}>
          Agents live on the web version
        </h1>
        <p style={{ fontSize: 14, maxWidth: 320, lineHeight: 1.5 }}>
          Deploying an agent needs the full site. Everything else — House Boss,
          the daily bounty, your deck — works right here.
        </p>
        <Link
          href="/"
          style={{
            marginTop: 6,
            padding: "10px 22px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 0.4,
            color: "#04121b",
            background: "#56a4cb",
            textDecoration: "none",
          }}
        >
          BACK TO GAME
        </Link>
      </main>
    );
  }

  return <AgentsCommandDeck />;
}
