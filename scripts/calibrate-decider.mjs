#!/usr/bin/env node
/**
 * Calibrate Decider — empirical calibration & threshold sweep harness for the
 * local Strands 2B Decisions model against a gold-labeled CX QA fixture.
 *
 * Computes:
 *  - Binary compliance `noul`: Accuracy, Brier score, Expected Calibration Error (ECE),
 *    and Precision/Recall across high-band threshold candidates (0.50 .. 0.85).
 *  - End-to-end QA triage routing agreement against gold_qa_path.
 *  - Persists calibration summary JSON to .tmp/qa-triage/calibration.json for
 *    dashboard and report consumption.
 *
 * Usage:
 *   npm run qa-calibrate
 *   npm run qa-calibrate -- --file fixtures/qa-calibration-gold.json --json
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const venvBin = join(workspaceRoot, ".venv", "bin");
const deciderBin = join(venvBin, "strands-decider");
const CHECKPOINT =
  process.env.STRANDS_DECIDER_CHECKPOINT || "StrandsAgents/strands-decider-2B-hobson-v21";

const rawArgs = process.argv.slice(2);
const argOf = (flag) => {
  const i = rawArgs.indexOf(flag);
  return i >= 0 ? rawArgs[i + 1] : undefined;
};
const file = argOf("--file") ?? join(workspaceRoot, "fixtures", "qa-calibration-gold.json");
const outFile = argOf("--out") ?? join(workspaceRoot, ".tmp", "qa-triage", "calibration.json");
const port = Number(argOf("--port") ?? process.env.STRANDS_DECIDER_PORT ?? 8111);
const asJson = rawArgs.includes("--json");

if (!existsSync(resolve(file))) {
  console.error(`Gold calibration file not found: ${resolve(file)}`);
  process.exit(2);
}

const goldItems = JSON.parse(readFileSync(resolve(file), "utf8"));
if (!Array.isArray(goldItems) || goldItems.length === 0) {
  console.error("Calibration fixture must be a non-empty JSON array.");
  process.exit(2);
}

const base = `http://127.0.0.1:${port}`;
if (!existsSync(deciderBin)) {
  console.error(`strands-decider not found at ${deciderBin}.`);
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

const shutdown = () => {
  if (spawnedServer && spawnedServer.exitCode === null) spawnedServer.kill("SIGTERM");
};
process.on("exit", shutdown);
process.on("SIGINT", () => { shutdown(); process.exit(130); });
process.on("SIGTERM", () => { shutdown(); process.exit(143); });

if (!(await isHealthy())) {
  spawnedServer = spawn(deciderBin, ["serve", CHECKPOINT, "--host", "127.0.0.1", "--port", String(port)], {
    cwd: workspaceRoot,
    stdio: ["ignore", "ignore", "pipe"],
    detached: false,
  });
  const serverErr = [];
  spawnedServer.stderr.on("data", (chunk) => {
    serverErr.push(String(chunk));
    if (serverErr.length > 50) serverErr.shift();
  });
  spawnedServer.on("exit", (code) => {
    if (!serverCrashed) {
      serverCrashed = true;
      console.error(`decider server exited during boot (code ${code})`);
    }
  });
  const bootDeadline = Date.now() + 180_000;
  while (!(await isHealthy())) {
    if (serverCrashed || Date.now() > bootDeadline) {
      shutdown();
      console.error(`decider server failed to start on port ${port}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const askSystemOne = async (item) => {
  const body = {
    state: item.summary,
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
  if (!res.ok) throw new Error(`systemone HTTP ${res.status} for ${item.id}`);
  const json = await res.json();
  return {
    noul: json.answers.compliance_flag.noul,
    score: json.answers.severity.score,
    score_conf: json.answers.severity.confidence ?? 0,
  };
};

const evaluatePolicyAt = (ans, highBand = 0.7, lowClearNoul = 0.2, medBand = 0.4) => {
  if (ans.noul >= highBand) return "targeted_human_qa";
  if (ans.score >= 1.5 && ans.score_conf >= highBand) return "targeted_human_qa";
  if (ans.noul < lowClearNoul && ans.score < 1.0) return "auto_qa_only";
  if (ans.score_conf < medBand) return "needs_review";
  return "auto_qa_only";
};

const observations = [];
for (const item of goldItems) {
  const ans = await askSystemOne(item);
  const predictedPath = evaluatePolicyAt(ans, 0.7, 0.2, 0.4);
  observations.push({
    id: item.id,
    channel: item.channel,
    gold_compliance_risk: item.gold_compliance_risk,
    gold_severity_level: item.gold_severity_level,
    gold_qa_path: item.gold_qa_path,
    noul: Number(ans.noul.toFixed(4)),
    score: Number(ans.score.toFixed(3)),
    score_conf: Number(ans.score_conf.toFixed(3)),
    predicted_qa_path: predictedPath,
    path_match: predictedPath === item.gold_qa_path,
  });
}

// Brier score for binary compliance noul: mean((p - y)^2)
const n = observations.length;
const brier =
  observations.reduce((acc, o) => acc + (o.noul - o.gold_compliance_risk) ** 2, 0) / n;

// 5-bin Expected Calibration Error (ECE) on binary compliance probability
const numBins = 5;
let ece = 0;
for (let b = 0; b < numBins; b++) {
  const lo = b / numBins;
  const hi = (b + 1) / numBins;
  const inBin = observations.filter((o) =>
    b === numBins - 1 ? o.noul >= lo && o.noul <= hi : o.noul >= lo && o.noul < hi,
  );
  if (inBin.length === 0) continue;
  const avgConf = inBin.reduce((acc, o) => acc + o.noul, 0) / inBin.length;
  const avgAcc = inBin.reduce((acc, o) => acc + o.gold_compliance_risk, 0) / inBin.length;
  ece += (inBin.length / n) * Math.abs(avgConf - avgAcc);
}

// Threshold sweep for compliance high-band gate
const candidateThresholds = [0.55, 0.65, 0.7, 0.75, 0.8, 0.85];
const sweep = candidateThresholds.map((t) => {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  let pathMatches = 0;
  for (const o of observations) {
    const predPos = o.noul >= t ? 1 : 0;
    if (predPos === 1 && o.gold_compliance_risk === 1) tp++;
    else if (predPos === 1 && o.gold_compliance_risk === 0) fp++;
    else if (predPos === 0 && o.gold_compliance_risk === 0) tn++;
    else fn++;
    if (evaluatePolicyAt(o, t, 0.2, 0.4) === o.gold_qa_path) pathMatches++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    threshold: t,
    accuracy: Number(((tp + tn) / n).toFixed(3)),
    precision: Number(precision.toFixed(3)),
    recall: Number(recall.toFixed(3)),
    f1: Number(f1.toFixed(3)),
    policy_agreement: Number((pathMatches / n).toFixed(3)),
  };
});

const defaultSweep = sweep.find((s) => s.threshold === 0.7) ?? sweep[0];
const bestSweep = [...sweep].sort((a, b) => b.policy_agreement - a.policy_agreement || b.f1 - a.f1)[0];

const report = {
  calibrated_at: new Date().toISOString(),
  model: CHECKPOINT,
  sample_size: n,
  compliance_brier: Number(brier.toFixed(4)),
  compliance_ece: Number(ece.toFixed(4)),
  active_high_band: 0.7,
  recommended_high_band: bestSweep.threshold,
  compliance_f1_at_0_70: defaultSweep.f1,
  policy_agreement_at_0_70: defaultSweep.policy_agreement,
  threshold_sweep: sweep,
  observations,
};

mkdirSync(dirname(resolve(outFile)), { recursive: true });
writeFileSync(resolve(outFile), JSON.stringify(report, null, 2) + "\n");

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `\nStrands 2B Decider Calibration (${n} gold contacts)\n` +
      `  Model: ${CHECKPOINT}\n` +
      `  Compliance Brier: ${report.compliance_brier}   ECE (5-bin): ${report.compliance_ece}\n` +
      `  Active band (0.70): F1=${defaultSweep.f1}  Policy agreement=${(defaultSweep.policy_agreement * 100).toFixed(0)}%\n` +
      `  Recommended band:   ${bestSweep.threshold.toFixed(2)}\n`,
  );
  console.log("Threshold sweep:");
  for (const s of sweep) {
    const marker = s.threshold === 0.7 ? " <-- active" : "";
    console.log(
      `  t=${s.threshold.toFixed(2)}  acc=${s.accuracy.toFixed(3)}  prec=${s.precision.toFixed(3)}  rec=${s.recall.toFixed(3)}  f1=${s.f1.toFixed(3)}  policy=${(s.policy_agreement * 100).toFixed(0)}%${marker}`,
    );
  }
  console.log(`\nSaved calibration artifact: ${resolve(outFile)}`);
}

shutdown();
process.exit(0);
