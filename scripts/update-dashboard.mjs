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
const manifoldPath = resolve(
  argOf("--manifold") ?? join(ROOT, ".tmp", "continuous-scale", "manifold-summary.json"),
);
const recalibratedPath = resolve(
  argOf("--recalibrated") ?? join(ROOT, ".tmp", "continuous-scale", "recalibrated-blueprints.json"),
);
const journeyHistoryPath = resolve(
  argOf("--journey-history") ?? join(ROOT, ".tmp", "qa-triage", "journey-a2a-history.jsonl"),
);
const ontologyPath = join(ROOT, "ontology", "cx-ontology.json");
const packPath = join(ROOT, "ontology", "cxos-systems-pack.json");

const esc = (s) =>
  String(s ?? "")
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
const manifold = existsSync(manifoldPath)
  ? JSON.parse(readFileSync(manifoldPath, "utf8"))
  : null;
const recalibrated = existsSync(recalibratedPath)
  ? JSON.parse(readFileSync(recalibratedPath, "utf8"))
  : null;

const journeyRows = [];
if (existsSync(journeyHistoryPath)) {
  for (const line of readFileSync(journeyHistoryPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      journeyRows.push(JSON.parse(trimmed));
    } catch {
      // ignore malformed journey history line
    }
  }
}
const byJourney = new Map();
for (const r of journeyRows) {
  const jid = r?.journey_id ?? r?.journeyId;
  if (jid) byJourney.set(jid, r);
}
const uniqueJourneys = [...byJourney.values()];

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
const totalContinuousModels = taxonomies.filter((t) => Boolean(t.data.continuousDynamics)).length;
const totalStateVariables = taxonomies.reduce(
  (acc, t) => acc + (t.data.continuousDynamics?.stateVariables?.length ?? 0),
  0,
);
const totalDiffEquations = taxonomies.reduce(
  (acc, t) => acc + (t.data.continuousDynamics?.differentialEquations?.length ?? 0),
  0,
);
const totalScoringModels = taxonomies.filter((t) => Boolean(t.data.scoringModel)).length;
const packIntents = pack
  ? pack.domains.reduce((acc, d) => acc + (d.intents?.length ?? 0), 0)
  : 0;

const taxonomyRowsHtml = taxonomies
  .map((t) => {
    const kpiLinks = (t.data.metrics ?? [])
      .filter((m) => m.mapsToKpi)
      .map((m) => m.mapsToKpi);
    const uniqueKpis = [...new Set(kpiLinks)];
    const cd = t.data.continuousDynamics;
    const sm = t.data.scoringModel;
    const cdSummary = cd
      ? `<code>R^${cd.stateSpaceDimension ?? 16}</code> (${cd.stateVariables?.length ?? 0} vars, ${cd.differentialEquations?.length ?? 0} ODEs)`
      : "-";
    const smSummary = sm
      ? `${sm.maxPoints ?? 100}pt (${sm.dimensions?.length ?? 0} dims)`
      : "-";
    return `      <tr>
        <td><strong>${esc(t.acronym)}</strong> · ${esc(t.name)}</td>
        <td><code>${esc(t.category)}</code></td>
        <td>${t.data.glossary?.length ?? 0} terms · ${t.data.facets?.length ?? 0} facets</td>
        <td>${t.data.metrics?.length ?? 0} (${uniqueKpis.map((k) => `<code>${esc(k)}</code>`).join(", ") || "-"})</td>
        <td>${cdSummary} · ${smSummary}</td>
        <td>${t.data.failureModes?.length ?? 0}</td>
        <td class="idea">${esc(t.summary)}</td>
      </tr>`;
  })
  .join("\n");

