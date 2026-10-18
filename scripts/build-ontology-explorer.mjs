#!/usr/bin/env node
/**
 * Build CXOS Ontology Explorer — generates cxos-ontology-explorer.html, a rich,
 * interactive, single-file offline HTML application for exploring the CX Ontology,
 * system integration topology, Coxswain Engine KPI rollups, QA rubrics, and
 * Strands 2B Decider calibration & triage results.
 *
 * Strictly zero external dependencies, 100% offline-safe, and strictly NO regular
 * expressions anywhere in the generator or emitted inline JavaScript.
 *
 * Usage:
 *   node scripts/build-ontology-explorer.mjs
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

const outPath = resolve(argOf("--out") ?? join(ROOT, "cxos-ontology-explorer.html"));
const ontologyPath = resolve(argOf("--ontology") ?? join(ROOT, "ontology", "cx-ontology.json"));
const packPath = resolve(argOf("--pack") ?? join(ROOT, "ontology", "cxos-systems-pack.json"));
const calibrationPath = resolve(argOf("--calibration") ?? join(ROOT, ".tmp", "qa-triage", "calibration.json"));
const historyPath = resolve(argOf("--history") ?? join(ROOT, ".tmp", "qa-triage", "history.jsonl"));
const journeyTracesPath = resolve(argOf("--journey-traces") ?? join(ROOT, "fixtures", "journey-a2a-traces.sample.json"));
const journeyHistoryPath = resolve(argOf("--journey-history") ?? join(ROOT, ".tmp", "qa-triage", "journey-a2a-history.jsonl"));
const manifoldSummaryPath = resolve(argOf("--manifold") ?? join(ROOT, ".tmp", "continuous-scale", "manifold-summary.json"));

const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const safeJsonForScript = (obj) =>
  JSON.stringify(obj)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");

const ontology = JSON.parse(readFileSync(ontologyPath, "utf8"));
const ontologyDir = dirname(ontologyPath);

const taxonomies = (ontology.taxonomies ?? []).map((entry) => {
  const fullPath = join(ontologyDir, entry.path);
  const tax = JSON.parse(readFileSync(fullPath, "utf8"));
  return {
    ...entry,
    ...tax,
    summary: entry.summary ?? tax.description ?? "",
  };
});

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
      // skip malformed line
    }
  }
}

const byContact = new Map();
for (const r of triageRows) {
  if (r && r.contact_id) byContact.set(r.contact_id, r);
}
const uniqueTriage = [...byContact.values()].sort(
  (a, b) => (a.priority ?? 99) - (b.priority ?? 99) || (b.compliance_noul ?? 0) - (a.compliance_noul ?? 0),
);

const journeyFixtures = existsSync(journeyTracesPath)
  ? JSON.parse(readFileSync(journeyTracesPath, "utf8"))
  : [];
const journeyDecisionsById = new Map();
if (existsSync(journeyHistoryPath)) {
  for (const line of readFileSync(journeyHistoryPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      const jid = parsed.journey_id ?? parsed.journeyId;
      if (jid) journeyDecisionsById.set(jid, parsed);
    } catch {
      // skip malformed line
    }
  }
}
const journeyTriadTraces = journeyFixtures.map((jf) => ({
  ...jf,
  decision: journeyDecisionsById.get(jf.journeyId) ?? null,
}));
const manifoldSummary = existsSync(manifoldSummaryPath)
  ? JSON.parse(readFileSync(manifoldSummaryPath, "utf8"))
  : null;

function countFacetNodes(node) {
  if (!node) return 0;
  let count = 1;
  for (const child of node.children ?? []) {
    count += countFacetNodes(child);
  }
  return count;
}

let totalGlossary = 0;
let totalFacetNodes = 0;
let totalMetrics = 0;
let totalKpiLinkedMetrics = 0;
let totalFailureModes = 0;
let totalIntegrations = 0;

for (const t of taxonomies) {
  totalGlossary += (t.glossary ?? []).length;
  for (const f of t.facets ?? []) {
    totalFacetNodes += countFacetNodes(f.root);
  }
  const metrics = t.metrics ?? [];
  totalMetrics += metrics.length;
  totalKpiLinkedMetrics += metrics.filter((m) => Boolean(m.mapsToKpi)).length;
  totalFailureModes += (t.failureModes ?? []).length;
  totalIntegrations += (t.integrations ?? []).length;
}

const categoryPalette = {
  self_service: "#38bdf8",
  routing: "#5b8cff",
  workforce: "#a78bfa",
  quality: "#3dd68c",
  customer_data: "#f472b6",
  knowledge: "#fbbf24",
  analytics: "#2dd4bf",
  outreach: "#fb923c",
  feedback: "#f87171",
};

const fallbackColors = [
  "#5b8cff",
  "#3dd68c",
  "#f5a524",
  "#f87171",
  "#a78bfa",
  "#38bdf8",
  "#2dd4bf",
  "#f472b6",
  "#fb923c",
];

const colorForCategory = (cat, idx = 0) =>
  categoryPalette[cat] ?? fallbackColors[idx % fallbackColors.length];

// Precompute circular SVG layout coordinates for all taxonomies dynamically
const svgWidth = 760;
const svgHeight = 520;
const cx = svgWidth / 2;
const cy = svgHeight / 2;
const radius = Math.min(svgWidth, svgHeight) * 0.37;

const nodePositions = new Map();
taxonomies.forEach((t, idx) => {
  const angle = (2 * Math.PI * idx) / Math.max(taxonomies.length, 1) - Math.PI / 2;
  const x = Math.round((cx + radius * Math.cos(angle)) * 10) / 10;
  const y = Math.round((cy + radius * Math.sin(angle)) * 10) / 10;
  nodePositions.set(t.id, {
    id: t.id,
    acronym: t.acronym,
    name: t.name,
    category: t.category,
    color: colorForCategory(t.category, idx),
    x,
    y,
    angle,
  });
});

const edges = [];
for (const t of taxonomies) {
  const fromPos = nodePositions.get(t.id);
  if (!fromPos) continue;
  for (const integ of t.integrations ?? []) {
    const toPos = nodePositions.get(integ.with);
    if (!toPos) continue;
    edges.push({
      from: t.id,
      fromAcronym: t.acronym,
      fromName: t.name,
      to: integ.with,
      toAcronym: toPos.acronym,
      toName: toPos.name,
      exchanges: integ.exchanges ?? [],
      x1: fromPos.x,
      y1: fromPos.y,
      x2: toPos.x,
      y2: toPos.y,
      color: fromPos.color,
    });
  }
}

// Build KPI Rollup Matrix data for the 9 Coxswain Engine KPIs
const kpiIds = ontology.engineAlignment?.kpiIds ?? [];
const packKpiMap = new Map();
if (pack && Array.isArray(pack.kpis)) {
  for (const k of pack.kpis) {
    packKpiMap.set(k.id, k);
  }
}

const kpiRollups = kpiIds.map((kpiId) => {
  const packInfo = packKpiMap.get(kpiId);
  const linkedMetrics = [];
  for (const t of taxonomies) {
    for (const m of t.metrics ?? []) {
      if (m.mapsToKpi === kpiId) {
        linkedMetrics.push({
          taxonomyId: t.id,
          taxonomyAcronym: t.acronym,
          taxonomyName: t.name,
          category: t.category,
          color: nodePositions.get(t.id)?.color ?? "#5b8cff",
          metricId: m.id,
          metricName: m.name,
          unit: m.unit,
          direction: m.direction,
          definition: m.definition,
        });
      }
    }
  }
  return {
    id: kpiId,
    name: packInfo?.name ?? kpiId.split("_").map((w) => w.toUpperCase()).join(" "),
    unit: packInfo?.unit ?? "metric",
    description: packInfo?.description ?? `Coxswain Engine KPI (${kpiId})`,
    linkedMetrics,
  };
});

// Build SVG markup for the topology graph
const svgEdgesHtml = edges
  .map((e, i) => {
    const dx = e.x2 - e.x1;
    const dy = e.y2 - e.y1;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const nodeR = 30;
    const startX = (e.x1 + ux * nodeR).toFixed(1);
    const startY = (e.y1 + uy * nodeR).toFixed(1);
    const endX = (e.x2 - ux * (nodeR + 7)).toFixed(1);
    const endY = (e.y2 - uy * (nodeR + 7)).toFixed(1);
    // Slight curve offset perpendicular to line
    const mx = (e.x1 + e.x2) / 2 - uy * 22;
    const my = (e.y1 + e.y2) / 2 + ux * 22;
    const pathD = `M ${startX} ${startY} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${endX} ${endY}`;
    return `<path class="topo-edge" data-edge-index="${i}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" d="${pathD}" stroke="${esc(e.color)}" stroke-width="1.8" stroke-opacity="0.42" fill="none" marker-end="url(#arrow-default)" />`;
  })
  .join("\n          ");

const svgNodesHtml = taxonomies
  .map((t) => {
    const pos = nodePositions.get(t.id);
    const outCount = (t.integrations ?? []).length;
    const inCount = edges.filter((e) => e.to === t.id).length;
    return `<g class="topo-node" data-tax-id="${esc(t.id)}" transform="translate(${pos.x}, ${pos.y})" tabindex="0" role="button" aria-label="${esc(t.acronym)} ${esc(t.name)}">
            <circle class="node-halo" r="34" fill="${esc(pos.color)}" fill-opacity="0.12" stroke="${esc(pos.color)}" stroke-width="1" stroke-opacity="0.35" />
            <circle class="node-core" r="26" fill="#141a2e" stroke="${esc(pos.color)}" stroke-width="2.5" />
            <text y="-2" text-anchor="middle" fill="#e6ecff" font-size="12" font-weight="700" font-family="ui-sans-serif, system-ui, sans-serif">${esc(t.acronym)}</text>
            <text y="12" text-anchor="middle" fill="#8b95b5" font-size="9" font-family="ui-monospace, monospace">${outCount}out·${inCount}in</text>
            <text y="48" text-anchor="middle" fill="#c7d2fe" font-size="10.5" font-weight="500">${esc(t.name)}</text>
          </g>`;
  })
  .join("\n          ");

const categoryLegendHtml = Object.entries(ontology.categories ?? {})
  .map(([catId, desc], idx) => {
    const color = colorForCategory(catId, idx);
    return `<span class="cat-pill" title="${esc(desc)}"><i style="background:${esc(color)}"></i><code>${esc(catId)}</code></span>`;
  })
  .join("");

const clientPayload = {
  generatedAt: new Date().toISOString(),
  ontology: {
    id: ontology.id,
    version: ontology.version,
    name: ontology.name,
    description: ontology.description,
    engineAlignment: ontology.engineAlignment,
    categories: ontology.categories,
    core: ontology.core,
  },
  taxonomies,
  edges,
  kpiRollups,
  calibration,
  triage: uniqueTriage,
  journeyTriadTraces,
  manifoldSummary,
  packSummary: pack
    ? {
        version: pack.version,
        source: pack.source,
        domainCount: (pack.domains ?? []).length,
        intentCount: (pack.domains ?? []).reduce((a, d) => a + (d.intents?.length ?? 0), 0),
        journeyCount: (pack.journeys ?? []).length,
        nbaRuleCount: (pack.nbaRules ?? []).length,
        journeys: pack.journeys ?? [],
        nbaRules: pack.nbaRules ?? [],
      }
    : null,
};

const brierText = calibration ? String(calibration.compliance_brier) : "N/A";
const eceText = calibration ? String(calibration.compliance_ece) : "N/A";
const f1Text = calibration ? String(calibration.compliance_f1_at_0_70) : "N/A";
const agreeText = calibration
  ? `${Math.round((calibration.policy_agreement_at_0_70 ?? 0) * 100)}%`
  : "N/A";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>CXOS Ontology &amp; Strands 2B Decider Explorer</title>
<style>
  :root {
    --bg: #0b1020;
    --bg-elev: #10172b;
    --panel: #141a2e;
    --panel-alt: #19213a;
    --border: #243056;
    --border-hi: #3b4e87;
    --text: #e6ecff;
    --muted: #8b95b5;
    --accent: #5b8cff;
    --ok: #3dd68c;
    --warn: #f5a524;
    --off: #6b7280;
    --high: #f87171;
    --code: #b8d0ff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px 28px 48px;
    line-height: 1.45;
  }
  header.hero {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
  }
  h1 {
    font-size: 1.55rem;
    margin: 0 0 6px;
    letter-spacing: 0.01em;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .version-tag {
    font-size: 0.75rem;
    background: #1d2849;
    color: var(--code);
    border: 1px solid var(--border-hi);
    padding: 2px 8px;
    border-radius: 999px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .subtitle {
    color: var(--muted);
    font-size: 0.88rem;
    max-width: 820px;
    margin: 0;
  }
  .decider-badge {
    background: linear-gradient(135deg, #16203d 0%, #11182d 100%);
    border: 1px solid #2e437a;
    border-radius: 10px;
    padding: 10px 14px;
    min-width: 280px;
  }
  .decider-badge .badge-title {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--accent);
    font-weight: 700;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .decider-badge .badge-metrics {
    display: flex;
    gap: 14px;
    font-size: 0.84rem;
  }
  .decider-badge .badge-metrics div b {
    color: var(--ok);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .ribbon {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
    gap: 12px;
    margin-bottom: 24px;
  }
  .kpi-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 13px 15px;
    transition: border-color 0.15s ease, transform 0.15s ease;
  }
  .kpi-card:hover {
    border-color: var(--accent);
    transform: translateY(-1px);
  }
  .kpi-card b {
    display: block;
    font-size: 1.45rem;
    color: var(--text);
    letter-spacing: 0.01em;
  }
  .kpi-card span {
    color: var(--muted);
    font-size: 0.73rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .kpi-card small {
    display: block;
    color: var(--code);
    font-size: 0.74rem;
    margin-top: 4px;
  }
  .nav-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 12px;
  }
  .nav-btn {
    background: var(--panel);
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .nav-btn:hover {
    color: var(--text);
    border-color: var(--border-hi);
  }
  .nav-btn.active {
    background: #1f2d54;
    color: var(--text);
    border-color: var(--accent);
    box-shadow: 0 0 0 1px rgba(91, 140, 255, 0.25);
  }
  h2 {
    font-size: 1.08rem;
    margin: 0 0 12px;
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  h3 {
    font-size: 0.94rem;
    margin: 14px 0 8px;
    color: var(--text);
  }
  .section-panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px 20px;
    margin-bottom: 24px;
  }
  .topo-grid {
    display: grid;
    grid-template-columns: 1.25fr 1fr;
    gap: 18px;
    align-items: stretch;
  }
  @media (max-width: 1024px) {
    .topo-grid {
      grid-template-columns: 1fr;
    }
  }
  .svg-stage {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .svg-stage svg {
    width: 100%;
    max-width: 760px;
    height: auto;
    display: block;
  }
  .topo-node {
    cursor: pointer;
    transition: opacity 0.2s ease;
  }
  .topo-node:hover .node-core,
  .topo-node.selected .node-core {
    stroke-width: 3.5px;
    fill: #1e294a;
  }
  .topo-node.selected .node-halo {
    fill-opacity: 0.28;
    stroke-opacity: 0.9;
    stroke-width: 2px;
  }
  .topo-node.dimmed {
    opacity: 0.25;
  }
  .topo-edge {
    transition: stroke-opacity 0.2s ease, stroke-width 0.2s ease;
  }
  .topo-edge.dimmed {
    stroke-opacity: 0.08;
  }
  .topo-edge.outbound-hi {
    stroke: var(--ok);
    stroke-opacity: 0.95;
    stroke-width: 2.8px;
  }
  .topo-edge.inbound-hi {
    stroke: var(--warn);
    stroke-opacity: 0.95;
    stroke-width: 2.8px;
  }
  .cat-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    justify-content: center;
  }
  .cat-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 0.72rem;
  }
  .cat-pill i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .topo-inspector {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 560px;
    overflow-y: auto;
  }
  .exchange-group {
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: 8px;
    padding: 10px 12px;
  }
  .exchange-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.82rem;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .dir-badge {
    font-size: 0.7rem;
    padding: 2px 7px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    text-transform: uppercase;
  }
  .dir-out {
    background: rgba(61, 214, 140, 0.14);
    color: var(--ok);
    border: 1px solid rgba(61, 214, 140, 0.35);
  }
  .dir-in {
    background: rgba(245, 165, 36, 0.14);
    color: var(--warn);
    border: 1px solid rgba(245, 165, 36, 0.35);
  }
  ul.payload-list {
    margin: 0;
    padding-left: 18px;
    color: var(--muted);
    font-size: 0.82rem;
  }
  ul.payload-list li {
    margin-bottom: 3px;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
  }
  .search-input {
    flex: 1 1 320px;
    background: var(--bg-elev);
    border: 1px solid var(--border-hi);
    color: var(--text);
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.9rem;
    outline: none;
  }
  .search-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(91, 140, 255, 0.25);
  }
  .tax-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tax-pill {
    background: var(--bg-elev);
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 6px 11px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .tax-pill:hover {
    color: var(--text);
    border-color: var(--border-hi);
  }
  .tax-pill.active {
    background: #1f2d54;
    color: var(--text);
    border-color: var(--accent);
  }
  .tax-card {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 16px;
  }
  .tax-card-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
    margin-bottom: 12px;
  }
  .tax-card-title {
    font-size: 1.05rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tax-cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
  }
  .sub-box {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
  }
  .sub-box h4 {
    margin: 0 0 8px;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    display: flex;
    justify-content: space-between;
  }
  .term-item, .metric-item, .failure-item {
    padding: 7px 0;
    border-bottom: 1px solid rgba(36, 48, 86, 0.65);
    font-size: 0.84rem;
  }
  .term-item:last-child, .metric-item:last-child, .failure-item:last-child {
    border-bottom: none;
  }
  .term-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .tag-chip {
    font-size: 0.68rem;
    background: #1c2541;
    color: var(--code);
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;
  }
  .kpi-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    background: rgba(61, 214, 140, 0.14);
    color: var(--ok);
    border: 1px solid rgba(61, 214, 140, 0.4);
    padding: 1px 7px;
    border-radius: 999px;
    cursor: pointer;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .kpi-badge:hover {
    background: rgba(61, 214, 140, 0.25);
  }
  details.facet-tree {
    margin-bottom: 6px;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
  }
  details.facet-tree summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.84rem;
    color: var(--text);
  }
  ul.tree-list {
    list-style: none;
    padding-left: 14px;
    margin: 6px 0 2px;
    border-left: 1px dashed var(--border-hi);
  }
  ul.tree-list li {
    margin: 4px 0;
    font-size: 0.82rem;
  }
  .rubric-bar {
    display: flex;
    height: 12px;
    border-radius: 6px;
    overflow: hidden;
    margin: 8px 0 12px;
    background: var(--bg);
  }
  .kpi-matrix-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
    gap: 14px;
  }
  .kpi-matrix-card {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    transition: border-color 0.15s ease;
  }
  .kpi-matrix-card.highlighted {
    border-color: var(--ok);
    box-shadow: 0 0 0 2px rgba(61, 214, 140, 0.25);
  }
  .kpi-matrix-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
  }
  .sweep-row {
    display: grid;
    grid-template-columns: 90px 1fr 220px;
    gap: 12px;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    font-size: 0.83rem;
  }
  @media (max-width: 720px) {
    .sweep-row {
      grid-template-columns: 1fr;
    }
  }
  .bar-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bar-track {
    background: var(--bg);
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    display: flex;
  }
  .bar-fill {
    height: 100%;
    border-radius: 4px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--bg-elev);
    border-radius: 8px;
    overflow: hidden;
    font-size: 0.84rem;
  }
  th, td {
    text-align: left;
    padding: 9px 11px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  th {
    color: var(--muted);
    font-weight: 600;
    font-size: 0.73rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: #12182c;
  }
  tr:last-child td { border-bottom: none; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem;
    color: var(--code);
  }
  .urg-high { color: var(--high); font-weight: 600; }
  .urg-med { color: var(--warn); font-weight: 600; }
  .ok { color: var(--ok); font-weight: 600; }
  .muted { color: var(--muted); }
  .btn-reset {
    background: #1d2849;
    color: var(--code);
    border: 1px solid var(--border-hi);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.76rem;
    cursor: pointer;
  }
  .btn-reset:hover {
    background: #273663;
  }
  footer {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.76rem;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
</head>
<body>
  <header class="hero">
    <div>
      <h1>
        CXOS Ontology &amp; System Topology Explorer
        <span class="version-tag">v${esc(ontology.version)}</span>
        <span class="version-tag">engine: ${esc(ontology.engineAlignment?.engine ?? "coxswain")} ${esc(ontology.engineAlignment?.engineVersion ?? "")}</span>
      </h1>
      <p class="subtitle">${esc(ontology.description)}</p>
    </div>
    <div class="decider-badge">
      <div class="badge-title">
        <span>Strands 2B Decider Calibration</span>
        <code>n=${calibration ? calibration.sample_size : 0}</code>
      </div>
      <div class="badge-metrics">
        <div>Brier: <b>${esc(brierText)}</b></div>
        <div>ECE: <b>${esc(eceText)}</b></div>
        <div>F1@0.70: <b>${esc(f1Text)}</b></div>
        <div>Agree: <b>${esc(agreeText)}</b></div>
      </div>
    </div>
  </header>

  <!-- 1. Executive KPI Ribbon -->
  <section class="ribbon" aria-label="Executive Ontology KPI Ribbon">
    <div class="kpi-card">
      <b>${taxonomies.length}</b>
      <span>System Taxonomies</span>
      <small>${Object.keys(ontology.categories ?? {}).length} domain categories</small>
    </div>
    <div class="kpi-card">
      <b>${totalGlossary}</b>
      <span>Glossary Terms</span>
      <small>Closed-world vocabulary</small>
    </div>
    <div class="kpi-card">
      <b>${totalFacetNodes}</b>
      <span>Facet Tree Nodes</span>
      <small>Hierarchical classifications</small>
    </div>
    <div class="kpi-card">
      <b>${totalKpiLinkedMetrics} <span class="muted" style="font-size:0.9rem">/ ${totalMetrics}</span></b>
      <span>KPI-Linked Metrics</span>
      <small>Rolls into ${kpiIds.length} Engine KPIs</small>
    </div>
    <div class="kpi-card">
      <b>${totalFailureModes}</b>
      <span>Failure Modes</span>
      <small>Signal &rarr; Mitigation pairs</small>
    </div>
    <div class="kpi-card">
      <b>${totalIntegrations}</b>
      <span>System Integrations</span>
      <small>Directed cross-system flows</small>
    </div>
    <div class="kpi-card">
      <b>${esc(brierText)}</b>
      <span>Decider Brier / ECE</span>
      <small>ECE ${esc(eceText)} &middot; F1 ${esc(f1Text)}</small>
    </div>
  </section>

  <!-- 2. Interactive SVG System Integration Topology -->
  <section class="section-panel" id="section-topology">
    <h2>
      <span>1. Interactive System Integration Topology (${taxonomies.length} Systems &middot; ${totalIntegrations} Directed Edges)</span>
      <button type="button" class="btn-reset" id="btn-reset-topo">Show All Systems</button>
    </h2>
    <div class="topo-grid">
      <div class="svg-stage">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="CXOS System Integration Topology Graph">
          <defs>
            <marker id="arrow-default" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
            </marker>
            <marker id="arrow-out" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#3dd68c" />
            </marker>
            <marker id="arrow-in" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f5a524" />
            </marker>
          </defs>
          <circle cx="${cx}" cy="${cy}" r="${Math.round(radius)}" fill="none" stroke="#1e294a" stroke-dasharray="4 6" stroke-width="1" />
          <g id="svg-edges">
          ${svgEdgesHtml}
          </g>
          <g id="svg-nodes">
          ${svgNodesHtml}
          </g>
        </svg>
        <div class="cat-legend">${categoryLegendHtml}</div>
      </div>
      <div class="topo-inspector" id="topo-inspector">
        <!-- Populated dynamically on load and node click -->
      </div>
    </div>
  </section>

  <!-- 3. Interactive Taxonomy Deep-Dive & Search -->
  <section class="section-panel" id="section-deep-dive">
    <h2>
      <span>2. Interactive Taxonomy Deep-Dive &amp; Instant Search</span>
      <span id="search-count-label" class="muted" style="font-size:0.82rem;font-weight:500;"></span>
    </h2>
    <div class="toolbar">
      <input
        type="search"
        id="taxonomy-search"
        class="search-input"
        placeholder="Filter glossary terms, facet trees, metrics, KPIs, failure modes, or QA scoring rubric (instant, offline)..."
        aria-label="Search across all taxonomies"
      />
      <button type="button" class="btn-reset" id="btn-clear-search">Reset Filter</button>
    </div>
    <div class="tax-pills" id="tax-filter-pills"></div>
    <div id="taxonomy-deep-dive-container" style="margin-top:16px;"></div>
  </section>

  <!-- 4. Engine KPI Rollup Matrix -->
  <section class="section-panel" id="section-kpi-matrix">
    <h2>
      <span>3. Coxswain Engine KPI Rollup Matrix (${kpiIds.length} Engine KPIs &larr; ${totalKpiLinkedMetrics} Domain Metrics)</span>
      <button type="button" class="btn-reset" id="btn-clear-kpi">Clear KPI Highlight</button>
    </h2>
    <div class="kpi-matrix-grid" id="kpi-matrix-container"></div>
  </section>

  <!-- 4.5 Three-Plane Customer Journey Triad, Omnichannel Context & A2A Architecture -->
  <section class="section-panel" id="section-journey-triad">
    <h2>
      <span>4. Three-Plane Customer Journey Triad, Omnichannel Context &amp; A2A Orchestration</span>
      <code>CJM (Hoped) &rarr; CJT (Tracked) &rarr; JO + OCX + A2A (Orchestrated)</code>
    </h2>
    <div id="journey-triad-container"></div>
  </section>

  <!-- 5. Strands 2B Decider Calibration & Triage Inspector -->
  <section class="section-panel" id="section-calibration">
    <h2>
      <span>5. Strands 2B Decider Calibration &amp; QA Triage Inspector</span>
      <code id="decider-model-label">${esc(calibration?.model ?? "StrandsAgents/strands-decider-2B-hobson-v21")}</code>
    </h2>
    <div id="calibration-container"></div>
  </section>

  <footer>
    <span>CXOS Ontology Explorer &middot; 100% Offline Self-Contained HTML/SVG/JS &middot; Zero External Assets &middot; Zero Regex</span>
    <span>Generated ${esc(clientPayload.generatedAt)}</span>
  </footer>

  <script id="cxos-ontology-data" type="application/json">${safeJsonForScript(clientPayload)}</script>
  <script>
  (function () {
    "use strict";

    var dataEl = document.getElementById("cxos-ontology-data");
    var DATA = JSON.parse(dataEl.textContent);

    var state = {
      selectedTaxonomyId: null,
      searchQuery: "",
      highlightedKpiId: null
    };

    function escHtml(val) {
      return String(val == null ? "" : val)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function matchesQuery(text, q) {
      if (!q) return true;
      return String(text == null ? "" : text).toLowerCase().includes(q);
    }

    function facetNodeMatches(node, q) {
      if (!node) return false;
      if (matchesQuery(node.id, q) || matchesQuery(node.name, q) || matchesQuery(node.description, q)) {
        return true;
      }
      var see = node.seeAlso || [];
      for (var i = 0; i < see.length; i++) {
        if (matchesQuery(see[i], q)) return true;
      }
      var children = node.children || [];
      for (var j = 0; j < children.length; j++) {
        if (facetNodeMatches(children[j], q)) return true;
      }
      return false;
    }

    function renderFacetNodeHtml(node, q) {
      if (!node) return "";
      var children = node.children || [];
      var seeBadges = (node.seeAlso || []).map(function (ref) {
        return '<span class="tag-chip">see: ' + escHtml(ref) + "</span>";
      }).join(" ");
      var descHtml = node.description
        ? ' <span class="muted">&mdash; ' + escHtml(node.description) + "</span>"
        : "";
      var childItems = "";
      for (var i = 0; i < children.length; i++) {
        if (!q || facetNodeMatches(children[i], q)) {
          childItems += renderFacetNodeHtml(children[i], q);
        }
      }
      var subTree = childItems ? '<ul class="tree-list">' + childItems + "</ul>" : "";
      return (
        "<li>" +
          "<strong>" + escHtml(node.name) + "</strong> " +
          "<code>" + escHtml(node.id) + "</code> " +
          seeBadges +
          descHtml +
          subTree +
        "</li>"
      );
    }

    // 1. Topology Selection & Inspector
    function updateTopologyView() {
      var selectedId = state.selectedTaxonomyId;
      var nodes = document.querySelectorAll(".topo-node");
      var edgesEls = document.querySelectorAll(".topo-edge");

      var connectedIds = {};
      if (selectedId) {
        connectedIds[selectedId] = true;
        for (var i = 0; i < DATA.edges.length; i++) {
          var e = DATA.edges[i];
          if (e.from === selectedId) connectedIds[e.to] = true;
          if (e.to === selectedId) connectedIds[e.from] = true;
        }
      }

      nodes.forEach(function (nodeEl) {
        var tid = nodeEl.getAttribute("data-tax-id");
        nodeEl.classList.toggle("selected", tid === selectedId);
        nodeEl.classList.toggle("dimmed", Boolean(selectedId && !connectedIds[tid]));
      });

      edgesEls.forEach(function (edgeEl) {
        var fromId = edgeEl.getAttribute("data-from");
        var toId = edgeEl.getAttribute("data-to");
        edgeEl.classList.remove("outbound-hi", "inbound-hi", "dimmed");
        if (!selectedId) {
          edgeEl.setAttribute("marker-end", "url(#arrow-default)");
          return;
        }
        if (fromId === selectedId) {
          edgeEl.classList.add("outbound-hi");
          edgeEl.setAttribute("marker-end", "url(#arrow-out)");
        } else if (toId === selectedId) {
          edgeEl.classList.add("inbound-hi");
          edgeEl.setAttribute("marker-end", "url(#arrow-in)");
        } else {
          edgeEl.classList.add("dimmed");
          edgeEl.setAttribute("marker-end", "url(#arrow-default)");
        }
      });

      renderTopologyInspector(selectedId);
      renderFilterPills();
    }

    function renderTopologyInspector(selectedId) {
      var container = document.getElementById("topo-inspector");
      if (!selectedId) {
        var html =
          '<div>' +
            '<h3 style="margin-top:0">All Cross-System Integrations (' + DATA.edges.length + ' edges)</h3>' +
            '<p class="muted" style="font-size:0.83rem;margin-top:4px;">Click any system node on the circular topology graph to isolate its inbound &amp; outbound payload exchanges and filter the deep-dive explorer below.</p>' +
          '</div>';
        for (var i = 0; i < DATA.edges.length; i++) {
          var edge = DATA.edges[i];
          var payloads = (edge.exchanges || []).map(function (ex) {
            return "<li>" + escHtml(ex) + "</li>";
          }).join("");
          html +=
            '<div class="exchange-group">' +
              '<div class="exchange-header">' +
                '<span><strong>' + escHtml(edge.fromAcronym) + '</strong> &rarr; <strong>' + escHtml(edge.toAcronym) + '</strong> <span class="muted">(' + escHtml(edge.toName) + ')</span></span>' +
                '<span class="dir-badge dir-out">' + (edge.exchanges || []).length + ' payload(s)</span>' +
              '</div>' +
              '<ul class="payload-list">' + payloads + '</ul>' +
            '</div>';
        }
        container.innerHTML = html;
        return;
      }

      var tax = null;
      for (var tIdx = 0; tIdx < DATA.taxonomies.length; tIdx++) {
        if (DATA.taxonomies[tIdx].id === selectedId) {
          tax = DATA.taxonomies[tIdx];
          break;
        }
      }
      if (!tax) return;

      var outbound = DATA.edges.filter(function (e) { return e.from === selectedId; });
      var inbound = DATA.edges.filter(function (e) { return e.to === selectedId; });

      var outHtml = outbound.length === 0
        ? '<p class="muted" style="font-size:0.82rem;">No outbound integrations declared.</p>'
        : outbound.map(function (e) {
            var items = (e.exchanges || []).map(function (x) { return "<li>" + escHtml(x) + "</li>"; }).join("");
            return (
              '<div class="exchange-group">' +
                '<div class="exchange-header">' +
                  '<span><strong>' + escHtml(e.fromAcronym) + '</strong> &rarr; <strong>' + escHtml(e.toAcronym) + '</strong> (' + escHtml(e.toName) + ')</span>' +
                  '<span class="dir-badge dir-out">Outbound</span>' +
                '</div>' +
                '<ul class="payload-list">' + items + '</ul>' +
              '</div>'
            );
          }).join("");

      var inHtml = inbound.length === 0
        ? '<p class="muted" style="font-size:0.82rem;">No inbound integrations declared.</p>'
        : inbound.map(function (e) {
            var items = (e.exchanges || []).map(function (x) { return "<li>" + escHtml(x) + "</li>"; }).join("");
            return (
              '<div class="exchange-group">' +
                '<div class="exchange-header">' +
                  '<span><strong>' + escHtml(e.fromAcronym) + '</strong> (' + escHtml(e.fromName) + ') &rarr; <strong>' + escHtml(e.toAcronym) + '</strong></span>' +
                  '<span class="dir-badge dir-in">Inbound</span>' +
                '</div>' +
                '<ul class="payload-list">' + items + '</ul>' +
              '</div>'
            );
          }).join("");

      container.innerHTML =
        '<div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
            '<h3 style="margin:0">' + escHtml(tax.acronym) + ' &middot; ' + escHtml(tax.name) + '</h3>' +
            '<code>' + escHtml(tax.category) + '</code>' +
          '</div>' +
          '<p class="muted" style="font-size:0.83rem;margin:6px 0 4px;">' + escHtml(tax.description) + '</p>' +
          '<p style="font-size:0.8rem;margin:0;color:#b8d0ff;"><strong>Role in Center:</strong> ' + escHtml(tax.roleInCenter) + '</p>' +
        '</div>' +
        '<div>' +
          '<h3>Outbound Flows (' + outbound.length + ')</h3>' +
          outHtml +
        '</div>' +
        '<div>' +
          '<h3>Inbound Flows (' + inbound.length + ')</h3>' +
          inHtml +
        '</div>';
    }

    // 2. Taxonomy Filter Pills & Deep-Dive Search
    function renderFilterPills() {
      var pillsEl = document.getElementById("tax-filter-pills");
      var allActive = state.selectedTaxonomyId === null ? " active" : "";
      var html = '<button type="button" class="tax-pill' + allActive + '" data-pill-tax="">All (' + DATA.taxonomies.length + ')</button>';
      for (var i = 0; i < DATA.taxonomies.length; i++) {
        var t = DATA.taxonomies[i];
        var isAct = state.selectedTaxonomyId === t.id ? " active" : "";
        html +=
          '<button type="button" class="tax-pill' + isAct + '" data-pill-tax="' + escHtml(t.id) + '">' +
            escHtml(t.acronym) + " &middot; " + escHtml(t.name) +
          "</button>";
      }
      pillsEl.innerHTML = html;

      var btns = pillsEl.querySelectorAll(".tax-pill");
      btns.forEach(function (b) {
        b.addEventListener("click", function () {
          var val = b.getAttribute("data-pill-tax");
          state.selectedTaxonomyId = val ? val : null;
          updateTopologyView();
          renderDeepDive();
        });
      });
    }

    function renderScoringModelHtml(scoringModel, q) {
      if (!scoringModel) return "";
      var dims = scoringModel.dimensions || [];
      var filteredDims = dims.filter(function (d) {
        if (!q) return true;
        if (matchesQuery(d.id, q) || matchesQuery(d.name, q) || matchesQuery(d.description, q)) return true;
        var sc = d.sampleCriteria || [];
        for (var i = 0; i < sc.length; i++) {
          if (matchesQuery(sc[i], q)) return true;
        }
        return false;
      });

      var modelMatchesHeader =
        !q ||
        matchesQuery(scoringModel.id, q) ||
        matchesQuery(scoringModel.name, q) ||
        matchesQuery(scoringModel.note, q) ||
        (scoringModel.autoFailItems || []).some(function (af) { return matchesQuery(af, q); });

      if (q && !modelMatchesHeader && filteredDims.length === 0) {
        return "";
      }

      var dimsToShow = filteredDims.length > 0 ? filteredDims : dims;
      var barColors = ["#5b8cff", "#3dd68c", "#f5a524", "#a78bfa", "#38bdf8", "#f472b6"];

      var segmentsHtml = dims.map(function (d, idx) {
        var col = barColors[idx % barColors.length];
        return (
          '<div style="width:' + Number(d.weightPercent || 0) + '%;background:' + col + ';" title="' +
          escHtml(d.name) + " (" + Number(d.weightPercent || 0) + '%)"></div>'
        );
      }).join("");

      var autoFailChips = (scoringModel.autoFailItems || []).map(function (af) {
        return '<span class="tag-chip" style="color:#f87171;border:1px solid rgba(248,113,113,0.35);">auto-fail: ' + escHtml(af) + "</span>";
      }).join(" ");

      var dimsRows = dimsToShow.map(function (d, idx) {
        var col = barColors[idx % barColors.length];
        var criteria = (d.sampleCriteria || []).map(function (c) {
          return "<li>" + escHtml(c) + "</li>";
        }).join("");
        return (
          '<div class="term-item">' +
            '<div class="term-head">' +
              '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + col + ';"></span>' +
              '<span>' + escHtml(d.name) + '</span>' +
              '<code>' + escHtml(d.id) + '</code>' +
              '<span class="tag-chip">' + Number(d.weightPercent || 0) + '% weight</span>' +
            '</div>' +
            '<div class="muted" style="margin:3px 0 4px;">' + escHtml(d.description) + '</div>' +
            '<ul class="payload-list">' + criteria + '</ul>' +
          '</div>'
        );
      }).join("");

      return (
        '<div class="sub-box" style="grid-column: 1 / -1;">' +
          '<h4>' +
            '<span>QA Scoring Rubric: ' + escHtml(scoringModel.name) + ' (<code>' + escHtml(scoringModel.scaleType) + '</code> &middot; ' + Number(scoringModel.maxPoints || 100) + ' pts)</span>' +
            '<span>' + dimsToShow.length + ' / ' + dims.length + ' dimensions</span>' +
          '</h4>' +
          '<div class="rubric-bar">' + segmentsHtml + '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">' + autoFailChips + '</div>' +
          (scoringModel.note ? '<p class="muted" style="font-size:0.78rem;margin:0 0 8px;">' + escHtml(scoringModel.note) + '</p>' : '') +
          dimsRows +
        '</div>'
      );
    }

    function renderContinuousDynamicsHtml(cd, q) {
      if (!cd) return "";
      var vars = cd.stateVariables || [];
      var eqs = cd.differentialEquations || [];
      var invs = cd.scaleInvariants || [];

      var filteredVars = vars.filter(function (v) {
        return !q || matchesQuery(v.id, q) || matchesQuery(v.symbol, q) || matchesQuery(v.domain, q) || matchesQuery(v.description, q);
      });
      var filteredEqs = eqs.filter(function (e) {
        return !q || matchesQuery(e.id, q) || matchesQuery(e.name, q) || matchesQuery(e.formula, q) || matchesQuery(e.interpretation, q);
      });
      if (q && filteredVars.length === 0 && filteredEqs.length === 0) return "";

      var varsHtml = (filteredVars.length ? filteredVars : vars).map(function (v) {
        return (
          '<div class="term-item">' +
            '<div class="term-head">' +
              '<code>' + escHtml(v.symbol) + '</code>' +
              '<span>' + escHtml(v.id) + '</span>' +
              '<span class="tag-chip">' + escHtml(v.domain) + '</span>' +
              (v.unit ? '<span class="tag-chip">' + escHtml(v.unit) + '</span>' : '') +
            '</div>' +
            '<div class="muted" style="margin-top:2px;">' + escHtml(v.description) + '</div>' +
          '</div>'
        );
      }).join("");

      var eqsHtml = (filteredEqs.length ? filteredEqs : eqs).map(function (e) {
        return (
          '<div class="term-item">' +
            '<div class="term-head"><span>' + escHtml(e.name) + '</span><code>' + escHtml(e.id) + '</code></div>' +
            '<div style="margin:4px 0;padding:5px 8px;background:var(--bg);border-radius:4px;font-family:ui-monospace,monospace;font-size:0.78rem;color:var(--ok);">' + escHtml(e.formula) + '</div>' +
            '<div class="muted" style="font-size:0.8rem;">' + escHtml(e.interpretation) + '</div>' +
          '</div>'
        );
      }).join("");

      var invsHtml = invs.map(function (inv) {
        return "<li>" + escHtml(inv) + "</li>";
      }).join("");

      return (
        '<div class="sub-box" style="grid-column: 1 / -1; border-color: #2e437a;">' +
          '<h4>' +
            '<span>Continuous Dynamical Manifold (R^' + Number(cd.stateSpaceDimension || 16) + ' State Space)</span>' +
            '<span>' + vars.length + ' State Variables &middot; ' + eqs.length + ' Differential Equations</span>' +
          '</h4>' +
          '<div class="tax-cols">' +
            '<div><strong style="font-size:0.78rem;color:var(--code);">State Space Variables</strong>' + varsHtml + '</div>' +
            '<div><strong style="font-size:0.78rem;color:var(--code);">Governing Differential &amp; Field Equations</strong>' + eqsHtml +
              '<div style="margin-top:8px;"><strong style="font-size:0.78rem;color:var(--code);">Massive-Scale Invariants</strong><ul class="payload-list" style="margin-top:4px;">' + invsHtml + '</ul></div>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }

    function renderDeepDive() {
      var container = document.getElementById("taxonomy-deep-dive-container");
      var countLabel = document.getElementById("search-count-label");
      var q = state.searchQuery.trim().toLowerCase();

      var matchedTaxonomiesCount = 0;
      var totalMatchedItems = 0;
      var cardsHtml = "";

      for (var i = 0; i < DATA.taxonomies.length; i++) {
        var t = DATA.taxonomies[i];
        if (state.selectedTaxonomyId && t.id !== state.selectedTaxonomyId) {
          continue;
        }

        var taxMetaMatch =
          !q ||
          matchesQuery(t.id, q) ||
          matchesQuery(t.acronym, q) ||
          matchesQuery(t.name, q) ||
          matchesQuery(t.category, q) ||
          matchesQuery(t.description, q) ||
          matchesQuery(t.roleInCenter, q);

        var glossary = (t.glossary || []).filter(function (g) {
          if (!q || taxMetaMatch) return true;
          if (matchesQuery(g.id, q) || matchesQuery(g.term, q) || matchesQuery(g.definition, q)) return true;
          var tags = g.tags || [];
          for (var k = 0; k < tags.length; k++) {
            if (matchesQuery(tags[k], q)) return true;
          }
          var aliases = g.aliases || [];
          for (var a = 0; a < aliases.length; a++) {
            if (matchesQuery(aliases[a], q)) return true;
          }
          return false;
        });

        var facets = (t.facets || []).filter(function (f) {
          if (!q || taxMetaMatch) return true;
          return matchesQuery(f.id, q) || matchesQuery(f.name, q) || facetNodeMatches(f.root, q);
        });

        var metrics = (t.metrics || []).filter(function (m) {
          if (!q || taxMetaMatch) return true;
          return (
            matchesQuery(m.id, q) ||
            matchesQuery(m.name, q) ||
            matchesQuery(m.unit, q) ||
            matchesQuery(m.definition, q) ||
            matchesQuery(m.mapsToKpi, q)
          );
        });

        var failures = (t.failureModes || []).filter(function (fm) {
          if (!q || taxMetaMatch) return true;
          return (
            matchesQuery(fm.id, q) ||
            matchesQuery(fm.name, q) ||
            matchesQuery(fm.signal, q) ||
            matchesQuery(fm.mitigation, q)
          );
        });

        var scoringHtml = renderScoringModelHtml(t.scoringModel, taxMetaMatch ? "" : q);
        var continuousHtml = renderContinuousDynamicsHtml(t.continuousDynamics, taxMetaMatch ? "" : q);

        var hasAnyMatch =
          glossary.length > 0 ||
          facets.length > 0 ||
          metrics.length > 0 ||
          failures.length > 0 ||
          Boolean(scoringHtml) ||
          Boolean(continuousHtml);

        if (!hasAnyMatch) continue;

        matchedTaxonomiesCount += 1;
        totalMatchedItems += glossary.length + facets.length + metrics.length + failures.length;

        var glossaryHtml = glossary.map(function (g) {
          var tagsHtml = (g.tags || []).map(function (tg) {
            return '<span class="tag-chip">' + escHtml(tg) + "</span>";
          }).join(" ");
          var seeHtml = (g.seeAlso || []).map(function (sa) {
            return '<span class="tag-chip">see: ' + escHtml(sa) + "</span>";
          }).join(" ");
          return (
            '<div class="term-item">' +
              '<div class="term-head">' +
                '<span>' + escHtml(g.term) + '</span>' +
                '<code>' + escHtml(g.id) + '</code>' +
                tagsHtml + " " + seeHtml +
              '</div>' +
              '<div class="muted" style="margin-top:2px;">' + escHtml(g.definition) + '</div>' +
            '</div>'
          );
        }).join("");

        var facetsHtml = facets.map(function (f) {
          var treeHtml = renderFacetNodeHtml(f.root, taxMetaMatch ? "" : q);
          return (
            '<details class="facet-tree" open>' +
              '<summary>' + escHtml(f.name) + ' <code>' + escHtml(f.id) + '</code></summary>' +
              '<ul class="tree-list">' + treeHtml + '</ul>' +
            '</details>'
          );
        }).join("");

        var metricsHtml = metrics.map(function (m) {
          var kpiBadge = m.mapsToKpi
            ? '<button type="button" class="kpi-badge" data-jump-kpi="' + escHtml(m.mapsToKpi) + '" title="Jump to Engine KPI Rollup">&rarr; KPI: ' + escHtml(m.mapsToKpi) + "</button>"
            : '<span class="tag-chip">domain-local</span>';
          var dirArrow = m.direction === "higher_is_better" ? "&uarr; higher" : m.direction === "lower_is_better" ? "&darr; lower" : "&harr; target";
          return (
            '<div class="metric-item">' +
              '<div class="term-head" style="justify-content:space-between;">' +
                '<span>' + escHtml(m.name) + ' <code>' + escHtml(m.id) + '</code></span>' +
                kpiBadge +
              '</div>' +
              '<div class="muted" style="margin-top:2px;">' +
                '<span class="tag-chip">' + escHtml(m.unit) + '</span> ' +
                '<span class="tag-chip">' + dirArrow + '</span> ' +
                escHtml(m.definition) +
              '</div>' +
            '</div>'
          );
        }).join("");

        var failuresHtml = failures.map(function (fm) {
          return (
            '<div class="failure-item">' +
              '<div class="term-head">' +
                '<span class="urg-high">' + escHtml(fm.name) + '</span>' +
                '<code>' + escHtml(fm.id) + '</code>' +
              '</div>' +
              '<div style="margin-top:3px;"><strong style="color:var(--warn)">Signal:</strong> <span class="muted">' + escHtml(fm.signal) + '</span></div>' +
              '<div style="margin-top:2px;"><strong style="color:var(--ok)">Mitigation:</strong> <span class="muted">' + escHtml(fm.mitigation) + '</span></div>' +
            '</div>'
          );
        }).join("");

        cardsHtml +=
          '<article class="tax-card" data-card-tax="' + escHtml(t.id) + '">' +
            '<div class="tax-card-header">' +
              '<div class="tax-card-title">' +
                '<span>' + escHtml(t.acronym) + ' &mdash; ' + escHtml(t.name) + '</span>' +
                '<code>' + escHtml(t.category) + '</code>' +
              '</div>' +
              '<span class="muted" style="font-size:0.8rem;">' + escHtml(t.roleInCenter) + '</span>' +
            '</div>' +
            '<div class="tax-cols">' +
              '<div class="sub-box">' +
                '<h4><span>Glossary Terms</span><span>' + glossary.length + '</span></h4>' +
                (glossaryHtml || '<span class="muted">No matching terms</span>') +
              '</div>' +
              '<div class="sub-box">' +
                '<h4><span>Facet Trees</span><span>' + facets.length + '</span></h4>' +
                (facetsHtml || '<span class="muted">No matching facets</span>') +
              '</div>' +
              '<div class="sub-box">' +
                '<h4><span>Domain Metrics</span><span>' + metrics.length + '</span></h4>' +
                (metricsHtml || '<span class="muted">No matching metrics</span>') +
              '</div>' +
              '<div class="sub-box">' +
                '<h4><span>Failure Modes (Signal &rarr; Mitigation)</span><span>' + failures.length + '</span></h4>' +
                (failuresHtml || '<span class="muted">No matching failure modes</span>') +
              '</div>' +
              scoringHtml +
              continuousHtml +
            '</div>' +
          '</article>';
      }

      countLabel.textContent =
        "Showing " + matchedTaxonomiesCount + " of " + DATA.taxonomies.length + " taxonomies (" + totalMatchedItems + " matching artifacts)";
      container.innerHTML = cardsHtml || '<p class="muted">No ontology items match your filter query.</p>';

      var kpiJumpBtns = container.querySelectorAll("[data-jump-kpi]");
      kpiJumpBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
          var kpiId = btn.getAttribute("data-jump-kpi");
          state.highlightedKpiId = kpiId;
          renderKpiMatrix();
          var targetEl = document.getElementById("kpi-card-" + kpiId);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        });
      });
    }

    // 3. Engine KPI Rollup Matrix
    function renderKpiMatrix() {
      var container = document.getElementById("kpi-matrix-container");
      var html = "";
      for (var i = 0; i < DATA.kpiRollups.length; i++) {
        var kpi = DATA.kpiRollups[i];
        var isHi = state.highlightedKpiId === kpi.id ? " highlighted" : "";
        var metricsHtml = kpi.linkedMetrics.map(function (m) {
          return (
            '<div class="metric-item">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">' +
                '<span><strong style="color:' + escHtml(m.color) + '">' + escHtml(m.taxonomyAcronym) + '</strong> &middot; ' + escHtml(m.metricName) + '</span>' +
                '<code>' + escHtml(m.metricId) + '</code>' +
              '</div>' +
              '<div class="muted" style="font-size:0.78rem;margin-top:2px;">' +
                '<span class="tag-chip">' + escHtml(m.unit) + '</span> ' +
                escHtml(m.definition) +
              '</div>' +
            '</div>'
          );
        }).join("");

        html +=
          '<div class="kpi-matrix-card' + isHi + '" id="kpi-card-' + escHtml(kpi.id) + '">' +
            '<div class="kpi-matrix-head">' +
              '<div>' +
                '<strong style="font-size:0.96rem;">' + escHtml(kpi.name) + '</strong><br/>' +
                '<code>' + escHtml(kpi.id) + '</code> &middot; <span class="tag-chip">' + escHtml(kpi.unit) + '</span>' +
              '</div>' +
              '<span class="dir-badge dir-out">' + kpi.linkedMetrics.length + ' metric(s)</span>' +
            '</div>' +
            '<div style="border-top:1px solid var(--border);padding-top:6px;">' +
              metricsHtml +
            '</div>' +
          '</div>';
      }
      container.innerHTML = html;
    }

    // 4.5 Three-Plane Customer Journey Triad, Omnichannel Context & A2A Inspector
    function renderJourneyTriad() {
      var container = document.getElementById("journey-triad-container");
      if (!container) return;

      var triad = (DATA.ontology.core && DATA.ontology.core.journeyTriad) || null;
      var envSpec = (DATA.ontology.core && DATA.ontology.core.contextEnvelopeSpec) || null;
      var traces = DATA.journeyTriadTraces || [];
      var mf = DATA.manifoldSummary || null;

      var manifoldBannerHtml = "";
      if (mf && mf.benchmark && mf.continuousFieldMetrics) {
        var bm = mf.benchmark;
        var cfm = mf.continuousFieldMetrics;
        var ctrlRows = (mf.controlActionSummary || []).map(function (c) {
          var pct = Math.round((c.meanContinuousWeight || 0) * 100);
          return (
            '<div style="margin-bottom:6px;">' +
              '<div style="display:flex;justify-content:space-between;font-size:0.76rem;">' +
                '<code>' + escHtml(c.action) + '</code>' +
                '<span>mean=' + Number(c.meanContinuousWeight).toFixed(3) + ' &middot; dom=' + Number(c.dominantSharePercent).toFixed(1) + '%</span>' +
              '</div>' +
              '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:var(--accent);"></div></div>' +
            '</div>'
          );
        }).join("");

        var agentRows = (mf.a2aAgentFieldSummary || []).slice(0, 8).map(function (ag) {
          var pct = Math.min(100, Math.round((ag.meanBoltzmannWeight || 0) * 400));
          return (
            '<div style="margin-bottom:5px;">' +
              '<div style="display:flex;justify-content:space-between;font-size:0.75rem;">' +
                '<code>' + escHtml(ag.agentId) + '</code>' +
                '<span>mass=' + Number(ag.meanBoltzmannWeight).toFixed(3) + ' &middot; top1=' + Number(ag.top1AssignmentShare).toFixed(1) + '%</span>' +
              '</div>' +
              '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:var(--ok);"></div></div>' +
            '</div>'
          );
        }).join("");

        manifoldBannerHtml =
          '<div class="sub-box" style="margin-bottom:16px;border-color:#3dd68c;">' +
            '<h4>' +
              '<span>Continuous R^' + bm.dimensions + ' Manifold &amp; A2A Spectral Field Benchmark (' + Number(bm.scaleJourneys).toLocaleString() + ' Trajectories / ' + Number(bm.totalEventsProcessed).toLocaleString() + ' Events)</span>' +
              '<code>' + Number(bm.throughputJourneysPerSec).toLocaleString() + ' journeys/sec &middot; ' + Number(bm.throughputEventsPerSec).toLocaleString() + ' events/sec (' + bm.elapsedMilliseconds + ' ms)</code>' +
            '</h4>' +
            '<div class="tax-cols">' +
              '<div>' +
                '<div class="term-item"><strong>Plane 2 Mahalanobis Drift D_M:</strong> mean <code>' + cfm.mahalanobisDrift.mean + '</code> &middot; p50 <code>' + cfm.mahalanobisDrift.p50 + '</code> &middot; p95 <code>' + cfm.mahalanobisDrift.p95 + '</code> &middot; Wasserstein-2 <code>' + cfm.wassersteinTransportCostMean + '</code></div>' +
                '<div class="term-item"><strong>Lyapunov Stability Regimes:</strong> <span class="ok">Convergent ' + cfm.lyapunovStability.convergentSharePercent + '%</span> &middot; <span class="urg-med">Orbital ' + cfm.lyapunovStability.orbitalSharePercent + '%</span> &middot; <span class="urg-high">Divergent ' + cfm.lyapunovStability.divergentSharePercent + '%</span></div>' +
                '<div class="term-item"><strong>Omnichannel Context Fidelity I(X_0;X_t)/H(X_0):</strong> mean <code>' + cfm.omnichannelContextField.meanMutualInfoRetention + '</code> (p50 <code>' + cfm.omnichannelContextField.p50Fidelity + '</code>, p90 <code>' + cfm.omnichannelContextField.p90Fidelity + '</code>) &middot; Entropy <code>' + cfm.omnichannelContextField.meanShannonContextEntropy + '</code></div>' +
                '<div class="term-item"><strong>A2A Spectral Field:</strong> Boltzmann Entropy <code>' + cfm.a2aSpectralField.meanBoltzmannEntropy + '</code> &middot; Spectral Loop Energy <code>' + cfm.a2aSpectralField.meanSpectralLoopEnergy + '</code></div>' +
              '</div>' +
              '<div><strong style="font-size:0.78rem;color:var(--code);">Plane 3 Continuous Hamiltonian Control Vector u*(t) in [0,1]^6</strong><div style="margin-top:6px;">' + ctrlRows + '</div></div>' +
              '<div><strong style="font-size:0.78rem;color:var(--code);">A2A Continuous Boltzmann Routing Field P(a | z_t)</strong><div style="margin-top:6px;">' + agentRows + '</div></div>' +
            '</div>' +
          '</div>';
      }

      var planeColors = ["#38bdf8", "#f5a524", "#3dd68c"];
      var planesHtml = "";
      if (triad && triad.planes) {
        planesHtml = triad.planes.map(function (p, idx) {
          var col = planeColors[idx % planeColors.length];
          var artifactsHtml = (p.artifacts || []).map(function (a) {
            return '<span class="tag-chip">' + escHtml(a) + "</span>";
          }).join(" ");
          return (
            '<div class="sub-box" style="border-top: 3px solid ' + col + ';">' +
              '<h4><span>' + escHtml(p.name) + '</span><code>' + escHtml(p.taxonomyId) + '</code></h4>' +
              '<div style="font-size:0.9rem;font-weight:600;color:' + col + ';margin-bottom:6px;">' + escHtml(p.question) + '</div>' +
              '<div class="muted" style="font-size:0.78rem;margin-bottom:8px;">Temporal focus: <code>' + escHtml(p.temporalFocus) + '</code></div>' +
              '<div style="display:flex;flex-wrap:wrap;gap:5px;">' + artifactsHtml + '</div>' +
            '</div>'
          );
        }).join("");
      }

      var envFieldsHtml = "";
      if (envSpec && envSpec.requiredFields) {
        envFieldsHtml = envSpec.requiredFields.map(function (f) {
          return '<span class="tag-chip" style="padding:3px 8px;font-family:ui-monospace,monospace;">' + escHtml(f) + "</span>";
        }).join(" ");
      }

      var tracesRowsHtml = traces.map(function (tr) {
        var bp = tr.hopedBlueprint || {};
        var act = tr.actualTrace || {};
        var env = tr.contextEnvelope || {};
        var dec = tr.decision || {};

        var plannedStages = (bp.goldenPathStages || []).join(" &rarr; ");
        var actualStages = (act.observedStages || []).join(" &rarr; ");
        var channels = (act.channelsTouched || []).join(" &rarr; ");
        var a2aHops = (env.a2aChain || []).map(function (h) {
          return escHtml(h.from) + "&rarr;" + escHtml(h.to) + " (" + escHtml(h.status) + ")";
        }).join("; ");

        var driftLabel = dec.drift_severity || dec.conformance_drift || "pending";
        var driftCls = driftLabel === "critical_path_break" ? "urg-high" : driftLabel === "minor_deviation" ? "urg-med" : "ok";
        var hydrateNoul = dec.context_hydration_noul != null ? Number(dec.context_hydration_noul).toFixed(3) : "—";
        var orchAction = dec.orchestration_action || "—";
        var targetOwner = dec.target_a2a_owner || "—";
        var confVal = dec.action_confidence != null ? Number(dec.action_confidence).toFixed(3) : "—";

        return (
          "<tr>" +
            "<td>" +
              "<strong>" + escHtml(tr.journeyId) + "</strong><br/>" +
              '<span class="tag-chip">' + escHtml(tr.customerTier) + "</span>" +
            "</td>" +
            "<td>" +
              "<code>" + escHtml(bp.blueprintId) + "</code><br/>" +
              '<div class="muted" style="font-size:0.77rem;margin-top:3px;"><strong>Golden Path:</strong> ' + plannedStages + "</div>" +
              '<div class="muted" style="font-size:0.76rem;"><strong>MoT:</strong> ' + escHtml(bp.momentOfTruth) + " (SLA " + escHtml(bp.slaBudgetSeconds) + "s)</div>" +
            "</td>" +
            "<td>" +
              '<div style="font-size:0.78rem;"><strong>Observed:</strong> ' + actualStages + "</div>" +
              '<div class="muted" style="font-size:0.76rem;margin-top:2px;"><strong>Channels:</strong> <code>' + channels + "</code> &middot; Loops: <b>" + Number(act.loopCount || 0) + "</b> &middot; Elapsed: " + Number(act.elapsedSeconds || 0) + "s</div>" +
              '<div class="muted" style="font-size:0.76rem;margin-top:2px;">' + escHtml(act.driftSummary) + "</div>" +
            "</td>" +
            "<td>" +
              '<div>Auth Carryover: <b>' + (env.authCarriedOver ? '<span class="ok">YES</span>' : '<span class="urg-high">NO</span>') + '</b> &middot; Slots: <b>' + (env.extractedSlotsPreserved ? '<span class="ok">OK</span>' : '<span class="urg-high">DROPPED</span>') + "</b></div>" +
              '<div class="muted" style="font-size:0.75rem;margin-top:2px;"><strong>A2A Chain:</strong> ' + (a2aHops || "none") + "</div>" +
              '<div style="font-size:0.76rem;margin-top:2px;">Hydrate Noul: <code>' + hydrateNoul + "</code></div>" +
            "</td>" +
            "<td>" +
              '<div class="' + driftCls + '">' + escHtml(driftLabel) + "</div>" +
              '<div style="margin-top:3px;">Action: <code>' + escHtml(orchAction) + "</code></div>" +
              '<div style="margin-top:2px;">Owner: <code>' + escHtml(targetOwner) + "</code> (conf <code>" + confVal + "</code>)</div>" +
            "</td>" +
          "</tr>"
        );
      }).join("");

      container.innerHTML =
        manifoldBannerHtml +
        '<div class="tax-cols" style="margin-bottom:16px;">' +
          planesHtml +
        '</div>' +
        '<div class="sub-box" style="margin-bottom:16px;">' +
          '<h4><span>Canonical Omnichannel &amp; A2A Context Envelope (<code>ocx</code> + <code>a2a_protocol</code>)</span><span>' + ((envSpec && envSpec.requiredFields && envSpec.requiredFields.length) || 0) + ' Required Envelope Fields</span></h4>' +
          '<p class="muted" style="font-size:0.82rem;margin:0 0 8px;">' + escHtml((envSpec && envSpec.description) || "") + '</p>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + envFieldsHtml + '</div>' +
        '</div>' +
        '<div class="sub-box">' +
          '<h4><span>Live 3-Plane Journey &amp; A2A Decision Matrix (' + traces.length + ' Multi-Step Traces Evaluated by Strands 2B)</span><span>Plane 1 (Hoped) vs. Plane 2 (Actual) vs. Plane 3 (Orchestrated)</span></h4>' +
          '<table>' +
            '<thead>' +
              '<tr>' +
                '<th>Journey</th>' +
                '<th>Plane 1: Hoped Blueprint (CJM)</th>' +
                '<th>Plane 2: Tracked Reality &amp; Drift (CJT)</th>' +
                '<th>Omnichannel &amp; A2A Envelope (OCX/A2A)</th>' +
                '<th>Plane 3: Strands 2B Orchestration (JO)</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + (tracesRowsHtml || '<tr><td colspan="5">No journey traces loaded</td></tr>') + '</tbody>' +
          '</table>' +
        '</div>';
    }
    function renderCalibration() {
      var container = document.getElementById("calibration-container");
      var cal = DATA.calibration;
      if (!cal) {
        container.innerHTML = '<p class="muted">No calibration data found at <code>.tmp/qa-triage/calibration.json</code>.</p>';
        return;
      }

      var sweepRowsHtml = (cal.threshold_sweep || []).map(function (row) {
        var isRec = Number(row.threshold) === Number(cal.recommended_high_band);
        var isAct = Number(row.threshold) === Number(cal.active_high_band);
        var badge = isRec
          ? ' <span class="tag-chip" style="color:var(--ok)">recommended</span>'
          : isAct
            ? ' <span class="tag-chip" style="color:var(--warn)">active</span>'
            : "";

        var f1Pct = Math.round((row.f1 || 0) * 100);
        var agreePct = Math.round((row.policy_agreement || 0) * 100);
        var accPct = Math.round((row.accuracy || 0) * 100);
        var precPct = Math.round((row.precision || 0) * 100);
        var recPct = Math.round((row.recall || 0) * 100);

        return (
          '<div class="sweep-row">' +
            '<div><strong>&tau; = ' + Number(row.threshold).toFixed(2) + '</strong>' + badge + '</div>' +
            '<div class="bar-group">' +
              '<div style="display:flex;justify-content:space-between;font-size:0.75rem;">' +
                '<span>F1: <b>' + Number(row.f1).toFixed(3) + '</b> (' + f1Pct + '%)</span>' +
                '<span>Policy Agreement: <b>' + agreePct + '%</b></span>' +
              '</div>' +
              '<div class="bar-track">' +
                '<div class="bar-fill" style="width:' + f1Pct + '%;background:var(--accent);"></div>' +
              '</div>' +
              '<div class="bar-track">' +
                '<div class="bar-fill" style="width:' + agreePct + '%;background:var(--ok);"></div>' +
              '</div>' +
            '</div>' +
            '<div class="muted" style="font-size:0.78rem;font-family:ui-monospace,monospace;">' +
              'Acc ' + accPct + '% &middot; Prec ' + precPct + '% &middot; Rec ' + recPct + '%' +
            '</div>' +
          '</div>'
        );
      }).join("");

      var obsRowsHtml = (cal.observations || []).map(function (o) {
        var matchCls = o.path_match ? "ok" : "urg-high";
        var matchTxt = o.path_match ? "MATCH" : "MISMATCH";
        return (
          "<tr>" +
            "<td><strong>" + escHtml(o.id) + "</strong></td>" +
            "<td><code>" + escHtml(o.channel) + "</code></td>" +
            "<td><code>" + escHtml(o.gold_compliance_risk) + "</code> / <code>" + escHtml(o.gold_severity_level) + "</code></td>" +
            "<td><code>" + escHtml(o.gold_qa_path) + "</code></td>" +
            "<td><code>" + Number(o.noul).toFixed(4) + "</code></td>" +
            "<td><code>" + Number(o.score).toFixed(3) + "</code> (conf <code>" + Number(o.score_conf).toFixed(3) + "</code>)</td>" +
            "<td><code>" + escHtml(o.predicted_qa_path) + "</code></td>" +
            '<td class="' + matchCls + '">' + matchTxt + "</td>" +
          "</tr>"
        );
      }).join("");

      var triageRowsHtml = (DATA.triage || []).map(function (r) {
        var cls = r.qa_path === "targeted_human_qa" ? "urg-high" : r.qa_path === "needs_review" ? "urg-med" : "ok";
        return (
          "<tr>" +
            "<td><strong>" + escHtml(r.contact_id) + "</strong></td>" +
            "<td><code>" + escHtml(r.channel) + "</code></td>" +
            '<td class="' + cls + '">' + escHtml(r.qa_path) + "</td>" +
            "<td><code>" + Number(r.compliance_noul || 0).toFixed(3) + "</code></td>" +
            "<td><code>" + Number(r.severity_score || 0).toFixed(2) + "</code></td>" +
            "<td><code>" + Number(r.severity_confidence || 0).toFixed(3) + "</code></td>" +
            "<td>" + escHtml(r.reason) + "</td>" +
          "</tr>"
        );
      }).join("");

      container.innerHTML =
        '<div class="tax-cols" style="margin-bottom:18px;">' +
          '<div class="sub-box">' +
            '<h4><span>Threshold Sweep (0.55 .. 0.85)</span><span>Active=' + cal.active_high_band + ' &middot; Rec=' + cal.recommended_high_band + '</span></h4>' +
            sweepRowsHtml +
          '</div>' +
          '<div class="sub-box">' +
            '<h4><span>Live QA Triage Queue (' + (DATA.triage || []).length + ' contacts)</span><span>history.jsonl</span></h4>' +
            '<table>' +
              '<thead><tr><th>Contact</th><th>Channel</th><th>QA Path</th><th>Noul</th><th>Sev</th><th>Conf</th><th>Reason</th></tr></thead>' +
              '<tbody>' + (triageRowsHtml || '<tr><td colspan="7">No triage rows</td></tr>') + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
        '<div class="sub-box">' +
          '<h4><span>Gold Calibration Observations (n=' + (cal.observations || []).length + ')</span><span>Calibrated ' + escHtml(cal.calibrated_at) + '</span></h4>' +
          '<table>' +
            '<thead><tr><th>ID</th><th>Channel</th><th>Gold Risk/Sev</th><th>Gold Path</th><th>Compliance Noul</th><th>Pred Score (Conf)</th><th>Pred Path</th><th>Status</th></tr></thead>' +
            '<tbody>' + obsRowsHtml + '</tbody>' +
          '</table>' +
        '</div>';
    }

    // Wire events
    document.querySelectorAll(".topo-node").forEach(function (nodeEl) {
      nodeEl.addEventListener("click", function () {
        var tid = nodeEl.getAttribute("data-tax-id");
        state.selectedTaxonomyId = state.selectedTaxonomyId === tid ? null : tid;
        updateTopologyView();
        renderDeepDive();
      });
      nodeEl.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          var tid = nodeEl.getAttribute("data-tax-id");
          state.selectedTaxonomyId = state.selectedTaxonomyId === tid ? null : tid;
          updateTopologyView();
          renderDeepDive();
        }
      });
    });

    document.getElementById("btn-reset-topo").addEventListener("click", function () {
      state.selectedTaxonomyId = null;
      updateTopologyView();
      renderDeepDive();
    });

    var searchInput = document.getElementById("taxonomy-search");
    searchInput.addEventListener("input", function () {
      state.searchQuery = searchInput.value;
      renderDeepDive();
    });

    document.getElementById("btn-clear-search").addEventListener("click", function () {
      state.searchQuery = "";
      state.selectedTaxonomyId = null;
      searchInput.value = "";
      updateTopologyView();
      renderDeepDive();
    });

    document.getElementById("btn-clear-kpi").addEventListener("click", function () {
      state.highlightedKpiId = null;
      renderKpiMatrix();
    });

    // Initial render
    updateTopologyView();
    renderDeepDive();
    renderKpiMatrix();
    renderJourneyTriad();
    renderCalibration();
  })();
  </script>
</body>
</html>
`;

writeFileSync(outPath, html);
console.log(
  `Generated CXOS Ontology Explorer: ${outPath} (${taxonomies.length} taxonomies, ${totalGlossary} terms, ${totalFacetNodes} facet nodes, ${totalKpiLinkedMetrics}/${totalMetrics} KPI-linked metrics, ${totalFailureModes} failure modes, ${totalIntegrations} integrations)`,
);
