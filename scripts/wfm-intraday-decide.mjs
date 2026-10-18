#!/usr/bin/env node
/**
 * WFM Intraday Decide — real-time workforce management interval decisions via Strands 2B Decider.
 *
 * Evaluates 30-minute WFM intervals against three calibrated System One questions:
 *   - sla_breach_severity (score): ["nominal", "at_risk", "critical_breach"]
 *   - intraday_action (choice): hold_steady, reallocate_blended_agents,
 *                               defer_planned_coaching_aux, offer_voluntary_overtime,
 *                               trigger_overflow_queues
 *   - burnout_risk (noul): whether sustained occupancy and shrinkage indicate agent burnout exposure
 *
 * Applies engine confidence bands:
 *   BAND_HIGH = 0.7   -> act_immediately
 *   BAND_MEDIUM = 0.4 -> act_with_verification
 *   < 0.4             -> gather_more_info
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const venvBin = join(workspaceRoot, ".venv", "bin");
const deciderBin = join(venvBin, "strands-decider");
const CHECKPOINT =
  process.env.STRANDS_DECIDER_CHECKPOINT || "StrandsAgents/strands-decider-2B-hobson-v21";

const BAND_HIGH = 0.7;
const BAND_MEDIUM = 0.4;

const rawArgs = process.argv.slice(2);
const argOf = (flag) => {
  const i = rawArgs.indexOf(flag);
  return i >= 0 ? rawArgs[i + 1] : undefined;
};
const file = argOf("--file") ?? join(workspaceRoot, "fixtures", "wfm-intervals.sample.json");
const port = Number(argOf("--port") ?? process.env.STRANDS_DECIDER_PORT ?? 8111);
const asJson = rawArgs.includes("--json");

const intervalsPath = resolve(file);
if (!existsSync(intervalsPath)) {
  console.error(`WFM intervals file not found: ${intervalsPath}`);
  process.exit(2);
}

const parseIntervalLines = (text, src) => {
  const rows = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      console.error(`WARN  skipping malformed interval line in ${src}: ${trimmed.slice(0, 80)}`);
    }
  }
  return rows;
};

const loadBatch = () => {
  if (file.endsWith(".jsonl")) {
    const text = readFileSync(intervalsPath, "utf8");
    return parseIntervalLines(text, intervalsPath);
  }
  const arr = JSON.parse(readFileSync(intervalsPath, "utf8"));
  if (!Array.isArray(arr) || arr.length === 0) {
    console.error("WFM intervals file must be a non-empty JSON array (or non-empty JSONL).");
    process.exit(2);
  }
  return arr;
};

/* ---------- server lifecycle ---------- */

const base = `http://127.0.0.1:${port}`;
const healthUrl = [base, "health"].join("/");
const systemOneUrl = [base, "v1", "systemone"].join("/");

if (!existsSync(deciderBin)) {
  console.error(
    `strands-decider not found at ${deciderBin}. Run:\n  python3 -m venv .venv && .venv/bin/pip install strands-decider`,
  );
  process.exit(2);
}

const isHealthy = async () => {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
};

let spawnedServer = null;
let serverCrashed = false;

const shutdown = () => {
  if (spawnedServer && spawnedServer.exitCode === null) spawnedServer.kill("SIGTERM");
};
process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(143);
});