let manifoldHtml = "";
if (manifold && manifold.benchmark && manifold.continuousFieldMetrics) {
  const bm = manifold.benchmark;
  const cfm = manifold.continuousFieldMetrics;
  const md = cfm.mahalanobisDrift ?? {};
  const lyap = cfm.lyapunovStability ?? {};
  const ocx = cfm.omnichannelContextField ?? {};
  const a2a = cfm.a2aSpectralField ?? {};

  const controlRowsHtml = (manifold.controlActionSummary ?? [])
    .map((act) => {
      const id = act.id ?? act.action ?? "";
      const mapped = act.mapsToDiscreteAction ?? "";
      const meanW = Number(act.meanContinuousWeight ?? 0).toFixed(4);
      const domShare = Number(act.primaryDominantShare ?? act.dominantSharePercent ?? 0).toFixed(2);
      const domCount = Number(act.primaryDominantCount ?? 0).toLocaleString();
      return `      <tr>
        <td><code>${esc(id)}</code></td>
        <td><code>${esc(mapped)}</code></td>
        <td><strong>${esc(meanW)}</strong></td>
        <td>${esc(domShare)}% (${esc(domCount)})</td>
      </tr>`;
    })
    .join("\n");

  const agentRowsHtml = (manifold.a2aAgentFieldSummary ?? [])
    .map((ag) => {
      const id = ag.id ?? ag.agentId ?? "";
      const role = ag.role ?? "";
      const mass = Number(ag.meanBoltzmannWeight ?? 0).toFixed(4);
      const share = Number(ag.top1AssignmentShare ?? 0).toFixed(2);
      const cnt = Number(ag.top1AssignmentCount ?? 0).toLocaleString();
      return `      <tr>
        <td><strong>${esc(id)}</strong> · <span class="idea">${esc(ag.name ?? "")}</span></td>
        <td><code>${esc(role)}</code></td>
        <td><code>${esc(ag.authorityRadius ?? "-")}</code></td>
        <td><strong>${esc(mass)}</strong></td>
        <td>${esc(share)}% (${esc(cnt)})</td>
      </tr>`;
    })
    .join("\n");

  manifoldHtml = `
  <h2>Continuous R^${esc(bm.dimensions ?? 16)} Manifold &amp; A2A Spectral Field Benchmark (${Number(bm.scaleJourneys ?? 0).toLocaleString()} Trajectories)</h2>
  <div class="meta">Simulated <strong>${Number(bm.scaleJourneys ?? 0).toLocaleString()}</strong> continuous trajectories (<strong>${Number(bm.totalEventsProcessed ?? 0).toLocaleString()}</strong> assimilated events) across <code>R^${esc(bm.dimensions ?? 16)}</code> in <strong>${esc(bm.elapsedMilliseconds)} ms</strong> · Throughput: <strong>${Number(bm.throughputJourneysPerSec ?? 0).toLocaleString()} journeys per sec</strong> (${Number(bm.throughputEventsPerSec ?? 0).toLocaleString()} events per sec)</div>
  <div class="cards">
    <div class="card"><b>${Number(bm.scaleJourneys ?? 0).toLocaleString()}</b><span>Trajectories (${Number(bm.totalEventsProcessed ?? 0).toLocaleString()} Events)</span></div>
    <div class="card"><b>${esc(bm.elapsedMilliseconds)} ms</b><span>Wall Time</span></div>
    <div class="card"><b class="ok">${Number(bm.throughputJourneysPerSec ?? 0).toLocaleString()} jps</b><span>Throughput (${Number(bm.throughputEventsPerSec ?? 0).toLocaleString()} eps)</span></div>
    <div class="card"><b>${esc(md.mean)}</b><span>Mahalanobis Drift (p50=${esc(md.p50)}, p95=${esc(md.p95)}, p99=${esc(md.p99)})</span></div>
    <div class="card"><b class="ok">${esc(lyap.convergentSharePercent)}%</b><span>Lyapunov Convergent (Orb ${esc(lyap.orbitalSharePercent)}% · Div ${esc(lyap.divergentSharePercent)}%)</span></div>
    <div class="card"><b>${esc(ocx.meanMutualInfoRetention)}</b><span>Context Fidelity I(X_0;X_t) &divide; H(X_0) (H=${esc(ocx.meanShannonContextEntropy)})</span></div>
    <div class="card"><b>${esc(a2a.meanBoltzmannEntropy)}</b><span>A2A Boltzmann Entropy (Loop E=${esc(a2a.meanSpectralLoopEnergy)})</span></div>
  </div>
  <table>
    <thead><tr><th>Plane 3 Control Basis u*(t)</th><th>Maps To Discrete Action</th><th>Mean Continuous Weight</th><th>Dominant Trajectory Share</th></tr></thead>
    <tbody>
${controlRowsHtml}
    </tbody>
  </table>
  <br/>
  <table>
    <thead><tr><th>A2A Continuous Agent</th><th>Role</th><th>Auth Radius</th><th>Mean Boltzmann Mass</th><th>Top-1 Assignment Share</th></tr></thead>
    <tbody>
${agentRowsHtml}
    </tbody>
  </table>`;
}

