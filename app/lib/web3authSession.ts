// Web3Auth session hint + resume state.
//
// Deliberately dependency-free: the landing page imports this to decide whether
// a returning user needs the wallet UI immediately, and pulling web3auth.ts in
// there would drag wagmi into the landing's critical bundle and undo the
// deferred-load work that keeps LCP down for anonymous visitors.

const WEB3AUTH_SESSION_KEY = "ao:web3auth-connected";

export function persistWeb3AuthSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(WEB3AUTH_SESSION_KEY, "1");
  } catch {}
  try {
    window.localStorage.setItem(WEB3AUTH_SESSION_KEY, "1");
  } catch {}
}

export function clearWeb3AuthSessionHint() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(WEB3AUTH_SESSION_KEY);
  } catch {}
  try {
    window.localStorage.removeItem(WEB3AUTH_SESSION_KEY);
  } catch {}
}

export function hasWeb3AuthSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(WEB3AUTH_SESSION_KEY) === "1") return true;
  } catch {}
  try {
    if (window.localStorage.getItem(WEB3AUTH_SESSION_KEY) === "1") return true;
  } catch {}
  return false;
}

// ── Resume state ─────────────────────────────────────────────────────────────
// Re-attaching a restored session after an OAuth redirect takes seconds on
// mobile (SDK download + init). Without a signal the sign-in button just reads
// "SIGN IN" the whole time, which looks broken and makes people tap it. This
// lets the wallet UI show that work is in progress.

// ── Interactive sign-in guard ────────────────────────────────────────────────
// The session hint is written BEFORE web3auth.connect() opens the login, so for
// the whole time the user is on Google's screen the app looks exactly like
// someone returning from a redirect. Any resume that starts in that window ends
// up issuing a second connect on the same instance, on top of the token
// exchange that is still in progress — which is the googleapis.com step.
//
// MetaMask survives it only because it completes in under a second; a Google
// login is slow enough to be hit every time.
let signInInFlight = false;

export function setWeb3AuthSignInInFlight(next: boolean) {
  signInInFlight = next;
}

export function isWeb3AuthSignInInFlight(): boolean {
  return signInInFlight;
}

type Listener = () => void;

let resuming = false;
const listeners = new Set<Listener>();

export function setWeb3AuthResuming(next: boolean) {
  if (resuming === next) return;
  resuming = next;
  listeners.forEach((listener) => listener());
}

export function getWeb3AuthResuming(): boolean {
  return resuming;
}

export function subscribeWeb3AuthResuming(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