if (await isHealthy()) {
  console.error(`decider server already healthy on port ${port} — reusing`);
} else {
  spawnedServer = spawn(
    deciderBin,
    ["serve", CHECKPOINT, "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: workspaceRoot,
      stdio: ["ignore", "ignore", "pipe"],
      detached: false,
    },
  );
  const serverErr = [];
  spawnedServer.stderr.on("data", (chunk) => {
    serverErr.push(String(chunk));
    if (serverErr.length > 50) serverErr.shift();
  });
  spawnedServer.on("exit", (code) => {
    if (!serverCrashed) {
      serverCrashed = true;
      console.error(`decider server exited during boot (code ${code}). Last stderr lines:`);
      console.error(serverErr.join("").split("\n").slice(-12).join("\n") || "(no stderr)");
    }
  });

  const bootDeadline = Date.now() + 180_000;
  while (!(await isHealthy())) {
    if (serverCrashed) {
      console.error(`decider server died before becoming healthy on port ${port}`);
      process.exit(1);
    }
    if (Date.now() > bootDeadline) {
      spawnedServer.kill("SIGTERM");
      console.error(`decider server did not become healthy on port ${port} within 180s. Last stderr lines:`);
      console.error(serverErr.join("").split("\n").slice(-12).join("\n") || "(no stderr)");
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`decider server up on port ${port} (pid ${spawnedServer.pid})`);
}

/* ---------- decision asks ---------- */

const formatState = (item) => {
  if (item.summary) return item.summary;
  return (
    `Interval ${item.interval} on ${item.queue}: forecast=${item.forecast_volume}, ` +
    `actual=${item.actual_volume}, forecast_aht=${item.forecast_aht_sec}s, ` +
    `actual_aht=${item.actual_aht_sec}s, occupancy=${item.occupancy_pct}%, ` +
    `shrinkage=${item.shrinkage_pct}%, SLA=${item.service_level_pct}%`
  );
};

const askSystemOne = async (item) => {
  const body = {
    state: formatState(item),
    questions: {
      sla_breach_severity: {
        type: "score",
        instructions:
          "How severe is the service-level agreement (SLA) breach and queue backlog in this 30-minute WFM interval?",
        criteria: ["nominal", "at_risk", "critical_breach"],
      },
      intraday_action: {
        type: "choice",
        instructions:
          "Which primary WFM intraday management lever should the real-time adherence desk execute for this interval?",
        criteria: {
          hold_steady:
            "Volume, AHT, and service level are tracking near forecast within healthy occupancy bounds; no staffing intervention needed.",
          reallocate_blended_agents:
            "Moderate SLA dip where cross-trained or blended digital/chat agents with idle capacity can be shifted into the queue.",
          defer_planned_coaching_aux:
            "Elevated occupancy and queue backlog during a window where scheduled offline coaching, training, or team huddles can be postponed.",
          offer_voluntary_overtime:
            "Sustained multi-hour demand spike and high shrinkage where internal blended pools and AUX deferrals are already exhausted.",
          trigger_overflow_queues:
            "Severe volume surge and critical SLA collapse with extreme wait times and saturation requiring immediate BPO or overflow queue routing.",
        },
      },
      burnout_risk: {
        type: "noul",
        instructions:
          "Does the sustained occupancy and shrinkage pattern in this interval expose frontline agents to acute burnout risk?",
        criteria: {
          true: "Occupancy is persistently above 90 percent across consecutive intervals or paired with high unscheduled shrinkage and long handle times.",
          false: "Occupancy is within normal operating range (below 90 percent) with adequate recovery time between contacts.",
        },
      },
    },
  };
  const res = await fetch(systemOneUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`systemone HTTP ${res.status} for interval ${item.id}`);
  const json = await res.json();
  return {
    sla_breach_severity: json.answers.sla_breach_severity,
    intraday_action: json.answers.intraday_action,
    burnout_risk: json.answers.burnout_risk,
  };
};

const wfmPolicy = (answers) => {
  const sev = answers.sla_breach_severity;
  const act = answers.intraday_action;
  const burnout = answers.burnout_risk.noul;
  const minConf = Math.min(sev.confidence ?? 0, act.confidence ?? 0);

  let band = "low";
  let execution_mode = "gather_more_info";
  if (minConf >= BAND_HIGH) {
    band = "high";
    execution_mode = "act_immediately";
  } else if (minConf >= BAND_MEDIUM) {
    band = "medium";
    execution_mode = "act_with_verification";
  }

  let severity_label = "nominal";
  if (sev.score >= 1.5) severity_label = "critical_breach";
  else if (sev.score >= 0.75) severity_label = "at_risk";

  const burnout_alert = burnout >= BAND_HIGH;

  return {
    sla_score: Number(sev.score.toFixed(2)),
    sla_confidence: Number((sev.confidence ?? 0).toFixed(3)),
    severity_label,
    intraday_action: act.choice,
    action_confidence: Number((act.confidence ?? 0).toFixed(3)),
    burnout_noul: Number(burnout.toFixed(3)),
    burnout_alert,
    band,
    execution_mode,
  };
};

/* ---------- batch execution ---------- */

const intervals = loadBatch();
const failures = [];
const results = [];

console.error(
  `\nWFM Intraday Decider — ${intervals.length} interval(s), bands: high>=${BAND_HIGH}, medium>=${BAND_MEDIUM}\n`,
);
if (!asJson) {
  console.log(
    `${"ID".padEnd(10)}${"INTERVAL".padEnd(13)}${"SLA_SEV".padEnd(17)}${"SCORE".padEnd(7)}${"INTRADAY_ACTION".padEnd(28)}${"A_CONF".padEnd(8)}${"BURNOUT".padEnd(9)}BAND`,
  );
}

for (const item of intervals) {
  try {
    const answers = await askSystemOne(item);
    const decision = wfmPolicy(answers);
    const row = {
      decided_at: new Date().toISOString(),
      interval_id: item.id,
      interval: item.interval ?? "unknown",
      queue: item.queue ?? "unknown",
      occupancy_pct: item.occupancy_pct ?? null,
      service_level_pct: item.service_level_pct ?? null,
      ...decision,
    };
    results.push(row);
    if (asJson) {
      console.log(JSON.stringify(row));
    } else {
      console.log(
        `${String(row.interval_id).padEnd(10)}${String(row.interval).padEnd(13)}${row.severity_label.padEnd(17)}` +
          `${String(row.sla_score).padEnd(7)}${row.intraday_action.padEnd(28)}${String(row.action_confidence).padEnd(8)}` +
          `${String(row.burnout_noul).padEnd(9)}${row.band} (${row.execution_mode})`,
      );
    }
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    failures.push({ interval_id: item.id, error: msg });
    console.error(`WARN  ask failed for ${item.id}: ${msg}`);
  }
}

if (!asJson) {
  const criticalCount = results.filter((r) => r.severity_label === "critical_breach").length;
  const burnoutCount = results.filter((r) => r.burnout_alert).length;
  console.log(
    `\nSummary: ${results.length} interval(s) evaluated (${criticalCount} critical SLA breach, ${burnoutCount} burnout alert).`,
  );
}

shutdown();
if (failures.length > 0) {
  console.error(`\nCOMPLETE WITH ERRORS — ${failures.length} failure(s)`);
  process.exit(1);
}
process.exit(0);
