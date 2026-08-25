"use client";

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

export default function AgentsPage() {
  const wallet = useGoodAgentWallet();
  const config = useGoodAgentWidgetConfig();

  return (
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
  );
}
