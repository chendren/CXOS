#!/usr/bin/env node
/**
 * QA Triage Report — standalone offline HTML summary from qa-triage history.
 *
 * Reads one or more triage result JSONL files (written by
 * `npm run qa-triage -- --out <history.jsonl>`) and emits a self-contained
 * HTML report: path distribution, severity histogram, band counts, and the
 * prioritized contact table. No dependencies; opens directly in any browser.
 *
 * Usage:
 *   npm run qa-report -- --results .tmp/qa-triage/history.jsonl
 *   npm run qa-report -- --results a.jsonl --results b.jsonl --out qa-report.html
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const rawArgs = process.argv.slice(2);
const resultsFiles = [];
let outArg = undefined;
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === "--results") resultsFiles.push(rawArgs[i + 1]);
  if (rawArgs[i] === "--out") outArg = rawArgs[i + 1];
}
const outPath = outArg ? resolve(outArg) : resolve(workspaceRoot, "qa-triage-report.html");

if (resultsFiles.length === 0) {
  console.error(
    `Usage: npm run qa-report -- --results <history.jsonl> [--out qa-triage-report.html]\n` +
      `  --results may be repeated; rows are merged and sorted by priority.`,
  );
  process.exit(2);
}

const rows = [];
for (const rf of resultsFiles) {
  const p = resolve(rf);
  if (!existsSync(p)) {
    console.error(`results file not found: ${p}`);
    process.exit(2);
  }
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      console.error(`WARN  skipping malformed result line in ${p}: ${trimmed.slice(0, 80)}`);
    }
  }
}
if (rows.length === 0) {
  console.error("No triage result rows found; nothing to report.");
  process.exit(2);
}

/* ---------- aggregate ---------- */

const countByPath = (path) => rows.filter((r) => r.qa_path === path).length;
const countByBand = (band) => rows.filter((r) => r.band === band).length;

const severityBuckets = [
  { label: "minor (<0.5)", min: 0.0, max: 0.5 },
  { label: "moderate (0.5-1.5)", min: 0.5, max: 1.5 },
  { label: "major (>=1.5)", min: 1.5, max: 2.01 },
];
const histogram = severityBuckets.map((b) => ({
  label: b.label,
  count: rows.filter((r) => r.severity_score >= b.min && r.severity_score < b.max).length,
}));

const sorted = [...rows].sort((a, b) =>
  a.priority - b.priority ||
  (b.compliance_noul ?? 0) - (a.compliance_noul ?? 0) ||
  a.contact_id.localeCompare(b.contact_id),
);
const human = countByPath("targeted_human_qa");
const review = countByPath("needs_review");
const auto = countByPath("auto_qa_only");

/* ---------- html ---------- */

const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const fmtPct = (n) => `${Math.round((n / rows.length) * 100)}%`;

const barRow = (label, count, cls) => `
      <div class="bar-row"><span class="bar-label">${esc(label)}</span>
        <div class="bar-track"><div class="bar-fill ${cls}" style="width:${(count / rows.length) * 100}%"></div></div>
        <span class="bar-value">${count} (${fmtPct(count)})</span></div>`;

