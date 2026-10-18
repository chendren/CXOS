#!/usr/bin/env node
/**
 * QA Triage — sample-plan selection via the local Strands Decider.
 *
 * Inputs are contacts (id, channel, summary); outputs are QA paths decided by the
 * calibrated decision model and the engine's confidence bands:
 *
 *   high band   (conf >= 0.7) -> act_immediately
 *   medium band (conf >= 0.4) -> act_with_verification
 *   low band    (conf <  0.4) -> gather_more_info
 *
 * Policy (deterministic, in precedence order):
 *   1. compliance noul >= 0.70                          -> targeted_human_qa (compliance_risk)
 *   2. severity score >= 1.5 with confidence >= 0.70   -> targeted_human_qa (high_impact)
 *   3. severity confidence < 0.40 (low band)            -> needs_review (ambiguous signals)
 *   4. otherwise                                       -> auto_qa_only (full-coverage auto scoring)
 *
 * Everything not human-sampled still receives full-coverage auto QA; this script only
 * picks which contacts deserve scarce human evaluator attention first.
 *
 * Usage:
 *   npm run qa-triage -- --file fixtures/qa-triage-contacts.sample.json
 *   npm run qa-triage -- --file contacts.json --json          # JSONL to stdout
 *
 * The decider server is spawned on 127.0.0.1:8111 (or STRANDS_DECIDER_PORT / --port);
 * if one is already healthy on that port it is reused and left running.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const venvBin = join(workspaceRoot, ".venv", "bin");
const deciderBin = join(venvBin, "strands-decider");
const CHECKPOINT =
  process.env.STRANDS_DECIDER_CHECKPOINT || "StrandsAgents/strands-decider-2B-hobson-v21";

// Engine confidence bands ( ontology/cx-ontology.json > engineAlignment.confidenceBands )
const BAND_HIGH = 0.7;
const BAND_MEDIUM = 0.4;

const rawArgs = process.argv.slice(2);
const argOf = (flag) => {
  const i = rawArgs.indexOf(flag);
  return i >= 0 ? rawArgs[i + 1] : undefined;
};
const file = argOf("--file");
const port = Number(argOf("--port") ?? process.env.STRANDS_DECIDER_PORT ?? 8111);
const asJson = rawArgs.includes("--json");

if (!file || !existsSync(resolve(file))) {
  console.error(
    `Usage: npm run qa-triage -- --file <contacts.json> [--json] [--port 8111]\n` +
      `  contacts.json: [{ "id": "...", "channel": "...", "summary": "..." }, ...]`,
  );
  process.exit(2);
}

const contacts = JSON.parse(readFileSync(resolve(file), "utf8"));
if (!Array.isArray(contacts) || contacts.length === 0) {
  console.error("Contacts file must be a non-empty JSON array.");
  process.exit(2);
}

/* ---------- server lifecycle ---------- */

const base = `http://127.0.0.1:${port}`;
if (!existsSync(deciderBin)) {
  console.error(`strands-decider not found at ${deciderBin}. Run:\n  python3 -m venv .venv && .venv/bin/pip install strands-decider`);
  process.exit(2);
}

const isHealthy = async () => {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
};

