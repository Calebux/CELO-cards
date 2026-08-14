"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import {
  getDeployStatus,
  listDeploysByOwner,
  playAgentMatch,
  startDeploy,
  stopDeploy,
  type DeployAgent,
  type DeployStatusResponse,
} from "../../lib/goodagent-host";
import { signDeployControl } from "../../lib/goodagent-auth";

function statusLabel(status: string): string {
  switch (status) {
    case "awaiting_vouch":
      return "Awaiting vouch";
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "provisioning":
      return "Provisioning";
    case "failed":
      return "Failed";
    default:
      return status.replace(/_/g, " ");
  }
}

function actionOrderSkill(status: DeployStatusResponse | null) {
  return status?.skills?.find((s) => s.skillId.includes("actionorder")) ?? null;
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function AgentDashboard() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [deploys, setDeploys] = useState<DeployAgent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastMatchId, setLastMatchId] = useState<string | null>(null);

  const selectedDeploy = useMemo(
    () => deploys.find((d) => d.id === selectedId) ?? deploys[0] ?? null,
    [deploys, selectedId],
  );

  const skill = actionOrderSkill(status);
  const stats = skill?.stats ?? null;
  const config = skill?.configuration ?? {};
  const isOwner =
    Boolean(address) &&
    status?.ownerWallet?.toLowerCase() === address?.toLowerCase();
  const online = status?.pm2?.online ?? status?.status === "running";
  const verified = Boolean(status?.verify?.valid && status?.verify?.agentProven);
  const provisioned = Boolean(status?.agentAddress);
  const canPlay = verified && provisioned;

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listDeploysByOwner(address);
      setDeploys(list);
      const activeId = selectedId ?? list[0]?.id ?? null;
      if (activeId) {
        setSelectedId(activeId);
        const full = await getDeployStatus(activeId);
        setStatus(full);
      } else {
        setStatus(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address, selectedId]);

  useEffect(() => {
    if (!isConnected || !address) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 8000);
    return () => clearInterval(timer);
  }, [address, isConnected, refresh]);

  const runControl = useCallback(
    async (action: "start" | "stop" | "play") => {
      if (!address || !selectedDeploy) return;
      setBusy(action);
      setError(null);
      setNotice(null);
      try {
        const auth = await signDeployControl(
          signMessageAsync,
          address,
          action === "play" ? "play" : action === "start" ? "resume" : "pause",
          selectedDeploy.id,
        );
        if (action === "start") {
          await startDeploy(selectedDeploy.id, auth);
          setNotice("Autopilot started — agent will grind House Boss matches.");
        } else if (action === "stop") {
          await stopDeploy(selectedDeploy.id, auth);
          setNotice("Autopilot paused.");
        } else {
          const play = await playAgentMatch(selectedDeploy.id, auth);
          setLastMatchId(play.matchId);
          const outcome = play.won ? "Won" : "Lost";
          setNotice(
            `${outcome} ${play.matchId} · ${play.playerRoundsWon ?? "?"}-${play.opponentRoundsWon ?? "?"} · ${play.pointsEarned ?? 0} pts`,
          );
        }
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [address, refresh, selectedDeploy, signMessageAsync],
  );

  if (!isConnected) {
    return (
      <div className="ao-dash-empty">
        <p className="ao-dash-empty-title">Wallet not connected</p>
        <p className="ao-dash-empty-text">
          Connect your wallet above to view and control your House Boss agents.
        </p>
      </div>
    );
  }

  if (loading && !deploys.length) {
    return (
      <div className="ao-dash-empty">
        <p className="ao-dash-empty-title">Loading agents…</p>
      </div>
    );
  }

  if (!deploys.length) {
    return (
      <div className="ao-dash-empty">
        <p className="ao-dash-empty-title">No agents yet</p>
        <p className="ao-dash-empty-text">
          Deploy a House Boss agent in the panel on the right, or add another
          from the Deploy tab.
        </p>
      </div>
    );
  }

  return (
    <div className="ao-dash">
      {error ? <div className="ao-dash-alert ao-dash-alert-error">{error}</div> : null}
      {notice ? <div className="ao-dash-alert ao-dash-alert-ok">{notice}</div> : null}

      <div className="ao-dash-command">
        <div className="ao-dash-command-main">
          {deploys.length > 1 ? (
            <select
              className="ao-dash-select"
              value={selectedDeploy?.id ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {deploys.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName}
                </option>
              ))}
            </select>
          ) : (
            <h3 className="ao-dash-agent-name">
              {selectedDeploy?.displayName ?? "Your agent"}
            </h3>
          )}
          <div className="ao-dash-badges">
            <span
              className={`ao-dash-pill ao-dash-pill-${online ? "online" : "offline"}`}
            >
              <span className="ao-dash-dot" aria-hidden />
              {online ? "Online" : "Offline"}
            </span>
            <span
              className={`ao-dash-pill ao-dash-pill-${verified ? "ok" : "warn"}`}
            >
              {verified ? "Verified" : "Needs vouch"}
            </span>
            <span className="ao-dash-pill ao-dash-pill-muted">
              {statusLabel(status?.status ?? "—")}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="ao-dash-btn ao-dash-btn-ghost ao-dash-btn-sm"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="ao-dash-stats">
        <article className="ao-stat">
          <p className="ao-stat-label">Record</p>
          <p className="ao-stat-value">
            {stats ? `${stats.wins ?? 0}W · ${stats.losses ?? 0}L` : "—"}
          </p>
          <p className="ao-stat-meta">
            {stats?.matchesToday != null
              ? `${stats.matchesToday} today`
              : "No matches yet"}
          </p>
        </article>
        <article className="ao-stat">
          <p className="ao-stat-label">Character</p>
          <p className="ao-stat-value ao-stat-cap">
            {config.CHARACTER_ID ?? "riven"}
          </p>
          <p className="ao-stat-meta">
            {config.STRATEGY ?? "anti_strike"}
          </p>
        </article>
        <article className="ao-stat">
          <p className="ao-stat-label">House diff</p>
          <p className="ao-stat-value">{config.DIFFICULTY ?? "0"}</p>
          <p className="ao-stat-meta">vs House Boss</p>
        </article>
        <article className="ao-stat">
          <p className="ao-stat-label">Agent wallet</p>
          <p className="ao-stat-value ao-stat-mono">
            {status?.agentAddress ? shortAddress(status.agentAddress) : "—"}
          </p>
          <p className="ao-stat-meta">
            {provisioned ? "Provisioned" : "Pending"}
          </p>
        </article>
      </div>

      {isOwner ? (
        <div className="ao-dash-playdeck">
          <div className="ao-dash-playdeck-copy">
            <p className="ao-dash-playdeck-title">Run a match</p>
            <p className="ao-dash-playdeck-hint">
              Play now resolves instantly. Autopilot grinds on an interval.
            </p>
          </div>
          <div className="ao-dash-actions">
            <button
              type="button"
              className="ao-dash-btn ao-dash-btn-primary"
              disabled={!canPlay || busy !== null}
              title={
                !verified
                  ? "Complete verify / vouch first"
                  : !provisioned
                    ? "Agent wallet still provisioning"
                    : undefined
              }
              onClick={() => void runControl("play")}
            >
              {busy === "play" ? "Playing…" : "Play now"}
            </button>
            {online ? (
              <button
                type="button"
                className="ao-dash-btn"
                disabled={busy !== null}
                onClick={() => void runControl("stop")}
              >
                {busy === "stop" ? "Stopping…" : "Pause autopilot"}
              </button>
            ) : (
              <button
                type="button"
                className="ao-dash-btn"
                disabled={!verified || busy !== null}
                onClick={() => void runControl("start")}
              >
                {busy === "start" ? "Starting…" : "Start autopilot"}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {lastMatchId ? (
        <p className="ao-dash-footnote">
          Latest match <code>{lastMatchId}</code>
        </p>
      ) : null}

      {stats?.summary ? (
        <p className="ao-dash-summary">{stats.summary}</p>
      ) : null}

      {stats?.matches?.length ? (
        <div className="ao-match-block">
          <div className="ao-match-block-head">
            <h3>Recent matches</h3>
            <span>{stats.matches.length} total</span>
          </div>
          <div className="ao-match-table-wrap">
            <table className="ao-match-table">
              <thead>
                <tr>
                  <th>Result</th>
                  <th>Match</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {stats.matches.slice(0, 8).map((m) => (
                  <tr key={m.matchId}>
                    <td>
                      <span className={`ao-result ao-result-${m.result}`}>
                        {m.result}
                      </span>
                    </td>
                    <td>
                      <code className="ao-match-id">{m.matchId}</code>
                    </td>
                    <td className="ao-match-time">
                      {new Date(m.at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
