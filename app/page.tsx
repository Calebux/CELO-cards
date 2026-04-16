"use client";

import React, { useRef, useEffect } from 'react';
import Link from 'next/link';
import { useGameStore } from './lib/gameStore';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { isMiniPay, formatAddress } from './lib/minipay';

const DESIGN_W = 1440;
const DESIGN_H = 823;


function WalletBadge() {
  const { address, isConnected } = useAccount();
  // Inside MiniPay: show address pill only (no connect button)
  if (isMiniPay() && isConnected && address) {
    return (
      <div style={{
        position: "absolute", right: 40, top: 20, zIndex: 20,
        display: "flex", alignItems: "center", gap: 8,
        background: "rgba(15,23,42,0.85)", border: "1px solid #56a4cb",
        borderRadius: 6, padding: "8px 14px", backdropFilter: "blur(8px)",
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#b9e7f4", letterSpacing: 1 }}>
          {formatAddress(address)}
        </span>
      </div>
    );
  }
  // Desktop/browser: show RainbowKit connect button
  return (
    <div style={{ position: "absolute", right: 40, top: 20, zIndex: 20 }}>
      <ConnectButton />
    </div>
  );
}

export default function ActionOrderLandingPage() {
  const playerPoints = useGameStore((s) => s.playerPoints);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current) return;
      const w = document.body.clientWidth;
      const h = document.body.clientHeight;
      const s = Math.min(w / DESIGN_W, h / DESIGN_H);
      wrapRef.current.style.transform = `scale(${s})`;
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

  return (
    <>
      <title>Action Order – Land Page</title>
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
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          .ko-land-page {
            position: relative;
            width: 1440px;
            height: 823px;
            background: #0a0f1c;
            overflow: hidden;
          }

          .ko-bg-image {
            position: absolute;
            top: 0; left: 0;
            width: 1440px;
            height: 823px;
            object-fit: cover;
            pointer-events: none;
            z-index: 0;
          }

          .ko-logo-wrap {
            position: absolute;
            left: 50%;
            top: -13px;
            transform: translateX(-50%);
            width: 350px;
            height: 200px;
            z-index: 10;
            overflow: hidden;
          }
          .ko-logo-wrap img {
            width: 100% !important; 
            height: 100% !important;
            max-width: none !important;
            object-fit: cover;
          }


          .ko-left-tab {
            position: absolute;
            left: -8px;
            top: 218px;
            width: 22.5px;
            height: 305px;
            z-index: 10;
          }
          .ko-left-tab img { 
            width: 100% !important; 
            height: 100% !important;
            max-width: none !important;
          }

          .ko-nav-btn {
            position: absolute;
            display: flex;
            align-items: center;
            gap: 12px;
            height: 44px;
            width: 180px;
            padding: 0 16px;
            z-index: 15;
            cursor: pointer;
            text-decoration: none;
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid rgba(86, 164, 203, 0.3);
            border-radius: 6px;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            backdrop-filter: blur(8px);
            clip-path: polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
          }
          .ko-nav-btn::before {
             content: '';
             position: absolute;
             top: 0; left: 0; right: 0; bottom: 0;
             background: linear-gradient(90deg, transparent, rgba(86,164,203,0.1), transparent);
             transform: translateX(-100%);
             transition: 0.5s;
          }
          .ko-nav-btn:hover::before {
             transform: translateX(100%);
          }
          .ko-nav-btn:hover {
            border-color: rgba(86,164,203,0.8);
            background: rgba(30, 41, 59, 0.9);
            transform: translateX(8px);
            box-shadow: -4px 0 15px rgba(86,164,203,0.15);
          }
          
          .ko-nav-btn.ko-btn-create {
            background: linear-gradient(135deg, rgba(34,47,66,0.95), rgba(86,164,203,0.25));
            border: 1.5px solid #56a4cb;
            box-shadow: 0 0 15px rgba(86,164,203,0.4), inset 0 0 20px rgba(86,164,203,0.1);
          }
          .ko-nav-btn.ko-btn-create:hover {
             box-shadow: 0 0 20px rgba(86,164,203,0.6), inset 0 0 30px rgba(86,164,203,0.2);
          }

          .ko-nav-btn .ko-btn-icon {
            width: 18px; 
            height: 18px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
            flex-shrink: 0;
            z-index: 1;
            opacity: 0.9;
            transition: all 0.3s ease;
          }

          .ko-nav-btn .ko-btn-label {
            position: relative;
            z-index: 1;
            font-size: 13px;
            font-weight: 700;
            white-space: nowrap;
            letter-spacing: 1.5px;
            transition: all 0.3s ease;
          }

          .ko-btn-create { left: 40px; top: 260px; }
          .ko-btn-create .ko-btn-label { color: #fff; }
          .ko-btn-create .ko-btn-icon { color: #fff; }

          .ko-btn-join      { left: 40px; top: 316px; }
          .ko-btn-story     { left: 40px; top: 372px; }
          .ko-btn-community   { left: 40px; top: 428px; }
          .ko-btn-leaderboard { left: 40px; top: 484px; }
          .ko-btn-join .ko-btn-label,
          .ko-btn-story .ko-btn-label,
          .ko-btn-community .ko-btn-label,
          .ko-btn-leaderboard .ko-btn-label { color: #b9e7f4; opacity: 0.8; }
          .ko-btn-join .ko-btn-icon,
          .ko-btn-story .ko-btn-icon,
          .ko-btn-community .ko-btn-icon,
          .ko-btn-leaderboard .ko-btn-icon { color: #56a4cb; }

          .ko-nav-btn:hover .ko-btn-label { opacity: 1; text-shadow: 0 0 8px rgba(185, 231, 244, 0.4); }
          .ko-nav-btn:hover .ko-btn-icon { transform: scale(1.1); filter: drop-shadow(0 0 4px rgba(86,164,203,0.8)); }

          .ko-points-badge {
            position: absolute;
            left: 40px;
            top: 540px;
            width: 180px;
            height: 44px;
            z-index: 15;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 0 16px;
            background: linear-gradient(135deg, rgba(15,23,42,0.9), rgba(168,85,247,0.15));
            border: 1px solid rgba(168,85,247,0.45);
            border-radius: 6px;
            backdrop-filter: blur(8px);
            clip-path: polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
          }
          .ko-points-badge .ko-points-icon {
            font-size: 16px;
            flex-shrink: 0;
          }
          .ko-points-badge .ko-points-text {
            display: flex;
            flex-direction: column;
          }
          .ko-points-badge .ko-points-label {
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 1.5px;
            color: rgba(168,85,247,0.8);
            text-transform: uppercase;
            line-height: 1;
          }
          .ko-points-badge .ko-points-value {
            font-size: 15px;
            font-weight: 800;
            color: #fff;
            letter-spacing: 1px;
            line-height: 1.2;
            text-shadow: 0 0 12px rgba(168,85,247,0.6);
          }

          .ko-right-tab {
            position: absolute;
            right: 17px;
            top: 218px;
            width: 22.5px;
            height: 305px;
            z-index: 10;
            transform: rotate(180deg);
          }
          .ko-right-tab img { 
            width: 100% !important; 
            height: 100% !important;
            max-width: none !important;
          }

          .ko-scrollbar-track {
            position: absolute;
            left: 1375px; top: 225px;
            width: 5px; height: 373px;
            background: #1f2c44;
            border-radius: 4px;
            z-index: 10;
          }
          .ko-scrollbar-thumb {
            position: absolute;
            left: 1375px; top: 225px;
            width: 5px; height: 82px;
            background: #60a5ce;
            border-radius: 4px;
            z-index: 11;
          }

          .ko-news-panel {
            position: absolute;
            left: 1114px;
            top: 181px;
            width: 274px;
            z-index: 10;
          }

          .ko-news-heading-img {
            position: absolute;
            left: 1114px;
            top: 181px;
            width: 274px;
            height: 35px;
            z-index: 11;
          }
          .ko-news-heading-img img { 
            width: 100% !important; 
            height: 100% !important; 
            max-width: none !important;
            object-fit: fill; 
          }
          .ko-news-label {
            position: absolute;
            left: 1130px;
            top: 189px;
            font-size: 16px;
            font-weight: 500;
            color: #fff;
            z-index: 12;
          }

          .ko-news-cards-box {
            position: absolute;
            left: 1114px;
            top: 216px;
            width: 274px;
            height: 406px;
            z-index: 10;
            overflow: hidden;
          }
          .ko-news-cards-box img {
            width: 100% !important; 
            height: 100% !important;
            max-width: none !important;
            object-fit: fill;
          }

          .ko-news-card-1 {
            position: absolute;
            left: 1130px;
            top: 232px;
            width: 237px;
            z-index: 15;
          }
          .ko-news-card-2 {
            position: absolute;
            left: 1130px;
            top: 437px;
            width: 237px;
            z-index: 15;
          }

          .ko-news-card img.ko-card-img {
            width: 100%;
            aspect-ratio: 1440 / 803;
            object-fit: cover;
            border: 2px solid #60a5ce;
            display: block;
          }
          .ko-news-card-2 img.ko-card-img { aspect-ratio: 1408 / 768; border-color: #56a4cb; }

          .ko-news-card .ko-card-title {
            margin-top: 8px;
            font-size: 16px;
            font-weight: 600;
            color: #fff;
            line-height: 1.3;
          }

          .ko-news-divider {
            position: absolute;
            left: 1129px;
            top: 419px;
            width: 238px;
            height: 2px;
            background: rgba(96,165,206,0.4);
            z-index: 16;
          }

          .ko-social-btn-bg {
            position: absolute;
            left: 40px;
            top: 707px;
            width: 171px;
            height: 37px;
            z-index: 10;
          }
          .ko-social-btn-bg img { 
            width: 100% !important; 
            height: 100% !important; 
            max-width: none !important;
            object-fit: fill; 
          }
          .ko-social-label {
            position: absolute;
            left: 64px;
            top: 716px;
            font-size: 16px;
            font-weight: 700;
            color: #b9e7f4;
            white-space: nowrap;
            z-index: 11;
          }

          .ko-social-icons-row {
            position: absolute;
            left: 40px;
            top: 744px;
            width: 379px;
            height: 52px;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .ko-social-icons-row img {
            width: 379px !important; 
            height: 52px !important;
            max-width: none !important;
            object-fit: fill;
            transform: scaleY(-1);
          }
        `}</style>

      <div style={{ width: "100vw", minHeight: "100vh", overflowX: "hidden", overflowY: "auto", backgroundColor: "#0a0f1c" }}>
        <div ref={wrapRef} className="ko-land-page-wrapper" style={{ position: "relative", transformOrigin: "top left" }}>
          <WalletBadge />
          <div className="ko-land-page">
            <img className="ko-bg-image"
              src="/new-assets/landing-hero.png"
              alt="background" />

            <div className="ko-logo-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 38, lineHeight: "1.1", letterSpacing: "-1.5px", color: "#b9e7f4", textAlign: "center", textShadow: "0 0 30px rgba(185,231,244,0.6)", textTransform: "uppercase" }}>ACTION<br/>ORDER</div>
            </div>


            <div className="ko-left-tab" />

            <Link className="ko-nav-btn ko-btn-create" href="/create">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
              <span className="ko-btn-label">CREATE MATCH</span>
            </Link>

            <Link className="ko-nav-btn ko-btn-join" href="/join">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              <span className="ko-btn-label">JOIN MATCH</span>
            </Link>

            <a className="ko-nav-btn ko-btn-story" href="#">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
              <span className="ko-btn-label">STORY</span>
            </a>

            <a className="ko-nav-btn ko-btn-community" href="#">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              <span className="ko-btn-label">COMMUNITY</span>
            </a>

            <Link className="ko-nav-btn ko-btn-leaderboard" href="/leaderboard">
              <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
              <span className="ko-btn-label">LEADERBOARD</span>
            </Link>

            <div className="ko-points-badge">
              <span className="ko-points-icon">⚡</span>
              <div className="ko-points-text">
                <span className="ko-points-label">Total Points</span>
                <span className="ko-points-value">{playerPoints.toLocaleString()}</span>
              </div>
            </div>

            <div className="ko-news-heading-img" />
            <span className="ko-news-label">News</span>

            <div className="ko-news-cards-box" />

            <div className="ko-news-card ko-news-card-1">
              <img className="ko-card-img"
                src="/new-assets/fighters-energy.jpeg"
                alt="Season 1: Order Ascension" />
              <div className="ko-card-title">
                <p>SEASON 1: ORDER ASCENSION</p>
                <p>NOW LIVE!</p>
              </div>
            </div>

            <div className="ko-news-divider"></div>

            <div className="ko-news-card ko-news-card-2">
              <img className="ko-card-img"
                src="/new-assets/fighters-rooftop.jpeg"
                alt="New Character Reveal" />
              <div className="ko-card-title">NEW CHARACTER REVEAL: KAZUMA, THE BLAZING SWORD</div>
            </div>

            <div className="ko-right-tab" />

            <div className="ko-scrollbar-track"></div>
            <div className="ko-scrollbar-thumb"></div>

            <div className="ko-social-btn-bg" />
            <span className="ko-social-label">SOCIAL MEDIA</span>

            <div className="ko-social-icons-row">
              <a href="https://t.me/knockorder" target="_blank" rel="noopener noreferrer" style={{ color: "#b9e7f4", fontSize: 12, letterSpacing: 1, textDecoration: "none", textTransform: "uppercase" }}>Telegram</a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" style={{ color: "#b9e7f4", fontSize: 12, letterSpacing: 1, textDecoration: "none", textTransform: "uppercase", marginLeft: 16 }}>X / Twitter</a>
            </div>

          </div>
          
          <div style={{ 
            marginTop: '20px', 
            padding: '24px 0', 
            borderTop: '1px solid rgba(86,164,203,0.3)',
            display: 'flex', 
            flexWrap: 'wrap',
            justifyContent: 'center', 
            gap: '30px', 
            width: '1440px',
            color: '#b9e7f4', 
            fontSize: '16px',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            <Link href="/terms" style={{ textDecoration: 'none', color: 'inherit' }}>Terms of Service</Link>
            <Link href="/privacy" style={{ textDecoration: 'none', color: 'inherit' }}>Privacy Policy</Link>
            <Link href="https://t.me/knockorder" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>Support</Link>
          </div>
        </div>
      </div>
    </>
  );
}
