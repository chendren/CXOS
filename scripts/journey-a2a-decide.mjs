#!/usr/bin/env node
/**
 * Journey A2A Decide — Omnichannel Context Sharing, A2A Multi-Agent Delegation,
 * and Three-Plane Customer Journey Triad Orchestration via the local Strands 2B Decider.
 *
 * Unifies the Three-Plane Customer Journey Triad:
 *   - Plane 1: Hoped and Planned Blueprint (goldenPathStages, plannedChannels, slaBudgetSeconds, momentOfTruth)
 *   - Plane 2: Tracked Actual Reality (observedStages, channelsTouched, elapsedSeconds, loopCount, driftSummary)
 *   - Plane 3: Real-Time Orchestration Decision (conformance_drift, context_hydration_urgent,
 *              orchestration_action, target_a2a_owner)
 *
 * Applies Coxswain confidence bands:
 *   BAND_HIGH = 0.7   -> act_immediately
 *   BAND_MEDIUM = 0.4 -> act_with_verification
 *   < 0.4             -> gather_more_info
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
const file = argOf("--file") ?? join(workspaceRoot, "fixtures", "journey-a2a-traces.sample.json");
const port = Number(argOf("--port") ?? process.env.STRANDS_DECIDER_PORT ?? 8111);
const asJson = rawArgs.includes("--json");
const watch = rawArgs.includes("--watch");
const outPath = argOf("--out") ? resolve(argOf("--out")) : undefined;
const interval = Number(argOf("--interval") ?? 2000);

if (watch && !file.endsWith(".jsonl")) {
  console.error("--watch requires a .jsonl file (append-mode input).");
  process.exit(2);
}

const tracesPath = resolve(file);
if (!watch && !existsSync(tracesPath)) {
  console.error(`Journey traces file not found: ${tracesPath}`);
  process.exit(2);
}

/* ---------- trace parsing ---------- */

const failures = [];

const parseTraceLines = (text, src) => {
  const rows = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      console.error(`WARN  skipping malformed journey trace line in ${src}: ${trimmed.slice(0, 80)}`);
    }
  }
  return rows;
};

const parseCompleteLinesFromBuffer = (buf) => {
  const lastNl = buf.lastIndexOf(0x0a);
  if (lastNl < 0) return { rows: [], completeBytes: 0 };
  const rows = parseTraceLines(buf.subarray(0, lastNl + 1).toString("utf8"), "watch chunk");
  return { rows, completeBytes: lastNl + 1 };
};

const loadBatch = () => {
  if (file.endsWith(".jsonl")) {
    const text = readFileSync(tracesPath, "utf8");
    if (text.length > 0 && !text.endsWith("\n")) {
      console.error("WARN  journey traces JSONL lacks a trailing newline; the final line is still parsed");
    }
    return parseTraceLines(text, tracesPath);
  }
  const arr = JSON.parse(readFileSync(tracesPath, "utf8"));
  if (!Array.isArray(arr) || arr.length === 0) {
    console.error("Journey traces file must be a non-empty JSON array (or non-empty JSONL).");
    process.exit(2);
  }
  return arr;
};

