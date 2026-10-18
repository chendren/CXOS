#!/usr/bin/env node
/**
 * Routing Decide — ACD + Journey Orchestration routing decisions via the local Strands 2B Decider.
 *
 * Evaluates incoming contacts against three calibrated System One questions:
 *   - skill_queue (choice): billing_dispute, technical_support, retention_save,
 *                           fraud_escalation, order_fulfillment
 *   - vip_priority (noul): whether the contact warrants a priority queue jump
 *   - offer_callback (noul): whether the contact is suitable for an EWT callback offer
 *
 * Applies engine confidence bands:
 *   BAND_HIGH = 0.7   -> act_immediately (auto_route)
 *   BAND_MEDIUM = 0.4 -> act_with_verification (verified_route)
 *   < 0.4             -> gather_more_info (triage_hold)
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
const file = argOf("--file") ?? join(workspaceRoot, "fixtures", "routing-contacts.sample.json");
const port = Number(argOf("--port") ?? process.env.STRANDS_DECIDER_PORT ?? 8111);
const asJson = rawArgs.includes("--json");

const contactsPath = resolve(file);
if (!existsSync(contactsPath)) {
  console.error(`Contacts file not found: ${contactsPath}`);
  process.exit(2);
}

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

const loadBatch = () => {
  if (file.endsWith(".jsonl")) {
    const text = readFileSync(contactsPath, "utf8");
    return parseContactLines(text, contactsPath);
  }
  const arr = JSON.parse(readFileSync(contactsPath, "utf8"));
  if (!Array.isArray(arr) || arr.length === 0) {
    console.error("Contacts file must be a non-empty JSON array (or non-empty JSONL).");
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

const formatState = (contact) => {
  const parts = [];
  if (contact.channel) parts.push(`Channel: ${contact.channel}`);
  if (contact.customer_tier) parts.push(`Customer Tier: ${contact.customer_tier}`);
  if (contact.estimated_wait_sec !== undefined) {
    parts.push(`Estimated Wait Seconds: ${contact.estimated_wait_sec}`);
  }
  parts.push(`Summary: ${contact.summary}`);
  return parts.join(" | ");
};

const askSystemOne = async (contact) => {
  const body = {
    state: formatState(contact),
    questions: {
      skill_queue: {
        type: "choice",
        instructions:
          "Which specialized ACD skill queue should handle this incoming customer contact based on the primary intent and issue domain?",
        criteria: {
          billing_dispute:
            "Invoice errors, double charges, prorated ledger credits, fee disputes, or payment plan adjustments.",
          technical_support:
            "Service outages, hardware or ONT alarms, packet loss, connectivity failures, or SIP trunk faults.",
          retention_save:
            "Cancellation requests, competitor price-match demands, churn threats, or contract renewal negotiations.",
          fraud_escalation:
            "Unauthorized account charges, stolen payment instruments, account takeover, or urgent security freezes.",
          order_fulfillment:
            "Equipment shipment tracking, unshipped orders, carrier delays, delivery status, or hardware swaps.",
        },
      },
      vip_priority: {
        type: "noul",
        instructions:
          "Does this contact warrant an immediate VIP or emergency priority queue jump ahead of standard FIFO traffic?",
        criteria: {
          true: "The caller is an enterprise VIP, reports active financial fraud, or faces a critical multi-site business outage.",
          false: "The contact is a routine inquiry, standard billing question, or non-emergency support request.",
        },
      },
      offer_callback: {
        type: "noul",
        instructions:
          "Is this contact suitable for an automated Estimated Wait Time (EWT) virtual queue callback offer rather than holding live?",
        criteria: {
          true: "Wait time is elevated on a routine, non-emergency issue where the customer can safely receive a return call.",
          false: "The issue is urgent fraud, a critical outage, an active cancellation threat, or wait time is already very short.",
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
  if (!res.ok) throw new Error(`systemone HTTP ${res.status} for contact ${contact.id}`);
  const json = await res.json();
  return {
    skill_queue: json.answers.skill_queue,
    vip_priority: json.answers.vip_priority,
    offer_callback: json.answers.offer_callback,
  };
};

const routingPolicy = (answers) => {
  const q = answers.skill_queue;
  const vip = answers.vip_priority.noul;
  const cb = answers.offer_callback.noul;
  const conf = q.confidence ?? 0;

  let band = "low";
  let execution_mode = "gather_more_info";
  if (conf >= BAND_HIGH) {
    band = "high";
    execution_mode = "act_immediately";
  } else if (conf >= BAND_MEDIUM) {
    band = "medium";
    execution_mode = "act_with_verification";
  }

  const priority_jump = vip >= BAND_HIGH;
  const callback_offered = !priority_jump && cb >= BAND_MEDIUM;

  let routing_treatment = "standard_fifo";
  if (priority_jump) {
    routing_treatment = "vip_front_of_queue";
  } else if (callback_offered) {
    routing_treatment = "ewt_callback_offer";
  }

  return {
    skill_queue: q.choice,
    queue_confidence: Number(conf.toFixed(3)),
    band,
    execution_mode,
    priority_jump,
    vip_noul: Number(vip.toFixed(3)),
    callback_offered,
    callback_noul: Number(cb.toFixed(3)),
    routing_treatment,
  };
};

/* ---------- batch execution ---------- */

const contacts = loadBatch();
const failures = [];
const results = [];

console.error(
  `\nACD Routing Decider — ${contacts.length} contact(s), bands: high>=${BAND_HIGH}, medium>=${BAND_MEDIUM}\n`,
);
if (!asJson) {
  console.log(
    `${"CONTACT".padEnd(10)}${"CHANNEL".padEnd(9)}${"SKILL_QUEUE".padEnd(20)}${"Q_CONF".padEnd(8)}${"BAND".padEnd(8)}${"VIP_NOUL".padEnd(10)}${"CB_NOUL".padEnd(9)}TREATMENT`,
  );
}

for (const contact of contacts) {
  try {
    const answers = await askSystemOne(contact);
    const decision = routingPolicy(answers);
    const row = {
      decided_at: new Date().toISOString(),
      contact_id: contact.id,
      channel: contact.channel ?? "unknown",
      customer_tier: contact.customer_tier ?? "standard",
      estimated_wait_sec: contact.estimated_wait_sec ?? null,
      ...decision,
    };
    results.push(row);
    if (asJson) {
      console.log(JSON.stringify(row));
    } else {
      console.log(
        `${String(row.contact_id).padEnd(10)}${String(row.channel).padEnd(9)}${row.skill_queue.padEnd(20)}` +
          `${String(row.queue_confidence).padEnd(8)}${row.band.padEnd(8)}${String(row.vip_noul).padEnd(10)}` +
          `${String(row.callback_noul).padEnd(9)}${row.routing_treatment} (${row.execution_mode})`,
      );
    }
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    failures.push({ contact_id: contact.id, error: msg });
    console.error(`WARN  ask failed for ${contact.id}: ${msg}`);
  }
}

if (!asJson) {
  const vipCount = results.filter((r) => r.priority_jump).length;
  const cbCount = results.filter((r) => r.callback_offered).length;
  const highBand = results.filter((r) => r.band === "high").length;
  console.log(
    `\nSummary: ${results.length} routed (${highBand} high-confidence auto-route, ${vipCount} VIP priority jump, ${cbCount} callback offered).`,
  );
}

shutdown();
if (failures.length > 0) {
  console.error(`\nCOMPLETE WITH ERRORS — ${failures.length} failure(s)`);
  process.exit(1);
}
process.exit(0);
