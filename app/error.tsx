"use client";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", minHeight: "100vh",
            background: "#0a0a0a", color: "#fff", fontFamily: "sans-serif",
            padding: "2rem", textAlign: "center",
        }}>
            <h2 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Something went wrong</h2>
            <p style={{ color: "#aaa", marginBottom: "1.5rem", maxWidth: 360 }}>
                {error.message ?? "An unexpected error occurred."}
            </p>
            <button
                onClick={reset}
                style={{
                    background: "#35D07F", color: "#000", border: "none",
                    borderRadius: 8, padding: "0.75rem 2rem",
                    fontWeight: 600, cursor: "pointer", fontSize: "1rem",
                }}
            >
                Try again
            </button>
        </div>
    );
}
