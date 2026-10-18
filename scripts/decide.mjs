#!/usr/bin/env node
/**
 * Thin proxy: run the local strands-decider decision model with this workspace's venv.
 *
 * The Strands Decider (https://hf.co/StrandsAgents/strands-decider-2B-hobson-v21) is a
 * small calibrated decision model: it answers yes/no (noul), picks between options
 * (choice), and rates on ordered scales (score) — with a confidence on every answer.
 * Use it for rote decisions inside the CXOS operate loop (triage, routing picks,
 * rubric scores) and leave narrative work to the engine tiers.
 *
 * Setup (once):
 *   python3 -m venv .venv && .venv/bin/pip install strands-decider
 *
 * Usage:
 *   npm run decide -- --state "<text>" --noul "Is it urgent?" \
 *     --choice "Team?=billing,sales,support" --score "Severity?=low,mid,high" --json
 *   npm run decide -- --serve              # serve POST /v1/systemone on 127.0.0.1:8000
 *
 * Checkpoint defaults to STRANDS_DECIDER_CHECKPOINT or the pinned v21 release below.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const venvBin = join(workspaceRoot, ".venv", "bin");
const deciderBin = join(venvBin, "strands-decider");

const DEFAULT_CHECKPOINT = "StrandsAgents/strands-decider-2B-hobson-v21";

if (!existsSync(deciderBin)) {
  console.error(
    `Error: strands-decider not found at ${deciderBin}.\n` +
      `Set it up once with:\n` +
      `  python3 -m venv .venv\n` +
      `  .venv/bin/pip install strands-decider\n\n` +
      `The first ask downloads the base model weights (~4 GB) from Hugging Face.`,
  );
  process.exit(2);
}

const rawArgs = process.argv.slice(2);
const wantsServe = rawArgs.includes("--serve");
const args = rawArgs.filter((a) => a !== "--serve");

if (args.length === 0) {
  console.error(
    `Usage:\n` +
      `  npm run decide -- --state "<text>" [--noul "..."] [--choice "Q?=a,b,c"] [--score "Q?=low,mid,high"] [--json]\n` +
      `  npm run decide -- --serve [--port 8000]`,
  );
  process.exit(2);
}

// First positional (if any) is the checkpoint; otherwise inject the pinned default.
const hasPositional = args.length > 0 && !args[0].startsWith("--");
const checkpoint =
  process.env.STRANDS_DECIDER_CHECKPOINT ||
  (hasPositional ? null : DEFAULT_CHECKPOINT);

const command = wantsServe ? "serve" : "ask";
const cmdArgs = [command, ...(checkpoint ? [checkpoint] : []), ...args];

const result = spawnSync(deciderBin, cmdArgs, {
  stdio: "inherit",
  cwd: workspaceRoot,
  env: { ...process.env },
});

process.exit(result.status ?? 1);