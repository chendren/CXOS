#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = dirname(currentFile);
const workspaceRoot = resolve(scriptsDir, "..");

const specPath = join(workspaceRoot, "ontology", "continuous-scale-spec.json");
const ontologyPath = join(workspaceRoot, "ontology", "cx-ontology.json");
if (!existsSync(specPath) || !existsSync(ontologyPath)) {
  console.error("Missing core CXOS ontology or continuous-scale-spec.json");
  process.exit(2);
}

const baseSpec = JSON.parse(readFileSync(specPath, "utf8"));
const baseOntology = JSON.parse(readFileSync(ontologyPath, "utf8"));

const telcoSpecCandidate = resolve(
  workspaceRoot,
  "..",
  "TelcoCXOS",
  ".cox",
  "cx",
  "telco-core",
  "spec.json",
);
let telcoWorkspaceMeta = {
  workspaceDetected: false,
  specName: "telco-core",
  idea: "Converged Fiber FTTH and 5G Mobile Carrier CX Operations",
  journeyMapIds: [
    "billing_dispute",
    "technical_troubleshooting",
    "churn_prevention",
    "new_account_setup",
    "service_upgrade",
  ],
  personaIds: [
    "persona_price_sensitive_mobile",
    "persona_sme_owner",
    "persona_fiber_home",
    "persona_churn_risk",
  ],
  nbaRuleCount: 11,
};

if (existsSync(telcoSpecCandidate)) {
  try {
    const rawTelco = JSON.parse(readFileSync(telcoSpecCandidate, "utf8"));
    const jMaps = rawTelco?.spec?.design?.journeyMaps ?? [];
    const personas = rawTelco?.spec?.design?.personas ?? [];
    const nbaRules = rawTelco?.spec?.design?.nbaRuleSet?.rules ?? [];
    telcoWorkspaceMeta = {
      workspaceDetected: true,
      specName: rawTelco?.spec?.state?.name ?? "telco-core",
      idea: rawTelco?.idea ?? telcoWorkspaceMeta.idea,
      journeyMapIds: jMaps.map((m) => m.id),
      personaIds: personas.map((p) => p.id),
      nbaRuleCount: nbaRules.length,
    };
  } catch {
    telcoWorkspaceMeta.workspaceDetected = false;
  }
}