let recalibratedHtml = "";
if (recalibrated) {
  const bpList =
    recalibrated.recalibratedBlueprints ??
    recalibrated.blueprints ??
    recalibrated.attractors ??
    recalibrated.items ??
    (Array.isArray(recalibrated) ? recalibrated : []);

  const manifoldBpCounts = new Map();
  if (manifold && Array.isArray(manifold.blueprintAttractorSummary)) {
    for (const mb of manifold.blueprintAttractorSummary) {
      if (mb && mb.blueprintId) manifoldBpCounts.set(mb.blueprintId, mb.journeyCount);
    }
  }
  const defaultPerBpCount =
    recalibrated.sourceScaleJourneys && bpList.length > 0
      ? Math.round(recalibrated.sourceScaleJourneys / bpList.length)
      : 0;

  const recalRowsHtml = bpList
    .map((bp) => {
      const bpId = bp.blueprintId ?? bp.blueprint_id ?? bp.id ?? "unknown";
      const bpName = bp.name ?? bp.title ?? "";
      const rawJCount =
        bp.journeyCount ??
        bp.journey_count ??
        bp.trajectories ??
        manifoldBpCounts.get(bpId) ??
        defaultPerBpCount;
      const jCount = Number(rawJCount).toLocaleString();

      const ci = bp.counterfactualImpact ?? {};
      const sla = bp.slaRecalibration ?? {};

      const priorDrift =
        ci.priorMahalanobisDrift ??
        bp.priorMahalanobisDrift ??
        bp.priorDrift ??
        "-";
      const postDrift =
        ci.counterfactualPostDrift ??
        bp.postRecalibrationDrift ??
        bp.postMahalanobisDrift ??
        "-";
      const driftRed =
        ci.driftReductionPercent ??
        bp.driftReductionPercent ??
        bp.driftReductionPct ??
        "-";

      const priorSla =
        sla.priorSlaBudgetSeconds ??
        bp.priorSlaBudgetSeconds ??
        bp.slaBudgetSeconds ??
        "-";
      const postSla =
        sla.recalibratedSlaBudgetSeconds ??
        bp.recalibratedSlaBudgetSeconds ??
        bp.postSlaBudgetSeconds ??
        "-";
      const slaDelta = sla.slaDeltaSeconds;
      const slaDeltaStr =
        slaDelta !== undefined
          ? ` (${slaDelta > 0 ? "+" : ""}${slaDelta}s)`
          : "";

      const rawAxes =
        bp.top3DivergingManifoldAxes ??
        bp.topDivergingAxes ??
        bp.topDivergingManifoldAxes ??
        bp.divergingAxes ??
        [];
      const axesStr = Array.isArray(rawAxes)
        ? rawAxes
            .map((a) => {
              if (typeof a === "string") return `<code>${esc(a)}</code>`;
              const axId = a.axisId ?? a.id ?? a.axis ?? a.name ?? "axis";
              const delta = a.driftResidualDeltaMu ?? a.delta ?? a.zScore ?? a.drift;
              const deltaFormatted =
                typeof delta === "number"
                  ? `${delta > 0 ? "+" : ""}${delta.toFixed(3)}`
                  : delta !== undefined
                    ? String(delta)
                    : "";
              return `<code>${esc(axId)}</code>${deltaFormatted ? ` (${esc(deltaFormatted)})` : ""}`;
            })
            .join(", ")
        : `<code>${esc(String(rawAxes))}</code>`;

      const recs = bp.prescriptiveStructuralRecommendations;
      const actionStr = Array.isArray(recs) && recs.length > 0
        ? recs.slice(0, 2).join(" · ")
        : bp.prescriptiveBlueprintAction ??
          bp.prescriptiveAction ??
          bp.recommendedAction ??
          bp.action ??
          "-";

      return `      <tr>
        <td><strong>${esc(bpId)}</strong>${bpName ? `<br/><span class="idea">${esc(bpName)}</span>` : ""}</td>
        <td>${esc(jCount)}</td>
        <td><code>${esc(priorDrift)}</code> &rarr; <code class="ok">${esc(postDrift)}</code></td>
        <td class="ok"><strong>-${esc(driftRed)}%</strong></td>
        <td><code>${esc(priorSla)}s</code> &rarr; <code>${esc(postSla)}s</code>${esc(slaDeltaStr)}</td>
        <td>${axesStr || "-"}</td>
        <td>${esc(actionStr)}</td>
      </tr>`;
    })
    .join("\n");

  const summaryMeta =
    recalibrated.portfolioRecalibrationSummary ??
    recalibrated.summary ??
    recalibrated.aggregate ??
    {};
  const meanBefore =
    summaryMeta.meanPriorMahalanobisDrift ??
    summaryMeta.priorMeanDrift ??
    summaryMeta.meanDriftBefore ??
    recalibrated.priorMeanMahalanobisDrift ??
    null;
  const meanAfter =
    summaryMeta.meanCounterfactualPostDrift ??
    summaryMeta.postMeanDrift ??
    summaryMeta.meanDriftAfter ??
    recalibrated.postMeanMahalanobisDrift ??
    null;
  const meanRed =
    summaryMeta.overallDriftReductionPercent ??
    summaryMeta.meanDriftReductionPercent ??
    recalibrated.overallDriftReductionPercent ??
    null;
  const lyapLift =
    summaryMeta.overallLyapunovConvergenceLiftPctPoints ?? null;

  recalibratedHtml = `
  <h2>Plane 1 &larr; Plane 2 &amp; Plane 3 Closed-Loop Blueprint Recalibration (${bpList.length} Attractor Tubes)</h2>
  <div class="meta">Closed-loop empirical feedback updating Plane 1 Golden Attractor Tubes <code>T*(tau) = (mu*(tau), Sigma*(tau))</code> and SLA budgets from Plane 2 trajectory residuals &amp; Plane 3 Hamiltonian control impulses${meanBefore !== null && meanAfter !== null ? ` · Mean Drift: <strong>${esc(meanBefore)} &rarr; ${esc(meanAfter)}</strong> (${meanRed !== null ? `<strong class="ok">-${esc(meanRed)}%</strong>` : "recalibrated"})${lyapLift !== null ? ` · Lyapunov Convergence Lift: <strong class="ok">+${esc(lyapLift)} pp</strong>` : ""}` : ""}</div>
  <table>
    <thead><tr><th>Blueprint Attractor</th><th>Journey Count</th><th>Prior vs. Post-Recalibration Drift</th><th>Drift Reduction %</th><th>Prior vs. Recalibrated SLA Budget</th><th>Top Diverging Manifold Axes</th><th>Prescriptive Blueprint Action</th></tr></thead>
    <tbody>
${recalRowsHtml}
    </tbody>
  </table>`;
}

