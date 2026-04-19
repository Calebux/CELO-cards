"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGameStore } from './lib/gameStore';
import { CHARACTERS } from './lib/gameData';
import { WalletSection } from './components/WalletSection';
import { HowToPlayModal } from './components/HowToPlayModal';

const DESIGN_W = 1440;
const DESIGN_H = 823;

export default function ActionOrderLandingPage() {
  const playerPoints = useGameStore((s) => s.playerPoints);
  const { selectCharacter, startMatch, autoLockOrder } = useGameStore();
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  const handleQuickPlay = useCallback(() => {
    const unlocked = CHARACTERS.filter((c) => !c.isLocked);
    const char = unlocked[Math.floor(Math.random() * unlocked.length)];
    selectCharacter(char);
    startMatch();
    autoLockOrder();
    router.push("/gameplay");
  }, [selectCharacter, startMatch, autoLockOrder, router]);

  useEffect(() => {
    const fetch_ = () => fetch("/api/online").then(r => r.json()).then((d: { online: number }) => setOnlineCount(d.online)).catch(() => {});
    fetch_();
    const id = setInterval(fetch_, 20_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
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
      wrapRef.current.style.transform = transform;
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

  return (
    <>
      <title>Action Order</title>
      <link href="https://fonts.googleapis.com/css2?family=Ruda:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        .ko-land-page-wrapper {
          width: 1440px;
          height: 823px;
          overflow: hidden;
          font-family: 'Ruda', sans-serif;
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
        .ko-btn-community   { left: 40px; top: 428px; }
        .ko-btn-leaderboard { left: 40px; top: 484px; }
        .ko-btn-profile     { left: 40px; top: 540px; }
        .ko-btn-challenges  { left: 40px; top: 596px; }
        .ko-btn-join .ko-btn-label,
        .ko-btn-tournament .ko-btn-label,
        .ko-btn-community .ko-btn-label,
        .ko-btn-leaderboard .ko-btn-label,
        .ko-btn-profile .ko-btn-label { color: #b9e7f4; opacity: 0.8; }
        .ko-btn-join .ko-btn-icon,
        .ko-btn-tournament .ko-btn-icon,
        .ko-btn-community .ko-btn-icon,
        .ko-btn-leaderboard .ko-btn-icon,
        .ko-btn-profile .ko-btn-icon { color: #56a4cb; }
        .ko-nav-btn:hover .ko-btn-label { opacity: 1; text-shadow: 0 0 8px rgba(185,231,244,0.4); }
        .ko-nav-btn:hover .ko-btn-icon  { transform: scale(1.1); filter: drop-shadow(0 0 4px rgba(86,164,203,0.8)); }

        /* ── Points badge ─────────────────────────────── */
        .ko-points-badge {
          position: absolute; left: 40px; top: 596px;
          width: 180px; height: 44px; z-index: 15;
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

        /* ── Tournament CTA pulse ─────────────────────── */
        @keyframes ko-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(86,164,203,0.4); }
          50%      { box-shadow: 0 0 0 8px rgba(86,164,203,0); }
        }
        @keyframes ko-dot-pulse {
          0%,100% { opacity:1; } 50% { opacity:0.4; }
        }
      `}</style>

      <div style={{ width:"100vw", height:"100vh", overflow:"hidden", position:"fixed", backgroundColor:"#0a0f1c" }}>
        <div ref={wrapRef} className="ko-land-page-wrapper" style={{ position:"absolute", top:0, left:0, transformOrigin:"top left" }}>
          <div className="ko-land-page">

            {/* Background */}
            <img className="ko-bg-image" src="/new-assets/landing-hero.png" alt="background" />
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(to right, rgba(5,8,18,0.82) 0%, rgba(5,8,18,0.22) 22%, rgba(5,8,18,0.22) 78%, rgba(5,8,18,0.82) 100%)", zIndex:1, pointerEvents:"none" }} />
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, rgba(5,8,18,0.85) 0%, transparent 12%, transparent 82%, rgba(5,8,18,0.9) 100%)", zIndex:1, pointerEvents:"none" }} />

            {/* ── Top Bar ──────────────────────────────────────────── */}
            <div style={{ position:"absolute", top:0, left:0, width:"100%", height:62, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 40px", borderBottom:"1px solid rgba(86,164,203,0.12)", background:"linear-gradient(to bottom, rgba(5,8,18,0.92) 0%, rgba(5,8,18,0) 100%)", zIndex:20 }}>

              {/* Left: branding */}
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:3, height:24, background:"#56a4cb", borderRadius:2, boxShadow:"0 0 8px #56a4cb" }} />
                <div>
                  <div style={{ fontSize:9, fontWeight:700, letterSpacing:3, color:"#56a4cb", textTransform:"uppercase", lineHeight:1 }}>ACTION ORDER</div>
                  <div style={{ fontSize:11, fontWeight:500, letterSpacing:1.5, color:"rgba(185,231,244,0.5)", textTransform:"uppercase", lineHeight:1.4 }}>On-Chain Fighting Game</div>
                </div>
              </div>

              {/* Center: live season badge */}
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 18px", border:"1px solid rgba(86,164,203,0.28)", borderRadius:4, background:"rgba(86,164,203,0.07)" }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:"#4ade80", boxShadow:"0 0 6px #4ade80", animation:"ko-dot-pulse 2s ease-in-out infinite" }} />
                <span style={{ fontSize:10, fontWeight:700, letterSpacing:2, color:"#b9e7f4", textTransform:"uppercase" }}>SEASON 1 · ORDER ASCENSION · LIVE</span>
              </div>

              {/* Right: wallet */}
              <WalletSection />
            </div>

            {/* ── G$ Claim Banner ──────────────────────────────────── */}
            <Link href="/profile" style={{
              position:"absolute", left:40, top:72, width:180, zIndex:15,
              display:"flex", alignItems:"center", gap:8,
              padding:"7px 14px",
              background:"linear-gradient(135deg, rgba(0,197,142,0.18), rgba(0,197,142,0.06))",
              border:"1px solid rgba(0,197,142,0.5)",
              borderRadius:6, textDecoration:"none",
              boxShadow:"0 0 12px rgba(0,197,142,0.2)",
              animation:"ko-dot-pulse 2.5s ease-in-out infinite",
            }}>
              <span style={{ fontSize:14 }}>🌱</span>
              <div>
                <div style={{ fontSize:8, fontWeight:800, letterSpacing:2, color:"#00C58E", textTransform:"uppercase", lineHeight:1 }}>GOODDOLLAR UBI</div>
                <div style={{ fontSize:10, fontWeight:700, color:"rgba(0,197,142,0.85)", lineHeight:1.4 }}>Claim your G$ →</div>
              </div>
            </Link>

            {/* ── Left Nav ─────────────────────────────────────────── */}
            <Link className="ko-nav-btn ko-btn-create" href="/create">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              <span className="ko-btn-label">CREATE MATCH</span>
            </Link>

            <Link className="ko-nav-btn ko-btn-join" href="/join">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span className="ko-btn-label">JOIN MATCH</span>
            </Link>

            <a className="ko-nav-btn ko-btn-tournament" href="/tournament">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
              <span className="ko-btn-label">TOURNAMENT</span>
            </a>

            <a className="ko-nav-btn ko-btn-community" href="https://t.me/knockorder" target="_blank" rel="noopener noreferrer">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span className="ko-btn-label">COMMUNITY</span>
            </a>

            <Link className="ko-nav-btn ko-btn-leaderboard" href="/leaderboard">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
              <span className="ko-btn-label">LEADERBOARD</span>
            </Link>

            <Link className="ko-nav-btn ko-btn-profile" href="/profile">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              <span className="ko-btn-label">PROFILE</span>
            </Link>

            <Link className="ko-nav-btn ko-btn-challenges" href="/challenges">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4M7 21l5-3 5 3-1.5-5.5L21 9.5l-5.5-.5L13 4l-2 5-5.5.5 4.5 2.5z"/></svg>
              <span className="ko-btn-label">CHALLENGES</span>
            </Link>

            <div className="ko-points-badge" style={{ top: 652 }}>
              <span style={{ fontSize:16, flexShrink:0 }}>⚡</span>
              <div style={{ display:"flex", flexDirection:"column" }}>
                <span className="ko-points-label">Total Points</span>
                <span className="ko-points-value">{playerPoints.toLocaleString()}</span>
              </div>
            </div>

            {/* How to Play button */}
            <button
              onClick={() => setShowHowToPlay(true)}
              style={{
                position:"absolute", left:40, top:708, zIndex:15,
                width:180, height:44,
                display:"flex", alignItems:"center", gap:10, padding:"0 16px",
                background:"rgba(15,23,42,0.75)", border:"1px solid rgba(86,164,203,0.2)",
                borderRadius:6, backdropFilter:"blur(8px)", cursor:"pointer",
                fontFamily:"inherit", textDecoration:"none",
                clipPath:"polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)",
                transition:"all 0.25s",
              }}
            >
              <span style={{ fontSize:18, flexShrink:0 }}>❓</span>
              <span style={{ fontSize:13, fontWeight:700, letterSpacing:1.5, color:"rgba(185,231,244,0.7)", textTransform:"uppercase" }}>HOW TO PLAY</span>
            </button>

            {/* Live player count — bottom right */}
            <div style={{ position:"absolute", right:40, bottom:32, zIndex:15, display:"flex", alignItems:"center", gap:10, padding:"10px 18px", background:"rgba(74,222,128,0.07)", border:"1px solid rgba(74,222,128,0.3)", borderRadius:8, backdropFilter:"blur(8px)" }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:"#4ade80", boxShadow:"0 0 8px #4ade80", animation:"ko-dot-pulse 2s ease-in-out infinite", flexShrink:0 }} />
              <div style={{ display:"flex", flexDirection:"column" }}>
                <span style={{ fontSize:7, fontWeight:700, letterSpacing:2, color:"#4ade80", textTransform:"uppercase", lineHeight:1 }}>Playing Now</span>
                <span style={{ fontSize:18, fontWeight:900, color:"#4ade80", letterSpacing:-0.5, lineHeight:1.4 }}>
                  {onlineCount !== null ? onlineCount.toLocaleString() : "—"}
                </span>
              </div>
            </div>

            {/* ── Centre: Tournament CTA ────────────────────────────── */}
            <div style={{ position:"absolute", left:"50%", transform:"translateX(-50%)", top:640, zIndex:15, display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 14px", background:"rgba(86,164,203,0.1)", border:"1px solid rgba(86,164,203,0.3)", borderRadius:3 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:"#4ade80", animation:"ko-dot-pulse 1.5s ease-in-out infinite" }} />
                <span style={{ fontSize:9, fontWeight:700, letterSpacing:2.5, color:"#56a4cb", textTransform:"uppercase" }}>WEEKLY TOURNAMENT — TOP 16 RANKED PLAYERS</span>
              </div>
              <div style={{ display:"flex", gap:12 }}>
                <button onClick={handleQuickPlay} style={{
                  display:"flex", alignItems:"center", gap:8, padding:"10px 24px",
                  background:"linear-gradient(135deg,rgba(74,222,128,0.2),rgba(74,222,128,0.08))",
                  border:"1.5px solid #4ade80", borderRadius:6, cursor:"pointer",
                  fontFamily:"inherit", color:"#4ade80", fontSize:13, fontWeight:800,
                  letterSpacing:2, textTransform:"uppercase",
                  boxShadow:"0 0 16px rgba(74,222,128,0.25)",
                  clipPath:"polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg>
                  QUICK PLAY
                </button>
                <Link href="/create" style={{
                  display:"flex", alignItems:"center", gap:8, padding:"10px 24px",
                  background:"linear-gradient(135deg,rgba(34,47,66,0.95),rgba(86,164,203,0.3))",
                  border:"1.5px solid #56a4cb", borderRadius:6, textDecoration:"none",
                  color:"#fff", fontSize:13, fontWeight:800, letterSpacing:2, textTransform:"uppercase",
                  boxShadow:"0 0 20px rgba(86,164,203,0.35)", animation:"ko-pulse 2.5s ease-in-out infinite",
                  clipPath:"polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  FULL LOBBY
                </Link>
                <Link href="/leaderboard" style={{
                  display:"flex", alignItems:"center", gap:8, padding:"10px 20px",
                  background:"rgba(15,23,42,0.85)", border:"1px solid rgba(86,164,203,0.35)",
                  borderRadius:6, textDecoration:"none",
                  color:"#b9e7f4", fontSize:13, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase",
                  backdropFilter:"blur(8px)",
                  clipPath:"polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#56a4cb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                  RANKINGS
                </Link>
              </div>
            </div>

            {/* ── News Panel ───────────────────────────────────────── */}
            {/* Panel container */}
            <div style={{ position:"absolute", left:1114, top:181, width:274, height:410, zIndex:10, background:"rgba(10,15,28,0.75)", border:"1px solid rgba(86,164,203,0.2)", borderRadius:6, backdropFilter:"blur(6px)" }} />

            {/* Panel heading */}
            <div style={{ position:"absolute", left:1114, top:181, width:274, height:36, zIndex:12, display:"flex", alignItems:"center", gap:8, padding:"0 16px", borderBottom:"1px solid rgba(86,164,203,0.2)", background:"rgba(86,164,203,0.08)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#56a4cb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16M4 2h16"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
              <span style={{ fontSize:11, fontWeight:700, letterSpacing:2.5, color:"#b9e7f4", textTransform:"uppercase" }}>NEWS</span>
            </div>

            {/* News card 1 */}
            <div className="ko-news-card" style={{ position:"absolute", left:1130, top:232, width:237, zIndex:15 }}>
              <img className="ko-card-img" src="/new-assets/fighters-energy.jpeg" alt="Season 1" />
              <div className="ko-card-title">
                <p style={{ color:"#56a4cb", fontSize:10, letterSpacing:1.5, textTransform:"uppercase", marginBottom:3 }}>LATEST</p>
                <p>SEASON 1: ORDER ASCENSION</p>
                <p style={{ color:"#4ade80", fontSize:11 }}>NOW LIVE!</p>
              </div>
            </div>

            <div style={{ position:"absolute", left:1129, top:419, width:238, height:1, background:"rgba(86,164,203,0.25)", zIndex:16 }} />

            {/* News card 2 */}
            <div className="ko-news-card" style={{ position:"absolute", left:1130, top:430, width:237, zIndex:15 }}>
              <img className="ko-card-img" src="/new-assets/fighters-rooftop.jpeg" alt="New Character" />
              <div className="ko-card-title">
                <p style={{ color:"#56a4cb", fontSize:10, letterSpacing:1.5, textTransform:"uppercase", marginBottom:3 }}>CHARACTER</p>
                <p>NEW REVEAL: KAZUMA, THE BLAZING SWORD</p>
              </div>
            </div>

            <div className="ko-scrollbar-track" />
            <div className="ko-scrollbar-thumb" />

            {/* ── Social ───────────────────────────────────────────── */}
            <div style={{ position:"absolute", left:40, top:710, zIndex:15 }}>
              <p style={{ fontSize:9, fontWeight:700, letterSpacing:2.5, color:"rgba(185,231,244,0.5)", textTransform:"uppercase", marginBottom:10 }}>FOLLOW US</p>
              <div style={{ display:"flex", gap:10 }}>
                <a className="ko-social-btn" href="https://t.me/knockorder" target="_blank" rel="noopener noreferrer">
                  <svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                  Telegram
                </a>
                <a className="ko-social-btn" href="https://twitter.com" target="_blank" rel="noopener noreferrer">
                  <svg viewBox="0 0 24 24"><path d="M4 4l16 16M4 20 20 4"/></svg>
                  X / Twitter
                </a>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div style={{ marginTop:"20px", padding:"24px 0", borderTop:"1px solid rgba(86,164,203,0.2)", display:"flex", flexWrap:"wrap", justifyContent:"center", gap:"30px", width:"1440px", color:"rgba(185,231,244,0.5)", fontSize:"13px", textTransform:"uppercase", letterSpacing:"1px" }}>
            <Link href="/terms"   style={{ textDecoration:"none", color:"inherit" }}>Terms of Service</Link>
            <Link href="/privacy" style={{ textDecoration:"none", color:"inherit" }}>Privacy Policy</Link>
            <a href="https://t.me/knockorder" target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none", color:"inherit" }}>Support</a>
          </div>
        </div>
      </div>
      {showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} />}
    </>
  );
}