const buildTelcoVerticalOverlay = () => ({
  kind: "cxVerticalDomainOverlay",
  id: "telco_carrier_fiber_5g_overlay",
  version: baseSpec.version,
  verticalId: "telco_carrier_operations",
  title: "Telco, Fiber FTTH & 5G Mobile Carrier Vertical Overlay Pack",
  description:
    "Zero-code-change domain projection binding CXOS 19-System Closed-World Ontology, 3-Plane Journey Triad, Omnichannel Context Envelope, and R^16 Continuous Manifold into Tier-1 Telco, Fiber FTTH, and Mobile Carrier operations.",
  sourceWorkspaceAlignment: telcoWorkspaceMeta,
  coreOntologyBinding: {
    ontologyId: baseOntology.id,
    ontologyVersion: baseOntology.version,
    boundSystemsCount: baseOntology.taxonomies.length,
    boundSystemIds: baseOntology.taxonomies.map((t) => t.id),
    invariantManifoldDimensions: baseSpec.dimensions,
    zeroCoreEngineCodeChangesRequired: true,
  },
  omnichannelContextExtensions: [
    {
      id: "ont_serial_mac",
      name: "GPON & XGS-PON Optical Network Terminal Serial & MAC",
      mapsToCanonicalField: "slot_ledger",
      decayLambdaPerSecond: 0.00004,
      weightContribution: 0.24,
      description:
        "Hardware telemetry identity for fiber CPE, optical Rx and Tx dBm power levels, and dying-gasp alarm correlation across NOC and field dispatch.",
    },
    {
      id: "cell_tower_eci",
      name: "5G NR gNodeB & E-UTRAN Cell Global Identifier (ECI)",
      mapsToCanonicalField: "provenance_digest",
      decayLambdaPerSecond: 0.00022,
      weightContribution: 0.2,
      description:
        "Active radio access network sector, SINR and RSRP telemetry, and regional tower degradation state bound to the customer session.",
    },
    {
      id: "esim_eid_iccid",
      name: "Embedded Universal Integrated Circuit Card (eUICC EID & ICCID)",
      mapsToCanonicalField: "identity_binding",
      decayLambdaPerSecond: 0.00003,
      weightContribution: 0.26,
      description:
        "SM-DP+ profile activation state, IMEI-2 hardware lock, and HLR or UDM subscriber entitlement token for zero-touch eSIM swap.",
    },
    {
      id: "cpni_verified_tier",
      name: "FCC CPNI Cryptographic Verification & Passkey Assurance Tier",
      mapsToCanonicalField: "auth_assurance",
      decayLambdaPerSecond: 0.00048,
      weightContribution: 0.3,
      description:
        "Customer Proprietary Network Information (47 U.S.C. 222) verification level required before exposing call detail records, port-out PINs, or SIM changes.",
    },
  ],
  verticalGoldenAttractorTubes: [
    {
      blueprintId: "telco_fiber_ont_los_outage",
      mapsToTelcoDesignJourney: "technical_troubleshooting",
      name: "Fiber FTTH ONT Loss-of-Signal (LOS) Optical Triage & Dispatch Attractor",
      domain: "fiber_network_assurance",
      slaBudgetSeconds: 165,
      momentOfTruthTau: 0.45,
      knots: [
        {
          tau: 0.0,
          stageName: "ont_red_los_alarm_and_dying_gasp_entry",
          mu: [
            0.82, 0.88, 0.34, 0.76, 0.78, 0.62, 0.68, 0.74, 0.92, 0.32, 0.14, 0.84, 0.78, 0.18,
            0.28, 0.52,
          ],
          sigmaDiag: [
            0.11, 0.12, 0.15, 0.14, 0.15, 0.14, 0.14, 0.12, 0.1, 0.12, 0.09, 0.12, 0.13, 0.1,
            0.13, 0.13,
          ],
        },
        {
          tau: 0.5,
          stageName: "olt_optical_line_test_and_pon_splitter_correlation",
          mu: [
            0.91, 0.78, 0.58, 0.52, 0.78, 0.44, 0.79, 0.76, 0.88, 0.3, 0.12, 0.9, 0.82, 0.26, 0.2,
            0.8,
          ],
          sigmaDiag: [
            0.09, 0.11, 0.13, 0.13, 0.14, 0.12, 0.12, 0.11, 0.1, 0.11, 0.08, 0.1, 0.11, 0.11, 0.1,
            0.11,
          ],
        },
        {
          tau: 1.0,
          stageName: "remote_pon_reset_or_automated_5g_backup_failover",
          mu: [
            0.97, 0.34, 0.85, 0.22, 0.8, 0.18, 0.91, 0.72, 0.64, 0.26, 0.1, 0.93, 0.8, 0.29, 0.13,
            0.96,
          ],
          sigmaDiag: [
            0.08, 0.11, 0.11, 0.11, 0.14, 0.1, 0.1, 0.1, 0.11, 0.1, 0.08, 0.09, 0.11, 0.11, 0.09,
            0.08,
          ],
        },
      ],
    },
    {
      blueprintId: "telco_5g_esim_provisioning_swap",
      mapsToTelcoDesignJourney: "new_account_setup",
      name: "5G Standalone eSIM SM-DP+ Profile Swap & Zero-Trust Port-Protection Attractor",
      domain: "mobile_core_provisioning",
      slaBudgetSeconds: 140,
      momentOfTruthTau: 0.52,
      knots: [
        {
          tau: 0.0,
          stageName: "device_upgrade_esim_transfer_initiation",
          mu: [
            0.78, 0.76, 0.46, 0.62, 0.76, 0.48, 0.82, 0.88, 0.76, 0.36, 0.84, 0.86, 0.76, 0.14,
            0.24, 0.56,
          ],
          sigmaDiag: [
            0.11, 0.13, 0.14, 0.14, 0.15, 0.14, 0.13, 0.11, 0.12, 0.12, 0.13, 0.12, 0.13, 0.1,
            0.12, 0.13,
          ],
        },
        {
          tau: 0.5,
          stageName: "cpni_biometric_step_up_and_hlr_udm_profile_bind",
          mu: [
            0.92, 0.68, 0.66, 0.44, 0.76, 0.34, 0.89, 0.92, 0.72, 0.32, 0.68, 0.97, 0.82, 0.22,
            0.18, 0.82,
          ],
          sigmaDiag: [
            0.09, 0.11, 0.12, 0.12, 0.14, 0.12, 0.11, 0.09, 0.11, 0.11, 0.11, 0.08, 0.11, 0.11,
            0.1, 0.11,
          ],
        },
        {
          tau: 1.0,
          stageName: "smdp_qr_push_and_5g_sa_bearer_registration",
          mu: [
            0.97, 0.28, 0.88, 0.19, 0.79, 0.14, 0.95, 0.86, 0.52, 0.24, 0.28, 0.97, 0.8, 0.26,
            0.12, 0.97,
          ],
          sigmaDiag: [
            0.07, 0.1, 0.11, 0.1, 0.14, 0.1, 0.09, 0.09, 0.11, 0.1, 0.1, 0.08, 0.11, 0.1, 0.09,
            0.07,
          ],
        },
      ],
    },
    {
      blueprintId: "telco_roaming_bill_shock_dispute",
      mapsToTelcoDesignJourney: "billing_dispute",
      name: "International Roaming CDR Rating Dispute & Retroactive Travel-Pass Attractor",
      domain: "carrier_billing_and_rating",
      slaBudgetSeconds: 175,
      momentOfTruthTau: 0.62,
      knots: [
        {
          tau: 0.0,
          stageName: "roaming_overage_alert_and_bill_shock_arrival",
          mu: [
            0.74, 0.64, 0.38, 0.64, 0.74, 0.58, 0.84, 0.62, 0.48, 0.94, 0.2, 0.86, 0.74, 0.14,
            0.24, 0.54,
          ],
          sigmaDiag: [
            0.12, 0.14, 0.15, 0.15, 0.16, 0.14, 0.13, 0.13, 0.13, 0.1, 0.1, 0.12, 0.13, 0.1, 0.12,
            0.13,
          ],
        },
        {
          tau: 0.5,
          stageName: "tap3_cdr_re_rating_and_retroactive_day_pass_application",
          mu: [
            0.9, 0.54, 0.64, 0.42, 0.74, 0.38, 0.9, 0.66, 0.46, 0.86, 0.16, 0.91, 0.76, 0.23, 0.17,
            0.81,
          ],
          sigmaDiag: [
            0.09, 0.12, 0.13, 0.13, 0.15, 0.12, 0.11, 0.11, 0.11, 0.1, 0.09, 0.1, 0.11, 0.11, 0.1,
            0.11,
          ],
        },
        {
          tau: 1.0,
          stageName: "instant_ledger_rebill_and_data_cap_guard_lock",
          mu: [
            0.96, 0.24, 0.86, 0.2, 0.76, 0.16, 0.95, 0.56, 0.34, 0.58, 0.12, 0.93, 0.75, 0.27,
            0.11, 0.96,
          ],
          sigmaDiag: [
            0.08, 0.11, 0.11, 0.11, 0.15, 0.1, 0.09, 0.11, 0.11, 0.12, 0.08, 0.09, 0.11, 0.11,
            0.09, 0.08,
          ],
        },
      ],
    },
    {
      blueprintId: "telco_multi_line_churn_save",
      mapsToTelcoDesignJourney: "churn_prevention",
      name: "Converged Multi-Line Family & Fiber Bundle Port-Out Save Attractor",
      domain: "household_retention_and_convergence",
      slaBudgetSeconds: 220,
      momentOfTruthTau: 0.68,
      knots: [
        {
          tau: 0.0,
          stageName: "number_transfer_pin_request_and_competitor_quote_signal",
          mu: [
            0.76, 0.72, 0.42, 0.6, 0.94, 0.9, 0.76, 0.68, 0.46, 0.82, 0.18, 0.85, 0.76, 0.16, 0.26,
            0.5,
          ],
          sigmaDiag: [
            0.11, 0.13, 0.14, 0.14, 0.09, 0.11, 0.13, 0.13, 0.13, 0.13, 0.1, 0.11, 0.13, 0.1, 0.12,
            0.13,
          ],
        },
        {
          tau: 0.5,
          stageName: "household_ltv_arbitration_and_converged_fiber_mobile_discount",
          mu: [
            0.9, 0.62, 0.66, 0.42, 0.94, 0.6, 0.84, 0.72, 0.48, 0.82, 0.15, 0.91, 0.8, 0.26, 0.19,
            0.79,
          ],
          sigmaDiag: [
            0.09, 0.12, 0.13, 0.13, 0.09, 0.12, 0.11, 0.11, 0.11, 0.11, 0.09, 0.1, 0.11, 0.11, 0.1,
            0.11,
          ],
        },
        {
          tau: 1.0,
          stageName: "bundle_commitment_accepted_and_port_out_lock_restored",
          mu: [
            0.96, 0.26, 0.87, 0.21, 0.95, 0.2, 0.91, 0.64, 0.38, 0.66, 0.12, 0.93, 0.8, 0.3, 0.13,
            0.96,
          ],
          sigmaDiag: [
            0.08, 0.11, 0.11, 0.11, 0.09, 0.11, 0.09, 0.11, 0.11, 0.11, 0.08, 0.09, 0.11, 0.11,
            0.09, 0.08,
          ],
        },
      ],
    },
  ],
  verticalA2ASpecialistAgents: [
    {
      id: "ont_optical_telemetry_agent",
      name: "GPON & XGS-PON Optical Line & ONT Telemetry Specialist",
      role: "telco_network_specialist",
      mapsToCoreAgent: "tech_diagnostics_agent",
      authorityRadius: 0.82,
      latencyHazard: 0.14,
      baseLoad: 0.24,
      capabilityVector16D: [
        0.9, 0.84, 0.62, 0.56, 0.76, 0.5, 0.86, 0.72, 0.99, 0.28, 0.16, 0.86, 0.8, 0.32, 0.26,
        0.88,
      ],
    },
    {
      id: "esim_hlr_provisioning_agent",
      name: "5G Core UDM, HLR & eSIM SM-DP+ Provisioning Specialist",
      role: "telco_provisioning_specialist",
      mapsToCoreAgent: "order_logistics_fulfillment_agent",
      authorityRadius: 0.88,
      latencyHazard: 0.11,
      baseLoad: 0.21,
      capabilityVector16D: [
        0.92, 0.76, 0.66, 0.48, 0.78, 0.42, 0.92, 0.88, 0.82, 0.34, 0.82, 0.95, 0.82, 0.24, 0.22,
        0.91,
      ],
    },
    {
      id: "roaming_rating_ledger_agent",
      name: "TAP3 Roaming CDR Re-Rating & Bill-Shock Adjustment Specialist",
      role: "telco_billing_specialist",
      mapsToCoreAgent: "billing_specialist_agent",
      authorityRadius: 0.85,
      latencyHazard: 0.13,
      baseLoad: 0.27,
      capabilityVector16D: [
        0.91, 0.62, 0.68, 0.46, 0.76, 0.52, 0.9, 0.68, 0.5, 0.99, 0.24, 0.88, 0.74, 0.28, 0.22,
        0.89,
      ],
    },
    {
      id: "household_bundle_retention_agent",
      name: "Converged Fiber + Multi-Line Mobile Bundle Save Specialist",
      role: "telco_retention_specialist",
      mapsToCoreAgent: "retention_negotiator_agent",
      authorityRadius: 0.89,
      latencyHazard: 0.15,
      baseLoad: 0.25,
      capabilityVector16D: [
        0.89, 0.72, 0.64, 0.54, 0.98, 0.96, 0.84, 0.68, 0.48, 0.86, 0.2, 0.88, 0.8, 0.3, 0.24,
        0.88,
      ],
    },
    {
      id: "fcc_cpni_compliance_critic",
      name: "FCC CPNI (47 U.S.C. 222), Port-Freeze & TCPA Guardrail Critic",
      role: "telco_compliance_critic",
      mapsToCoreAgent: "critic_policy_verifier_agent",
      authorityRadius: 0.98,
      latencyHazard: 0.09,
      baseLoad: 0.16,
      capabilityVector16D: [
        0.93, 0.78, 0.6, 0.56, 0.82, 0.54, 0.78, 0.99, 0.74, 0.82, 0.92, 0.98, 0.76, 0.24, 0.2,
        0.84,
      ],
    },
  ],
});

