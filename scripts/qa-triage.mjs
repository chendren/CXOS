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
 *   3. noul < 0.20 and severity score < 1.0             -> auto_qa_only (clear_low_risk)
 *   4. severity confidence < 0.40 (low band)            -> needs_review (ambiguous signals)
 *   5. otherwise                                        -> auto_qa_only (no high-band signal)
 *
 * Everything not human-sampled still receives full-coverage auto QA; this script only
 * picks which contacts deserve scarce human evaluator attention first.
 *
 * Usage:
 *   npm run qa-triage -- --file fixtures/qa-triage-contacts.sample.json
 *   npm run qa-triage -- --file contacts.jsonl --json            # JSONL input
 *   npm run qa-triage -- --file live-contacts.jsonl --watch \
 *       --out .tmp/qa-triage/history.jsonl --json                 # tail -f triage
 *
 * --watch tails a .jsonl file: appended contacts are triaged as they arrive
 * (poll every --interval ms, default 2000). Truncation/rotation resets tracking to
 * the file start (already-seen contacts may re-triage — prefer in-place appends).
 * The input file may not exist yet in watch mode; it is awaited. With --out, every
 * triage result row is appended to the given JSONL file — the history feeds
 * npm run qa-report. An append failure is reported and flips the exit code to 1.
 *
 * The decider server is spawned on 127.0.0.1:8111 (or STRANDS_DECIDER_PORT / --port);
 * if one is already healthy on that port it is reused and left running.
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
const watch = rawArgs.includes("--watch");
const outPath = argOf("--out") ? resolve(argOf("--out")) : undefined;
const interval = Number(argOf("--interval") ?? 2000);

if (!file) {
  console.error(
    `Usage: npm run qa-triage -- --file <contacts.json|.jsonl> [--json] [--watch] [--out history.jsonl] [--port 8111]\n` +
      `  --file accepts a JSON array or JSONL (one contact object per line)\n` +
      `  --watch tails a .jsonl file (which may not exist yet) as contacts are appended`,
  );
  process.exit(2);
}
if (watch && !file.endsWith(".jsonl")) {
  console.error("--watch requires a .jsonl file (append-mode input).");
  process.exit(2);
}
const contactsPath = resolve(file);
if (!watch && !existsSync(contactsPath)) {
  console.error(`contacts file not found: ${contactsPath}`);
  process.exit(2);
}

/* ---------- contacts parsing ---------- */

const failures = [];

/** Parse every non-empty line of text into contact objects; malformed lines are warned and skipped. */
const parseContactLines = (text, src) => {
  const rows = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      console.error(`WARN  skipping malformed contact line in ${src}: ${trimmed.slice(0, 80)}`);
    }
  }
  return rows;
};

/**
 * Watch-safe chunk parse: only newline-terminated lines, with BYTE-exact accounting.
 * All offset math stays in Buffer space (bytes); only complete line runs are decoded
 * to UTF-8 strings, so multi-byte characters can never split a slice boundary.
 */
const parseCompleteLinesFromBuffer = (buf) => {
  const lastNl = buf.lastIndexOf(0x0a);
  if (lastNl < 0) return { rows: [], completeBytes: 0 };
  const rows = parseContactLines(buf.subarray(0, lastNl + 1).toString("utf8"), "watch chunk");
  return { rows, completeBytes: lastNl + 1 };
};

const loadBatch = () => {
  if (file.endsWith(".jsonl")) {
    const text = readFileSync(contactsPath, "utf8");
    if (text.length > 0 && !text.endsWith("\n")) {
      console.error("WARN  contacts JSONL lacks a trailing newline; the final line is still parsed");
    }
    return parseContactLines(text, contactsPath);
  }
  const arr = JSON.parse(readFileSync(contactsPath, "utf8"));
  if (!Array.isArray(arr) || arr.length === 0) {
    console.error("Contacts file must be a non-empty JSON array (or non-empty JSONL).");
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
    const { consoleLine, ...persist } = row; // display artifact stays out of the history
    appendFileSync(outPath, JSON.stringify(persist) + "\n");
    outAppendsOk += 1;
  } catch (e) {
    // A failed history write must not be masked by an exit 0 or a false success line.
    const msg = `history append failed: ${String(e instanceof Error ? e.message : e)}`;
    console.error(`WARN  ${msg}`);
    failures.push({ contact_id: row.contact_id, error: msg });
  }
};

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
let serverCrashed = false;

// Kill handlers are registered BEFORE any spawn/boot wait so Ctrl-C at any point
// (including during a cold model load) cannot orphan the spawned server.
const shutdown = () => {
  if (spawnedServer && spawnedServer.exitCode === null) spawnedServer.kill("SIGTERM");
};
process.on("exit", shutdown);
process.on("SIGINT", () => { shutdown(); process.exit(130); });
process.on("SIGTERM", () => { shutdown(); process.exit(143); });

