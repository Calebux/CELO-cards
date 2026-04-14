"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { useAccount } from "wagmi";
import { formatAddress } from "../lib/minipay";
import { WagerModal } from "../components/WagerModal";

const BG_IMAGE = "/new addition/gameplay landing page.webp";

type MatchType = "casual" | "ranked" | "tourney";

export default function CreateMatch() {
  const [matchType, setMatchType] = useState<MatchType>("ranked");
  const [copied, setCopied] = useState(false);
  const [showWager, setShowWager] = useState(false);
  const router = useRouter();
  const resetMatch = useGameStore((s) => s.resetMatch);
  const setPlayerRole = useGameStore((s) => s.setPlayerRole);

  const { address } = useAccount();

  const handleCreateMatch = () => {
    resetMatch();
    setPlayerRole("host");
    if (address) {
      setShowWager(true);
    } else {
      router.push("/ready");
    }
  };

  const handleWagerDone = () => {
    setShowWager(false);
    router.push("/ready");
  };

  return (
    <div
      className="relative w-full min-h-screen overflow-hidden"
      style={{ backgroundColor: "#0a060e", fontFamily: "'Space Grotesk', sans-serif" }}
    >
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src={BG_IMAGE}
          alt=""
          className="w-full h-full object-cover pointer-events-none"
        />
      </div>

      {/* Logo */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
        style={{ top: "-13px", width: "350px", height: "200px" }}
      >
        <div style={{ fontWeight: 900, fontSize: 30, lineHeight: "1.1", letterSpacing: "-1px", color: "#b9e7f4", textAlign: "center", textShadow: "0 0 24px rgba(185,231,244,0.5)", textTransform: "uppercase" }}>ACTION<br/>ORDER</div>
      </div>

      {/* Wallet Identity (top right) */}
      <div
        className="absolute flex items-center rounded-lg border border-[#222f42] p-[9px]"
        style={{
          top: "calc(50% - 353.5px)",
          left: "1200px",
          transform: "translateY(-50%)",
          backdropFilter: "blur(6px)",
          backgroundColor: "#b9e7f4",
        }}
      >
        <div className="flex flex-col items-end" style={{ width: "127px" }}>
          <span
            className="text-black font-bold text-right uppercase tracking-[1px]"
            style={{ fontSize: "10px", lineHeight: "10px" }}
          >
            Celo Wallet
          </span>
          <span
            className="text-black font-medium text-right"
            style={{ fontSize: "14px", lineHeight: "20px" }}
          >
            {address ? formatAddress(address) : "Not connected"}
          </span>
          {address && (
            <button
              onClick={() => {
                void navigator.clipboard.writeText(address).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="flex items-center gap-[3px] mt-[2px] cursor-pointer"
              title={address}
            >
              <span className="text-[#222f42] font-mono text-right" style={{ fontSize: "8px" }}>
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
              <span className="material-icons text-[#222f42]" style={{ fontSize: "9px" }}>
                {copied ? "check" : "content_copy"}
              </span>
            </button>
          )}
        </div>
        <div className="relative ml-4 shrink-0">
          <div
            className="relative rounded border-2 border-[#222f42] overflow-hidden flex items-center justify-center"
            style={{ width: "40px", height: "40px", backgroundColor: "#1e293b" }}
          >
            <span className="material-icons" style={{ color: "#94a3b8", fontSize: 22 }}>person</span>
          </div>
          <div
            className="absolute -bottom-1 -right-1 rounded-full border-2 border-[#0a060e]"
            style={{ width: "12px", height: "12px", backgroundColor: address ? "#4ade80" : "#6b7280" }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center px-3"
        style={{ top: "calc(50% + 29.75px)", width: "960px" }}
      >
        {/* Container with corner accents */}
        <div className="relative flex flex-col gap-6 items-start" style={{ width: "504px" }}>
          {/* Corner accents */}
          <div className="absolute border-t-[1.5px] border-l-[1.5px] border-[#b9e7f4]" style={{ top: "-12px", left: "-12px", width: "36px", height: "36px" }} />
          <div className="absolute border-t-[1.5px] border-r-[1.5px] border-[#b9e7f4]" style={{ top: "-12px", right: "-12px", width: "36px", height: "36px" }} />
          <div className="absolute border-b-[1.5px] border-l-[1.5px] border-[#b9e7f4]" style={{ bottom: "-12px", left: "-12px", width: "36px", height: "36px" }} />
          <div className="absolute border-b-[1.5px] border-r-[1.5px] border-[#b9e7f4]" style={{ bottom: "-12px", right: "-12px", width: "36px", height: "36px" }} />

          {/* Central Config Panel */}
          <div
            className="relative w-full rounded-[6px] border-[2.4px] border-[#b9e7f4] overflow-hidden"
            style={{
              backdropFilter: "blur(4.5px)",
              backgroundColor: "rgba(15,23,42,0.4)",
              padding: "38.4px",
            }}
          >
            <div className="absolute top-[-1.65px] left-[-1.65px] right-[-1.65px] bg-[#56a4cb]" style={{ height: "1.5px" }} />

            <div className="flex flex-col gap-[30px] items-start w-full">
              <div className="w-full flex flex-col gap-[6px] items-center">
                <h2
                  className="text-[#f1f5f9] font-bold text-center uppercase tracking-[4.5px]"
                  style={{ fontSize: "22.5px", lineHeight: "27px" }}
                >
                  Initiate Match Sequence
                </h2>
                <div className="rounded-full bg-[#222f42]" style={{ width: "72px", height: "3px" }} />
              </div>

              <div className="flex flex-col gap-6 items-start w-full">
                {/* Match Type Selector */}
                <div className="flex flex-col gap-3 items-start w-full">
                  <label className="text-white font-bold uppercase tracking-[2.7px]" style={{ fontSize: "9px", lineHeight: "12px" }}>
                    Select Match Type
                  </label>
                  <div className="flex gap-3 items-start w-full">
                    {([
                      { key: "casual" as MatchType, icon: "sports_esports", label: "Casual", sub: "No Stakes" },
                      { key: "ranked" as MatchType, icon: "military_tech", label: "Ranked", sub: "Earn Points", popular: true },
                      { key: "tourney" as MatchType, icon: "emoji_events", label: "Tourney", sub: "Bracketed" },
                    ]).map((mt) => (
                      <div key={mt.key} className="relative flex-1">
                        <button
                          onClick={() => setMatchType(mt.key)}
                          className={`w-full flex flex-col items-center py-[18.75px] ko-btn transition-all ${matchType === mt.key ? "ko-btn-secondary active" : "ko-btn-secondary"}`}
                        >
                          <span className={`material-icons mb-2 ko-btn-icon ${matchType === mt.key ? "text-[#222f42]" : "text-[#56a4cb]"}`} style={{ fontSize: "22.5px" }}>
                            {mt.icon}
                          </span>
                          <span className={`font-bold uppercase tracking-[1.05px] ko-btn-text ${matchType === mt.key ? "text-black" : "text-[#f1f5f9]"}`} style={{ fontSize: "10.5px", lineHeight: "15px" }}>
                            {mt.label}
                          </span>
                          <span className={`uppercase mt-[3px] ${matchType === mt.key ? "text-[rgba(0,0,0,0.8)]" : "text-[#94a3b8]"}`} style={{ fontSize: "7.5px", lineHeight: "11.25px" }}>
                            {mt.sub}
                          </span>
                        </button>
                        {mt.popular && (
                          <div className="absolute left-1/2 -translate-x-1/2 bg-[#222f42] rounded-[3px] px-[6px] py-[1.5px]" style={{ top: "-9px" }}>
                            <span className="text-[#f1f5f9] font-bold uppercase text-center" style={{ fontSize: "7.5px", lineHeight: "11.25px" }}>Popular</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Deck Selection + Server Region */}
                <div className="flex gap-[18px] items-start w-full" style={{ height: "67.5px" }}>
                  <div className="flex-1 flex flex-col gap-[6px] items-start self-stretch">
                    <label className="text-white font-bold uppercase tracking-[0.9px]" style={{ fontSize: "9px", lineHeight: "12px" }}>Deck Selection</label>
                    <div className="flex items-center justify-between w-full rounded-[6px] border-[0.75px] border-[#56a4cb] p-[9.75px] cursor-pointer" style={{ backgroundColor: "rgba(30,41,59,0.5)" }}>
                      <div className="flex items-center">
                        <div className="rounded-[3px] border-[0.75px] border-[#b9e7f4] shrink-0 bg-[#334155]" style={{ width: "24px", height: "30px" }} />
                        <div className="flex flex-col items-start pl-[9px]">
                          <span className="text-[#f1f5f9] font-medium" style={{ fontSize: "10.5px", lineHeight: "15px" }}>Void Walkers v.2</span>
                          <span className="text-white" style={{ fontSize: "7.5px", lineHeight: "11.25px" }}>10 Cards • SR Rare</span>
                        </div>
                      </div>
                      <span className="material-icons text-white" style={{ fontSize: "10.5px" }}>expand_more</span>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col gap-[6px] items-start self-stretch">
                    <label className="text-white font-bold uppercase tracking-[0.9px]" style={{ fontSize: "9px", lineHeight: "12px" }}>Server Region</label>
                    <div className="flex items-center justify-between w-full rounded-[6px] border-[0.75px] border-[#56a4cb] p-[9.75px] cursor-pointer" style={{ backgroundColor: "rgba(30,41,59,0.5)" }}>
                      <div className="flex items-center">
                        <span className="material-icons text-[#56a4cb]" style={{ fontSize: "13.5px" }}>language</span>
                        <span className="text-[#f1f5f9] font-medium uppercase tracking-[-0.525px] pl-[9px]" style={{ fontSize: "10.5px", lineHeight: "15px" }}>Automatic (24ms)</span>
                      </div>
                      <span className="material-icons text-white" style={{ fontSize: "10.5px" }}>expand_more</span>
                    </div>
                  </div>
                </div>

                {/* Create Match Button */}
                <div className="flex flex-col gap-3 items-start w-full pt-[18px]">
                  <button
                    onClick={handleCreateMatch}
                    className="flex w-full py-[15px] ko-btn ko-btn-primary animate-pulse"
                    style={{ animationDuration: "3s" }}
                  >
                    <span className="material-icons text-white ko-btn-icon" style={{ fontSize: "18px" }}>radar</span>
                    <span className="text-white font-bold uppercase tracking-[6px] pl-3 ko-btn-text" style={{ fontSize: "15px", lineHeight: "21px" }}>
                      Create Match
                    </span>
                    <span className="material-icons text-white pl-3 ko-btn-icon" style={{ fontSize: "18px" }}>radar</span>
                  </button>
                  <p className="text-white text-center uppercase tracking-[1.5px] w-full" style={{ fontSize: "7.5px", lineHeight: "11.25px" }}>
                    Establishing secure connection on Celo...
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Stats */}
          <div className="flex gap-3 items-start w-full" style={{ height: "53.25px" }}>
            {[
              { label: "Active Players", value: "12,408" },
              { label: "Live Lobbies", value: "1,102" },
              { label: "Avg Queue", value: "14s" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex-1 flex flex-col items-center justify-center rounded-[3px] border-[1.5px] border-[#b9e7f4] p-[10.5px] self-stretch"
                style={{ backgroundColor: "rgba(15,23,42,0.6)" }}
              >
                <span className="text-[#f5f5f5] font-bold uppercase tracking-[0.75px] text-center" style={{ fontSize: "7.5px", lineHeight: "11.25px" }}>
                  {stat.label}
                </span>
                <span className="text-white font-bold text-center" style={{ fontSize: "13.5px", lineHeight: "21px" }}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showWager && (
        <WagerModal
          onConfirmed={handleWagerDone}
          onSkip={handleWagerDone}
        />
      )}
    </div>
  );
}
