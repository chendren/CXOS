#!/usr/bin/env node
/**
 * Update Dashboard — wires CX Ontology, Coxswain Engine Pack, Strands 2B QA Triage
 * history, and Calibration metrics directly into cxos-dashboard.html alongside
 * the Fleet Board.
 *
 * Idempotent: uses HTML comment markers so repeated runs cleanly replace the
 * section without duplicating markup. Zero dependencies, offline, regex-free.
 *
 * Usage:
 *   npm run dashboard:ontology
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const rawArgs = process.argv.slice(2);
const argOf = (flag) => {
  const i = rawArgs.indexOf(flag);
  return i >= 0 ? rawArgs[i + 1] : undefined;
};

const dashboardPath = resolve(argOf("--dashboard") ?? join(ROOT, "cxos-dashboard.html"));
const historyPath = resolve(argOf("--history") ?? join(ROOT, ".tmp", "qa-triage", "history.jsonl"));
const calibrationPath = resolve(argOf("--calibration") ?? join(ROOT, ".tmp", "qa-triage", "calibration.json"));
const ontologyPath = join(ROOT, "ontology", "cx-ontology.json");
const packPath = join(ROOT, "ontology", "cxos-systems-pack.json");

const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const ontology = JSON.parse(readFileSync(ontologyPath, "utf8"));
const taxonomies = ontology.taxonomies.map((t) => ({
  ...t,
  data: JSON.parse(readFileSync(join(ROOT, "ontology", t.path), "utf8")),
}));

const pack = existsSync(packPath) ? JSON.parse(readFileSync(packPath, "utf8")) : null;
const calibration = existsSync(calibrationPath)
  ? JSON.parse(readFileSync(calibrationPath, "utf8"))
  : null;

const triageRows = [];
if (existsSync(historyPath)) {
  for (const line of readFileSync(historyPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      triageRows.push(JSON.parse(trimmed));
    } catch {
      // ignore malformed history line
    }
  }
}

// Deduplicate triage rows by contact_id (latest wins) for dashboard display
const byContact = new Map();
for (const r of triageRows) {
  if (r && r.contact_id) byContact.set(r.contact_id, r);
}
const uniqueTriage = [...byContact.values()].sort(
  (a, b) => a.priority - b.priority || (b.compliance_noul ?? 0) - (a.compliance_noul ?? 0),
);

const humanCount = uniqueTriage.filter((r) => r.qa_path === "targeted_human_qa").length;
const reviewCount = uniqueTriage.filter((r) => r.qa_path === "needs_review").length;
const autoCount = uniqueTriage.filter((r) => r.qa_path === "auto_qa_only").length;

const totalTerms = taxonomies.reduce((acc, t) => acc + (t.data.glossary?.length ?? 0), 0);
const totalMetrics = taxonomies.reduce((acc, t) => acc + (t.data.metrics?.length ?? 0), 0);
const totalFailureModes = taxonomies.reduce((acc, t) => acc + (t.data.failureModes?.length ?? 0), 0);
const packIntents = pack
  ? pack.domains.reduce((acc, d) => acc + (d.intents?.length ?? 0), 0)
  : 0;

const taxonomyRowsHtml = taxonomies
  .map((t) => {
    const kpiLinks = (t.data.metrics ?? [])
      .filter((m) => m.mapsToKpi)
      .map((m) => m.mapsToKpi);
    const uniqueKpis = [...new Set(kpiLinks)];
    return `      <tr>
        <td><strong>${esc(t.acronym)}</strong> · ${esc(t.name)}</td>
        <td><code>${esc(t.category)}</code></td>
        <td>${t.data.glossary?.length ?? 0} terms · ${t.data.facets?.length ?? 0} facets</td>
        <td>${t.data.metrics?.length ?? 0} (${uniqueKpis.map((k) => `<code>${esc(k)}</code>`).join(", ") || "-"})</td>
        <td>${t.data.failureModes?.length ?? 0}</td>
        <td class="idea">${esc(t.summary)}</td>
      </tr>`;
  })
  .join("\n");

const triageRowsHtml =
  uniqueTriage.length === 0
    ? `      <tr><td colspan="7">(no triaged contacts yet — run <code>npm run qa-triage</code>)</td></tr>`
    : uniqueTriage
        .map((r) => {
          const cls =
            r.qa_path === "targeted_human_qa"
              ? "urg-high"
              : r.qa_path === "needs_review"
                ? "urg-med"
                : "ok";
          return `      <tr>
        <td><strong>${esc(r.contact_id)}</strong></td>
        <td><code>${esc(r.channel)}</code></td>
        <td class="${cls}">${esc(r.qa_path)}</td>
        <td><code>${r.compliance_noul?.toFixed(3) ?? "-"}</code></td>
        <td><code>${r.severity_score?.toFixed(2) ?? "-"}</code></td>
        <td><code>${r.severity_confidence?.toFixed(3) ?? "-"}</code></td>
        <td>${esc(r.reason)}</td>
      </tr>`;
        })
        .join("\n");

const calibrationSummaryHtml = calibration
  ? `<div class="meta">Strands 2B Decider (<code>${esc(calibration.model)}</code>) · Gold n=${calibration.sample_size} · Compliance Brier=<strong>${calibration.compliance_brier}</strong> · ECE=<strong>${calibration.compliance_ece}</strong> · F1@0.70=<strong>${calibration.compliance_f1_at_0_70}</strong> · Policy agreement=<strong>${Math.round(calibration.policy_agreement_at_0_70 * 100)}%</strong></div>`
  : `<div class="meta">Run <code>npm run qa-calibrate</code> to populate empirical Brier/ECE calibration metrics.</div>`;

const START_MARKER = "<!-- CXOS-ONTOLOGY-DECIDER:START -->";
const END_MARKER = "<!-- CXOS-ONTOLOGY-DECIDER:END -->";

const blockHtml = `${START_MARKER}
  <h2>CX Ontology &amp; Domain Taxonomies (${esc(ontology.version)})</h2>
  <div class="cards">
    <div class="card"><b>${taxonomies.length}</b><span>System Taxonomies</span></div>
    <div class="card"><b>${totalTerms}</b><span>Glossary Terms</span></div>
    <div class="card"><b>${totalMetrics}</b><span>Metrics (${ontology.engineAlignment.kpiIds.length} Engine KPIs)</span></div>
    <div class="card"><b>${totalFailureModes}</b><span>Failure Modes</span></div>
    <div class="card"><b>${packIntents}</b><span>Engine Pack Intents</span></div>
  </div>
  <table>
    <thead><tr><th>System</th><th>Category</th><th>Structure</th><th>Metrics (Engine KPI Links)</th><th>Failure Modes</th><th>Role Summary</th></tr></thead>
    <tbody>
${taxonomyRowsHtml}
    </tbody>
  </table>

  <h2>Strands 2B QA Triage &amp; Calibration (${uniqueTriage.length} contacts)</h2>
  ${calibrationSummaryHtml}
  <div class="cards">
    <div class="card"><b class="urg-high">${humanCount}</b><span>Targeted Human QA</span></div>
    <div class="card"><b class="urg-med">${reviewCount}</b><span>Needs Review</span></div>
    <div class="card"><b class="ok">${autoCount}</b><span>Auto-QA Only</span></div>
    <div class="card"><b>${calibration ? calibration.compliance_brier : "-"}</b><span>Compliance Brier</span></div>
    <div class="card"><b>${calibration ? Math.round(calibration.policy_agreement_at_0_70 * 100) + "%" : "-"}</b><span>Gold Policy Agreement</span></div>
  </div>
  <table>
    <thead><tr><th>Contact</th><th>Channel</th><th>QA Path</th><th>Compliance Noul</th><th>Severity</th><th>Sev Conf</th><th>Band Reason</th></tr></thead>
    <tbody>
${triageRowsHtml}
    </tbody>
  </table>
${END_MARKER}`;

const currentHtml = readFileSync(dashboardPath, "utf8");
let updatedHtml;

const startIdx = currentHtml.indexOf(START_MARKER);
const endIdx = currentHtml.indexOf(END_MARKER);

if (startIdx >= 0 && endIdx > startIdx) {
  updatedHtml =
    currentHtml.slice(0, startIdx) +
    blockHtml +
    currentHtml.slice(endIdx + END_MARKER.length);
} else {
  const footerIdx = currentHtml.lastIndexOf("<footer>");
  if (footerIdx >= 0) {
    updatedHtml =
      currentHtml.slice(0, footerIdx) +
      blockHtml +
      "\n  " +
      currentHtml.slice(footerIdx);
  } else {
    updatedHtml = currentHtml + "\n" + blockHtml + "\n";
  }
}

writeFileSync(dashboardPath, updatedHtml);
console.log(
  `Updated dashboard: ${dashboardPath} (${taxonomies.length} taxonomies, ${uniqueTriage.length} triaged contacts, calibration=${calibration ? "yes" : "no"})`,
);
