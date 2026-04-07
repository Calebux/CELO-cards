export default function TermsPage() {
  return (
    <div style={{ padding: "40px 20px", color: "white", fontFamily: "sans-serif", backgroundColor: "#0a0f1c", minHeight: "100vh" }}>
      <h1 style={{ marginBottom: "20px" }}>Terms of Service</h1>
      <p style={{ marginBottom: "10px" }}>Effective Date: April 2026</p>
      <p style={{ marginBottom: "20px" }}>
        Welcome to Action Order. By accessing or using our game, you agree to comply with and be bound by these Terms of Service.
      </p>

      <h2 style={{ marginTop: "30px", marginBottom: "10px" }}>1. Acceptance of Terms</h2>
      <p style={{ marginBottom: "20px", color: "#ccc" }}>
        By interacting with our application and its associated smart contracts on the Celo network, you agree to these terms.
      </p>

      <h2 style={{ marginTop: "30px", marginBottom: "10px" }}>2. Game Mechanisms</h2>
      <p style={{ marginBottom: "20px", color: "#ccc" }}>
        Action Order involves matches simulated entirely by your selected card strategies. Payouts and wagers are processed via ERC-20 cUSD transfers on the Celo network. We do not guarantee the performance of the underlying blockchain.
      </p>

      <h2 style={{ marginTop: "30px", marginBottom: "10px" }}>3. Risk Assumption</h2>
      <p style={{ marginBottom: "20px", color: "#ccc" }}>
        You interact with cryptographic tokens at your own risk. You are solely responsible for managing your wallets and any fees incurred.
      </p>
      
      <p style={{ marginTop: "40px", color: "#60a5ce" }}>
        &copy; 2026 Action Order. All rights reserved.
      </p>
    </div>
  );
}