if (await isHealthy()) {
  console.error(`decider server already healthy on port ${port} — reusing`);
} else {
  spawnedServer = spawn(deciderBin, ["serve", CHECKPOINT, "--host", "127.0.0.1", "--port", String(port)], {
    cwd: workspaceRoot,
    stdio: ["ignore", "ignore", "pipe"],
    detached: false,
  });
  const serverErr = [];
  spawnedServer.stderr.on("data", (chunk) => {
    serverErr.push(String(chunk));
    if (serverErr.length > 50) serverErr.shift(); // keep tail only
  });
  spawnedServer.on("exit", (code) => {
    if (!serverCrashed) {
      serverCrashed = true;
      console.error(`decider server exited during boot (code ${code}). Last stderr lines:`);
      console.error(serverErr.join("").split("\n").slice(-12).join("\n") || "(no stderr)");
    }
  });

  const bootDeadline = Date.now() + 180_000; // model load on mps can take a while cold
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

/* ---------- run: one contact -> row ---------- */

const triageContact = async (contact) => {
  let answers;
  try {
    answers = await askSystemOne(contact);
  } catch (e) {
    // One failed ask must not abort the batch; record it and continue.
    const msg = String(e instanceof Error ? e.message : e);
    failures.push({ contact_id: contact.id, error: msg });
    console.error(`WARN  ask failed for ${contact.id}: ${msg}`);
    return null;
  }
  const decision = triagePolicy(answers);
  const row = {
    triaged_at: new Date().toISOString(),
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
  row.consoleLine =
    `${String(row.contact_id).padEnd(10)}${row.qa_path.padEnd(18)}${String(row.compliance_noul).padEnd(7)}` +
    `${String(row.severity_score).padEnd(5)}${String(row.severity_confidence ?? "-").padEnd(8)}${row.reason}`;
  return row;
};

const printRow = (row) => {
  if (asJson) console.log(JSON.stringify(row));
  else console.log(row.consoleLine);
};

const printSummary = (rowsSoFar) => {
  const human = rowsSoFar.filter((r) => r.qa_path === "targeted_human_qa").length;
  const review = rowsSoFar.filter((r) => r.qa_path === "needs_review").length;
  console.log(`\nSummary: ${human} targeted human QA, ${review} needs review, ${rowsSoFar.length - human - review} auto-QA only.`);
  if (outPath && outAppendsOk > 0) console.error(`History: results appended to ${outPath} (${outAppendsOk} row(s))`);
};

/* ---------- batch mode ---------- */

if (!watch) {
  const contacts = loadBatch();
  const results = [];
  console.error(
    `\nQA triage — ${contacts.length} contact(s), policy: compliance>=0.7 || (severity>=1.5 & conf>=0.7) -> human QA; noul<0.2 & score<1.0 -> auto; conf<0.4 -> review\n`,
  );
  if (!asJson) {
    console.log(`${"CONTACT".padEnd(10)}${"PATH".padEnd(18)}${"NOUT".padEnd(7)}${"SEV".padEnd(5)}${"SEVCONF".padEnd(8)}REASON`);
  }
  for (const contact of contacts) {
    const row = await triageContact(contact);
    if (row) {
      results.push(row);
      appendOut(row);
      printRow(row);
    }
  }
  results.sort((a, b) => a.priority - b.priority || a.contact_id.localeCompare(b.contact_id));
  if (!asJson) printSummary(results);
  shutdown();
  if (failures.length > 0) {
    console.error(`\nCOMPLETE WITH ERRORS — ${failures.length}/${contacts.length} contact/failure record(s):`);
    for (const f of failures) console.error(`  ${f.contact_id}: ${f.error}`);
    process.exit(1);
  }
  process.exit(0);
}

/* ---------- watch mode: tail -f the JSONL file ---------- */

console.error(`watching ${contactsPath} every ${interval}ms — append contacts to triage them live (Ctrl-C to stop)`);
if (!asJson) {
  console.log(`${"CONTACT".padEnd(10)}${"PATH".padEnd(18)}${"NOUT".padEnd(7)}${"SEV".padEnd(5)}${"SEVCONF".padEnd(8)}REASON`);
}

const allRows = [];
let offset = 0;
if (existsSync(contactsPath)) {
  const { rows, completeBytes } = parseCompleteLinesFromBuffer(readFileSync(contactsPath));
  for (const contact of rows) {
    const row = await triageContact(contact);
    if (row) {
      allRows.push(row);
      appendOut(row);
      printRow(row);
    }
  }
  offset = completeBytes;
  console.error(`triaged ${rows.length} existing contact(s)`);
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
    size = statSync(contactsPath).size;
  } catch {
    if (!fileGoneWarned) {
      fileGoneWarned = true;
      console.error(`WARN  ${contactsPath} is gone; waiting for it to reappear`);
    }
    continue;
  }
  fileGoneWarned = false;
  if (size < offset) {
    // Truncated or rotated: reset to the file start so new content is never
    // silently skipped. Already-seen contacts may re-triage — prefer in-place appends.
    console.error(`WARN  ${contactsPath} shrank (${size} < offset ${offset}); truncation/rotation assumed — resetting to file start`);
    offset = 0;
  } else if (size === offset) {
    continue;
  }
  let chunk;
  try {
    chunk = readFileSync(contactsPath);
  } catch (e) {
    // Race with a writer replacing the file; retry on the next poll.
    console.error(`WARN  could not read ${contactsPath}: ${String(e instanceof Error ? e.message : e)}`);
    continue;
  }
  const { rows, completeBytes } = parseCompleteLinesFromBuffer(chunk.subarray(offset));
  for (const contact of rows) {
    const row = await triageContact(contact);
    if (row) {
      allRows.push(row);
      appendOut(row);
      printRow(row);
    }
  }
  offset += completeBytes;
}