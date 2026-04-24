// ── Sound Manager ─────────────────────────────────────────────────────────────
// Plays named game sounds and controls mute state globally.
//
// MiniPay WebView (and mobile browsers) block audio until the user has
// interacted with the page.  We track whether the audio context has been
// "unlocked" by a user gesture.  All sounds are queued until unlock happens.

export type SoundName =
    | "intro"
    | "clash"
    | "click"
    | "gameOver"
    | "roundEnd"
    | "matchFound";

const SOUND_PATHS: Record<SoundName, string> = {
    intro:      "/Sounds/intro sound.mp3",
    clash:      "/Sounds/slot clash sound.mp3",
    click:      "/Sounds/menu clicks.mp3",
    gameOver:   "/Sounds/Game over sound.mp3",
    roundEnd:   "/Sounds/game end sound.mp3",
    matchFound: "/Sounds/game end sound.mp3", // distinct ping — reuse round-end for now
};

// Pool of Audio elements so we can overlap the same sound
const pool: Partial<Record<SoundName, HTMLAudioElement>> = {};

let _muted = false;
let _volume = 1.0; // 0–1
let _bgAudio: HTMLAudioElement | null = null;
let _bgPending = false; // startBgMusic() called before unlock

// Load persisted sound prefs
if (typeof window !== "undefined") {
    try {
        const saved = localStorage.getItem("ao-sound");
        if (saved) {
            const prefs = JSON.parse(saved) as { muted?: boolean; volume?: number };
            if (typeof prefs.muted === "boolean") _muted = prefs.muted;
            if (typeof prefs.volume === "number") _volume = Math.max(0, Math.min(1, prefs.volume));
        }
    } catch { /* ignore */ }
}

function _saveSoundPrefs() {
    try { localStorage.setItem("ao-sound", JSON.stringify({ muted: _muted, volume: _volume })); } catch { /* ignore */ }
}

// ── Unlock on first user interaction ──────────────────────────────────────────
// Play + immediately pause a silent clip to unlock the audio context.
let _unlocked = false;

function onFirstInteraction() {
    if (_unlocked) return;
    _unlocked = true;
    // Remove listeners — only needed once
    if (typeof window !== "undefined") {
        window.removeEventListener("touchstart", onFirstInteraction, true);
        window.removeEventListener("pointerdown", onFirstInteraction, true);
        window.removeEventListener("click", onFirstInteraction, true);
    }
    // Lock to landscape for more screen real estate on mobile / MiniPay
    // (screen.orientation.lock is not in older TS DOM types, cast needed)
    const orient = typeof screen !== "undefined"
        ? (screen.orientation as { lock?: (t: string) => Promise<void> } | undefined)
        : undefined;
    orient?.lock?.("landscape").catch(() => {/* iOS/desktop — silently ignore */});
    // If bg music was requested before unlock, start it now
    if (_bgPending) {
        _bgPending = false;
        _startBgMusicNow();
    }
}

if (typeof window !== "undefined") {
    window.addEventListener("touchstart", onFirstInteraction, { capture: true, passive: true });
    window.addEventListener("pointerdown", onFirstInteraction, { capture: true, passive: true });
    window.addEventListener("click", onFirstInteraction, { capture: true, passive: true });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isMuted() { return _muted; }
export function getVolume() { return _volume; }

export function setMuted(muted: boolean) {
    _muted = muted;
    if (_bgAudio) _bgAudio.muted = muted;
    _saveSoundPrefs();
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ao-mute-change", { detail: { muted } }));
    }
}

export function setVolume(v: number) {
    _volume = Math.max(0, Math.min(1, v));
    if (_bgAudio) _bgAudio.volume = _volume * 0.3; // bg at 30% of master
    _saveSoundPrefs();
}

export function playSound(name: SoundName) {
    if (_muted) return;
    // Sounds triggered by user actions (clicks, etc.) work even without prior
    // unlock because the gesture itself counts — but we also set the flag.
    _unlocked = true;
    try {
        let audio = pool[name];
        if (!audio) {
            audio = new Audio(SOUND_PATHS[name]);
            pool[name] = audio;
        }
        // Clone so we can overlap the same sound
        const clone = audio.cloneNode() as HTMLAudioElement;
        clone.volume = (name === "clash" ? 0.7 : 0.5) * _volume;
        clone.play().catch(() => {/* autoplay policy – silently ignore */});
    } catch (_) { }
}

function _startBgMusicNow() {
    if (_bgAudio) return;
    try {
        _bgAudio = new Audio("/Sounds/intro sound.mp3");
        _bgAudio.loop = true;
        _bgAudio.volume = 0.3 * _volume;
        _bgAudio.muted = _muted;
        _bgAudio.play().catch(() => { });
    } catch (_) { }
}

// Background music (looping).
// Deferred until first user interaction when autoplay is blocked.
export function startBgMusic() {
    if (_bgAudio) return; // already running
    if (_unlocked) {
        _startBgMusicNow();
    } else {
        // Will be started in onFirstInteraction
        _bgPending = true;
    }
}

export function stopBgMusic() {
    _bgPending = false;
    if (_bgAudio) {
        _bgAudio.pause();
        _bgAudio.currentTime = 0;
        _bgAudio = null;
    }
}
