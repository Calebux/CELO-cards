export type DeployControlAction = "pause" | "resume" | "play";

export interface DeployControlAuth {
  ownerWallet: string;
  signature: `0x${string}`;
  issuedAt: number;
  /** Single-use id — the server rejects a nonce it has already seen. */
  nonce: string;
}

export function buildDeployControlMessage(
  action: DeployControlAction,
  deployId: string,
  issuedAt: number,
  nonce?: string,
): string {
  const lines = [
    "GoodAgent deploy control",
    `Action: ${action}`,
    `Deploy: ${deployId}`,
    `Issued: ${issuedAt}`,
  ];
  if (nonce) lines.push(`Nonce: ${nonce}`);
  return lines.join("\n");
}

export async function signDeployControl(
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
  address: `0x${string}`,
  action: DeployControlAction,
  deployId: string,
): Promise<DeployControlAuth> {
  const issuedAt = Date.now();
  const nonce = crypto.randomUUID();
  const message = buildDeployControlMessage(action, deployId, issuedAt, nonce);
  const signature = await signMessageAsync({ message });
  return { ownerWallet: address, signature, issuedAt, nonce };
}