let spawnedServer = null;
if (await isHealthy()) {
  console.error(`decider server already healthy on port ${port} — reusing`);
} else {
  spawnedServer = spawn(deciderBin, ["serve", CHECKPOINT, "--host", "127.0.0.1", "--port", String(port)], {
    cwd: workspaceRoot,
    stdio: "ignore",
    detached: false,
  });
  const bootDeadline = Date.now() + 180_000; // model load on mps can take a while cold
  while (!(await isHealthy())) {
    if (Date.now() > bootDeadline) {
      spawnedServer.kill("SIGTERM");
      console.error(`decider server did not become healthy on port ${port} within 180s`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`decider server up on port ${port} (pid ${spawnedServer.pid})`);
}

const shutdown = () => {
  if (spawnedServer) spawnedServer.kill("SIGTERM");
};
process.on("exit", shutdown);
process.on("SIGINT", () => { shutdown(); process.exit(130); });
process.on("SIGTERM", () => { shutdown(); process.exit(143); });

/* ---------- decision asks ---------- */

const askSystemOne = async (contact) => {
  const body = {
    state: contact.summary,
    questions: {
      compliance_flag: {
        type: "noul",
        instructions:
          "Does this contact summary indicate a possible compliance failure, such as a skipped identity verification, a missing mandatory disclosure, or a misstated customer-facing policy?",
        criteria: {
          true: "A verification, disclosure, or policy step appears skipped, missed, or contradicted.",
          false: "Nothing in the summary suggests a compliance misstep.",
        },
      },
      severity: {
        type: "score",
        instructions: "How severe is the customer impact described in this contact?",
        criteria: ["minor", "moderate", "major"],
      },
    },
  };
  const res = await fetch(`${base}/v1/systemone`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`systemone HTTP ${res.status} for contact ${contact.id}`);
  const json = await res.json();
  return { compliance: json.answers.compliance_flag, severity: json.answers.severity };
};

/** Deterministic band policy (precedence order). */
const triagePolicy = (answers) => {
  const p = answers.compliance.noul;
  const sev = answers.severity;
  if (p >= BAND_HIGH) {
    return { qa_path: "targeted_human_qa", priority: 0, band: "high", reason: `compliance_risk (noul ${p.toFixed(3)})` };
  }
  if (sev.score >= 1.5 && sev.confidence >= BAND_HIGH) {
    return { qa_path: "targeted_human_qa", priority: 1, band: "high", reason: `high_impact (score ${sev.score.toFixed(2)}, conf ${(sev.confidence ?? 0).toFixed(3)})` };
  }
  if (p < 0.2 && sev.score < 1.0) {
    return { qa_path: "auto_qa_only", priority: 2, band: "clear_low", reason: `clear_low_risk (noul ${p.toFixed(3)}, score ${sev.score.toFixed(2)})` };
  }
  if (sev.confidence !== undefined && sev.confidence < BAND_MEDIUM) {
    return { qa_path: "needs_review", priority: 3, band: "low", reason: `ambiguous_severity (conf ${sev.confidence.toFixed(3)}) — gather_more_info` };
  }
  return { qa_path: "auto_qa_only", priority: 4, band: "medium", reason: `no_high_band_signal (noul ${p.toFixed(3)}, score ${sev.score.toFixed(2)})` };
};

/* ---------- run ---------- */

const results = [];
for (const contact of contacts) {
  const answers = await askSystemOne(contact);
  const decision = triagePolicy(answers);
  const row = {
    contact_id: contact.id,
    channel: contact.channel ?? "unknown",
    qa_path: decision.qa_path,
    priority: decision.priority,
    band: decision.band,
    reason: decision.reason,
    compliance_noul: Number(answers.compliance.noul.toFixed(3)),
    severity_score: Number(answers.severity.score.toFixed(2)),
    severity_confidence: answers.severity.confidence !== undefined ? Number(answers.severity.confidence.toFixed(3)) : null,
  };
  results.push(row);
  if (asJson) console.log(JSON.stringify(row));
}

results.sort((a, b) => a.priority - b.priority || a.contact_id.localeCompare(b.contact_id));

if (!asJson) {
  const width = (s, n) => String(s).padEnd(n);
  console.log(`\nQA triage — ${results.length} contact(s), policy: compliance>=0.7 || (severity>=1.5 & conf>=0.7) -> human QA; noul<0.2 & score<1.0 -> auto; conf<0.4 -> review\n`);
  console.log(`${width("CONTACT", 10)}${width("PATH", 18)}${width("NOUT", 7)}${width("SEV", 5)}${width("SEVCONF", 8)}REASON`);
  for (const r of results) {
    console.log(
      `${width(r.contact_id, 10)}${width(r.qa_path, 18)}${width(r.compliance_noul, 7)}${width(r.severity_score, 5)}${width(r.severity_confidence ?? "-", 8)}${r.reason}`,
    );
  }
  const human = results.filter((r) => r.qa_path === "targeted_human_qa").length;
  const review = results.filter((r) => r.qa_path === "needs_review").length;
  console.log(`\nSummary: ${human} targeted human QA, ${review} needs review, ${results.length - human - review} auto-QA only.`);
}

shutdown();
process.exit(0);