const overlay = buildTelcoVerticalOverlay();

const retainedCoreAgentIds = new Set([
  "cai_concierge",
  "context_hydration_fabric_agent",
  "async_modality_shifter_agent",
  "outreach_suppression_governor",
  "tier2_human_specialist_copilot",
  "senior_human_advocate",
]);
const activeAgents = [
  ...overlay.verticalA2ASpecialistAgents,
  ...baseSpec.a2aContinuousAgents.filter((a) => retainedCoreAgentIds.has(a.id)),
];
const activeBlueprints = overlay.verticalGoldenAttractorTubes;

const DIM = 16;
const NUM_AGENTS = activeAgents.length;
const NUM_BLUEPRINTS = activeBlueprints.length;
const NUM_ACTIONS = 6;
const NUM_CTX_FIELDS = 6;
const NUM_TELCO_CTX = overlay.omnichannelContextExtensions.length;

const GAUSS_MASK = 4095;
const gaussTable = new Float64Array(4096);
for (let i = 0; i < 4096; i++) {
  const u1 = (i + 0.5) * 0.000244140625;
  const u2 = ((i * 2654435761) >>> 0) * 2.3283064365386963e-10;
  gaussTable[i] = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(6.283185307179586 * u2);
}

const clamp01 = (v) => (v < 0.0 ? 0.0 : v > 1.0 ? 1.0 : v);
const sigmoid = (x) => 1.0 / (1.0 + Math.exp(-x));

const bpMu0 = new Float64Array(NUM_BLUEPRINTS * DIM);
const bpMu1 = new Float64Array(NUM_BLUEPRINTS * DIM);
const bpMu2 = new Float64Array(NUM_BLUEPRINTS * DIM);
const bpSig0 = new Float64Array(NUM_BLUEPRINTS * DIM);
const bpSig1 = new Float64Array(NUM_BLUEPRINTS * DIM);
const bpSig2 = new Float64Array(NUM_BLUEPRINTS * DIM);
const bpSlaBudget = new Float64Array(NUM_BLUEPRINTS);
const bpMotTau = new Float64Array(NUM_BLUEPRINTS);

for (let b = 0; b < NUM_BLUEPRINTS; b++) {
  const tube = activeBlueprints[b];
  bpSlaBudget[b] = tube.slaBudgetSeconds;
  bpMotTau[b] = tube.momentOfTruthTau;
  const k0 = tube.knots[0];
  const k1 = tube.knots[1];
  const k2 = tube.knots[2];
  const base = b * DIM;
  for (let d = 0; d < DIM; d++) {
    bpMu0[base + d] = k0.mu[d];
    bpMu1[base + d] = k1.mu[d];
    bpMu2[base + d] = k2.mu[d];
    bpSig0[base + d] = k0.sigmaDiag[d];
    bpSig1[base + d] = k1.sigmaDiag[d];
    bpSig2[base + d] = k2.sigmaDiag[d];
  }
}

const evaluateAttractorTube = (bpIdx, tau, outMu, outSig) => {
  const t = clamp01(tau);
  const base = bpIdx * DIM;
  if (t <= 0.5) {
    const s = t * 2.0;
    const invS = 1.0 - s;
    const bend = 0.08 * s * invS;
    for (let d = 0; d < DIM; d++) {
      const m0 = bpMu0[base + d];
      const m1 = bpMu1[base + d];
      outMu[d] = invS * m0 + s * m1 + bend * (m1 - m0);
      outSig[d] = invS * bpSig0[base + d] + s * bpSig1[base + d];
    }
  } else {
    const s = (t - 0.5) * 2.0;
    const invS = 1.0 - s;
    const bend = 0.08 * s * invS;
    for (let d = 0; d < DIM; d++) {
      const m1 = bpMu1[base + d];
      const m2 = bpMu2[base + d];
      outMu[d] = invS * m1 + s * m2 + bend * (m2 - m1);
      outSig[d] = invS * bpSig1[base + d] + s * bpSig2[base + d];
    }
  }
};

const agentCapMatrix = new Float64Array(NUM_AGENTS * DIM);
const agentCapNorms = new Float64Array(NUM_AGENTS);
const agentAuthRadius = new Float64Array(NUM_AGENTS);
const agentLatencyHazard = new Float64Array(NUM_AGENTS);
const agentBaseLoad = new Float64Array(NUM_AGENTS);

for (let a = 0; a < NUM_AGENTS; a++) {
  const ag = activeAgents[a];
  agentAuthRadius[a] = ag.authorityRadius;
  agentLatencyHazard[a] = ag.latencyHazard;
  agentBaseLoad[a] = ag.baseLoad;
  const base = a * DIM;
  let sq = 0.0;
  for (let d = 0; d < DIM; d++) {
    const val = ag.capabilityVector16D[d];
    agentCapMatrix[base + d] = val;
    sq += val * val;
  }
  agentCapNorms[a] = Math.sqrt(sq);
}

const ctxDecayLambdas = new Float64Array([
  0.00002, 0.00055, 0.00018, 0.00012, 0.00025, 0.00001,
]);
const ctxWeights = new Float64Array([0.18, 0.22, 0.2, 0.22, 0.12, 0.06]);

const telcoExtLambdas = new Float64Array(
  overlay.omnichannelContextExtensions.map((e) => e.decayLambdaPerSecond),
);
const telcoExtWeights = new Float64Array(
  overlay.omnichannelContextExtensions.map((e) => e.weightContribution),
);

const MODALITIES = [
  "mobile_app",
  "web_portal",
  "async_sms_whatsapp",
  "web_chat_cai",
  "ivr_voicebot",
  "voice_pstn_acd",
  "video_cobrowse",
];
const modalitySynchronicity = new Float64Array([0.72, 0.65, 0.42, 0.76, 0.84, 0.94, 0.98]);
const modalityLossMatrix = new Float64Array([
  0.008, 0.06, 0.05, 0.07, 0.22, 0.28, 0.09,
  0.07, 0.01, 0.08, 0.06, 0.31, 0.35, 0.11,
  0.05, 0.08, 0.006, 0.07, 0.15, 0.16, 0.12,
  0.06, 0.05, 0.06, 0.008, 0.16, 0.18, 0.08,
  0.12, 0.18, 0.11, 0.14, 0.012, 0.14, 0.15,
  0.14, 0.2, 0.1, 0.12, 0.18, 0.01, 0.06,
  0.08, 0.09, 0.1, 0.07, 0.16, 0.05, 0.008,
]);

const BETA_TEMP =
  baseSpec.continuousFormulations.a2aContinuousField.hyperparameters.inverseTemperatureBeta;
