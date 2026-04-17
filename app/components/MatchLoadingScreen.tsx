"use client";

interface MatchLoadingScreenProps {
  playerName: string;
  opponentName: string;
  playerColor?: string;
  opponentColor?: string;
  playerPortrait?: string;
  opponentPortrait?: string;
  label?: string;
}

export function MatchLoadingScreen({
  playerName,
  opponentName,
  playerColor = "#06a8f9",
  opponentColor = "#f906a8",
  playerPortrait,
  opponentPortrait,
  label = "LOADING MATCH…",
}: MatchLoadingScreenProps) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "#050810",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-space-grotesk), sans-serif",
    }}>
      <style>{`
        @keyframes ml-fadein  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes ml-left    { from { opacity:0; transform:translateX(-80px) scale(0.9); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes ml-right   { from { opacity:0; transform:translateX(80px) scale(0.9); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes ml-pulse   { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        @keyframes ml-bar     { from { width:0%; } to { width:100%; } }
      `}</style>

      {/* Fighter portraits / name blocks */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        animation: "ml-fadein 0.4s ease forwards",
        marginBottom: 40,
      }}>
        {/* Player side */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          animation: "ml-left 0.5s cubic-bezier(0.22,1,0.36,1) forwards",
          width: 180,
        }}>
          {playerPortrait && (
            <div style={{
              width: 120, height: 150, borderRadius: 6, overflow: "hidden",
              border: `2px solid ${playerColor}`,
              boxShadow: `0 0 30px ${playerColor}60`,
            }}>
              <img src={playerPortrait} alt={playerName}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
            </div>
          )}
          <span style={{
            fontSize: 15, fontWeight: 800, letterSpacing: 3,
            color: playerColor, textTransform: "uppercase",
            textShadow: `0 0 16px ${playerColor}80`,
          }}>{playerName}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "rgba(185,231,244,0.4)", textTransform: "uppercase" }}>YOU</span>
        </div>

        {/* VS */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          margin: "0 24px",
          animation: "ml-fadein 0.6s 0.15s ease both",
        }}>
          <div style={{ width: 1, height: 40, background: `linear-gradient(to bottom, transparent, rgba(255,255,255,0.15), transparent)` }} />
          <div style={{
            fontSize: 32, fontWeight: 900, letterSpacing: -1, color: "#fff",
            textShadow: "0 0 30px rgba(255,255,255,0.4)",
            padding: "8px 0",
          }}>VS</div>
          <div style={{ width: 1, height: 40, background: `linear-gradient(to bottom, transparent, rgba(255,255,255,0.15), transparent)` }} />
        </div>

        {/* Opponent side */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          animation: "ml-right 0.5s cubic-bezier(0.22,1,0.36,1) forwards",
          width: 180,
        }}>
          {opponentPortrait && (
            <div style={{
              width: 120, height: 150, borderRadius: 6, overflow: "hidden",
              border: `2px solid ${opponentColor}`,
              boxShadow: `0 0 30px ${opponentColor}60`,
            }}>
              <img src={opponentPortrait} alt={opponentName}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
            </div>
          )}
          <span style={{
            fontSize: 15, fontWeight: 800, letterSpacing: 3,
            color: opponentColor, textTransform: "uppercase",
            textShadow: `0 0 16px ${opponentColor}80`,
          }}>{opponentName}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "rgba(185,231,244,0.4)", textTransform: "uppercase" }}>OPPONENT</span>
        </div>
      </div>

      {/* Loading bar */}
      <div style={{
        width: 320, height: 3,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 2, overflow: "hidden",
        marginBottom: 16,
        animation: "ml-fadein 0.4s 0.3s ease both",
      }}>
        <div style={{
          height: "100%", borderRadius: 2,
          background: `linear-gradient(90deg, ${playerColor}, ${opponentColor})`,
          animation: "ml-bar 1.8s cubic-bezier(0.4,0,0.6,1) 0.4s forwards",
          width: 0,
        }} />
      </div>

      {/* Label */}
      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 4,
        color: "rgba(185,231,244,0.45)", textTransform: "uppercase",
        animation: "ml-pulse 1.5s ease-in-out infinite, ml-fadein 0.4s 0.4s ease both",
        opacity: 0,
      }}>{label}</p>
    </div>
  );
}
