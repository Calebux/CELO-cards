export default function PrivacyPage() {
  return (
    <div style={{ padding: "40px 20px", color: "white", fontFamily: "sans-serif", backgroundColor: "#0a0f1c", minHeight: "100vh" }}>
      <h1 style={{ marginBottom: "20px" }}>Privacy Policy</h1>
      <p style={{ marginBottom: "10px" }}>Effective Date: April 2026</p>
      <p style={{ marginBottom: "20px" }}>
        Your privacy is important to us. This Privacy Policy describes how Action Order handles your information.
      </p>

      <h2 style={{ marginTop: "30px", marginBottom: "10px" }}>1. Data Collection</h2>
      <p style={{ marginBottom: "20px", color: "#ccc" }}>
        We only collect public blockchain data necessary for the operation of the game, including your public Celo wallet address. We do not collect names, emails, or personal identifiers unless you contact our support directly.
      </p>

      <h2 style={{ marginTop: "30px", marginBottom: "10px" }}>2. Use of Information</h2>
      <p style={{ marginBottom: "20px", color: "#ccc" }}>
        Your public address is used to track your in-game points and distribute winnings after a match.
      </p>

      <h2 style={{ marginTop: "30px", marginBottom: "10px" }}>3. Third-Party Services</h2>
      <p style={{ marginBottom: "20px", color: "#ccc" }}>
        We may use decentralized networks and third-party RPC providers (like Celo network nodes) which operate under their own privacy policies. We do not sell your data.
      </p>

      <p style={{ marginTop: "40px", color: "#60a5ce" }}>
        &copy; 2026 Action Order. All rights reserved.
      </p>
    </div>
  );
}