const GAMMA_LOAD =
  baseSpec.continuousFormulations.a2aContinuousField.hyperparameters.loadPenaltyGamma;
const ETA_LAT =
  baseSpec.continuousFormulations.a2aContinuousField.hyperparameters.latencyPenaltyEta;
const KAPPA_AUTH =
  baseSpec.continuousFormulations.a2aContinuousField.hyperparameters.authoritySlopeKappa;
const LOG_NUM_AGENTS = Math.log(NUM_AGENTS);

function runPartition({ startIdx, endIdx, workerSeed, reservoirCap }) {
  const count = endIdx - startIdx;
  const rngState = new Uint32Array(4);
  rngState[0] = (workerSeed >>> 0) ^ 0x9e3779b9;
  rngState[1] = ((workerSeed * 1664525 + 1013904223) >>> 0) ^ 0x7f4a7c15;
  rngState[2] = ((workerSeed * 22695477 + 1) >>> 0) ^ 0xbf58476d;
  rngState[3] = ((workerSeed * 1103515245 + 12345) >>> 0) ^ 0x1ce4e5b9;
  if ((rngState[0] | rngState[1] | rngState[2] | rngState[3]) === 0) rngState[0] = 1;

  const nextU32 = () => {
    let t = rngState[3];
    const s = rngState[0];
    rngState[3] = rngState[2];
    rngState[2] = rngState[1];
    rngState[1] = s;
    t ^= t << 11;
    t ^= t >>> 8;
    return (rngState[0] = (t ^ s ^ (s >>> 19)) >>> 0);
  };
  const nextFloat = () => nextU32() * 2.3283064365386963e-10;
  const nextGaussian = () => gaussTable[nextU32() & GAUSS_MASK];

  const zState = new Float64Array(DIM);
  const yObs = new Float64Array(DIM);
  const muPlan = new Float64Array(DIM);
  const sigPlan = new Float64Array(DIM);
  const stepVecPrev = new Float64Array(DIM);
  const ctxTensor = new Float64Array(NUM_CTX_FIELDS);
  const telcoCtxTensor = new Float64Array(NUM_TELCO_CTX);
  const a2aProbs = new Float64Array(NUM_AGENTS);
  const a2aLogits = new Float64Array(NUM_AGENTS);
  const controlVec = new Float64Array(NUM_ACTIONS);

  let totalEventsProcessed = 0;
  let sumDrift = 0.0;
  let sumWasserstein = 0.0;
  let sumLyapunov = 0.0;
  let sumContextFidelity = 0.0;
  let sumContextEntropy = 0.0;
  let sumA2AEntropy = 0.0;
  let sumSpectralLoopEnergy = 0.0;
  let sumTauProgress = 0.0;

  let countConvergent = 0;
  let countOrbital = 0;
  let countDivergent = 0;
  let countSipStripped = 0;

  const telcoExtFidelitySums = new Float64Array(NUM_TELCO_CTX);
  const sumLatentAxes = new Float64Array(DIM);
  const controlWeightSums = new Float64Array(NUM_ACTIONS);
  const controlDominantCounts = new Uint32Array(NUM_ACTIONS);
  const agentSoftMass = new Float64Array(NUM_AGENTS);
  const agentTop1Counts = new Uint32Array(NUM_AGENTS);

  const blueprintCounts = new Uint32Array(NUM_BLUEPRINTS);
  const blueprintDriftSums = new Float64Array(NUM_BLUEPRINTS);
  const blueprintFidelitySums = new Float64Array(NUM_BLUEPRINTS);
  const blueprintLyapSums = new Float64Array(NUM_BLUEPRINTS);
  const blueprintTauSums = new Float64Array(NUM_BLUEPRINTS);
  const blueprintElapsedSecSums = new Float64Array(NUM_BLUEPRINTS);
  const blueprintConvergentCounts = new Uint32Array(NUM_BLUEPRINTS);
  const blueprintDivergentCounts = new Uint32Array(NUM_BLUEPRINTS);
  const blueprintTopAgentCounts = new Uint32Array(NUM_BLUEPRINTS * NUM_AGENTS);

  const resLen = Math.min(count, reservoirCap);
  const resStride = Math.max(1, Math.floor(count / resLen));
  const resDrifts = new Float64Array(resLen);
  const resFidelities = new Float64Array(resLen);
  let resIdx = 0;

  for (let j = startIdx; j < endIdx; j++) {
    const bpIdx = j % NUM_BLUEPRINTS;
    blueprintCounts[bpIdx]++;

    const regimeRoll = nextFloat();
    const numSteps = 4 + (nextU32() % 9);
    totalEventsProcessed += numSteps;

    for (let k = 0; k < NUM_CTX_FIELDS; k++) {
      ctxTensor[k] = 0.95 + 0.05 * nextFloat();
    }
    for (let k = 0; k < NUM_TELCO_CTX; k++) {
      telcoCtxTensor[k] = 0.96 + 0.04 * nextFloat();
    }

    let tau = 0.03 + 0.05 * nextFloat();
    let elapsedSec = 0.0;
    let prevModality = nextU32() & 1;

    evaluateAttractorTube(bpIdx, tau, muPlan, sigPlan);

    let initialDriftSq = 0.0;
    for (let d = 0; d < DIM; d++) {
      const noise = nextGaussian() * sigPlan[d] * 0.85;
      const z0 = clamp01(muPlan[d] + noise);
      zState[d] = z0;
      stepVecPrev[d] = 0.0;
      const diff = (z0 - muPlan[d]) / sigPlan[d];
      initialDriftSq += diff * diff;
    }
    const initialDrift = Math.sqrt(initialDriftSq / DIM);

    let spectralOscEnergy = 0.0;
    let sipStrippedOccurred = false;

    for (let step = 1; step <= numSteps; step++) {
      const dt = 3.5 + nextFloat() * (regimeRoll > 0.8 ? 42.0 : 16.0);
      elapsedSec += dt;

      let currModality = prevModality;
      let sipHeaderStripped = false;
      if (nextFloat() < (regimeRoll > 0.7 ? 0.32 : 0.09)) {
        currModality =
          (prevModality + 1 + (nextU32() % (MODALITIES.length - 1))) % MODALITIES.length;
        if (
          (currModality === 4 || currModality === 5) &&
          nextFloat() < (regimeRoll > 0.8 ? 0.42 : 0.05)
        ) {
          sipHeaderStripped = true;
          sipStrippedOccurred = true;
        }
      }

      const modLoss = modalityLossMatrix[prevModality * MODALITIES.length + currModality];
      const carrierPenalty = sipHeaderStripped ? 0.42 : 0.0;
      const lossRetention = (1.0 - modLoss) * (1.0 - carrierPenalty);
      let mutualInfoRetention = 0.0;
      for (let k = 0; k < NUM_CTX_FIELDS; k++) {
        const timeDecay = 1.0 / (1.0 + ctxDecayLambdas[k] * dt);
        ctxTensor[k] = clamp01(ctxTensor[k] * timeDecay * lossRetention);
        mutualInfoRetention += ctxWeights[k] * ctxTensor[k];
      }
      let telcoExtRetention = 0.0;
      for (let k = 0; k < NUM_TELCO_CTX; k++) {
        const timeDecay = 1.0 / (1.0 + telcoExtLambdas[k] * dt);
        telcoCtxTensor[k] = clamp01(telcoCtxTensor[k] * timeDecay * lossRetention);
        telcoExtRetention += telcoExtWeights[k] * telcoCtxTensor[k];
      }
      const combinedFidelity = 0.65 * mutualInfoRetention + 0.35 * telcoExtRetention;

      const targetHorizonTau = 0.25 + 0.75 * ((j * 7919 + step * 131) % 1000) * 0.001;
      let dTau = (targetHorizonTau / numSteps) * (0.7 + 0.52 * combinedFidelity);
      if (regimeRoll > 0.85) {
        dTau *= 0.28 + 0.22 * nextFloat();
      } else if (regimeRoll < 0.65) {
        dTau *= 1.06;
      }
      tau = clamp01(tau + dTau);

      evaluateAttractorTube(bpIdx, tau, muPlan, sigPlan);

      const slaRatio = elapsedSec / bpSlaBudget[bpIdx];
      const contextLossPenalty = 1.0 - combinedFidelity;
      const noiseScale =
        regimeRoll < 0.65 ? 0.26 * (1.0 - 0.55 * tau) : regimeRoll < 0.82 ? 0.64 : 1.38;

      for (let d = 0; d < DIM; d++) {
        const perturb = nextGaussian() * sigPlan[d] * noiseScale;
        yObs[d] = clamp01(muPlan[d] + perturb);
      }

      if (regimeRoll >= 0.65) {
        const xLat = 3.2 * (slaRatio - 0.85);
        const latencyPressureObs = clamp01(0.5 + 0.5 * (xLat / (1.0 + Math.abs(xLat))));
        yObs[0] = clamp01(
          muPlan[0] * (0.58 + 0.42 * combinedFidelity) - 0.2 * contextLossPenalty,
        );
        yObs[2] = clamp01(
          muPlan[2] - 0.38 * contextLossPenalty - 0.25 * Math.max(0.0, slaRatio - 1.0),
        );
        yObs[3] = clamp01(
          muPlan[3] + 0.42 * contextLossPenalty + 0.28 * Math.max(0.0, slaRatio - 0.9),
        );
        yObs[5] = clamp01(
          muPlan[5] + 0.35 * contextLossPenalty + (regimeRoll > 0.84 ? 0.25 : 0.0),
        );
        yObs[11] = clamp01(telcoCtxTensor[3]);
        yObs[12] = modalitySynchronicity[currModality];
        yObs[13] = latencyPressureObs;
        yObs[14] = clamp01(
          muPlan[14] + 0.54 * contextLossPenalty + (sipHeaderStripped ? 0.26 : 0.0),
        );
        yObs[15] = clamp01(dTau * numSteps * 0.84);
      }

      const kalmanGain = 0.65;
      const oneMinusK = 0.35;
      let stepNormSq = 0.0;
      let prevStepNormSq = 0.0;
      let dotStep = 0.0;

      for (let d = 0; d < DIM; d++) {
        const oldZ = zState[d];
        const newZ = oneMinusK * oldZ + kalmanGain * yObs[d];
        const dv = newZ - oldZ;
        const effectiveDv =
          regimeRoll > 0.85 && (step & 1) === 0 ? -stepVecPrev[d] * 0.88 : dv;
        const prevDv = stepVecPrev[d];
        dotStep += effectiveDv * prevDv;
        stepNormSq += effectiveDv * effectiveDv;
        prevStepNormSq += prevDv * prevDv;
        stepVecPrev[d] = effectiveDv;
        zState[d] = newZ;
      }

      if (step >= 2 && stepNormSq > 1e-8 && prevStepNormSq > 1e-8) {
        const cosTurn = dotStep / Math.sqrt(stepNormSq * prevStepNormSq);
        const reversalEnergy = cosTurn < 0.0 ? clamp01(-cosTurn) : 0.04 * (1.0 - cosTurn);
        const decay = 1.0 / (1.0 + 0.004 * dt);
        spectralOscEnergy = clamp01(0.65 * spectralOscEnergy * decay + 0.35 * reversalEnergy);
      }

      prevModality = currModality;
    }

    if (sipStrippedOccurred) countSipStripped++;

    let mahaSq = 0.0;
    let wassSq = 0.0;
    let zNormSq = 0.0;
    for (let d = 0; d < DIM; d++) {
      const zVal = zState[d];
      sumLatentAxes[d] += zVal;
      zNormSq += zVal * zVal;
      const diff = zVal - muPlan[d];
      const sig = sigPlan[d];
      mahaSq += (diff * diff) / (sig * sig);
      const empSig = sig * (0.85 + 0.35 * spectralOscEnergy);
      const sigDiff = empSig - sig;
      wassSq += diff * diff + sigDiff * sigDiff;
    }
    const zNorm = Math.sqrt(zNormSq) + 1e-9;
    const driftScore = Math.sqrt(mahaSq / DIM);
    const wassersteinCost = Math.sqrt(wassSq / DIM);
    const invWindow = 1.0 / Math.max(elapsedSec, 10.0);
    const driftRatio = (driftScore + 0.05) / (initialDrift + 0.05);
    const lyapunovExp = invWindow * Math.log(driftRatio);

    if (lyapunovExp < -0.0015) {
      countConvergent++;
      blueprintConvergentCounts[bpIdx]++;
    } else if (lyapunovExp <= 0.0015) {
      countOrbital++;
    } else {
      countDivergent++;
      blueprintDivergentCounts[bpIdx]++;
    }

    let finalContextFidelity = 0.0;
    let shannonCtx = 0.0;
    for (let k = 0; k < NUM_CTX_FIELDS; k++) {
      const pk = clamp01(ctxTensor[k]);
      finalContextFidelity += ctxWeights[k] * pk;
      if (pk > 1e-6 && pk < 1.0 - 1e-6) {
        shannonCtx -= pk * Math.log(pk) + (1.0 - pk) * Math.log(1.0 - pk);
      }
    }
    shannonCtx /= NUM_CTX_FIELDS * 0.6931471805599453;

    for (let k = 0; k < NUM_TELCO_CTX; k++) {
      telcoExtFidelitySums[k] += telcoCtxTensor[k];
    }

    const maxRiskExposure =
      0.45 * zState[7] + 0.35 * Math.max(zState[9], zState[10]) + 0.2 * spectralOscEnergy;
    let maxLogit = -1e9;

    for (let a = 0; a < NUM_AGENTS; a++) {
      const base = a * DIM;
      let dot = 0.0;
      for (let d = 0; d < DIM; d++) {
        dot += zState[d] * agentCapMatrix[base + d];
      }
      const cosSim = dot / (zNorm * agentCapNorms[a]);
      const authGate = sigmoid(KAPPA_AUTH * (agentAuthRadius[a] - maxRiskExposure));

      let domainAffinity = 0.0;
      if (a === 0) domainAffinity = bpIdx === 0 ? 0.32 * zState[8] : 0.14 * zState[8];
      else if (a === 1) domainAffinity = bpIdx === 1 ? 0.32 * zState[10] : 0.14 * zState[11];
      else if (a === 2) domainAffinity = bpIdx === 2 ? 0.32 * zState[9] : 0.14 * zState[9];
      else if (a === 3) domainAffinity = bpIdx === 3 ? 0.32 * zState[4] * zState[5] : 0.14 * zState[5];
      else if (a === 4) domainAffinity = 0.26 * zState[7] * zState[10];
      else if (a === 5) domainAffinity = 0.22 * zState[6] * finalContextFidelity;
      else if (a === 6) domainAffinity = 0.3 * (1.0 - finalContextFidelity);
      else if (a === 7) domainAffinity = 0.25 * zState[13] * zState[6];
      else if (a === 8) domainAffinity = tau > 0.9 && driftScore < 0.45 ? 0.24 : -0.08;
      else if (a === 9) domainAffinity = 0.24 * Math.max(0.0, driftScore - 0.85);
      else if (a === 10)
        domainAffinity = 0.28 * spectralOscEnergy + 0.22 * Math.max(0.0, driftScore - 1.2);

      const instLoad = clamp01(agentBaseLoad[a] + 0.04 * ((j + a) & 3) * 0.25);
      const utility =
        cosSim * authGate + domainAffinity - GAMMA_LOAD * instLoad - ETA_LAT * agentLatencyHazard[a];
      const logit = BETA_TEMP * utility;
      a2aLogits[a] = logit;
      if (logit > maxLogit) maxLogit = logit;
    }

    let sumExp = 0.0;
    for (let a = 0; a < NUM_AGENTS; a++) {
      const w = Math.exp(a2aLogits[a] - maxLogit);
      a2aProbs[a] = w;
      sumExp += w;
    }

    let a2aEntropy = 0.0;
    let topAgent = 0;
    let topProb = -1.0;
    for (let a = 0; a < NUM_AGENTS; a++) {
      const p = a2aProbs[a] / sumExp;
      a2aProbs[a] = p;
      agentSoftMass[a] += p;
      if (p > 1e-9) a2aEntropy -= p * Math.log(p);
      if (p > topProb) {
        topProb = p;
        topAgent = a;
      }
    }
    a2aEntropy /= LOG_NUM_AGENTS;
    agentTop1Counts[topAgent]++;
    blueprintTopAgentCounts[bpIdx * NUM_AGENTS + topAgent]++;

    const rawU0 =
      3.4 * zState[6] * finalContextFidelity * (1.0 - spectralOscEnergy) -
      1.5 * Math.max(0.0, driftScore - 0.55) +
      (tau < 0.88 && driftScore < 0.55 ? 0.85 : 0.0);
    const rawU1 =
      4.2 * (1.0 - finalContextFidelity) + 1.3 * zState[14] + (sipStrippedOccurred ? 1.85 : -0.25);
    const rawU2 =
      3.0 * Math.max(zState[8], zState[9], zState[10], zState[5] * zState[4]) +
      (topAgent <= 4 ? 0.9 : -0.15);
    const rawU3 =
      3.1 * zState[13] * zState[6] + (zState[12] > 0.8 && zState[13] > 0.35 ? 1.65 : -0.2);
    const rawU4 =
      2.6 * Math.max(0.0, driftScore - 1.15) +
      2.8 * spectralOscEnergy +
      2.2 * Math.max(0.0, lyapunovExp * 95.0) +
      1.4 * zState[7] * (1.0 - zState[6]) -
      0.55;
    const rawU5 =
      2.2 * tau * (1.0 - zState[1]) * zState[15] +
      (tau > 0.91 && driftScore < 0.45 ? 1.65 : -0.85);

    const rawActions = [rawU0, rawU1, rawU2, rawU3, rawU4, rawU5];
    let maxActLogit = -1e9;
    for (let c = 0; c < NUM_ACTIONS; c++) {
      if (rawActions[c] > maxActLogit) maxActLogit = rawActions[c];
    }
    let sumActExp = 0.0;
    for (let c = 0; c < NUM_ACTIONS; c++) {
      const e = Math.exp(rawActions[c] - maxActLogit);
      controlVec[c] = e;
      sumActExp += e;
    }
    let topAction = 0;
    let topActionWeight = -1.0;
    for (let c = 0; c < NUM_ACTIONS; c++) {
      const w = controlVec[c] / sumActExp;
      controlVec[c] = w;
      controlWeightSums[c] += w;
      if (w > topActionWeight) {
        topActionWeight = w;
        topAction = c;
      }
    }
    controlDominantCounts[topAction]++;

    sumDrift += driftScore;
    sumWasserstein += wassersteinCost;
    sumLyapunov += lyapunovExp;
    sumContextFidelity += finalContextFidelity;
    sumContextEntropy += shannonCtx;
    sumA2AEntropy += a2aEntropy;
    sumSpectralLoopEnergy += spectralOscEnergy;
    sumTauProgress += tau;

    blueprintDriftSums[bpIdx] += driftScore;
    blueprintFidelitySums[bpIdx] += finalContextFidelity;
    blueprintLyapSums[bpIdx] += lyapunovExp;
    blueprintTauSums[bpIdx] += tau;
    blueprintElapsedSecSums[bpIdx] += elapsedSec;

    const localIdx = j - startIdx;
    if (localIdx % resStride === 0 && resIdx < resLen) {
      resDrifts[resIdx] = driftScore;
      resFidelities[resIdx] = finalContextFidelity;
      resIdx++;
    }
  }

  return {
    totalEventsProcessed,
    sumDrift,
    sumWasserstein,
    sumLyapunov,
    sumContextFidelity,
    sumContextEntropy,
    sumA2AEntropy,
    sumSpectralLoopEnergy,
    sumTauProgress,
    countConvergent,
    countOrbital,
    countDivergent,
    countSipStripped,
    telcoExtFidelitySums,
    sumLatentAxes,
    controlWeightSums,
    controlDominantCounts,
    agentSoftMass,
    agentTop1Counts,
    blueprintCounts,
    blueprintDriftSums,
    blueprintFidelitySums,
    blueprintLyapSums,
    blueprintTauSums,
    blueprintElapsedSecSums,
    blueprintConvergentCounts,
    blueprintDivergentCounts,
    blueprintTopAgentCounts,
    resDrifts: resDrifts.subarray(0, resIdx),
    resFidelities: resFidelities.subarray(0, resIdx),
  };
}

