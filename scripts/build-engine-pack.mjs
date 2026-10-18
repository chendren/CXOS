#!/usr/bin/env node
/**
 * Build Engine Pack — compiles the CXOS workspace taxonomies (IVR, ACD, WFM, QA,
 * CRM, KM, Speech Analytics, Outbound, VOC) into a Coxswain-compatible
 * CxOntologyCatalog extension pack at ontology/cxos-systems-pack.json.
 *
 * The resulting pack can be loaded via @cox/cx-core:
 *   const pack = loadOntologyFromCatalog(cxosSystemsPackJson);
 *   const merged = mergeOntologies(DEFAULT_ONTOLOGY, pack);
 *   validateOntology(merged); // -> { ok: true, issues: [] }
 *
 * Zero dependencies, deterministic, offline, regex-free.
 *
 * Usage:
 *   npm run ontology:pack
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ONTOLOGY_DIR = join(ROOT, "ontology");
const OUT_FILE = join(ONTOLOGY_DIR, "cxos-systems-pack.json");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const rootOntology = readJson(join(ONTOLOGY_DIR, "cx-ontology.json"));
const taxonomies = rootOntology.taxonomies.map((entry) => ({
  entry,
  tax: readJson(join(ONTOLOGY_DIR, entry.path)),
}));

// 1. Convert each system taxonomy into a CxDomain where failure modes and key
//    operational capabilities become addressable intents (`<taxonomy_id>.<intent_id>`).
const domains = taxonomies.map(({ tax }) => {
  const failureIntents = (tax.failureModes ?? []).map((fm) => ({
    id: `failure_${fm.id}`,
    name: `${tax.acronym}: ${fm.name}`,
    description: `${fm.signal} — Mitigation: ${fm.mitigation}`,
    exemplars: [
      fm.signal,
      fm.mitigation,
      `Investigate ${tax.acronym} ${fm.name.toLowerCase()} in contact center operations`,
    ],
  }));

  const facetIntents = (tax.facets ?? []).map((facet) => {
    const childNames = (facet.root?.children ?? []).map((c) => c.name);
    return {
      id: `ops_${facet.id}`,
      name: `${tax.acronym} ${facet.name}`,
      description: facet.description ?? `Operational classification for ${tax.name}: ${facet.name}`,
      exemplars: [
        `Configure ${tax.acronym} ${facet.name.toLowerCase()}`,
        ...childNames.slice(0, 4).map((cn) => `${tax.acronym} ${cn}`),
      ],
    };
  });

  return {
    id: `sys_${tax.id}`,
    name: `${tax.acronym} (${tax.name})`,
    intents: [...failureIntents, ...facetIntents],
  };
});

// 2. Build deterministic operational journeys from core.interactionLifecycle and QA triage
const lifecycleStages = rootOntology.core.interactionLifecycle;
const interactionSpineJourney = {
  id: "cxos_interaction_lifecycle",
  name: "CXOS End-to-End Interaction Lifecycle",
  triggerIntents: ["sys_ivr.ops_ivr_service_types", "sys_acd.ops_acd_routing_strategies"],
  stages: lifecycleStages.map((s, idx) => ({
    id: s.id,
    name: s.name,
    nextStages: idx + 1 < lifecycleStages.length ? [lifecycleStages[idx + 1].id] : [],
  })),
  terminalStages: [lifecycleStages[lifecycleStages.length - 1].id],
};

const qaTriageJourney = {
  id: "cxos_qa_calibration_loop",
  name: "CXOS QA Triage & Calibration Loop",
  triggerIntents: [
    "sys_qa.failure_gotcha_qa",
    "sys_qa.failure_calibration_drift",
    "sys_qa.ops_qa_evaluation_scopes",
  ],
  stages: [
    { id: "sampled", name: "Contact Sampled", nextStages: ["decider_triaged"] },
    {
      id: "decider_triaged",
      name: "Strands 2B Decider Triaged",
      nextStages: ["targeted_human_qa", "needs_review", "auto_qa_only"],
    },
    { id: "targeted_human_qa", name: "Targeted Human QA Evaluation", nextStages: ["coached", "calibrated"] },
    { id: "needs_review", name: "Ambiguous Band Review", nextStages: ["targeted_human_qa", "auto_qa_only"] },
    { id: "auto_qa_only", name: "Full-Coverage Auto QA", nextStages: ["calibrated"] },
    { id: "coached", name: "Coaching Scheduled in WFM", nextStages: ["calibrated"] },
    { id: "calibrated", name: "Calibrated & Closed", nextStages: [] },
  ],
  terminalStages: ["calibrated"],
};

// 3. Deterministic NBA rules for system-side operational telemetry & QA triage
const nbaRules = [
  {
    id: "QA_COMPLIANCE_HIGH_RISK",
    name: "Route High-Risk Compliance Contact to Human QA",
    priority: 100,
    conditions: [
      { field: "journey", op: "eq", value: "cxos_qa_calibration_loop" },
      { field: "stage", op: "eq", value: "targeted_human_qa" },
    ],
    logic: "AND",
    action: "assign_senior_qa_evaluator_and_flag_supervisor",
    actionType: "escalation",
    urgency: "critical",
  },
  {
    id: "WFM_OCCUPANCY_BURNOUT_GUARD",
    name: "Mitigate High Occupancy Burnout Risk",
    priority: 90,
    conditions: [
      { field: "intent", op: "eq", value: "sys_wfm.failure_occupancy_burnout" },
    ],
    logic: "AND",
    action: "trigger_wfm_recovery_aux_window_and_overflow_queues",
    actionType: "proactive",
    urgency: "high",
  },
  {
    id: "IVR_CONTAINMENT_DROP_GUARD",
    name: "Mitigate IVR Menu Maze / Zero-Out Spike",
    priority: 85,
    conditions: [
      { field: "intent", op: "in", value: ["sys_ivr.failure_menu_maze", "sys_ivr.failure_prompt_ambiguity"] },
    ],
    logic: "OR",
    action: "enable_open_phrase_routing_and_callback_offer",
    actionType: "deflection",
    urgency: "high",
  },
  {
    id: "KM_POISONED_KNOWLEDGE_ALERT",
    name: "Quarantine Stale or Contradictory KM Article",
    priority: 88,
    conditions: [
      { field: "intent", op: "eq", value: "sys_km.failure_poisoned_knowledge" },
    ],
    logic: "AND",
    action: "flag_km_article_urgent_review_and_sync_ivr_prompts",
    actionType: "protocol",
    urgency: "high",
  },
];

// 4. Preserve the 9 engine KPIs and expose taxonomy-level rollups in descriptions
const kpiRollupMap = new Map();
for (const kpiId of rootOntology.engineAlignment.kpiIds) {
  kpiRollupMap.set(kpiId, []);
}
for (const { tax } of taxonomies) {
  for (const m of tax.metrics ?? []) {
    if (m.mapsToKpi && kpiRollupMap.has(m.mapsToKpi)) {
      kpiRollupMap.get(m.mapsToKpi).push(`${tax.acronym}:${m.id}`);
    }
  }
}

const ENGINE_KPI_META = {
  total_contacts: { name: "Total Contacts", unit: "count" },
  sla_compliance_rate: { name: "SLA Compliance Rate", unit: "percent" },
  avg_wait_time: { name: "Average Wait Time", unit: "seconds" },
  deflection_rate: { name: "Deflection Rate", unit: "percent" },
  avg_contact_value: { name: "Average Contact Value", unit: "currency" },
  high_priority_contacts: { name: "High Priority Contacts", unit: "count" },
  fcr_rate: { name: "First Contact Resolution Rate", unit: "percent" },
  aht_seconds: { name: "Average Handle Time", unit: "seconds" },
  csat: { name: "Customer Satisfaction Score", unit: "score" },
};

const kpis = rootOntology.engineAlignment.kpiIds.map((id) => {
  const meta = ENGINE_KPI_META[id] ?? { name: id, unit: "count" };
  const linked = kpiRollupMap.get(id) ?? [];
  return {
    id,
    name: meta.name,
    unit: meta.unit,
    description: `Engine KPI (${id}) fed by ${linked.length} CXOS taxonomy metric(s): ${linked.join(", ")}`,
  };
});

const catalogPack = {
  version: rootOntology.version,
  source: "cxos-systems-ontology",
  domains,
  journeys: [interactionSpineJourney, qaTriageJourney],
  nbaRules,
  actionPolicies: {
    confidenceBands: rootOntology.engineAlignment.confidenceBands,
    escalationChains: {
      qa_compliance_breach: ["qa_specialist", "compliance_officer", "center_director"],
      wfm_sla_breach: ["intraday_analyst", "wfm_duty_manager", "ops_lead"],
    },
    actionSequenceTemplates: {
      qa_auto_fail_remediation: {
        steps: [
          "isolate_contact_recording",
          "assign_senior_qa_review",
          "schedule_wfm_coaching_block",
          "update_km_article_if_gap",
        ],
        applicableWhen: "compliance_noul >= 0.70 or auto_fail item triggered",
      },
    },
    resolutionFactors: {
      weights: {
        compliance_security: 0.25,
        accuracy_resolution: 0.3,
        process_efficiency: 0.15,
        communication_empathy: 0.2,
        brand_voice: 0.1,
      },
    },
    customerLifecycleStages: {},
  },
  kpis,
  channels: rootOntology.engineAlignment.channels,
  sentiments: rootOntology.engineAlignment.sentiments,
  urgencies: rootOntology.engineAlignment.urgencies,
  actionTypes: rootOntology.engineAlignment.actionTypes,
};

writeFileSync(OUT_FILE, JSON.stringify(catalogPack, null, 2) + "\n");

const totalIntents = domains.reduce((acc, d) => acc + d.intents.length, 0);
console.log(
  `Built Coxswain ontology extension pack: ${OUT_FILE}\n` +
    `  ${domains.length} system domains, ${totalIntents} operational intents, ` +
    `${catalogPack.journeys.length} journeys, ${nbaRules.length} NBA rules, ${kpis.length} aligned KPIs.`,
);