const journeyDecisionRowsHtml =
  uniqueJourneys.length === 0
    ? `      <tr><td colspan="9">(no journey A2A decisions yet — run <code>npm run journey-decide</code>)</td></tr>`
    : uniqueJourneys
        .map((r) => {
          const driftCls =
            r.conformance_drift === "critical_path_break"
              ? "urg-high"
              : r.conformance_drift === "minor_deviation"
                ? "urg-med"
                : "ok";
          const hydrateCls = r.context_hydration_urgent ? "urg-high" : "ok";
          return `      <tr>
        <td><strong>${esc(r.journey_id)}</strong></td>
        <td><code>${esc(r.customer_tier)}</code></td>
        <td><code>${esc(r.blueprint_id)}</code></td>
        <td>${esc(r.elapsed_sec ?? "-")}s of ${esc(r.sla_budget_sec ?? "-")}s (loops: ${esc(r.loop_count ?? 0)})</td>
        <td class="${driftCls}">${esc(r.conformance_drift)} (<code>${r.drift_score?.toFixed(2) ?? "-"}</code>)</td>
        <td class="${hydrateCls}"><code>${r.context_hydration_noul?.toFixed(3) ?? "-"}</code> (${r.context_hydration_urgent ? "URGENT" : "intact"})</td>
        <td><code>${esc(r.orchestration_action)}</code> (<code>${r.action_confidence?.toFixed(3) ?? "-"}</code>)</td>
        <td><code>${esc(r.target_a2a_owner)}</code> (<code>${r.owner_confidence?.toFixed(3) ?? "-"}</code>)</td>
        <td><strong class="ok">${esc(r.band)}</strong> · <code>${esc(r.execution_mode)}</code></td>
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
    <div class="card"><b class="ok">${totalContinuousModels}</b><span>Continuous Dynamical Models (${totalStateVariables} Vars · ${totalDiffEquations} ODEs)</span></div>
    <div class="card"><b class="ok">${totalScoringModels}</b><span>100-Pt Weighted Rubrics</span></div>
    <div class="card"><b>${packIntents}</b><span>Engine Pack Intents</span></div>
  </div>
  <table>
    <thead><tr><th>System</th><th>Category</th><th>Structure</th><th>Metrics (Engine KPI Links)</th><th>Continuous Dynamics &amp; 100-Pt Rubric</th><th>Failure Modes</th><th>Role Summary</th></tr></thead>
    <tbody>
${taxonomyRowsHtml}
    </tbody>
  </table>
${manifoldHtml}
${recalibratedHtml}

  <h2>Live 3-Plane Journey &amp; A2A Strands 2B Decisions (${uniqueJourneys.length} journeys)</h2>
  <table>
    <thead><tr><th>Journey</th><th>Tier</th><th>Plane 1 Blueprint</th><th>Plane 2 Elapsed &amp; Loops</th><th>Conformance Drift</th><th>Context Hydration Noul</th><th>Plane 3 Orchestration Action</th><th>Target A2A Owner</th><th>Band</th></tr></thead>
    <tbody>
${journeyDecisionRowsHtml}
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
  `Updated dashboard: ${dashboardPath} (${taxonomies.length} taxonomies, ${totalContinuousModels} continuous models, ${totalScoringModels} rubrics, ${uniqueJourneys.length} journey A2A decisions, ${uniqueTriage.length} triaged contacts, manifold=${manifold ? "yes" : "no"}, recalibrated=${recalibrated ? "yes" : "no"}, calibration=${calibration ? "yes" : "no"})`,
);