/* ---------- history output ---------- */

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
}
let outAppendsOk = 0;
const appendOut = (row) => {
  if (!outPath) return;
  try {
    const { consoleLine, ...persist } = row;
    appendFileSync(outPath, JSON.stringify(persist) + "\n");
    outAppendsOk += 1;
  } catch (e) {
    const msg = `history append failed: ${String(e instanceof Error ? e.message : e)}`;
    console.error(`WARN  ${msg}`);
    failures.push({ journey_id: row.journey_id, error: msg });
  }
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

const cleanup = () => {
  if (spawnedServer && spawnedServer.exitCode === null) spawnedServer.kill("SIGTERM");
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
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

const formatState = (trace) => {
  const bp = trace.hopedBlueprint ?? {};
  const actual = trace.actualTrace ?? {};
  const env = trace.contextEnvelope ?? {};

  const goldenStages = Array.isArray(bp.goldenPathStages) ? bp.goldenPathStages.join(" -> ") : "none";
  const plannedChannels = Array.isArray(bp.plannedChannels) ? bp.plannedChannels.join(", ") : "none";
  const observedStages = Array.isArray(actual.observedStages) ? actual.observedStages.join(" -> ") : "none";
  const channelsTouched = Array.isArray(actual.channelsTouched) ? actual.channelsTouched.join(" -> ") : "none";
  const missingFields =
    Array.isArray(env.missingContextFields) && env.missingContextFields.length > 0
      ? env.missingContextFields.join(", ")
      : "none";
  const a2aHops = Array.isArray(env.a2aChain)
    ? env.a2aChain
        .map((h) => `${h.from}->${h.to}[${h.status},conf=${h.confidence}]`)
        .join("; ")
    : "none";

  const plane1 =
    `Plane 1 (Hoped Blueprint): id=${bp.blueprintId ?? "unknown"}, tier=${trace.customerTier ?? "standard"}, ` +
    `goldenPath=[${goldenStages}], plannedChannels=[${plannedChannels}], ` +
    `slaBudget=${bp.slaBudgetSeconds ?? 0}s, momentOfTruth="${bp.momentOfTruth ?? ""}"`;

  const plane2 =
    `Plane 2 (Actual Trace): observedStages=[${observedStages}], channelsTouched=[${channelsTouched}], ` +
    `elapsed=${actual.elapsedSeconds ?? 0}s vs budget=${bp.slaBudgetSeconds ?? 0}s, ` +
    `loopCount=${actual.loopCount ?? 0}, driftSummary="${actual.driftSummary ?? ""}"`;

  const contextStr =
    `Omnichannel & A2A Context Envelope (${env.envelopeId ?? "no-id"}): ` +
    `authCarriedOver=${Boolean(env.authCarriedOver)}, extractedSlotsPreserved=${Boolean(env.extractedSlotsPreserved)}, ` +
    `missingFields=[${missingFields}], a2aChain=[${a2aHops}]`;

  const liveStr = `Live Customer Utterance: "${trace.liveCustomerUtterance ?? ""}"`;

  return [plane1, plane2, contextStr, liveStr].join(" | ");
};

const askSystemOne = async (trace) => {
  const jid = trace.journeyId ?? trace.id ?? "unknown";
  const body = {
    state: formatState(trace),
    questions: {
      conformance_drift: {
        type: "score",
        instructions:
          "How severely has the actual customer journey drifted from the planned golden-path blueprint?",
        options: ["on_golden_path", "minor_deviation", "critical_path_break"],
        criteria: ["on_golden_path", "minor_deviation", "critical_path_break"],
      },
      context_hydration_urgent: {
        type: "noul",
        instructions:
          "Does this journey suffer from dropped omnichannel context, repeated customer questioning, or broken A2A state that requires immediate context envelope re-hydration?",
        criteria: {
          true: "Authentication or extracted slots were dropped across channels, SIP UUI was stripped, the customer is forced to repeat information, or A2A agents lost state.",
          false: "The context envelope is intact with authentication and extracted slots preserved across hops.",
        },
      },
      orchestration_action: {
        type: "choice",
        instructions: "What Plane-3 real-time orchestration action should be taken next?",
        options: [
          "continue_golden_path",
          "hydrate_context_and_resume",
          "delegate_a2a_specialist",
          "steer_to_async_digital",
          "escalate_warm_human_advocate",
          "suppress_outreach_and_close",
        ],
        criteria: {
          continue_golden_path:
            "Journey is tracking on the planned golden path within SLA budget with intact context and high A2A confidence.",
          hydrate_context_and_resume:
            "Omnichannel context or SIP UUI token was dropped during channel transition; re-hydrate prior app or web diagnostic state and resume without re-asking the customer.",
          delegate_a2a_specialist:
            "Mid-journey intent pivot or security step-up requires delegating to a specialized A2A agent (such as retention negotiation or fraud trust verification) with hydrated context.",
          steer_to_async_digital:
            "Voice queue wait time is spiked on a routine request that can be completed faster by pushing an asynchronous WhatsApp or SMS visual flow with full context.",
          escalate_warm_human_advocate:
            "Severe A2A ping-pong looping, customer anger, or critical life-safety medical dependency requires immediate warm escalation to a senior human advocate.",
          suppress_outreach_and_close:
            "The underlying issue was already resolved on another channel and a stale outbound or collections nudge collided with cooldown governance; suppress and close.",
        },
      },
      target_a2a_owner: {
        type: "choice",
        instructions: "Which A2A agent or human specialist should own the next step?",
        options: [
          "cai_concierge",
          "billing_specialist_agent",
          "tech_diagnostics_agent",
          "fraud_trust_agent",
          "retention_negotiator_agent",
          "senior_human_advocate",
        ],
        criteria: {
          cai_concierge:
            "Frontline conversational AI concierge for clean golden-path completion, async digital link push, or cooldown suppression closure.",
          billing_specialist_agent:
            "Automated billing ledger and invoice dispute specialist agent.",
          tech_diagnostics_agent:
            "Automated technical diagnostics, API webhook setup, and network telemetry agent.",
          fraud_trust_agent:
            "Account takeover, SIM-swap anomaly, and biometric step-up verification security agent.",
          retention_negotiator_agent:
            "High-LTV churn prevention, contract renewal, and competitor price-match negotiation specialist agent.",
          senior_human_advocate:
            "Senior live human advocate for multi-hop A2A ping-pong loop rescue, frustrated VIP recovery, or life-safety medical outage escalation.",
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
  if (!res.ok) throw new Error(`systemone HTTP ${res.status} for journey ${jid}`);
  const json = await res.json();
  return {
    conformance_drift: json.answers.conformance_drift,
    context_hydration_urgent: json.answers.context_hydration_urgent,
    orchestration_action: json.answers.orchestration_action,
    target_a2a_owner: json.answers.target_a2a_owner,
  };
};

const journeyPolicy = (answers) => {
  const drift = answers.conformance_drift;
  const hydrateNoul = answers.context_hydration_urgent.noul;
  const action = answers.orchestration_action;
  const owner = answers.target_a2a_owner;

  const actionConf = action.confidence ?? 0;
  const ownerConf = owner.confidence ?? 0;
  const driftConf = drift.confidence ?? 0;
  const primaryConf = actionConf;

  let band = "low";
  let execution_mode = "gather_more_info";
  if (primaryConf >= BAND_HIGH) {
    band = "high";
    execution_mode = "act_immediately";
  } else if (primaryConf >= BAND_MEDIUM) {
    band = "medium";
    execution_mode = "act_with_verification";
  }

  let drift_label = "on_golden_path";
  if (drift.score >= 1.35) {
    drift_label = "critical_path_break";
  } else if (drift.score >= 0.65) {
    drift_label = "minor_deviation";
  }

  const hydration_urgent = hydrateNoul >= BAND_HIGH;

  return {
    drift_score: Number(drift.score.toFixed(2)),
    drift_confidence: Number(driftConf.toFixed(3)),
    conformance_drift: drift_label,
    context_hydration_noul: Number(hydrateNoul.toFixed(3)),
    context_hydration_urgent: hydration_urgent,
    orchestration_action: action.choice,
    action_confidence: Number(actionConf.toFixed(3)),
    target_a2a_owner: owner.choice,
    owner_confidence: Number(ownerConf.toFixed(3)),
    band,
    execution_mode,
  };
};

const evaluateTrace = async (trace) => {
  const jid = trace.journeyId ?? trace.id ?? "unknown";
  let answers;
  try {
    answers = await askSystemOne(trace);
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    failures.push({ journey_id: jid, error: msg });
    console.error(`WARN  ask failed for ${jid}: ${msg}`);
    return null;
  }

  const decision = journeyPolicy(answers);
  const bp = trace.hopedBlueprint ?? {};
  const actual = trace.actualTrace ?? {};

  const row = {
    decided_at: new Date().toISOString(),
    journey_id: jid,
    customer_tier: trace.customerTier ?? "standard",
    blueprint_id: bp.blueprintId ?? "unknown",
    loop_count: actual.loopCount ?? 0,
    elapsed_sec: actual.elapsedSeconds ?? null,
    sla_budget_sec: bp.slaBudgetSeconds ?? null,
    ...decision,
  };

  row.consoleLine =
    `${String(row.journey_id).padEnd(10)}` +
    `${String(row.blueprint_id).slice(0, 26).padEnd(28)}` +
    `${row.conformance_drift.padEnd(21)}` +
    `${String(row.context_hydration_noul).padEnd(9)}` +
    `${row.orchestration_action.padEnd(30)}` +
    `${row.target_a2a_owner.padEnd(28)}` +
    `${String(row.action_confidence).padEnd(8)}` +
    `${row.band} (${row.execution_mode})`;

  return row;
};

const printHeader = () => {
  if (!asJson) {
    console.log(
      `${"JOURNEY".padEnd(10)}` +
        `${"BLUEPRINT".padEnd(28)}` +
        `${"DRIFT".padEnd(21)}` +
        `${"HYDRATE".padEnd(9)}` +
        `${"ORCHESTRATION_ACTION".padEnd(30)}` +
        `${"TARGET_A2A_OWNER".padEnd(28)}` +
        `${"CONF".padEnd(8)}` +
        `BAND`,
    );
  }
};

const printRow = (row) => {
  if (asJson) {
    const { consoleLine, ...clean } = row;
    console.log(JSON.stringify(clean));
  } else {
    console.log(row.consoleLine);
  }
};

const printSummary = (rows) => {
  const highBand = rows.filter((r) => r.band === "high").length;
  const criticalDrift = rows.filter((r) => r.conformance_drift === "critical_path_break").length;
  const hydrateCount = rows.filter((r) => r.context_hydration_urgent).length;
  const humanEsc = rows.filter((r) => r.orchestration_action === "escalate_warm_human_advocate").length;
  console.log(
    `\nSummary: ${rows.length} journey(s) orchestrated (${highBand} high-confidence band, ${criticalDrift} critical path break, ${hydrateCount} urgent context hydration, ${humanEsc} warm human advocate escalation).`,
  );
  if (outPath && outAppendsOk > 0) {
    console.error(`History: results appended to ${outPath} (${outAppendsOk} row(s))`);
  }
};

/* ---------- batch mode ---------- */

if (!watch) {
  const traces = loadBatch();
  const results = [];

  console.error(
    `\nJourney & A2A Orchestration Decider — ${traces.length} journey(s), bands: high>=${BAND_HIGH}, medium>=${BAND_MEDIUM}\n`,
  );
  printHeader();

  for (const trace of traces) {
    const row = await evaluateTrace(trace);
    if (row) {
      results.push(row);
      appendOut(row);
      printRow(row);
    }
  }

  if (!asJson) printSummary(results);
  cleanup();
  if (failures.length > 0) {
    console.error(`\nCOMPLETE WITH ERRORS — ${failures.length} failure(s)`);
    process.exit(1);
  }
  process.exit(0);
}

/* ---------- watch mode ---------- */

console.error(`watching ${tracesPath} every ${interval}ms — append journey traces to evaluate live (Ctrl-C to stop)`);
printHeader();

const allRows = [];
let offset = 0;
if (existsSync(tracesPath)) {
  const { rows, completeBytes } = parseCompleteLinesFromBuffer(readFileSync(tracesPath));
  for (const trace of rows) {
    const row = await evaluateTrace(trace);
    if (row) {
      allRows.push(row);
      appendOut(row);
      printRow(row);
    }
  }
  offset = completeBytes;
  console.error(`evaluated ${rows.length} existing journey trace(s)`);
}

let fileGoneWarned = false;
while (true) {
  await new Promise((r) => setTimeout(r, interval));
  if (serverCrashed) {
    console.error("decider server is gone — stopping watch");
    process.exit(1);
  }
  let size = 0;
  try {
    size = statSync(tracesPath).size;
  } catch {
    if (!fileGoneWarned) {
      fileGoneWarned = true;
      console.error(`WARN  ${tracesPath} is gone; waiting for it to reappear`);
    }
    continue;
  }
  fileGoneWarned = false;
  if (size < offset) {
    console.error(`WARN  ${tracesPath} shrank (${size} < offset ${offset}); resetting to file start`);
    offset = 0;
  } else if (size === offset) {
    continue;
  }
  let chunk;
  try {
    chunk = readFileSync(tracesPath);
  } catch (e) {
    console.error(`WARN  could not read ${tracesPath}: ${String(e instanceof Error ? e.message : e)}`);
    continue;
  }
  const { rows, completeBytes } = parseCompleteLinesFromBuffer(chunk.subarray(offset));
  for (const trace of rows) {
    const row = await evaluateTrace(trace);
    if (row) {
      allRows.push(row);
      appendOut(row);
      printRow(row);
    }
  }
  offset += completeBytes;
}