if (!isMainThread) {
  const partResult = runPartition(workerData);
  parentPort.postMessage(partResult);
  process.exit(0);
}

const rawArgs = process.argv.slice(2);
const argOf = (flag) => {
  const idx = rawArgs.indexOf(flag);
  return idx >= 0 ? rawArgs[idx + 1] : undefined;
};

const scaleJourneys = Math.max(1000, Number(argOf("--scale") ?? 50000));
const seedInput = Number(argOf("--seed") ?? 20261018);
const explicitWorkers = argOf("--workers");
const workersUsed = Math.max(
  1,
  explicitWorkers !== undefined
    ? Number(explicitWorkers)
    : scaleJourneys >= 25000
      ? Math.min(os.availableParallelism(), 8)
      : 1,
);
const asJson = rawArgs.includes("--json");

const overlayOutPath = resolve(
  argOf("--overlay-out") ??
    join(workspaceRoot, "ontology", "verticals", "telco-carrier-overlay.json"),
);
const projectionOutPath = resolve(
  argOf("--out") ??
    join(workspaceRoot, ".tmp", "continuous-scale", "vertical-telco-projection.json"),
);

mkdirSync(dirname(overlayOutPath), { recursive: true });
writeFileSync(overlayOutPath, JSON.stringify(overlay, null, 2) + "\n", "utf8");

