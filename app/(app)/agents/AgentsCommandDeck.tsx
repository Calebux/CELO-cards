"use client";

import { useRef } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { GoodAgentWidget } from "@goodagent/widget";
import "@goodagent/widget/styles.css";
import "./agents.css";
import { AgentDashboard } from "./AgentDashboard";
import {
  useGoodAgentWallet,
  useGoodAgentWidgetConfig,
} from "../../lib/goodagent-wallet";
import { useGameFrameScale } from "../../lib/mobile";
import { DESIGN_W, DESIGN_H } from "../../lib/designConstants";

// Everything the agents lane needs that must not reach the MiniPay Mini App
// lives in this file: the GoodAgent widget and its GoodDollar verification
// flow, RainbowKit, and agents.css. page.tsx reaches it through a dynamic
// import from its web-only branch, so none of it enters a chunk MiniPay
// downloads — the same split lib/seasonPassGdollar.ts uses.

export function AgentsCommandDeck() {
  const wallet = useGoodAgentWallet();
  const config = useGoodAgentWidgetConfig();
  const wrapRef = useRef<HTMLDivElement>(null);
  useGameFrameScale(wrapRef);

  // Same shape as every other screen: a fixed viewport, the 1440×823 frame
  // inside it, and the content scrolling WITHIN the frame rather than the page
  // scrolling. This page was built as an ordinary responsive document, which
  // is why it looked like someone else's site and why long content had nowhere
  // to go — the frame is fixed, so an inner scroller is the only thing that can
  // move. See profile/page.tsx for the same three layers.
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef}
        data-ao-frame=""
        style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", transform: "var(--ao-tr)" }}>
    <main className="ao-agents-page">
      <div className="ao-agents-shell">
        <header className="ao-agents-topbar">
          <Link href="/" className="ao-agents-back">
            ← Back to game
          </Link>
          <ConnectButton />
        </header>

        <header className="ao-agents-hero">
          <p className="ao-agents-kicker">Season 2 · Rise of the Agents</p>
          <h1>Deploy your House Boss agent</h1>
          <p className="ao-agents-sub">
            Connect your wallet, deploy a verified GoodAgent, and grind House
            Boss matches from your command deck.
          </p>
        </header>

        <div className="ao-agents-layout">
          <section className="ao-panel ao-panel-dashboard">
            <div className="ao-panel-head">
              <div>
                <h2 className="ao-panel-title">Agent dashboard</h2>
                <p className="ao-panel-desc">
                  Live stats, play controls, and match history.
                </p>
              </div>
            </div>
            <div className="ao-panel-body">
              <AgentDashboard />
            </div>
          </section>

          <section className="ao-panel ao-panel-deploy">
            <div className="ao-panel-head">
              <div>
                <h2 className="ao-panel-title">Deploy & verify</h2>
                <p className="ao-panel-desc">
                  Create a new agent or finish GoodDollar verification.
                </p>
              </div>
            </div>
            <div className="ao-panel-body ao-agents-widget">
              <GoodAgentWidget mode="onboard" wallet={wallet} config={config} />
            </div>
          </section>
        </div>
      </div>
    </main>
      </div>
    </div>
  );
}
