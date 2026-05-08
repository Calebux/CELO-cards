/**
 * STASH — Removed from app/page.tsx
 * These elements were temporarily removed from the landing page.
 * Copy the snippet back into page.tsx when ready to re-add.
 */

// ─── 1. CHALLENGES BUTTON ─────────────────────────────────────────────────────
// Position: left nav, between TOURNAMENT and LEADERBOARD
// CSS classes needed: .ko-btn-community (regular) + .ko-btn-challenges (minipay)
// Re-add the CSS positions too (see bottom of this file)
/*
<Link className="ko-nav-btn ko-btn-community" href="/challenges">
  <svg className="ko-btn-icon" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4M7 21l5-3 5 3-1.5-5.5L21 9.5l-5.5-.5L13 4l-2 5-5.5.5 4.5 2.5z"/></svg>
  <span className="ko-btn-label">CHALLENGES</span>
</Link>
*/

// ─── 2. PEOPLE PLAYING NOW (bottom-right of landing page) ─────────────────────
// Needs: const [onlineCount, setOnlineCount] = useState<number | null>(null);
// Needs: the useEffect that polls /api/online every 20s (see below)
// Place: just above the Centre CTA section
/*
<div style={{ position:"absolute", right:isMp ? 34 : 40, bottom:isMp ? 36 : 32, zIndex:15, display:"flex", alignItems:"center", gap:isMp ? 12 : 10, padding:isMp ? "12px 20px" : "10px 18px", background:"rgba(74,222,128,0.07)", border:"1px solid rgba(74,222,128,0.3)", borderRadius:8, backdropFilter:"blur(8px)" }}>
  <div style={{ width:isMp ? 9 : 8, height:isMp ? 9 : 8, borderRadius:"50%", background:"#4ade80", boxShadow:"0 0 8px #4ade80", animation:"ko-dot-pulse 2s ease-in-out infinite", flexShrink:0 }} />
  <div style={{ display:"flex", flexDirection:"column" }}>
    <span style={{ fontSize:isMp ? 8 : 7, fontWeight:700, letterSpacing:2, color:"#4ade80", textTransform:"uppercase", lineHeight:1 }}>Playing Now</span>
    <span style={{ fontSize:isMp ? 20 : 18, fontWeight:900, color:"#4ade80", letterSpacing:-0.5, lineHeight:1.4 }}>
      {onlineCount !== null ? onlineCount.toLocaleString() : "—"}
    </span>
  </div>
</div>
*/

// onlineCount state + effect to add back inside the component:
/*
const [onlineCount, setOnlineCount] = useState<number | null>(null);

useEffect(() => {
  const fetch_ = () => fetch("/api/online").then(r => r.json()).then((d: { online: number }) => setOnlineCount(d.online)).catch(() => {});
  fetch_();
  const id = setInterval(fetch_, 20_000);
  return () => clearInterval(id);
}, []);
*/

// ─── 3. 16-PLAYER BRACKET · WIN TO EARN G$ pill ───────────────────────────────
// Place: inside the Centre CTA div, just above the button row
/*
<div style={{ display:"flex", alignItems:"center", gap:8, padding:isMp ? "7px 16px" : "5px 14px", background:"rgba(86,164,203,0.1)", border:"1px solid rgba(86,164,203,0.3)", borderRadius:3 }}>
  <div style={{ width:isMp ? 6 : 5, height:isMp ? 6 : 5, borderRadius:"50%", background:"#4ade80", animation:"ko-dot-pulse 1.5s ease-in-out infinite" }} />
  <span style={{ fontSize:isMp ? 10 : 9, fontWeight:700, letterSpacing:2.5, color:"#56a4cb", textTransform:"uppercase" }}>16-PLAYER BRACKET · WIN TO EARN G$</span>
</div>
*/

// ─── 4. FOLLOW US + TELEGRAM + TWITTER buttons ────────────────────────────────
// Place: replace the standalone fullscreen button section
// The fullscreen button was kept — just wrap it back with these social links
/*
<div style={{ position:"absolute", left:36, top:isMp ? 758 : 710, zIndex:15 }}>
  <p style={{ fontSize:isMp ? 10 : 9, fontWeight:700, letterSpacing:2.5, color:"rgba(185,231,244,0.5)", textTransform:"uppercase", marginBottom:10 }}>FOLLOW US</p>
  <div style={{ display:"flex", gap:10 }}>
    <a className="ko-social-btn" href="https://t.me/knockorder" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
      Telegram
    </a>
    <a className="ko-social-btn" href="https://twitter.com" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24"><path d="M4 4l16 16M4 20 20 4"/></svg>
      X / Twitter
    </a>
    { fullscreen button here }
  </div>
</div>
*/

// ─── 5. CSS TO RESTORE (add back into the <style> block) ──────────────────────
/*
// Challenges button positions (regular):
.ko-btn-community   { left: 40px; top: 428px; }
.ko-btn-leaderboard { left: 40px; top: 484px; }   // shift back down from 428
.ko-btn-profile     { left: 40px; top: 540px; }   // shift back down from 484
.ko-btn-challenges  { left: 40px; top: 596px; }   // unused but kept for safety

// Add community + challenges back to the label/icon color rules:
.ko-btn-community .ko-btn-label,
.ko-btn-challenges .ko-btn-label { color: #b9e7f4; opacity: 0.8; }
.ko-btn-community .ko-btn-icon,
.ko-btn-challenges .ko-btn-icon  { color: #56a4cb; }

// MiniPay positions:
.ko-land-page-wrapper.ko-minipay .ko-btn-community  { left: 36px; top: 446px; }
.ko-land-page-wrapper.ko-minipay .ko-btn-leaderboard { left: 36px; top: 512px; } // shift back
.ko-land-page-wrapper.ko-minipay .ko-btn-profile    { left: 36px; top: 578px; } // shift back
.ko-land-page-wrapper.ko-minipay .ko-btn-challenges { left: 36px; top: 644px; }

// Points badge position (shift back down):
// top: isMp ? 722 : 652
*/