const contactRows = sorted
  .map(
    (r) => `        <tr class="${r.qa_path === "targeted_human_qa" ? "row-human" : r.qa_path === "needs_review" ? "row-review" : "row-auto"}">
          <td>${esc(r.contact_id)}</td><td>${esc(r.triaged_at ?? "")}</td><td>${esc(r.channel)}</td>
          <td class="mono">${r.compliance_noul?.toFixed(3) ?? "-"}</td><td class="mono">${r.severity_score?.toFixed(2) ?? "-"}</td>
          <td class="mono">${r.severity_confidence?.toFixed(3) ?? "-"}</td><td class="path">${esc(r.qa_path)}</td>
          <td>${esc(r.reason)}</td></tr>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CXOS — QA Triage Report</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: -apple-system, "SF Pro Text", system-ui, sans-serif; background:#10141c; color:#e6e9ef; margin:0; padding:2rem; }
  h1 { font-size:1.4rem; margin:0 0 .25rem; }
  h2 { font-size:1rem; margin:1.75rem 0 .5rem; color:#9fb0c8; text-transform:uppercase; letter-spacing:.08em; }
  .meta { color:#8899ad; font-size:.85rem; margin-bottom:1.5rem; }
  .cards { display:flex; gap:.75rem; flex-wrap:wrap; }
  .card { background:#1a2231; border:1px solid #2a3547; border-radius:10px; padding: .9rem 1.2rem; min-width:11rem; }
  .card .num { font-size:1.7rem; font-weight:700; }
  .card .lbl { color:#8899ad; font-size:.78rem; text-transform:uppercase; letter-spacing:.06em; }
  .card.human .num { color:#ff7d6b; } .card.review .num { color:#e8b64c; } .card.auto .num { color:#5fbf87; }
  .bar-row { display:flex; align-items:center; gap:.75rem; margin:.4rem 0; }
  .bar-label { width:15rem; color:#9fb0c8; font-size:.85rem; text-align:right; }
  .bar-track { flex:1; background:#1a2231; border-radius:6px; height:1.1rem; overflow:hidden; border:1px solid #2a3547; }
  .bar-fill { height:100%; border-radius:6px; }
  .bar-fill.human { background:#ff7d6b; } .bar-fill.review { background:#e8b64c; } .bar-fill.auto { background:#5fbf87; } .bar-fill.hist { background:#6f9bd8; }
  .bar-value { width:8rem; font-size:.85rem; color:#c7d2e2; }
  table { border-collapse:collapse; width:100%; font-size:.85rem; }
  th { text-align:left; color:#9fb0c8; border-bottom:1px solid #2a3547; padding:.4rem .6rem; }
  td { padding:.4rem .6rem; border-bottom:1px solid #1c2534; vertical-align:top; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; text-align:right; }
  td.path { font-weight:600; }
  .row-human td.path { color:#ff7d6b; } .row-review td.path { color:#e8b64c; } .row-auto td.path { color:#5fbf87; }
  footer { margin-top:2rem; color:#6d7d92; font-size:.75rem; border-top:1px solid #1c2534; padding-top:.75rem; }
</style></head><body>
  <h1>CXOS — QA Triage Report</h1>
  <div class="meta">Generated ${esc(new Date().toISOString())} · ${rows.length} triaged contact(s) · decision model: ${esc(process.env.STRANDS_DECIDER_CHECKPOINT ?? "StrandsAgents/strands-decider-2B-hobson-v21")} · offline, deterministic policy</div>

  <div class="cards">
    <div class="card human"><div class="num">${human}</div><div class="lbl">targeted human QA</div></div>
    <div class="card review"><div class="num">${review}</div><div class="lbl">needs review</div></div>
    <div class="card auto"><div class="num">${auto}</div><div class="lbl">auto-QA only</div></div>
    <div class="card"><div class="num">${fmtPct(human)}</div><div class="lbl">human sample share</div></div>
    <div class="card"><div class="num">${countByBand("high")}</div><div class="lbl">high-band decisions</div></div>
  </div>

  <h2>QA path distribution</h2>
  ${barRow("targeted_human_qa", human, "human")}
  ${barRow("needs_review", review, "review")}
  ${barRow("auto_qa_only", auto, "auto")}

  <h2>Severity distribution</h2>
  ${histogram.map((h) => barRow(h.label, h.count, "hist")).join("\n  ")}

  <h2>Prioritized contacts</h2>
  <table>
    <thead><tr><th>Contact</th><th>Triaged at</th><th>Channel</th><th>Noul</th><th>Severity</th><th>Sev conf</th><th>Path</th><th>Reason</th></tr></thead>
    <tbody>
${contactRows}
    </tbody></table>

  <footer>CXOS workspace · confidence bands: high &ge; 0.70 act_immediately · medium &ge; 0.40 act_with_verification · low &lt; 0.40 gather_more_info · history source: ${esc(resultsFiles.map((f) => resolve(f)).join(", "))}</footer>
</body></html>`;

writeFileSync(outPath, html);
console.log(`Report written: ${outPath} (${rows.length} rows; ${human} human, ${review} review, ${auto} auto)`);