const TOTAL_RESERVOIR_CAP = 50000;
const tStart = performance.now();

let partials = [];
if (workersUsed === 1) {
  partials = [
    runPartition({
      startIdx: 0,
      endIdx: scaleJourneys,
      workerSeed: seedInput,
      reservoirCap: TOTAL_RESERVOIR_CAP,
    }),
  ];
} else {
  const perWorkerReservoir = Math.max(1000, Math.ceil(TOTAL_RESERVOIR_CAP / workersUsed));
  const workerPromises = [];
  for (let w = 0; w < workersUsed; w++) {
    const startIdx = Math.floor((w * scaleJourneys) / workersUsed);
    const endIdx = Math.floor(((w + 1) * scaleJourneys) / workersUsed);
    const workerSeed = (seedInput + w * 104729) >>> 0;
    workerPromises.push(
      new Promise((resolveWorker, rejectWorker) => {
        const worker = new Worker(currentFile, {
          workerData: {
            startIdx,
            endIdx,
            workerSeed,
            reservoirCap: perWorkerReservoir,
          },
        });
        worker.once("message", resolveWorker);
        worker.once("error", rejectWorker);
        worker.once("exit", (code) => {
          if (code !== 0) {
            rejectWorker(new Error("Worker exited with code " + String(code)));
          }
        });
      }),
    );
  }
  partials = await Promise.all(workerPromises);
}

