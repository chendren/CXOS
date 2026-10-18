#!/usr/bin/env node
/**
 * IVR Containment Decide — IVR session diagnosis and zero-out triage via Strands 2B Decider.
 *
 * Evaluates IVR call flow sessions against three calibrated System One questions:
 *   - zero_out_risk (noul): whether the caller is about to zero-out or abandon in IVR
 *   - failure_mode (choice): healthy_containment, menu_maze, prompt_ambiguity,
 *                            blind_transfer, stale_flow_content, identity_mismatch
 *   - friction_level (score): ["smooth", "moderate_friction", "severe_friction"]
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
const file = argOf("--file") ?? join(workspaceRoot, "fixtures", "ivr-sessions.sample.json");
const port = Number(argOf("--port") ?? process.env.STRANDS_DECIDER_PORT ?? 8111);
const asJson = rawArgs.includes("--json");

const sessionsPath = resolve(file);
if (!existsSync(sessionsPath)) {
  console.error(`IVR sessions file not found: ${sessionsPath}`);
  process.exit(2);
}

const parseSessionLines = (text, src) => {
  const rows = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      console.error(`WARN  skipping malformed session line in ${src}: ${trimmed.slice(0, 80)}`);
    }
  }
  return rows;
};

const loadBatch = () => {
  if (file.endsWith(".jsonl")) {
    const text = readFileSync(sessionsPath, "utf8");
    return parseSessionLines(text, sessionsPath);
  }
  const arr = JSON.parse(readFileSync(sessionsPath, "utf8"));
  if (!Array.isArray(arr) || arr.length === 0) {
    console.error("IVR sessions file must be a non-empty JSON array (or non-empty JSONL).");
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

const formatState = (session) => {
  const parts = [];
  if (session.flow_name) parts.push(`Flow: ${session.flow_name}`);
  if (session.turns !== undefined) parts.push(`Turns: ${session.turns}`);
  if (session.duration_sec !== undefined) parts.push(`Duration: ${session.duration_sec}s`);
  if (session.contained !== undefined) parts.push(`Contained: ${session.contained}`);
  parts.push(`Summary: ${session.summary}`);
  return parts.join(" | ");
};

const askSystemOne = async (session) => {
  const body = {
    state: formatState(session),
    questions: {
      zero_out_risk: {
        type: "noul",
        instructions:
          "Is the caller zeroing out to an agent, demanding a representative, or abandoning the IVR due to self-service failure?",
        criteria: {
          true: "The caller pressed 0, demanded an agent, abandoned in frustration, or was forced out of self-service.",
          false: "The caller completed their task smoothly inside the IVR without escaping or abandoning.",
        },
      },
      failure_mode: {
        type: "choice",
        instructions:
          "Which IVR taxonomy failure mode best diagnoses this call flow session?",
        criteria: {
          healthy_containment:
            "Caller authenticated and completed their self-service task cleanly within the IVR without agent transfer.",
          menu_maze:
            "Deeply nested sub-menus, circular menu loops, or excessive option trees caused caller fatigue or abandonment.",
          prompt_ambiguity:
            "Overlapping menu wording or unclear voice prompts caused repeated ASR or NLU misclassifications.",
          blind_transfer:
            "Caller provided data in the IVR but was transferred to a live agent with no CTI context, forcing them to repeat everything.",
          stale_flow_content:
            "IVR announced outdated promotions, expired deadlines, or hours for closed locations.",
          identity_mismatch:
            "Authentication or CRM lookup failed because account identifier type (e.g., FEIN vs SSN) was not supported by the flow.",
        },
      },
      friction_level: {
        type: "score",
        instructions:
          "What level of customer effort and interaction friction occurred during this IVR session?",
        criteria: ["smooth", "moderate_friction", "severe_friction"],
      },
    },
  };
  const res = await fetch(systemOneUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`systemone HTTP ${res.status} for session ${session.id}`);
  const json = await res.json();
  return {
    zero_out_risk: json.answers.zero_out_risk,
    failure_mode: json.answers.failure_mode,
    friction_level: json.answers.friction_level,
  };
};

const ivrPolicy = (answers) => {
  const zeroOut = answers.zero_out_risk.noul;
  const mode = answers.failure_mode;
  const friction = answers.friction_level;
  const conf = mode.confidence ?? 0;

  let band = "low";
  let execution_mode = "gather_more_info";
  if (conf >= BAND_HIGH) {
    band = "high";
    execution_mode = "act_immediately";
  } else if (conf >= BAND_MEDIUM) {
    band = "medium";
    execution_mode = "act_with_verification";
  }

  let remediation_priority = "none";
  if (mode.choice !== "healthy_containment") {
    if (zeroOut >= BAND_HIGH || friction.score >= 1.5) {
      remediation_priority = "p1_flow_fix";
    } else if (zeroOut >= BAND_MEDIUM || friction.score >= 0.8) {
      remediation_priority = "p2_prompt_tune";
    } else {
      remediation_priority = "p3_backlog_review";
    }
  }

  return {
    failure_mode: mode.choice,
    mode_confidence: Number(conf.toFixed(3)),
    zero_out_noul: Number(zeroOut.toFixed(3)),
    friction_score: Number(friction.score.toFixed(2)),
    friction_confidence: Number((friction.confidence ?? 0).toFixed(3)),
    remediation_priority,
    band,
    execution_mode,
  };
};

/* ---------- batch execution ---------- */

const sessions = loadBatch();
const failures = [];
const results = [];

console.error(
  `\nIVR Containment Decider — ${sessions.length} session(s), bands: high>=${BAND_HIGH}, medium>=${BAND_MEDIUM}\n`,
);
if (!asJson) {
  console.log(
    `${"SESSION".padEnd(10)}${"FLOW".padEnd(25)}${"FAILURE_MODE".padEnd(22)}${"M_CONF".padEnd(8)}${"ZERO_OUT".padEnd(10)}${"FRICT".padEnd(7)}${"REMEDIATION".padEnd(18)}BAND`,
  );
}

for (const session of sessions) {
  try {
    const answers = await askSystemOne(session);
    const decision = ivrPolicy(answers);
    const row = {
      decided_at: new Date().toISOString(),
      session_id: session.id,
      flow_name: session.flow_name ?? "unknown",
      turns: session.turns ?? null,
      contained: session.contained ?? null,
      ...decision,
    };
    results.push(row);
    if (asJson) {
      console.log(JSON.stringify(row));
    } else {
      console.log(
        `${String(row.session_id).padEnd(10)}${String(row.flow_name).padEnd(25)}${row.failure_mode.padEnd(22)}` +
          `${String(row.mode_confidence).padEnd(8)}${String(row.zero_out_noul).padEnd(10)}${String(row.friction_score).padEnd(7)}` +
          `${row.remediation_priority.padEnd(18)}${row.band} (${row.execution_mode})`,
      );
    }
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    failures.push({ session_id: session.id, error: msg });
    console.error(`WARN  ask failed for ${session.id}: ${msg}`);
  }
}

if (!asJson) {
  const containedCount = results.filter((r) => r.failure_mode === "healthy_containment").length;
  const p1Count = results.filter((r) => r.remediation_priority === "p1_flow_fix").length;
  console.log(
    `\nSummary: ${results.length} session(s) diagnosed (${containedCount} healthy containment, ${p1Count} P1 flow fixes).`,
  );
}

shutdown();
if (failures.length > 0) {
  console.error(`\nCOMPLETE WITH ERRORS — ${failures.length} failure(s)`);
  process.exit(1);
}
process.exit(0);
