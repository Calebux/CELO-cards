"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MiniPayImage } from './components/MiniPayImage';
import { useMiniPayMode } from './lib/premiumPayments';
import { DESIGN_W, DESIGN_H } from './lib/designConstants';
import { GameLoadingScreen } from './components/GameLoadingScreen';
import { useGameStore } from './lib/gameStore';

const HowToPlayModal = dynamic(() => import('./components/HowToPlayModal').then(m => ({ default: m.HowToPlayModal })), { ssr: false });
const LandingProgressBadge = dynamic(() => import('./components/LandingProgressBadge').then(m => ({ default: m.LandingProgressBadge })), { ssr: false });

type LandingWalletHudComponent = React.ComponentType<{ isMiniPay: boolean }>;
type LandingSeasonPassButtonComponent = React.ComponentType<{ isCompact: boolean; isMiniPay: boolean }>;

export default function ActionOrderLandingPage() {
  const isMp = useMiniPayMode();
  const hasSeenTutorial = useGameStore((s) => s.hasSeenTutorial);
  const setHasSeenTutorial = useGameStore((s) => s.setHasSeenTutorial);
  const playerAddress = useGameStore((s) => s.playerAddress);
  const playerName = useGameStore((s) => s.playerName);
  const [isMobile, setIsMobile] = useState(false);
  const isCompact = isMp || isMobile;
  const [showDeferredWalletUi, setShowDeferredWalletUi] = useState(false);
  const [LandingWalletHudComponent, setLandingWalletHudComponent] = useState<LandingWalletHudComponent | null>(null);
  const [LandingSeasonPassButtonComponent, setLandingSeasonPassButtonComponent] = useState<LandingSeasonPassButtonComponent | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [howToPlayVariant, setHowToPlayVariant] = useState<"quickstart" | "full">("full");
  const tournamentPrizeDisplay = "100 USDT";
  const tournamentPrizeLabel = "POOL PRIZE";
  const tournamentRewardCopy = "Beat our House AI in the full 5/5 streak to claim from the 100 USDT pool prize.";

  const [showLoader, setShowLoader] = useState(false);
  const handleLoaded = () => {
    sessionStorage.setItem('ao-loaded', '1');
    setShowLoader(false);
  };

  useEffect(() => {
    // < 768 targets phones only — iPads start at 768px and should use the desktop layout
    setIsMobile(window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent));
    // Only show the loading screen inside real MiniPay.
    // PageSpeed mobile simulation uses a 375px viewport but does NOT inject
    // window.ethereum.isMiniPay, so the 2.2s loader never blocks LCP on PageSpeed tests.
    const inMiniPay = !!(window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay;
    if (inMiniPay && !sessionStorage.getItem('ao-loaded')) setShowLoader(true);
  }, []);

  useEffect(() => {
    type IdleWindow = Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const idleWindow = window as IdleWindow;
    let cancelled = false;
    const show = () => {
      void Promise.all([
        import('./components/LandingWalletHud'),
        import('./components/LandingSeasonPassButton'),
      ]).then(([walletHud, seasonPass]) => {
        if (cancelled) return;
        setLandingWalletHudComponent(() => walletHud.LandingWalletHud);
        setLandingSeasonPassButtonComponent(() => seasonPass.LandingSeasonPassButton);
        setShowDeferredWalletUi(true);
      }).catch(() => {});
    };

    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(show, { timeout: 1800 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(handle);
      };
    }

    const timeout = window.setTimeout(show, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    // The root layout already computes --ao-tr before first paint. Only
    // do one deferred correction plus later viewport updates. MiniPay's
    // WebView can settle to its final size after the prepaint script runs.
    if (showLoader) return;
    const scale = () => {
      const viewport = window.visualViewport;
      const vw = viewport?.width ?? window.innerWidth;
      const vh = viewport?.height ?? window.innerHeight;
      const isPortrait = vh > vw;
      let transform: string;
      if (isPortrait) {
        const s = Math.min(vw / DESIGN_H, vh / DESIGN_W);
        const tx = vw / 2 + (DESIGN_H * s) / 2;
        const ty = vh / 2 - (DESIGN_W * s) / 2;
        transform = `translate(${tx}px, ${ty}px) rotate(90deg) scale(${s})`;
      } else {
        const s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
        const tx = (vw - DESIGN_W * s) / 2;
        const ty = (vh - DESIGN_H * s) / 2;
        transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      }
      document.documentElement.style.setProperty("--ao-tr", transform);
    };
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scale);
    });
    const viewport = window.visualViewport;
    window.addEventListener("resize", scale);
    window.addEventListener("orientationchange", scale);
    viewport?.addEventListener("resize", scale);
    viewport?.addEventListener("scroll", scale);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", scale);
      window.removeEventListener("orientationchange", scale);
      viewport?.removeEventListener("resize", scale);
      viewport?.removeEventListener("scroll", scale);
    };
  }, [showLoader]);

  useEffect(() => {
    if (showLoader || hasSeenTutorial) return;
    if (playerAddress && !playerName) return;
    const timeout = window.setTimeout(() => {
      setHowToPlayVariant("quickstart");
      setShowHowToPlay(true);
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [hasSeenTutorial, playerAddress, playerName, showLoader]);

  useEffect(() => {
    if (playerAddress && !playerName && showHowToPlay) {
      setShowHowToPlay(false);
    }
  }, [playerAddress, playerName, showHowToPlay]);

  if (showLoader) return <GameLoadingScreen onDone={handleLoaded} />;

  return (
    <>
      <style>{`
        .ko-land-page-wrapper {
          width: 1440px;
          height: 823px;
          overflow: hidden;
          font-family: var(--font-ruda, 'Ruda'), sans-serif;
          background: #0a0f1c;
          margin: 0 auto;
          position: relative;
        }
        .ko-land-page-wrapper *, .ko-land-page-wrapper *::before, .ko-land-page-wrapper *::after {
          box-sizing: border-box; margin: 0; padding: 0;
        }
        .ko-land-page {
          position: relative; width: 1440px; height: 823px;
          background: #0a0f1c; overflow: hidden;
        }
        .ko-bg-image {
          position: absolute; top: 0; left: 0;
          width: 1440px; height: 823px;
          object-fit: cover; pointer-events: none; z-index: 0;
        }

        /* ── Nav buttons ──────────────────────────────── */
        .ko-nav-btn {
          position: absolute; display: flex; align-items: center; gap: 12px;
          height: 44px; width: 180px; padding: 0 16px; z-index: 15;
          cursor: pointer; text-decoration: none;
          background: rgba(15,23,42,0.85); border: 1px solid rgba(86,164,203,0.3);
          border-radius: 6px; transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
          backdrop-filter: blur(8px);
          clip-path: polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%);
        }
        .ko-nav-btn::before {
          content: ''; position: absolute; top:0;left:0;right:0;bottom:0;
          background: linear-gradient(90deg,transparent,rgba(86,164,203,0.1),transparent);
          transform: translateX(-100%); transition: 0.5s;
        }
        .ko-nav-btn:hover::before { transform: translateX(100%); }
        .ko-nav-btn:hover {
          border-color: rgba(86,164,203,0.8); background: rgba(30,41,59,0.9);
          transform: translateX(8px); box-shadow: -4px 0 15px rgba(86,164,203,0.15);
        }
        .ko-nav-btn.ko-btn-create {
          background: linear-gradient(135deg,rgba(34,47,66,0.95),rgba(86,164,203,0.25));
          border: 1.5px solid #56a4cb;
          box-shadow: 0 0 15px rgba(86,164,203,0.4), inset 0 0 20px rgba(86,164,203,0.1);
        }
        .ko-nav-btn.ko-btn-create:hover {
          box-shadow: 0 0 20px rgba(86,164,203,0.6), inset 0 0 30px rgba(86,164,203,0.2);
        }
        .ko-nav-btn .ko-btn-icon {
          width: 18px; height: 18px; fill: none; stroke: currentColor;
          stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
          flex-shrink: 0; z-index: 1; opacity: 0.9; transition: all 0.3s ease;
        }
        .ko-nav-btn .ko-btn-label {
          position: relative; z-index: 1; font-size: 13px; font-weight: 700;
          white-space: nowrap; letter-spacing: 1.5px; transition: all 0.3s ease;
        }
        .ko-btn-create { left: 40px; top: 260px; }
        .ko-btn-create .ko-btn-label { color: #fff; }
        .ko-btn-create .ko-btn-icon  { color: #fff; }
        .ko-btn-join        { left: 40px; top: 316px; }
        .ko-btn-tournament  { left: 40px; top: 372px; }
        .ko-btn-leaderboard { left: 40px; top: 428px; }
        .ko-btn-profile     { left: 40px; top: 484px; }
        .ko-btn-join .ko-btn-label,
        .ko-btn-tournament .ko-btn-label,
        .ko-btn-leaderboard .ko-btn-label,
        .ko-btn-profile .ko-btn-label { color: #b9e7f4; opacity: 0.8; }
        .ko-btn-join .ko-btn-icon,
        .ko-btn-tournament .ko-btn-icon,
        .ko-btn-leaderboard .ko-btn-icon,
        .ko-btn-profile .ko-btn-icon { color: #56a4cb; }
        .ko-nav-btn:hover .ko-btn-label { opacity: 1; text-shadow: 0 0 8px rgba(185,231,244,0.4); }
        .ko-nav-btn:hover .ko-btn-icon  { transform: scale(1.1); filter: drop-shadow(0 0 4px rgba(86,164,203,0.8)); }

        .ko-land-page-wrapper.ko-minipay .ko-nav-btn {
          height: 70px;
          width: 256px;
          padding: 0 22px;
          gap: 16px;
          border-width: 1.5px;
        }
        .ko-land-page-wrapper.ko-minipay .ko-nav-btn .ko-btn-icon {
          width: 24px;
          height: 24px;
        }
        .ko-land-page-wrapper.ko-minipay .ko-nav-btn .ko-btn-label {
          font-size: 18px;
          letter-spacing: 2px;
        }
        .ko-land-page-wrapper.ko-minipay .ko-btn-create { left: 36px; top: 236px; }
        .ko-land-page-wrapper.ko-minipay .ko-btn-join { display: none; }
        .ko-land-page-wrapper.ko-minipay .ko-btn-tournament { left: 36px; top: 318px; }
        .ko-land-page-wrapper.ko-minipay .ko-btn-leaderboard { left: 36px; top: 400px; }
        .ko-land-page-wrapper.ko-minipay .ko-btn-profile { left: 36px; top: 482px; }

        .ko-land-page-wrapper.ko-mobile .ko-nav-btn {
          height: 70px;
          width: 256px;
          padding: 0 22px;
          gap: 16px;
          border-width: 1.5px;
        }
        .ko-land-page-wrapper.ko-mobile .ko-nav-btn .ko-btn-icon {
          width: 24px;
          height: 24px;
        }
        .ko-land-page-wrapper.ko-mobile .ko-nav-btn .ko-btn-label {
          font-size: 18px;
          letter-spacing: 2px;
        }
        .ko-land-page-wrapper.ko-mobile .ko-btn-create { left: 36px; top: 236px; }
        .ko-land-page-wrapper.ko-mobile .ko-btn-join { left: 36px; top: 318px; }
        .ko-land-page-wrapper.ko-mobile .ko-btn-tournament { left: 36px; top: 400px; }
        .ko-land-page-wrapper.ko-mobile .ko-btn-leaderboard { left: 36px; top: 482px; }
        .ko-land-page-wrapper.ko-mobile .ko-btn-profile { left: 36px; top: 564px; }
        .ko-land-page-wrapper.ko-mobile.ko-minipay .ko-btn-join { display: none; }
        .ko-land-page-wrapper.ko-mobile.ko-minipay .ko-btn-tournament { top: 318px; }
        .ko-land-page-wrapper.ko-mobile.ko-minipay .ko-btn-leaderboard { top: 400px; }
        .ko-land-page-wrapper.ko-mobile.ko-minipay .ko-btn-profile { top: 482px; }

        /* ── Points badge ─────────────────────────────── */
        .ko-points-badge {
          position: absolute; left: 40px; top: 596px;
          min-width: 180px; height: 44px; z-index: 15;
          display: flex; align-items: center; gap: 10px; padding: 0 16px;
          background: linear-gradient(135deg,rgba(15,23,42,0.9),rgba(168,85,247,0.15));
          border: 1px solid rgba(168,85,247,0.45); border-radius: 6px;
          backdrop-filter: blur(8px);
          clip-path: polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%);
        }
        .ko-points-badge .ko-points-label {
          font-size: 8px; font-weight: 700; letter-spacing: 1.5px;
          color: rgba(168,85,247,0.8); text-transform: uppercase; line-height: 1;
        }
        .ko-points-badge .ko-points-value {
          font-size: 15px; font-weight: 800; color: #fff;
          letter-spacing: 1px; line-height: 1.2; text-shadow: 0 0 12px rgba(168,85,247,0.6);
        }
        .ko-land-page-wrapper.ko-minipay .ko-points-badge {
          min-width: 220px;
          height: 54px;
          padding: 0 18px;
        }
        .ko-land-page-wrapper.ko-minipay .ko-points-badge .ko-points-label { font-size: 9px; }
        .ko-land-page-wrapper.ko-minipay .ko-points-badge .ko-points-value { font-size: 18px; }

        /* ── Scrollbar (cosmetic) ─────────────────────── */
        .ko-scrollbar-track {
          position: absolute; left: 1375px; top: 225px;
          width: 5px; height: 373px; background: #1f2c44; border-radius: 4px; z-index: 10;
        }
        .ko-scrollbar-thumb {
          position: absolute; left: 1375px; top: 225px;
          width: 5px; height: 82px; background: #60a5ce; border-radius: 4px; z-index: 11;
        }

        /* ── News card titles ─────────────────────────── */
        .ko-news-card img.ko-card-img {
          width: 100%; aspect-ratio: 16/9; object-fit: cover;
          border: 1.5px solid rgba(86,164,203,0.5); display: block; border-radius: 4px;
        }
        .ko-news-card .ko-card-title {
          margin-top: 8px; font-size: 13px; font-weight: 700;
          color: #fff; line-height: 1.35; letter-spacing: 0.3px;
        }
        .ko-land-page-wrapper.ko-minipay .ko-news-card .ko-card-title {
          margin-top: 10px;
          font-size: 15px;
          line-height: 1.4;
        }

        /* ── Social buttons ───────────────────────────── */
        .ko-social-btn {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 16px; border-radius: 6px;
          background: rgba(15,23,42,0.85); border: 1px solid rgba(86,164,203,0.25);
          backdrop-filter: blur(8px); text-decoration: none;
          transition: all 0.25s ease; color: #b9e7f4;
          font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
          clip-path: polygon(0 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%);
        }
        .ko-social-btn:hover {
          border-color: rgba(86,164,203,0.7); background: rgba(30,41,59,0.9);
          box-shadow: 0 0 12px rgba(86,164,203,0.2);
        }
        .ko-social-btn svg { width:15px; height:15px; fill:none; stroke:#56a4cb; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; flex-shrink:0; }
        .ko-land-page-wrapper.ko-minipay .ko-social-btn {
          padding: 12px 18px;
          font-size: 14px;
          gap: 10px;
        }
        .ko-land-page-wrapper.ko-minipay .ko-social-btn svg {
          width: 18px;
          height: 18px;
        }

        /* ── Tournament CTA pulse ─────────────────────── */
        @keyframes ko-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(86,164,203,0.4); }
          50%      { box-shadow: 0 0 0 8px rgba(86,164,203,0); }
        }
        @keyframes ko-dot-pulse {
          0%,100% { opacity:1; } 50% { opacity:0.4; }
        }
        @keyframes ko-tournament-blink {
          0%,100% { box-shadow: 0 0 18px rgba(251,204,92,0.5), 0 0 40px rgba(251,204,92,0.2); border-color: rgba(251,204,92,0.9); }
          50%     { box-shadow: 0 0 6px rgba(251,204,92,0.2), 0 0 12px rgba(251,204,92,0.05); border-color: rgba(251,204,92,0.4); }
        }
      `}</style>

      <div style={{ width:"100vw", height:"100vh", overflow:"hidden", position:"fixed", backgroundColor:"#0a0f1c" }}>
        <div className={`ko-land-page-wrapper${isMp ? " ko-minipay" : ""}${isMobile ? " ko-mobile" : ""}`} style={{ position:"absolute", top:0, left:0, transformOrigin:"top left", transform:"var(--ao-tr)" }}>
          <div className="ko-land-page">

            {/* LCP hero — serve the already-optimized WebP directly to avoid image optimizer overhead on first paint. */}
            <img className="ko-bg-image" src="/new-assets/landing-hero.webp" alt="background" loading="eager" decoding="async" fetchPriority="high" />
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(to right, rgba(5,8,18,0.82) 0%, rgba(5,8,18,0.22) 22%, rgba(5,8,18,0.22) 78%, rgba(5,8,18,0.82) 100%)", zIndex:1, pointerEvents:"none" }} />
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, rgba(5,8,18,0.85) 0%, transparent 12%, transparent 82%, rgba(5,8,18,0.9) 100%)", zIndex:1, pointerEvents:"none" }} />

            {/* ── Top Bar ──────────────────────────────────────────── */}
            <div style={{ position:"absolute", top:0, left:0, width:"100%", height:isMp ? 74 : 62, display:"flex", alignItems:"center", justifyContent:"space-between", padding:isMp ? "0 34px" : "0 40px", borderBottom:"1px solid rgba(86,164,203,0.12)", background:"linear-gradient(to bottom, rgba(5,8,18,0.92) 0%, rgba(5,8,18,0) 100%)", zIndex:20 }}>

              {/* Left: branding */}
              <div style={{ display:"flex", alignItems:"center", gap:isMp ? 14 : 12 }}>
                <div style={{ width:isMp ? 4 : 3, height:isMp ? 30 : 24, background:"#56a4cb", borderRadius:2, boxShadow:"0 0 8px #56a4cb" }} />
                <div>
                  <div style={{ fontSize:isMp ? 10 : 9, fontWeight:700, letterSpacing:isMp ? 3.2 : 3, color:"#56a4cb", textTransform:"uppercase", lineHeight:1 }}>ACTION ORDER</div>
                  <div style={{ fontSize:isMp ? 12 : 11, fontWeight:500, letterSpacing:1.5, color:"rgba(185,231,244,0.5)", textTransform:"uppercase", lineHeight:1.4 }}>On-Chain Fighting Game</div>
                </div>
              </div>

              {/* Center: live season badge — absolutely centered */}
              <div style={{ position:"absolute", left:"50%", transform:"translateX(-50%)", display:"flex", alignItems:"center", gap:isMp ? 10 : 8, padding:isMp ? "8px 22px" : "6px 18px", border:"1px solid rgba(86,164,203,0.28)", borderRadius:4, background:"rgba(86,164,203,0.07)" }}>
                <div style={{ width:isMp ? 7 : 6, height:isMp ? 7 : 6, borderRadius:"50%", background:"#4ade80", boxShadow:"0 0 6px #4ade80", animation:"ko-dot-pulse 2s ease-in-out infinite" }} />
                <span style={{ fontSize:isMp ? 11 : 10, fontWeight:700, letterSpacing:isMp ? 2.2 : 2, color:"#b9e7f4", textTransform:"uppercase" }}>SEASON 2 · RISE OF THE AGENTS · LIVE</span>
              </div>

              {/* Right: wallet */}
              <div style={{ width: isMp ? 320 : 220, height: isMp ? 54 : 40 }} />
            </div>
            {showDeferredWalletUi && LandingWalletHudComponent ? <LandingWalletHudComponent isMiniPay={isMp} /> : null}

            {/* ── Tournament Live Banner — centered, blinking ───────── */}
            <a href="/tournament" style={{
              position:"absolute", left:"50%", transform:"translateX(-50%)", top:isMp ? 186 : 200, zIndex:15,
              display:"flex", alignItems:"center", gap:isMp ? 18 : 16, padding:isMp ? "16px 32px" : "14px 28px",
              background:"linear-gradient(135deg, rgba(15,12,5,0.92), rgba(40,30,5,0.88))",
              border:"1.5px solid rgba(251,204,92,0.8)", borderRadius:8,
              textDecoration:"none", whiteSpace:"nowrap",
              animation:"ko-tournament-blink 1.4s ease-in-out infinite",
            }}>
              <span style={{ fontSize:isMp ? 24 : 22 }}>🏆</span>
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                <span style={{ fontSize:isMp ? 11 : 10, fontWeight:800, letterSpacing:3, color:"#fbbf24", textTransform:"uppercase", lineHeight:1 }}>HOUSE BOSS LIVE</span>
                <span style={{ fontSize:isMp ? 22 : 20, fontWeight:900, letterSpacing:-0.5, color:"#fff", lineHeight:1 }}>{tournamentPrizeDisplay} <span style={{ color:"#4ade80", fontSize:isMp ? 14 : 13, fontWeight:700, letterSpacing:1 }}>{tournamentPrizeLabel}</span></span>
              </div>
              <div style={{ width:1, height:isMp ? 36 : 32, background:"rgba(251,204,92,0.25)" }} />
              <span style={{ fontSize:isMp ? 12 : 11, fontWeight:700, letterSpacing:2, color:"#fbbf24", textTransform:"uppercase" }}>BEAT THE HOUSE →</span>
            </a>

            {/* ── Match Resume Banner ──────────────────────────────── */}
            {/* ── Left Nav ─────────────────────────────────────────── */}
            <a className="ko-nav-btn ko-btn-create" href="/create">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              <span className="ko-btn-label">CREATE MATCH</span>
            </a>

            {!isMp && (
            <a className="ko-nav-btn ko-btn-join" href="/join">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span className="ko-btn-label">JOIN MATCH</span>
            </a>
            )}

            <a className="ko-nav-btn ko-btn-tournament" href="/tournament">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
                <span className="ko-btn-label">HOUSE EVENT</span>
            </a>

            <a className="ko-nav-btn ko-btn-leaderboard" href="/leaderboard">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
              <span className="ko-btn-label">LEADERBOARD</span>
            </a>

            <a className="ko-nav-btn ko-btn-profile" href="/profile">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              <span className="ko-btn-label">PROFILE</span>
            </a>

            <LandingProgressBadge isCompact={isCompact} />

            {/* ── Centre: CTA ───────────────────────────────────────── */}
            <div style={{ position:"absolute", left:"50%", transform:"translateX(-50%)", top:726, zIndex:15, display:"flex", flexDirection:"column", alignItems:"center", gap:isCompact ? 12 : 10 }}>
              <div style={{ display:"flex", gap:isCompact ? 16 : 12 }}>
                <a href="/black-market" style={{
                  display:"flex", alignItems:"center", justifyContent:"center", gap:isCompact ? 12 : 8, padding:isCompact ? "15px 30px" : "10px 24px",
                  background:"linear-gradient(135deg,rgba(34,47,66,0.95),rgba(239,68,68,0.3))",
                  border:"1.5px solid #ef4444", borderRadius:6, textDecoration:"none",
                  color:"#fff", fontSize:isCompact ? 17 : 13, fontWeight:800, letterSpacing:2, textTransform:"uppercase",
                  boxShadow:"0 0 20px rgba(239,68,68,0.35)", animation:"ko-pulse 2.5s ease-in-out infinite",
                  clipPath:"polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)",
                  whiteSpace:"nowrap", lineHeight:1,
                }}>
                  <svg width={isCompact ? 18 : 16} height={isCompact ? 18 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                  BLACK MARKET
                </a>
                {showDeferredWalletUi && LandingSeasonPassButtonComponent ? (
                  <LandingSeasonPassButtonComponent isCompact={isCompact} isMiniPay={isMp} />
                ) : (
                  <div
                    style={{
                      display:"flex", alignItems:"center", justifyContent:"center", gap:isCompact ? 12 : 8, padding:isCompact ? "15px 30px" : "10px 24px",
                      background:"linear-gradient(135deg, rgba(40,28,5,0.95), rgba(80,55,0,0.88))",
                      border:"1.5px solid rgba(251,204,92,0.85)", borderRadius:6,
                      color:"#fbbf24", fontSize:isCompact ? 17 : 13, fontWeight:800, letterSpacing:2, textTransform:"uppercase",
                      clipPath:"polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)",
                      opacity: 0.8, whiteSpace:"nowrap", lineHeight:1,
                    }}
                  >
                    ⚡ SEASON PASS
                  </div>
                )}
                <button onClick={() => {
                  setHowToPlayVariant("full");
                  setShowHowToPlay(true);
                }} style={{
                  display:"flex", alignItems:"center", justifyContent:"center", gap:isCompact ? 12 : 8, padding:isCompact ? "15px 26px" : "10px 20px",
                  background:"rgba(15,23,42,0.85)", border:"1px solid rgba(86,164,203,0.35)",
                  borderRadius:6, cursor:"pointer", fontFamily:"inherit",
                  color:"#b9e7f4", fontSize:isCompact ? 17 : 13, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase",
                  backdropFilter:"blur(8px)",
                  clipPath:"polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)",
                  whiteSpace:"nowrap", lineHeight:1,
                }}>
                  <svg width={isCompact ? 17 : 14} height={isCompact ? 17 : 14} viewBox="0 0 24 24" fill="none" stroke="#56a4cb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                  HOW TO PLAY
                </button>
              </div>
            </div>

            {/* ── News Panel ───────────────────────────────────────── */}
            {/* Panel container */}
            <div style={{ position:"absolute", left:isMp ? 1068 : 1114, top:isMp ? 172 : 181, width:isMp ? 320 : 274, height:isMp ? 500 : 450, zIndex:10, background:"rgba(10,15,28,0.75)", border:"1px solid rgba(86,164,203,0.2)", borderRadius:6, backdropFilter:"blur(6px)" }} />

            {/* Panel heading */}
            <div style={{ position:"absolute", left:isMp ? 1068 : 1114, top:isMp ? 172 : 181, width:isMp ? 320 : 274, height:isMp ? 42 : 36, zIndex:12, display:"flex", alignItems:"center", gap:8, padding:isMp ? "0 18px" : "0 16px", borderBottom:"1px solid rgba(86,164,203,0.2)", background:"rgba(86,164,203,0.08)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#56a4cb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16M4 2h16"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
              <span style={{ fontSize:isMp ? 12 : 11, fontWeight:700, letterSpacing:2.5, color:"#b9e7f4", textTransform:"uppercase" }}>NEWS</span>
            </div>

            {/* News card 1 */}
            <div className="ko-news-card" style={{ position:"absolute", left:isMp ? 1088 : 1130, top:isMp ? 228 : 232, width:isMp ? 280 : 237, zIndex:15 }}>
              <MiniPayImage className="ko-card-img" src="/new-assets/fighters-energy-sm.webp" alt="Season 1" minipayWidth={420} minipayQuality={75} />
              <div className="ko-card-title">
                <p style={{ color:"#56a4cb", fontSize:isMp ? 11 : 10, letterSpacing:1.5, textTransform:"uppercase", marginBottom:3 }}>LATEST</p>
                <p>SEASON 2: RISE OF THE AGENTS</p>
                <p style={{ color:"#4ade80", fontSize:isMp ? 12 : 11 }}>NOW LIVE!</p>
              </div>
            </div>

            <div style={{ position:"absolute", left:isMp ? 1088 : 1129, top:isMp ? 444 : 419, width:isMp ? 280 : 238, height:1, background:"rgba(86,164,203,0.25)", zIndex:16 }} />

            {/* News card 2 */}
            <div style={{ position:"absolute", left:isMp ? 1088 : 1130, top:isMp ? 460 : 435, width:isMp ? 280 : 237, zIndex:15,
              background:"linear-gradient(135deg, rgba(40,28,5,0.7), rgba(5,20,10,0.7))",
              border:"1px solid rgba(251,204,92,0.3)", borderRadius:6, padding:isMp ? "18px 16px" : "16px 14px" }}>
              <p style={{ color:"#fbbf24", fontSize:isMp ? 10 : 9, fontWeight:800, letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>🏆 HOUSE BOSS LIVE</p>
              <p style={{ color:"#fff", fontSize:isMp ? 18 : 16, fontWeight:900, letterSpacing:-0.5, lineHeight:1.2, marginBottom:6 }}>{tournamentPrizeDisplay}<br/><span style={{ fontSize:isMp ? 12 : 11, fontWeight:700, color:"#b9e7f4", letterSpacing:1 }}>{tournamentPrizeLabel}</span></p>
              <div style={{ height:1, background:"rgba(251,204,92,0.2)", margin:"8px 0" }} />
              <p style={{ color:"#9ca3af", fontSize:isMp ? 12 : 11, lineHeight:1.5, marginBottom:6 }}>{tournamentRewardCopy}</p>
              <p style={{ color:"#4ade80", fontSize:isMp ? 12 : 11, fontWeight:700, letterSpacing:0.5 }}>Beat the 5/5 House streak to qualify →</p>
            </div>

            <div className="ko-scrollbar-track" />
            <div className="ko-scrollbar-thumb" />


          </div>

        </div>
      </div>
      {showHowToPlay && (
        <HowToPlayModal
          isMiniPay={isMp}
          variant={howToPlayVariant}
          onClose={() => {
            if (howToPlayVariant === "quickstart") {
              setHasSeenTutorial(true);
            }
            setShowHowToPlay(false);
          }}
        />
      )}
    </>
  );
}