let totalEventsProcessed = 0;
let sumDrift = 0.0;
let sumWasserstein = 0.0;
let sumLyapunov = 0.0;
let sumContextFidelity = 0.0;
let sumContextEntropy = 0.0;
let sumA2AEntropy = 0.0;
let sumSpectralLoopEnergy = 0.0;
let sumTauProgress = 0.0;
let countConvergent = 0;
let countOrbital = 0;
let countDivergent = 0;
let countSipStripped = 0;

const telcoExtFidelitySums = new Float64Array(NUM_TELCO_CTX);
const sumLatentAxes = new Float64Array(DIM);
const controlWeightSums = new Float64Array(NUM_ACTIONS);
const controlDominantCounts = new Uint32Array(NUM_ACTIONS);
const agentSoftMass = new Float64Array(NUM_AGENTS);
const agentTop1Counts = new Uint32Array(NUM_AGENTS);
const blueprintCounts = new Uint32Array(NUM_BLUEPRINTS);
const blueprintDriftSums = new Float64Array(NUM_BLUEPRINTS);
const blueprintFidelitySums = new Float64Array(NUM_BLUEPRINTS);
const blueprintLyapSums = new Float64Array(NUM_BLUEPRINTS);
const blueprintTauSums = new Float64Array(NUM_BLUEPRINTS);
const blueprintElapsedSecSums = new Float64Array(NUM_BLUEPRINTS);
const blueprintConvergentCounts = new Uint32Array(NUM_BLUEPRINTS);
const blueprintDivergentCounts = new Uint32Array(NUM_BLUEPRINTS);
const blueprintTopAgentCounts = new Uint32Array(NUM_BLUEPRINTS * NUM_AGENTS);

let totalRes = 0;
for (const p of partials) totalRes += p.resDrifts.length;
const allDrifts = new Float64Array(totalRes);
const allFidelities = new Float64Array(totalRes);
let rOffset = 0;

for (const p of partials) {
  totalEventsProcessed += p.totalEventsProcessed;
  sumDrift += p.sumDrift;
  sumWasserstein += p.sumWasserstein;
  sumLyapunov += p.sumLyapunov;
  sumContextFidelity += p.sumContextFidelity;
  sumContextEntropy += p.sumContextEntropy;
  sumA2AEntropy += p.sumA2AEntropy;
  sumSpectralLoopEnergy += p.sumSpectralLoopEnergy;
  sumTauProgress += p.sumTauProgress;
  countConvergent += p.countConvergent;
  countOrbital += p.countOrbital;
  countDivergent += p.countDivergent;
  countSipStripped += p.countSipStripped;

  for (let k = 0; k < NUM_TELCO_CTX; k++) telcoExtFidelitySums[k] += p.telcoExtFidelitySums[k];
  for (let d = 0; d < DIM; d++) sumLatentAxes[d] += p.sumLatentAxes[d];
  for (let c = 0; c < NUM_ACTIONS; c++) {
    controlWeightSums[c] += p.controlWeightSums[c];
    controlDominantCounts[c] += p.controlDominantCounts[c];
  }
  for (let a = 0; a < NUM_AGENTS; a++) {
    agentSoftMass[a] += p.agentSoftMass[a];
    agentTop1Counts[a] += p.agentTop1Counts[a];
  }
  for (let b = 0; b < NUM_BLUEPRINTS; b++) {
    blueprintCounts[b] += p.blueprintCounts[b];
    blueprintDriftSums[b] += p.blueprintDriftSums[b];
    blueprintFidelitySums[b] += p.blueprintFidelitySums[b];
    blueprintLyapSums[b] += p.blueprintLyapSums[b];
    blueprintTauSums[b] += p.blueprintTauSums[b];
    blueprintElapsedSecSums[b] += p.blueprintElapsedSecSums[b];
    blueprintConvergentCounts[b] += p.blueprintConvergentCounts[b];
    blueprintDivergentCounts[b] += p.blueprintDivergentCounts[b];
  }
  for (let i = 0; i < NUM_BLUEPRINTS * NUM_AGENTS; i++) {
    blueprintTopAgentCounts[i] += p.blueprintTopAgentCounts[i];
  }
  allDrifts.set(p.resDrifts, rOffset);
  allFidelities.set(p.resFidelities, rOffset);
  rOffset += p.resDrifts.length;
}

const tElapsedMs = Math.max(0.1, performance.now() - tStart);
const journeysPerSec = Math.round((scaleJourneys / tElapsedMs) * 1000);
const eventsPerSec = Math.round((totalEventsProcessed / tElapsedMs) * 1000);

const sortedDrifts = Float64Array.from(allDrifts).sort();
const sortedFidelities = Float64Array.from(allFidelities).sort();
const quantile = (sortedArr, q) => {
  const pos = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(q * sortedArr.length)));
  return Number(sortedArr[pos].toFixed(4));
};

const contextExtensionSummary = overlay.omnichannelContextExtensions.map((ext, k) => ({
  id: ext.id,
  name: ext.name,
  mapsToCanonicalField: ext.mapsToCanonicalField,
  decayLambdaPerSecond: ext.decayLambdaPerSecond,
  meanRetainedFidelity: Number((telcoExtFidelitySums[k] / scaleJourneys).toFixed(4)),
}));

const verticalBlueprintSummary = activeBlueprints.map((tube, b) => {
  const cnt = Math.max(1, blueprintCounts[b]);
  let dominantAgentIdx = 0;
  let dominantAgentCount = 0;
  for (let a = 0; a < NUM_AGENTS; a++) {
    const c = blueprintTopAgentCounts[b * NUM_AGENTS + a];
    if (c > dominantAgentCount) {
      dominantAgentCount = c;
      dominantAgentIdx = a;
    }
  }
  return {
    blueprintId: tube.blueprintId,
    mapsToTelcoDesignJourney: tube.mapsToTelcoDesignJourney,
    name: tube.name,
    domain: tube.domain,
    slaBudgetSeconds: tube.slaBudgetSeconds,
    momentOfTruthTau: tube.momentOfTruthTau,
    journeyCount: blueprintCounts[b],
    meanProgressTau: Number((blueprintTauSums[b] / cnt).toFixed(4)),
    meanElapsedSeconds: Number((blueprintElapsedSecSums[b] / cnt).toFixed(2)),
    meanMahalanobisDrift: Number((blueprintDriftSums[b] / cnt).toFixed(4)),
    meanContextFidelity: Number((blueprintFidelitySums[b] / cnt).toFixed(4)),
    meanLyapunovExponent: Number((blueprintLyapSums[b] / cnt).toFixed(5)),
    convergentSharePercent: Number(((blueprintConvergentCounts[b] / cnt) * 100).toFixed(2)),
    divergentSharePercent: Number(((blueprintDivergentCounts[b] / cnt) * 100).toFixed(2)),
    dominantA2ASpecialist: activeAgents[dominantAgentIdx].id,
    dominantA2ASharePercent: Number(((dominantAgentCount / cnt) * 100).toFixed(2)),
  };
});

const verticalAgentSummary = activeAgents.map((ag, a) => ({
  id: ag.id,
  name: ag.name,
  role: ag.role,
  mapsToCoreAgent: ag.mapsToCoreAgent ?? ag.id,
  authorityRadius: ag.authorityRadius,
  latencyHazard: ag.latencyHazard,
  meanBoltzmannWeight: Number((agentSoftMass[a] / scaleJourneys).toFixed(4)),
  top1AssignmentCount: agentTop1Counts[a],
  top1AssignmentSharePercent: Number(((agentTop1Counts[a] / scaleJourneys) * 100).toFixed(2)),
}));

const controlActionSummary =
  baseSpec.continuousFormulations.plane3ControlField.controlActionBasis.map((act, c) => ({
    index: c,
    id: act.id,
    mapsToDiscreteAction: act.mapsToDiscreteAction,
    meanContinuousWeight: Number((controlWeightSums[c] / scaleJourneys).toFixed(4)),
    dominantCount: controlDominantCounts[c],
    dominantSharePercent: Number(((controlDominantCounts[c] / scaleJourneys) * 100).toFixed(2)),
  }));

