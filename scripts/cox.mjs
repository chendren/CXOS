#!/usr/bin/env node
/**
 * Thin proxy: run coxswain CLI with this workspace as default --cwd.
 * If the user already passes --cwd, do not inject a second one.
 */
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const coxswainRoot =
  process.env.COXSWAIN_ROOT || join(homedir(), "coxswain");

const userArgs = process.argv.slice(2);
const hasCwd = userArgs.some(
  (a, i) => a === "--cwd" || a.startsWith("--cwd=") || (userArgs[i - 1] === "--cwd"),
);

const args = [];
if (!hasCwd) {
  args.push("--cwd", workspaceRoot);
}
args.push(...userArgs);

const r = spawnSync(
  "node",
  [join(coxswainRoot, "packages/cli/dist/main.js"), ...args],
  { stdio: "inherit", shell: false, env: process.env },
);

process.exit(r.status ?? 1);
