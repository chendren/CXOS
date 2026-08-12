#!/usr/bin/env node
/**
 * Thin proxy: run coxswain CLI with this workspace as default --cwd.
 * If the user already passes --cwd, do not inject a second one.
 *
 * Entry resolution (Round 1 enhancement):
 * 1. $COXSWAIN_ROOT or ~/coxswain
 * 2. Prefer packages/cli/dist/main.js when built
 * 3. Else fall back to tsx on packages/cli/src/main.ts (coxswain local or npx)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const coxswainRoot = process.env.COXSWAIN_ROOT || join(homedir(), "coxswain");

const distMain = join(coxswainRoot, "packages/cli/dist/main.js");
const srcMain = join(coxswainRoot, "packages/cli/src/main.ts");
const localTsx = join(coxswainRoot, "node_modules/.bin/tsx");

if (!existsSync(coxswainRoot)) {
  console.error(
    `Error: coxswain root not found at ${coxswainRoot}.\n` +
      `Set COXSWAIN_ROOT to your coxswain checkout (export COXSWAIN_ROOT=/path/to/coxswain).`,
  );
  process.exit(2);
}

/** @type {{ command: string, cmdArgs: string[] } | null} */
let launch = null;

if (existsSync(distMain)) {
  launch = { command: "node", cmdArgs: [distMain] };
} else if (existsSync(srcMain)) {
  if (existsSync(localTsx)) {
    launch = { command: localTsx, cmdArgs: [srcMain] };
  } else {
    // Last resort: npx tsx (requires network first time; fine for dev)
    launch = { command: "npx", cmdArgs: ["--yes", "tsx", srcMain] };
  }
} else {
  console.error(
    `Error: no cox CLI entry under ${coxswainRoot}.\n` +
      `Expected packages/cli/dist/main.js (after pnpm build) or packages/cli/src/main.ts.`,
  );
  process.exit(2);
}

const userArgs = process.argv.slice(2);
const hasCwd = userArgs.some(
  (a, i) =>
    a === "--cwd" ||
    a.startsWith("--cwd=") ||
    (i > 0 && userArgs[i - 1] === "--cwd"),
);

const args = [];
if (!hasCwd) {
  args.push("--cwd", workspaceRoot);
}
args.push(...userArgs);

const r = spawnSync(launch.command, [...launch.cmdArgs, ...args], {
  stdio: "inherit",
  shell: false,
  env: process.env,
});

if (r.error) {
  console.error(`Error: failed to launch cox CLI: ${r.error.message}`);
  process.exit(2);
}

process.exit(r.status ?? 1);