const projectionArtifact = {
  kind: "cxVerticalManifoldProjectionSummary",
  version: baseSpec.version,
  generatedAt: new Date().toISOString(),
  verticalOverlayPath: ["ontology", "verticals", "telco-carrier-overlay.json"].join("/"),
  telcoWorkspaceAlignment: telcoWorkspaceMeta,
  architectureProof: {
    invariantCoreOntologySystems: baseOntology.taxonomies.length,
    invariantManifoldDimensions: DIM,
    verticalGoldenAttractorsBound: NUM_BLUEPRINTS,
    verticalSpecialistAgentsEmbedded: overlay.verticalA2ASpecialistAgents.length,
    totalA2ACapabilityFieldAgents: NUM_AGENTS,
    verticalContextEnvelopeExtensions: NUM_TELCO_CTX,
    zeroCoreEngineCodeChangesRequired: true,
  },
  benchmark: {
    scaleJourneys,
    totalEventsProcessed,
    workersUsed,
    elapsedMilliseconds: Number(tElapsedMs.toFixed(2)),
    throughputJourneysPerSec: journeysPerSec,
    throughputEventsPerSec: eventsPerSec,
  },
  continuousManifoldMetrics: {
    mahalanobisDrift: {
      mean: Number((sumDrift / scaleJourneys).toFixed(4)),
      p50: quantile(sortedDrifts, 0.5),
      p90: quantile(sortedDrifts, 0.9),
      p95: quantile(sortedDrifts, 0.95),
      p99: quantile(sortedDrifts, 0.99),
    },
    wassersteinTransportCostMean: Number((sumWasserstein / scaleJourneys).toFixed(4)),
    lyapunovStability: {
      meanExponent: Number((sumLyapunov / scaleJourneys).toFixed(5)),
      convergentCount: countConvergent,
      convergentSharePercent: Number(((countConvergent / scaleJourneys) * 100).toFixed(2)),
      orbitalCount: countOrbital,
      orbitalSharePercent: Number(((countOrbital / scaleJourneys) * 100).toFixed(2)),
      divergentCount: countDivergent,
      divergentSharePercent: Number(((countDivergent / scaleJourneys) * 100).toFixed(2)),
    },
    omnichannelContextField: {
      meanMutualInfoRetention: Number((sumContextFidelity / scaleJourneys).toFixed(4)),
      p10Fidelity: quantile(sortedFidelities, 0.1),
      p50Fidelity: quantile(sortedFidelities, 0.5),
      p90Fidelity: quantile(sortedFidelities, 0.9),
      meanShannonContextEntropy: Number((sumContextEntropy / scaleJourneys).toFixed(4)),
      sipHeaderStrippedIncidencePercent: Number(
        ((countSipStripped / scaleJourneys) * 100).toFixed(2),
      ),
      verticalContextExtensions: contextExtensionSummary,
    },
    a2aSpectralField: {
      meanBoltzmannEntropy: Number((sumA2AEntropy / scaleJourneys).toFixed(4)),
      meanSpectralLoopEnergy: Number((sumSpectralLoopEnergy / scaleJourneys).toFixed(4)),
    },
    meanNormalizedProgressTau: Number((sumTauProgress / scaleJourneys).toFixed(4)),
  },
  verticalBlueprintSummary,
  verticalAgentSummary,
  controlActionSummary,
};

mkdirSync(dirname(projectionOutPath), { recursive: true });
writeFileSync(projectionOutPath, JSON.stringify(projectionArtifact, null, 2) + "\n", "utf8");

if (asJson) {
  console.log(JSON.stringify(projectionArtifact, null, 2));
  process.exit(0);
}

console.log(
  "================================================================================================================",
);
console.log(
  "  CXOS DOMAIN VERTICAL PROJECTION & R^16 MANIFOLD STRESS-TEST BRIDGE (TELCO, FIBER FTTH & 5G CARRIER PACK)",
);
console.log(
  "================================================================================================================",
);
console.log(
  `  Source Telco Spec    : ${telcoWorkspaceMeta.specName} (TelcoCXOS detected=${telcoWorkspaceMeta.workspaceDetected}) | ${ baseOntology.taxonomies.length } Core Systems -> R^${DIM} Manifold`,
);
console.log(
  `  Vertical Overlay     : ${overlayOutPath}`,
);
console.log(
  `  Scale Simulated      : ${scaleJourneys.toLocaleString()} trajectories (${totalEventsProcessed.toLocaleString()} events) across ${workersUsed} worker(s) in ${tElapsedMs.toFixed(2)} ms`,
);
console.log(
  `  Vector Throughput    : ${journeysPerSec.toLocaleString()} journeys per sec  |  ${eventsPerSec.toLocaleString()} events per sec  |  Zero Core Engine Code Changes!`,
);
console.log(
  "----------------------------------------------------------------------------------------------------------------",
);
console.log(
  "  VERTICAL PLANE-1 GOLDEN ATTRACTOR TUBES (MAPPED INTO UNIVERSAL R^16 MANIFOLD COORDINATES)",
);
console.log(
  "  VERTICAL BLUEPRINT ID            | TELCO JOURNEY             | SLA  | DRIFT D_M | FIDELITY | CONV %  | TOP A2A SPECIALIST",
);
console.log(
  "----------------------------------------------------------------------------------------------------------------",
);
for (const bp of verticalBlueprintSummary) {
  const idCol = bp.blueprintId.padEnd(32);
  const mapCol = bp.mapsToTelcoDesignJourney.padEnd(25);
  const slaCol = (String(bp.slaBudgetSeconds) + "s").padStart(4);
  const driftCol = bp.meanMahalanobisDrift.toFixed(4).padStart(9);
  const fidCol = bp.meanContextFidelity.toFixed(4).padStart(8);
  const convCol = (bp.convergentSharePercent.toFixed(1) + "%").padStart(7);
  const agCol = `${bp.dominantA2ASpecialist} (${bp.dominantA2ASharePercent.toFixed(1)}%)`;
  console.log(`  ${idCol} | ${mapCol} | ${slaCol} | ${driftCol} | ${fidCol} | ${convCol} | ${agCol}`);
}
console.log(
  "----------------------------------------------------------------------------------------------------------------",
);
console.log(
  "  VERTICAL A2A SPECIALIST CAPABILITY FIELD IN R^16 (BOLTZMANN ROUTING KERNEL)",
);
for (const ag of verticalAgentSummary) {
  const tag = ag.role.startsWith("telco_") ? "[TELCO-VERTICAL]" : "[CORE-INVARIANT]";
  console.log(
    `    ${tag} ${ag.id.padEnd(34)} boltzmann_mass=${ag.meanBoltzmannWeight.toFixed(4)}  top1_share=${String(ag.top1AssignmentSharePercent.toFixed(2)).padStart(5)}% (${ag.top1AssignmentCount.toLocaleString()})`,
  );
}
console.log(
  "----------------------------------------------------------------------------------------------------------------",
);
console.log(
  "  VERTICAL OMNICHANNEL CONTEXT ENVELOPE EXTENSIONS (EXPONENTIAL HALF-LIFE FIDELITY FIELD)",
);
for (const ext of contextExtensionSummary) {
  console.log(
    `    ${ext.id.padEnd(24)} -> ${ext.mapsToCanonicalField.padEnd(18)} lambda=${String(ext.decayLambdaPerSecond).padEnd(9)} mean_fidelity=${ext.meanRetainedFidelity.toFixed(4)}`,
  );
}
console.log(
  "================================================================================================================",
);
console.log(`  Vertical projection artifact written to: ${projectionOutPath}`);
