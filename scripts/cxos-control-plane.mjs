/**
 * CXOS Unified Real-Time Streaming Control Plane Server
 *
 * Exposes the 19-taxonomy CX Ontology, continuous R^16 manifold state-space math,
 * Omnichannel Context Fidelity tensor decay, 12-agent A2A Boltzmann routing field,
 * closed-loop Plane-1 Robbins-Monro recalibrated Golden Attractor Tubes,
 * Plane-3 Hamiltonian control vectors, optional Tier-2 Strands 2B System-One
 * boundary arbitration, and real-time Server-Sent Events telemetry streaming.
 *
 * Zero external npm dependencies. Zero regular expressions.
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SLASH = String.fromCharCode(47);
const MIME_JSON = ["application", "json; charset=utf-8"].join(SLASH);
const MIME_SSE = ["text", "event-stream; charset=utf-8"].join(SLASH);

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = dirname(currentFile);
const defaultWorkspaceRoot = resolve(scriptsDir, "..");

const DIM = 16;
const NUM_ACTIONS = 6;
const NUM_CTX_FIELDS = 6;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => (v < 0.0 ? 0.0 : v > 1.0 ? 1.0 : v);
const sigmoid = (x) => 1.0 / (1.0 + Math.exp(-x));
const round4 = (v) => Number(Number(v).toFixed(4));
const round5 = (v) => Number(Number(v).toFixed(5));

const CANONICAL_TO_GOLDEN_BP = {
  bp_billing_auto_dispute: "bp_billing_dispute_golden_v4",
  bp_card_fraud_replacement: "bp_card_replace_golden_v3",
  bp_onboarding_api_setup: "bp_enterprise_api_onboarding_v2",
  bp_renewal_save_negotiation: "bp_vip_renewal_retention_v5",
  bp_order_modification_self_serve: "bp_async_claim_submission_v2",
  bp_fiber_outage_proactive: "bp_critical_outage_life_safety_v4",
};

const GOLDEN_TO_CANONICAL_BP = {
  bp_billing_dispute_golden_v4: "bp_billing_auto_dispute",
  bp_card_replace_golden_v3: "bp_card_fraud_replacement",
  bp_enterprise_api_onboarding_v2: "bp_onboarding_api_setup",
  bp_vip_renewal_retention_v5: "bp_renewal_save_negotiation",
  bp_async_claim_submission_v2: "bp_order_modification_self_serve",
  bp_critical_outage_life_safety_v4: "bp_fiber_outage_proactive",
};

const CTX_FIELD_IDS = [
  "identity_binding",
  "auth_assurance",
  "intent_embedding",
  "slot_ledger",
  "provenance_digest",
  "consent_vector",
];

const ctxDecayLambdas = new Float64Array([
  0.00002,
  0.00055,
  0.00018,
  0.00012,
  0.00025,
  0.00001,
]);

const ctxWeights = new Float64Array([0.18, 0.22, 0.2, 0.22, 0.12, 0.06]);

const MODALITIES = [
  "mobile_app",
  "web_portal",
  "async_sms_whatsapp",
  "web_chat_cai",
  "ivr_voicebot",
  "voice_pstn_acd",
  "video_cobrowse",
];

/**
 * Loads all ontology, taxonomy, continuous manifold spec, and recalibration artifacts.
 */
export function loadControlPlaneState(workspaceRoot = defaultWorkspaceRoot) {
  const ontologyPath = join(workspaceRoot, "ontology", "cx-ontology.json");
  const specPath = join(workspaceRoot, "ontology", "continuous-scale-spec.json");
  const manifoldSummaryPath = join(
    workspaceRoot,
    ".tmp",
    "continuous-scale",
    "manifold-summary.json",
  );
  const recalibratedPath = join(
    workspaceRoot,
    ".tmp",
    "continuous-scale",
    "recalibrated-blueprints.json",
  );

  const ontology = JSON.parse(readFileSync(ontologyPath, "utf8"));
  const taxonomies = ontology.taxonomies.map((entry) => {
    const relParts = String(entry.path).split(SLASH);
    const taxPath = join(workspaceRoot, "ontology", ...relParts);
    const data = JSON.parse(readFileSync(taxPath, "utf8"));
    return {
      ...entry,
      data,
    };
  });

  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const manifoldSummary = existsSync(manifoldSummaryPath)
    ? JSON.parse(readFileSync(manifoldSummaryPath, "utf8"))
    : null;
  const recalibratedBlueprints = existsSync(recalibratedPath)
    ? JSON.parse(readFileSync(recalibratedPath, "utf8"))
    : null;

  const agents = spec.a2aContinuousAgents;
  const numAgents = agents.length;
  const agentCapMatrix = new Float64Array(numAgents * DIM);
  const agentCapNorms = new Float64Array(numAgents);
  const agentAuthRadius = new Float64Array(numAgents);
  const agentLatencyHazard = new Float64Array(numAgents);
  const agentBaseLoad = new Float64Array(numAgents);

  for (let a = 0; a < numAgents; a++) {
    const ag = agents[a];
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

  const blueprintById = new Map();
  const recalibratedById = new Map();

  for (let b = 0; b < spec.goldenAttractorTubes.length; b++) {
    const tube = spec.goldenAttractorTubes[b];
    blueprintById.set(tube.blueprintId, { index: b, tube });
    const alias = GOLDEN_TO_CANONICAL_BP[tube.blueprintId];
    if (alias) {
      blueprintById.set(alias, { index: b, tube });
    }
  }

  if (recalibratedBlueprints && Array.isArray(recalibratedBlueprints.recalibratedBlueprints)) {
    for (const rbp of recalibratedBlueprints.recalibratedBlueprints) {
      recalibratedById.set(rbp.blueprintId, rbp);
      if (rbp.canonicalAlias) {
        recalibratedById.set(rbp.canonicalAlias, rbp);
      }
    }
  }

  return {
    workspaceRoot,
    startedAtMs: Date.now(),
    ontology,
    taxonomies,
    spec,
    manifoldSummary,
    recalibratedBlueprints,
    agents,
    numAgents,
    agentCapMatrix,
    agentCapNorms,
    agentAuthRadius,
    agentLatencyHazard,
    agentBaseLoad,
    blueprintById,
    recalibratedById,
  };
}

/**
 * Interpolates a 3-knot Golden Attractor Tube (prior or recalibrated) at progress tau in [0, 1].
 */
function interpolateKnots(knots, tau, useRecalibratedKnots = false) {
  const t = clamp01(tau);
  const k0 = knots[0];
  const k1 = knots[1];
  const k2 = knots[2];

  const mu0 = useRecalibratedKnots ? (k0.recalibratedMu ?? k0.mu) : (k0.priorMu ?? k0.mu);
  const mu1 = useRecalibratedKnots ? (k1.recalibratedMu ?? k1.mu) : (k1.priorMu ?? k1.mu);
  const mu2 = useRecalibratedKnots ? (k2.recalibratedMu ?? k2.mu) : (k2.priorMu ?? k2.mu);

  const sig0 = useRecalibratedKnots
    ? (k0.recalibratedSigmaDiag ?? k0.sigmaDiag)
    : (k0.priorSigmaDiag ?? k0.sigmaDiag);
  const sig1 = useRecalibratedKnots
    ? (k1.recalibratedSigmaDiag ?? k1.sigmaDiag)
    : (k1.priorSigmaDiag ?? k1.sigmaDiag);
  const sig2 = useRecalibratedKnots
    ? (k2.recalibratedSigmaDiag ?? k2.sigmaDiag)
    : (k2.priorSigmaDiag ?? k2.sigmaDiag);

  const mu = new Float64Array(DIM);
  const sig = new Float64Array(DIM);

  if (t <= 0.5) {
    const s = t * 2.0;
    const invS = 1.0 - s;
    const bend = 0.08 * s * invS;
    for (let d = 0; d < DIM; d++) {
      const m0 = mu0[d];
      const m1 = mu1[d];
      mu[d] = invS * m0 + s * m1 + bend * (m1 - m0);
      sig[d] = invS * sig0[d] + s * sig1[d];
    }
  } else {
    const s = (t - 0.5) * 2.0;
    const invS = 1.0 - s;
    const bend = 0.08 * s * invS;
    for (let d = 0; d < DIM; d++) {
      const m1 = mu1[d];
      const m2 = mu2[d];
      mu[d] = invS * m1 + s * m2 + bend * (m2 - m1);
      sig[d] = invS * sig1[d] + s * sig2[d];
    }
  }

  return { mu, sig };
}

/**
 * Computes Mahalanobis drift D_M and Wasserstein-2 transport proxy between zState and (muPlan, sigPlan).
 */
function computeDriftMetrics(zState, muPlan, sigPlan, spectralLoopEnergy) {
  let mahaSq = 0.0;
  let wassSq = 0.0;
  for (let d = 0; d < DIM; d++) {
    const diff = zState[d] - muPlan[d];
    const sig = Math.max(1e-4, sigPlan[d]);
    const normDiff = diff / sig;
    mahaSq += normDiff * normDiff;
    const empSig = sig * (0.85 + 0.35 * spectralLoopEnergy);
    const sigDiff = empSig - sig;
    wassSq += diff * diff + sigDiff * sigDiff;
  }
  const mahaRms = Math.sqrt(mahaSq / DIM);
  const wassRms = Math.sqrt(wassSq / DIM);
  return {
    mahalanobisDrift: mahaRms,
    wassersteinCost: wassRms,
  };
}

/**
 * Computes the 12-agent A2A Continuous Boltzmann Routing distribution P(a | z_t).
 */
export function evaluateA2ABoltzmannRoute(cpState, input = {}) {
  const t0 = performance.now();
  const { spec, agents, numAgents, agentCapMatrix, agentCapNorms, agentAuthRadius, agentLatencyHazard, agentBaseLoad } =
    cpState;

  const hyper = spec.continuousFormulations.a2aContinuousField.hyperparameters;
  const betaTemp = hyper.inverseTemperatureBeta;
  const gammaLoad = hyper.loadPenaltyGamma;
  const etaLat = hyper.latencyPenaltyEta;
  const kappaAuth = hyper.authoritySlopeKappa;
  const logNumAgents = Math.log(numAgents);

  const rawVec = Array.isArray(input.stateVector) ? input.stateVector : null;
  const zState = new Float64Array(DIM);
  let zNormSq = 0.0;
  for (let d = 0; d < DIM; d++) {
    const val = rawVec && typeof rawVec[d] === "number" ? clamp01(rawVec[d]) : 0.65;
    zState[d] = val;
    zNormSq += val * val;
  }
  const zNorm = Math.sqrt(zNormSq) + 1e-9;

  const tau = clamp01(Number(input.tau ?? 0.55));
  const contextFidelity = clamp01(Number(input.contextFidelity ?? zState[11] ?? 0.82));
  const driftScore = Math.max(0.0, Number(input.driftScore ?? 0.42));
  const spectralLoopEnergy = clamp01(Number(input.spectralLoopEnergy ?? 0.08));
  const bpIdx = Number(input.blueprintIndex ?? 0);
  const loadOverrides = input.loadOverrides && typeof input.loadOverrides === "object" ? input.loadOverrides : {};

  const computedRisk =
    0.45 * zState[7] + 0.35 * Math.max(zState[9], zState[10]) + 0.2 * spectralLoopEnergy;
  const maxRiskExposure = clamp01(
    typeof input.maxRiskExposure === "number" ? input.maxRiskExposure : computedRisk,
  );

  const logits = new Float64Array(numAgents);
  const probs = new Float64Array(numAgents);
  const cosSims = new Float64Array(numAgents);
  const authGates = new Float64Array(numAgents);
  const affinities = new Float64Array(numAgents);
  const effLoads = new Float64Array(numAgents);
  const utilities = new Float64Array(numAgents);

  let maxLogit = -1e9;

  for (let a = 0; a < numAgents; a++) {
    const ag = agents[a];
    const base = a * DIM;
    let dot = 0.0;
    for (let d = 0; d < DIM; d++) {
      dot += zState[d] * agentCapMatrix[base + d];
    }
    const denom = zNorm * agentCapNorms[a];
    const cosSim = denom > 0.0 ? dot / denom : 0.0;
    const authGate = sigmoid(kappaAuth * (agentAuthRadius[a] - maxRiskExposure));

    let domainAffinity = 0.0;
    if (a === 0) {
      domainAffinity = 0.26 * zState[6] * contextFidelity * (1.0 - Math.max(0.0, tau - 0.88));
    } else if (a === 1) {
      domainAffinity = 0.28 * zState[9];
    } else if (a === 2) {
      domainAffinity = 0.28 * zState[8];
    } else if (a === 3) {
      domainAffinity = 0.30 * zState[10];
    } else if (a === 4) {
      domainAffinity = 0.28 * zState[4] * zState[5];
    } else if (a === 5) {
      domainAffinity = 0.32 * (1.0 - contextFidelity);
    } else if (a === 6) {
      domainAffinity = 0.28 * zState[13] * zState[6];
    } else if (a === 7) {
      domainAffinity = bpIdx === 4 ? 0.26 : 0.09 * zState[6];
    } else if (a === 8) {
      domainAffinity = 0.18 * zState[7] * zState[9];
    } else if (a === 9) {
      domainAffinity = tau > 0.91 && driftScore < 0.45 ? 0.26 : -0.08;
    } else if (a === 10) {
      domainAffinity = 0.24 * Math.max(0.0, driftScore - 0.85);
    } else if (a === 11) {
      domainAffinity = 0.30 * spectralLoopEnergy + 0.22 * Math.max(0.0, driftScore - 1.25);
    }

    const overrideLoad = loadOverrides[ag.id];
    const instLoad = clamp01(
      typeof overrideLoad === "number" ? overrideLoad : agentBaseLoad[a],
    );

    const utility =
      cosSim * authGate + domainAffinity - gammaLoad * instLoad - etaLat * agentLatencyHazard[a];
    const logit = betaTemp * utility;

    cosSims[a] = cosSim;
    authGates[a] = authGate;
    affinities[a] = domainAffinity;
    effLoads[a] = instLoad;
    utilities[a] = utility;
    logits[a] = logit;
    if (logit > maxLogit) maxLogit = logit;
  }

  let sumExp = 0.0;
  for (let a = 0; a < numAgents; a++) {
    const w = Math.exp(logits[a] - maxLogit);
    probs[a] = w;
    sumExp += w;
  }

  let entropy = 0.0;
  const distribution = [];
  const probabilitiesByAgent = {};
  const authorityGatesByAgent = {};

  for (let a = 0; a < numAgents; a++) {
    const p = probs[a] / sumExp;
    probs[a] = p;
    if (p > 1e-9) {
      entropy -= p * Math.log(p);
    }
    const ag = agents[a];
    const probRounded = round4(p);
    const gateRounded = round4(authGates[a]);
    probabilitiesByAgent[ag.id] = probRounded;
    authorityGatesByAgent[ag.id] = gateRounded;

    distribution.push({
      index: a,
      agentId: ag.id,
      id: ag.id,
      name: ag.name,
      role: ag.role,
      probability: probRounded,
      boltzmannWeight: probRounded,
      authorityGate: gateRounded,
      authorityRadius: ag.authorityRadius,
      cosineSimilarity: round4(cosSims[a]),
      domainAffinity: round4(affinities[a]),
      effectiveLoad: round4(effLoads[a]),
      latencyHazard: ag.latencyHazard,
      utility: round4(utilities[a]),
      logit: round4(logits[a]),
    });
  }

  const normalizedEntropy = round4(entropy / logNumAgents);
  const ranked = [...distribution].sort((x, y) => y.probability - x.probability);
  for (let r = 0; r < ranked.length; r++) {
    ranked[r].rank = r + 1;
  }

  const primaryAgent = ranked[0];
  const secondaryAgent = ranked[1];
  const criticEntry =
    ranked.find((ag) => ag.role === "critic_guardrail") ?? ranked[1];
  const shadowCriticAgent =
    maxRiskExposure >= 0.42 || primaryAgent.agentId !== criticEntry.agentId
      ? criticEntry
      : secondaryAgent;

  const computeLatencyMs = round4(performance.now() - t0);

  return {
    ok: true,
    computeLatencyMs,
    maxRiskExposure: round4(maxRiskExposure),
    inverseTemperatureBeta: betaTemp,
    boltzmannShannonEntropy: normalizedEntropy,
    a2aEntropy: normalizedEntropy,
    recommendedPrimaryAgent: primaryAgent,
    recommendedSecondaryAgent: secondaryAgent,
    recommendedShadowCriticAgent: shadowCriticAgent,
    primaryAgent,
    shadowCriticAgent,
    top3Agents: ranked.slice(0, 3),
    rankedAgents: ranked,
    distribution,
    probabilitiesByAgent,
    authorityGatesByAgent,
  };
}

/**
 * Evaluates a single journey state on Plane 1, Plane 2, Omnichannel Context Field,
 * A2A Boltzmann Field, and Plane 3 Continuous Hamiltonian Control Field.
 */
export async function evaluateManifoldState(cpState, payload = {}, options = {}) {
  const t0 = performance.now();
  const { spec, blueprintById, recalibratedById } = cpState;

  const requestedBpId = payload.blueprintId ?? "bp_billing_dispute_golden_v4";
  const bpMatch =
    blueprintById.get(requestedBpId) ??
    blueprintById.get("bp_billing_dispute_golden_v4") ?? {
      index: 0,
      tube: spec.goldenAttractorTubes[0],
    };

  const bpIdx = bpMatch.index;
  const tube = bpMatch.tube;
  const recalBp = recalibratedById.get(tube.blueprintId) ?? null;
  const useRecalibrated = Boolean(payload.useRecalibrated);

  const tau = clamp01(Number(payload.tau ?? 0.55));
  const priorSla = tube.slaBudgetSeconds;
  const recalSla = recalBp?.slaRecalibration?.recalibratedSlaBudgetSeconds ?? priorSla;
  const activeSlaBudget = useRecalibrated ? recalSla : priorSla;
  const elapsedSeconds = Math.max(
    1.0,
    Number(payload.elapsedSeconds ?? Math.round(tau * activeSlaBudget)),
  );

  const priorTubeEval = interpolateKnots(tube.knots, tau, false);
  const recalTubeEval =
    recalBp && Array.isArray(recalBp.recalibratedKnots)
      ? interpolateKnots(recalBp.recalibratedKnots, tau, true)
      : priorTubeEval;

  const activeTubeEval = useRecalibrated ? recalTubeEval : priorTubeEval;
  const muPlan = activeTubeEval.mu;
  const sigPlan = activeTubeEval.sig;

  const zState = new Float64Array(DIM);
  if (Array.isArray(payload.stateVector) && payload.stateVector.length >= DIM) {
    for (let d = 0; d < DIM; d++) {
      zState[d] = clamp01(Number(payload.stateVector[d] ?? muPlan[d]));
    }
  } else {
    for (let d = 0; d < DIM; d++) {
      zState[d] = clamp01(muPlan[d]);
    }
  }

  const sipHeaderStripped = Boolean(payload.sipHeaderStripped);
  const modalityHops = Math.max(0, Math.floor(Number(payload.modalityHops ?? 0)));

  const ctxTensor = new Float64Array(NUM_CTX_FIELDS);
  const hasExplicitCtx =
    Array.isArray(payload.contextTensor) && payload.contextTensor.length >= NUM_CTX_FIELDS;

  let rawCtxMean = 0.0;
  for (let k = 0; k < NUM_CTX_FIELDS; k++) {
    const initVal = hasExplicitCtx ? clamp01(Number(payload.contextTensor[k])) : 0.96;
    ctxTensor[k] = initVal;
    rawCtxMean += initVal / NUM_CTX_FIELDS;
  }

  const shouldApplyChannelDecay = !hasExplicitCtx || (rawCtxMean > 0.85 && (sipHeaderStripped || modalityHops > 0));
  if (shouldApplyChannelDecay) {
    const hopRetention = Math.pow(0.88, modalityHops);
    const carrierRetention = sipHeaderStripped ? 0.56 : 1.0;
    const totalChannelRetention = hopRetention * carrierRetention;
    for (let k = 0; k < NUM_CTX_FIELDS; k++) {
      const timeDecay = 1.0 / (1.0 + ctxDecayLambdas[k] * elapsedSeconds);
      ctxTensor[k] = clamp01(ctxTensor[k] * timeDecay * totalChannelRetention);
    }
  }

  let mutualInfoRetention = 0.0;
  let shannonCtx = 0.0;
  for (let k = 0; k < NUM_CTX_FIELDS; k++) {
    const pk = clamp01(ctxTensor[k]);
    mutualInfoRetention += ctxWeights[k] * pk;
    if (pk > 1e-6 && pk < 1.0 - 1e-6) {
      shannonCtx -= pk * Math.log(pk) + (1.0 - pk) * Math.log(1.0 - pk);
    }
  }
  const shannonContextEntropy = clamp01(shannonCtx / (NUM_CTX_FIELDS * 0.6931471805599453));

  let spectralLoopEnergy = 0.0;
  if (typeof payload.spectralLoopEnergy === "number") {
    spectralLoopEnergy = clamp01(payload.spectralLoopEnergy);
  } else if (Array.isArray(payload.previousVector) && payload.previousVector.length >= DIM) {
    let stepSq = 0.0;
    for (let d = 0; d < DIM; d++) {
      const dv = zState[d] - clamp01(Number(payload.previousVector[d] ?? zState[d]));
      stepSq += dv * dv;
    }
    spectralLoopEnergy = clamp01(Math.sqrt(stepSq / DIM) * 0.85 + 0.15 * modalityHops);
  } else {
    spectralLoopEnergy = clamp01(0.06 * modalityHops + (sipHeaderStripped ? 0.18 : 0.03));
  }

  const priorDriftMetrics = computeDriftMetrics(
    zState,
    priorTubeEval.mu,
    priorTubeEval.sig,
    spectralLoopEnergy,
  );
  const recalDriftMetrics = computeDriftMetrics(
    zState,
    recalTubeEval.mu,
    recalTubeEval.sig,
    spectralLoopEnergy,
  );

  const activeDriftMetrics = useRecalibrated ? recalDriftMetrics : priorDriftMetrics;
  const driftScore = activeDriftMetrics.mahalanobisDrift;
  const wassersteinCost = activeDriftMetrics.wassersteinCost;

  let initialDrift = 0.62;
  if (Array.isArray(payload.previousVector) && payload.previousVector.length >= DIM) {
    const prevZ = new Float64Array(DIM);
    for (let d = 0; d < DIM; d++) {
      prevZ[d] = clamp01(Number(payload.previousVector[d]));
    }
    const prevTau = clamp01(Math.max(0.0, tau - 0.18));
    const prevTube = interpolateKnots(
      useRecalibrated && recalBp ? recalBp.recalibratedKnots : tube.knots,
      prevTau,
      useRecalibrated && Boolean(recalBp),
    );
    const prevMetrics = computeDriftMetrics(prevZ, prevTube.mu, prevTube.sig, spectralLoopEnergy * 0.5);
    initialDrift = prevMetrics.mahalanobisDrift;
  }

  const lyapunovExp =
    (1.0 / Math.max(elapsedSeconds, 10.0)) * Math.log((driftScore + 0.05) / (initialDrift + 0.05));

  let stabilityRegime = "orbital";
  if (lyapunovExp < -0.0015) {
    stabilityRegime = "convergent";
  } else if (lyapunovExp > 0.0015) {
    stabilityRegime = "divergent";
  }

  const a2aResult = evaluateA2ABoltzmannRoute(cpState, {
    stateVector: Array.from(zState),
    tau,
    contextFidelity: mutualInfoRetention,
    driftScore,
    spectralLoopEnergy,
    blueprintIndex: bpIdx,
    loadOverrides: payload.loadOverrides,
    maxRiskExposure: payload.maxRiskExposure,
  });

  const topAgentIdx = a2aResult.primaryAgent.index;
  const a2aEntropy = a2aResult.boltzmannShannonEntropy;

  const rawU0 =
    3.4 * zState[6] * mutualInfoRetention * (1.0 - spectralLoopEnergy) -
    1.5 * Math.max(0.0, driftScore - 0.55) +
    (tau < 0.88 && driftScore < 0.55 ? 0.85 : 0.0);
  const rawU1 =
    4.2 * (1.0 - mutualInfoRetention) + 1.3 * zState[14] + (sipHeaderStripped ? 1.85 : -0.25);
  const rawU2 =
    2.9 * Math.max(zState[8], zState[9], zState[10], zState[5] * zState[4]) +
    (topAgentIdx >= 1 && topAgentIdx <= 8 ? 0.85 : -0.2);
  const rawU3 =
    3.1 * zState[13] * zState[6] + (zState[12] > 0.80 && zState[13] > 0.35 ? 1.65 : -0.2);
  const rawU4 =
    2.6 * Math.max(0.0, driftScore - 1.15) +
    2.8 * spectralLoopEnergy +
    2.2 * Math.max(0.0, lyapunovExp * 95.0) +
    1.4 * zState[7] * (1.0 - zState[6]) -
    0.55;
  const rawU5 =
    2.2 * tau * (1.0 - zState[1]) * zState[15] + (tau > 0.91 && driftScore < 0.45 ? 1.65 : -0.85);

  const rawActions = [rawU0, rawU1, rawU2, rawU3, rawU4, rawU5];
  let maxActLogit = -1e9;
  for (let c = 0; c < NUM_ACTIONS; c++) {
    if (rawActions[c] > maxActLogit) maxActLogit = rawActions[c];
  }
  const controlVec = new Float64Array(NUM_ACTIONS);
  let sumActExp = 0.0;
  for (let c = 0; c < NUM_ACTIONS; c++) {
    const e = Math.exp(rawActions[c] - maxActLogit);
    controlVec[c] = e;
    sumActExp += e;
  }

  const actionBasis = spec.continuousFormulations.plane3ControlField.controlActionBasis;
  const controlMap = {};
  const actionBreakdown = [];
  let topActionIdx = 0;
  let topActionWeight = -1.0;

  for (let c = 0; c < NUM_ACTIONS; c++) {
    const w = controlVec[c] / sumActExp;
    controlVec[c] = w;
    const wRound = round4(w);
    const basis = actionBasis[c];
    controlMap[basis.id] = wRound;
    actionBreakdown.push({
      index: c,
      id: basis.id,
      mapsToDiscreteAction: basis.mapsToDiscreteAction,
      weight: wRound,
    });
    if (w > topActionWeight) {
      topActionWeight = w;
      topActionIdx = c;
    }
  }

  const deciderBoundaryScore = round4(
    clamp01(
      a2aEntropy * 0.55 +
        Math.min(1.0, Math.abs(driftScore - 1.0)) * 0.25 +
        spectralLoopEnergy * 0.2,
    ),
  );

  const boundaryThreshold = Number(options.boundaryThreshold ?? 0.58);
  let tierUsed = "tier1_vector_manifold";
  let tier2Arbitration = null;

  if (payload.invokeDeciderOnBoundary && deciderBoundaryScore >= boundaryThreshold) {
    const deciderPort = Number(
      options.deciderPort ?? process.env.STRANDS_DECIDER_PORT ?? 8111,
    );
    const deciderHost = ["http:", "", "127.0.0.1:" + String(deciderPort)].join(SLASH);
    const systemOneUrl = [deciderHost, "v1", "systemone"].join(SLASH);
    try {
      const statePrompt =
        `Continuous Manifold Frontier State (blueprint=${tube.blueprintId}): ` +
        `progress_tau=${round4(tau)}, elapsed=${Math.round(elapsedSeconds)}s, ` +
        `mahalanobis_drift=${round4(driftScore)}, lyapunov_exp=${round5(lyapunovExp)}, ` +
        `context_fidelity=${round4(mutualInfoRetention)}, spectral_loop_energy=${round4(spectralLoopEnergy)}, ` +
        `a2a_boltzmann_entropy=${a2aEntropy}, top_a2a=${a2aResult.primaryAgent.agentId}`;
      const res = await fetch(systemOneUrl, {
        method: "POST",
        headers: { "content-type": MIME_JSON },
        body: JSON.stringify({
          state: statePrompt,
          questions: {
            orchestration_action: {
              type: "choice",
              instructions: "Select the optimal Plane-3 steering mode for this high-entropy manifold state.",
              options: [
                "continue_golden_path",
                "hydrate_context_and_resume",
                "delegate_a2a_specialist",
                "steer_to_async_digital",
                "escalate_warm_human_advocate",
                "suppress_outreach_and_close",
              ],
            },
          },
        }),
        signal: AbortSignal.timeout(1200),
      });
      if (res.ok) {
        const data = await res.json();
        const choice = data?.answers?.orchestration_action?.choice ?? null;
        const conf = round4(data?.answers?.orchestration_action?.confidence ?? 0);
        if (choice) {
          tierUsed = "tier2_strands_2b_systemone";
          tier2Arbitration = {
            orchestrationAction: choice,
            confidence: conf,
          };
        }
      }
    } catch {
      tierUsed = "tier1_vector_manifold";
    }
  }

  const muStarArr = Array.from(muPlan, round4);
  const sigmaStarArr = Array.from(sigPlan, round4);
  const stateVecArr = Array.from(zState, round4);
  const ctxTensorArr = Array.from(ctxTensor, round4);
  const controlVecArr = Array.from(controlVec, round4);
  const primaryBasis = actionBasis[topActionIdx];
  const computeLatencyMs = round4(performance.now() - t0);

  return {
    ok: true,
    computeLatencyMs,
    blueprintId: tube.blueprintId,
    canonicalAlias: GOLDEN_TO_CANONICAL_BP[tube.blueprintId] ?? tube.blueprintId,
    blueprintName: tube.name,
    domain: tube.domain,
    useRecalibrated,
    tau: round4(tau),
    elapsedSeconds: round4(elapsedSeconds),
    slaBudgetSeconds: activeSlaBudget,
    muStar: muStarArr,
    sigmaStar: sigmaStarArr,
    mahalanobisDrift: round4(driftScore),
    priorMahalanobisDrift: round4(priorDriftMetrics.mahalanobisDrift),
    recalibratedMahalanobisDrift: round4(recalDriftMetrics.mahalanobisDrift),
    recalibrationDriftReduction: round4(
      priorDriftMetrics.mahalanobisDrift - recalDriftMetrics.mahalanobisDrift,
    ),
    wassersteinCost: round4(wassersteinCost),
    lyapunovExponent: round5(lyapunovExp),
    lyapunovRegime: stabilityRegime,
    stabilityRegime,
    contextFidelity: round4(mutualInfoRetention),
    mutualInformationRetention: round4(mutualInfoRetention),
    shannonContextEntropy: round4(shannonContextEntropy),
    spectralLoopEnergy: round4(spectralLoopEnergy),
    a2aEntropy,
    boltzmannShannonEntropy: a2aEntropy,
    top3A2AAgents: a2aResult.top3Agents,
    controlVector: controlVecArr,
    controlActions: controlMap,
    primaryControlAction: primaryBasis.id,
    primaryDiscreteAction: primaryBasis.mapsToDiscreteAction,
    deciderBoundaryScore,
    tierUsed,
    tier2Arbitration,
    plane1Attractor: {
      blueprintId: tube.blueprintId,
      name: tube.name,
      domain: tube.domain,
      tau: round4(tau),
      tubeSource: useRecalibrated
        ? "recalibrated_robbins_monro"
        : "prior_prescriptive_spec",
      slaBudgetSeconds: activeSlaBudget,
      priorSlaBudgetSeconds: priorSla,
      recalibratedSlaBudgetSeconds: recalSla,
      momentOfTruthTau: tube.momentOfTruthTau,
      muStar: muStarArr,
      sigmaStar: sigmaStarArr,
    },
    plane2Trajectory: {
      stateVector: stateVecArr,
      mahalanobisDrift: round4(driftScore),
      priorMahalanobisDrift: round4(priorDriftMetrics.mahalanobisDrift),
      recalibratedMahalanobisDrift: round4(recalDriftMetrics.mahalanobisDrift),
      wassersteinCost: round4(wassersteinCost),
      lyapunovExponent: round5(lyapunovExp),
      stabilityRegime,
    },
    omnichannelContext: {
      fields: CTX_FIELD_IDS,
      contextTensor: ctxTensorArr,
      mutualInformationRetention: round4(mutualInfoRetention),
      contextFidelity: round4(mutualInfoRetention),
      shannonContextEntropy: round4(shannonContextEntropy),
      sipHeaderStripped,
      modalityHops,
    },
    a2aRouting: {
      boltzmannShannonEntropy: a2aEntropy,
      maxRiskExposure: a2aResult.maxRiskExposure,
      primaryAgent: a2aResult.primaryAgent,
      secondaryAgent: a2aResult.secondaryAgent,
      shadowCriticAgent: a2aResult.shadowCriticAgent,
      top3Agents: a2aResult.top3Agents,
      distribution: a2aResult.distribution,
      probabilitiesByAgent: a2aResult.probabilitiesByAgent,
    },
    plane3Control: {
      controlVector: controlVecArr,
      controlMap,
      primaryControlAction: {
        index: topActionIdx,
        id: primaryBasis.id,
        mapsToDiscreteAction: primaryBasis.mapsToDiscreteAction,
        weight: round4(topActionWeight),
      },
      actionBreakdown,
    },
  };
}

/**
 * Builds the 19-taxonomy closed-world summary, journeyTriad, contextEnvelopeSpec,
 * continuous dynamics counts, and 9 Engine KPI rollups.
 */
export function buildOntologySummary(cpState) {
  const { ontology, taxonomies, spec, manifoldSummary, recalibratedBlueprints } = cpState;

  let totalGlossaryTerms = 0;
  let totalFacets = 0;
  let totalMetrics = 0;
  let totalFailureModes = 0;
  let totalScoringModels = 0;
  let totalContinuousModels = 0;
  let totalStateVariables = 0;
  let totalDifferentialEquations = 0;
  let totalScaleInvariants = 0;

  const kpiMap = new Map();
  for (const kpiId of ontology.engineAlignment.kpiIds) {
    kpiMap.set(kpiId, {
      kpiId,
      mappedMetricsCount: 0,
      taxonomiesCount: 0,
      taxonomies: [],
      metrics: [],
    });
  }

  const taxonomySummaries = taxonomies.map((t) => {
    const d = t.data;
    const glossaryCount = d.glossary?.length ?? 0;
    const facetsCount = d.facets?.length ?? 0;
    const metrics = d.metrics ?? [];
    const failureModesCount = d.failureModes?.length ?? 0;
    const cd = d.continuousDynamics ?? null;
    const sm = d.scoringModel ?? null;

    totalGlossaryTerms += glossaryCount;
    totalFacets += facetsCount;
    totalMetrics += metrics.length;
    totalFailureModes += failureModesCount;
    if (sm) totalScoringModels += 1;
    if (cd) {
      totalContinuousModels += 1;
      totalStateVariables += cd.stateVariables?.length ?? 0;
      totalDifferentialEquations += cd.differentialEquations?.length ?? 0;
      totalScaleInvariants += cd.scaleInvariants?.length ?? 0;
    }

    const mappedKpis = [];
    for (const m of metrics) {
      if (m.mapsToKpi && kpiMap.has(m.mapsToKpi)) {
        const rollup = kpiMap.get(m.mapsToKpi);
        rollup.mappedMetricsCount += 1;
        rollup.metrics.push({
          taxonomyId: t.id,
          acronym: t.acronym,
          metricId: m.id,
          metricName: m.name,
          unit: m.unit,
          direction: m.direction,
        });
        if (!rollup.taxonomies.includes(t.id)) {
          rollup.taxonomies.push(t.id);
          rollup.taxonomiesCount = rollup.taxonomies.length;
        }
        if (!mappedKpis.includes(m.mapsToKpi)) {
          mappedKpis.push(m.mapsToKpi);
        }
      }
    }

    return {
      id: t.id,
      acronym: t.acronym,
      name: t.name,
      category: t.category,
      version: d.version ?? ontology.version,
      summary: t.summary,
      glossaryCount,
      facetsCount,
      metricsCount: metrics.length,
      failureModesCount,
      mappedEngineKpis: mappedKpis,
      hasScoringModel: Boolean(sm),
      scoringMaxPoints: sm?.maxPoints ?? null,
      continuousStateSpaceDimension: cd?.stateSpaceDimension ?? null,
      stateVariablesCount: cd?.stateVariables?.length ?? 0,
      differentialEquationsCount: cd?.differentialEquations?.length ?? 0,
    };
  });

  const engineKpiRollups = Array.from(kpiMap.values());
  const kpiRollupsById = {};
  for (const r of engineKpiRollups) {
    kpiRollupsById[r.kpiId] = r;
  }

  return {
    ok: true,
    kind: "cxOntologyControlPlaneSummary",
    version: ontology.version,
    name: ontology.name,
    taxonomiesLoaded: taxonomies.length,
    engineAlignment: ontology.engineAlignment,
    journeyTriad: ontology.core.journeyTriad,
    contextEnvelopeSpec: ontology.core.contextEnvelopeSpec,
    continuousDynamicsCounts: {
      taxonomiesWithContinuousDynamics: totalContinuousModels,
      totalStateVariables,
      totalDifferentialEquations,
      totalScaleInvariants,
      latentManifoldDimensions: spec.dimensions,
      a2aContinuousAgents: spec.a2aContinuousAgents.length,
      goldenAttractorTubes: spec.goldenAttractorTubes.length,
      plane3ControlActions:
        spec.continuousFormulations.plane3ControlField.controlActionBasis.length,
    },
    totals: {
      taxonomies: taxonomies.length,
      glossaryTerms: totalGlossaryTerms,
      facets: totalFacets,
      metrics: totalMetrics,
      failureModes: totalFailureModes,
      scoringModels: totalScoringModels,
      continuousModels: totalContinuousModels,
      stateVariables: totalStateVariables,
      differentialEquations: totalDifferentialEquations,
      engineKpis: engineKpiRollups.length,
    },
    engineKpiRollups,
    kpiRollupsById,
    taxonomies: taxonomySummaries,
    latestManifoldBenchmark: manifoldSummary?.benchmark ?? null,
    latestRecalibrationSummary:
      recalibratedBlueprints?.portfolioRecalibrationSummary ?? null,
  };
}

/**
 * Generates deterministic live trajectory telemetry ticks for the /v1/stream SSE feed.
 */
async function generateLiveStreamTick(cpState, tickIndex, streamOpts = {}) {
  const tubes = cpState.spec.goldenAttractorTubes;
  const bpIdx = tickIndex % tubes.length;
  const tube = tubes[bpIdx];

  const phase = ((tickIndex * 2654435761) >>> 0) * 2.3283064365386963e-10;
  const tau = clamp01(0.18 + 0.72 * ((tickIndex * 0.19 + phase * 0.25) % 1.0));
  const useRecalibrated =
    streamOpts.useRecalibrated !== undefined
      ? Boolean(streamOpts.useRecalibrated)
      : true;

  const tubeEval = interpolateKnots(tube.knots, tau, false);
  const isHighDriftRegime = tickIndex % 3 === 2;
  const sipHeaderStripped = isHighDriftRegime && tickIndex % 2 === 0;
  const modalityHops = isHighDriftRegime ? 2 : tickIndex % 2;

  const stateVector = [];
  for (let d = 0; d < DIM; d++) {
    const wave = Math.sin(tickIndex * 1.13 + d * 0.71);
    const offset = isHighDriftRegime ? wave * 0.18 : wave * 0.04;
    let val = clamp01(tubeEval.mu[d] + offset);
    if (isHighDriftRegime) {
      if (d === 0 || d === 2 || d === 11 || d === 15) val = clamp01(val - 0.16);
      if (d === 3 || d === 5 || d === 13 || d === 14) val = clamp01(val + 0.16);
    }
    stateVector.push(round4(val));
  }

  const evalRes = await evaluateManifoldState(cpState, {
    blueprintId: streamOpts.blueprintId ?? tube.blueprintId,
    tau,
    elapsedSeconds: Math.round(tau * tube.slaBudgetSeconds * (isHighDriftRegime ? 1.25 : 0.92)),
    stateVector,
    sipHeaderStripped,
    modalityHops,
    spectralLoopEnergy: isHighDriftRegime ? 0.42 : 0.06,
    useRecalibrated,
  });

  return {
    sequence: tickIndex + 1,
    timestamp: new Date().toISOString(),
    journeyId: "JRN-STREAM-" + String(tickIndex + 1).padStart(6, "0"),
    modality: MODALITIES[tickIndex % MODALITIES.length],
    regime: isHighDriftRegime ? "high_friction_perturbation" : "nominal_attractor_flow",
    ...evalRes,
  };
}

/**
 * Reads and parses JSON request body safely.
 */
function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let totalBytes = 0;
    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > 4 * 1024 * 1024) {
        rejectBody(new Error("Request body exceeds 4MB limit"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolveBody({});
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(raw));
      } catch (err) {
        rejectBody(new Error("Invalid JSON payload: " + String(err.message ?? err)));
      }
    });
    req.on("error", rejectBody);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": MIME_JSON,
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(body);
}

/**
 * Creates the CXOS Real-Time Streaming Control Plane HTTP + SSE Server.
 * Returns an enhanced node:http Server instance that also exposes .start(), .stop(),
 * and direct in-memory evaluation helpers.
 */
export function createControlPlaneServer(options = {}) {
  const cpState = loadControlPlaneState(options.workspaceRoot ?? defaultWorkspaceRoot);
  const sseClients = new Set();
  const activeTimers = new Set();

  const healthPath = SLASH + "health";
  const ontologySummaryPath = [SLASH + "v1", "ontology", "summary"].join(SLASH);
  const manifoldEvaluatePath = [SLASH + "v1", "manifold", "evaluate"].join(SLASH);
  const a2aRoutePath = [SLASH + "v1", "a2a", "route"].join(SLASH);
  const recalibratedBlueprintsPath = [SLASH + "v1", "blueprints", "recalibrated"].join(SLASH);
  const streamPath = [SLASH + "v1", "stream"].join(SLASH);

  const buildHealthPayload = () => ({
    ok: true,
    service: "cxos-control-plane",
    version: cpState.ontology.version,
    taxonomiesLoaded: cpState.taxonomies.length,
    continuousDimensions: cpState.spec.dimensions,
    a2aAgentsLoaded: cpState.agents.length,
    goldenAttractorsLoaded: cpState.spec.goldenAttractorTubes.length,
    recalibratedBlueprintsLoaded:
      cpState.recalibratedBlueprints?.recalibratedBlueprints?.length ?? 0,
    manifoldSummaryLoaded: Boolean(cpState.manifoldSummary),
    uptimeSeconds: round4((Date.now() - cpState.startedAtMs) * 0.001),
  });

  const cachedOntologySummary = buildOntologySummary(cpState);

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        res.end();
        return;
      }

      const baseHost = ["http:", "", req.headers.host ?? "127.0.0.1"].join(SLASH);
      const parsedUrl = new URL(req.url ?? SLASH, baseHost);
      const pathname = parsedUrl.pathname;

      if (req.method === "GET" && pathname === healthPath) {
        sendJson(res, 200, buildHealthPayload());
        return;
      }

      if (req.method === "GET" && pathname === ontologySummaryPath) {
        sendJson(res, 200, cachedOntologySummary);
        return;
      }

      if (req.method === "POST" && pathname === manifoldEvaluatePath) {
        const body = await readJsonBody(req);
        if (Array.isArray(body) || Array.isArray(body.states) || Array.isArray(body.journeys)) {
          const list = Array.isArray(body)
            ? body
            : (body.states ?? body.journeys);
          const sharedRecal = body.useRecalibrated;
          const sharedDecider = body.invokeDeciderOnBoundary;
          const tBatch = performance.now();
          const results = [];
          for (const item of list) {
            const mergedItem = {
              ...item,
              useRecalibrated: item.useRecalibrated ?? sharedRecal ?? false,
              invokeDeciderOnBoundary: item.invokeDeciderOnBoundary ?? sharedDecider ?? false,
            };
            results.push(await evaluateManifoldState(cpState, mergedItem, options));
          }
          sendJson(res, 200, {
            ok: true,
            batchSize: results.length,
            computeLatencyMs: round4(performance.now() - tBatch),
            results,
          });
          return;
        }

        const singleResult = await evaluateManifoldState(cpState, body, options);
        sendJson(res, 200, singleResult);
        return;
      }

      if (req.method === "POST" && pathname === a2aRoutePath) {
        const body = await readJsonBody(req);
        const routeResult = evaluateA2ABoltzmannRoute(cpState, body);
        sendJson(res, 200, routeResult);
        return;
      }

      if (req.method === "GET" && pathname === recalibratedBlueprintsPath) {
        const bpFilter = parsedUrl.searchParams.get("blueprintId");
        const recal = cpState.recalibratedBlueprints;
        if (!recal) {
          sendJson(res, 200, {
            ok: true,
            version: cpState.spec.version,
            portfolioRecalibrationSummary: null,
            recalibratedBlueprints: [],
          });
          return;
        }
        if (bpFilter) {
          const matched = cpState.recalibratedById.get(bpFilter) ?? null;
          sendJson(res, 200, {
            ok: true,
            version: recal.version,
            generatedAt: recal.generatedAt,
            hyperparameters: recal.hyperparameters,
            portfolioRecalibrationSummary: recal.portfolioRecalibrationSummary,
            blueprint: matched,
            recalibratedBlueprints: matched ? [matched] : [],
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          ...recal,
        });
        return;
      }

      if (req.method === "GET" && pathname === streamPath) {
        const rawInterval = parsedUrl.searchParams.get("interval") ??
          parsedUrl.searchParams.get("intervalMs");
        const rawLimit = parsedUrl.searchParams.get("limit");
        const bpFilter = parsedUrl.searchParams.get("blueprintId") ?? undefined;
        const useRecalParam = parsedUrl.searchParams.get("useRecalibrated");

        const limit = rawLimit !== null ? Math.max(1, Math.floor(Number(rawLimit))) : 0;
        const defaultInterval = rawInterval !== null ? Number(rawInterval) : (limit > 0 ? 40 : 500);
        const intervalMs = clamp(Math.floor(defaultInterval), 5, 60000);
        const useRecalibrated =
          useRecalParam !== null ? useRecalParam !== "false" : true;

        res.writeHead(200, {
          "content-type": MIME_SSE,
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "access-control-allow-origin": "*",
        });

        sseClients.add(res);
        let tickCount = 0;
        let closed = false;
        let timer = null;

        const cleanupStream = () => {
          if (closed) return;
          closed = true;
          if (timer !== null) {
            clearInterval(timer);
            activeTimers.delete(timer);
            timer = null;
          }
          sseClients.delete(res);
          if (!res.writableEnded) {
            res.end();
          }
        };

        req.on("close", cleanupStream);

        const emitTick = async () => {
          if (closed || res.writableEnded) return;
          const currentIdx = tickCount;
          tickCount += 1;
          const tickPayload = await generateLiveStreamTick(cpState, currentIdx, {
            blueprintId: bpFilter,
            useRecalibrated,
          });
          if (closed || res.writableEnded) return;
          const frame =
            "id: " +
            String(tickPayload.sequence) +
            "\nevent: manifold_tick\ndata: " +
            JSON.stringify(tickPayload) +
            "\n\n";
          res.write(frame);

          if (limit > 0 && tickCount >= limit) {
            cleanupStream();
          }
        };

        await emitTick();
        if (!closed && (limit === 0 || tickCount < limit)) {
          timer = setInterval(() => {
            emitTick().catch(() => cleanupStream());
          }, intervalMs);
          activeTimers.add(timer);
        }
        return;
      }

      sendJson(res, 404, {
        ok: false,
        error: "Endpoint not found: " + String(req.method) + " " + pathname,
        availableEndpoints: [
          "GET " + healthPath,
          "GET " + ontologySummaryPath,
          "POST " + manifoldEvaluatePath,
          "POST " + a2aRoutePath,
          "GET " + recalibratedBlueprintsPath,
          "GET " + streamPath,
        ],
      });
    } catch (err) {
      sendJson(res, 400, {
        ok: false,
        error: String(err instanceof Error ? err.message : err),
      });
    }
  });

  const originalClose = server.close.bind(server);
  server.close = (callback) => {
    for (const timer of activeTimers) {
      clearInterval(timer);
    }
    activeTimers.clear();
    for (const clientRes of sseClients) {
      if (!clientRes.writableEnded) {
        clientRes.end();
      }
    }
    sseClients.clear();
    return originalClose(callback);
  };

  server.server = server;
  server.cpState = cpState;

  server.start = (
    listenPort = options.port ?? 0,
    listenHost = options.host ?? "127.0.0.1",
  ) =>
    new Promise((resolveStart, rejectStart) => {
      server.once("error", rejectStart);
      server.listen(listenPort, listenHost, () => {
        server.removeListener("error", rejectStart);
        const addr = server.address();
        const boundPort = typeof addr === "object" && addr ? addr.port : listenPort;
        const baseUrl = ["http:", "", listenHost + ":" + String(boundPort)].join(SLASH);
        server.port = boundPort;
        server.baseUrl = baseUrl;
        resolveStart({
          server,
          port: boundPort,
          host: listenHost,
          baseUrl,
        });
      });
    });

  server.stop = () =>
    new Promise((resolveStop, rejectStop) => {
      if (!server.listening) {
        resolveStop();
        return;
      }
      server.close((err) => {
        if (err) rejectStop(err);
        else resolveStop();
      });
    });

  return server;
}

/**
 * Runs a comprehensive end-to-end self-test across all 6 endpoints on an ephemeral port.
 */
export async function runControlPlaneSelfTest(options = {}) {
  const srv = createControlPlaneServer({ ...options, port: 0 });
  const { baseUrl, port } = await srv.start(0, "127.0.0.1");

  try {
    const healthUrl = [baseUrl, "health"].join(SLASH);
    const healthRes = await fetch(healthUrl);
    const health = await healthRes.json();
    if (!health.ok || health.taxonomiesLoaded !== 19 || health.continuousDimensions !== 16) {
      throw new Error("Health check validation failed: " + JSON.stringify(health));
    }

    const summaryUrl = [baseUrl, "v1", "ontology", "summary"].join(SLASH);
    const summaryRes = await fetch(summaryUrl);
    const summary = await summaryRes.json();
    if (
      !summary.ok ||
      summary.taxonomiesLoaded !== 19 ||
      summary.engineKpiRollups.length !== 9
    ) {
      throw new Error("Ontology summary validation failed");
    }

    const evaluateUrl = [baseUrl, "v1", "manifold", "evaluate"].join(SLASH);

    const nominalState = [
      0.89, 0.50, 0.65, 0.38, 0.68, 0.34, 0.89, 0.56,
      0.40, 0.82, 0.14, 0.91, 0.74, 0.22, 0.16, 0.80,
    ];
    const nominalEvalRes = await fetch(evaluateUrl, {
      method: "POST",
      headers: { "content-type": MIME_JSON },
      body: JSON.stringify({
        blueprintId: "bp_billing_dispute_golden_v4",
        tau: 0.55,
        elapsedSeconds: 95,
        stateVector: nominalState,
        contextTensor: [0.98, 0.94, 0.96, 0.97, 0.95, 0.99],
        sipHeaderStripped: false,
        modalityHops: 0,
        spectralLoopEnergy: 0.04,
      }),
    });
    const nominalEval = await nominalEvalRes.json();

    const highDriftEmpiricalState = [
      0.79, 0.43, 0.58, 0.45, 0.68, 0.42, 0.88, 0.54,
      0.37, 0.75, 0.15, 0.76, 0.74, 0.37, 0.26, 0.66,
    ];
    const priorEvalRes = await fetch(evaluateUrl, {
      method: "POST",
      headers: { "content-type": MIME_JSON },
      body: JSON.stringify({
        blueprintId: "bp_billing_dispute_golden_v4",
        tau: 0.68,
        elapsedSeconds: 195,
        stateVector: highDriftEmpiricalState,
        sipHeaderStripped: true,
        modalityHops: 2,
        spectralLoopEnergy: 0.56,
        useRecalibrated: false,
      }),
    });
    const priorEval = await priorEvalRes.json();

    const recalEvalRes = await fetch(evaluateUrl, {
      method: "POST",
      headers: { "content-type": MIME_JSON },
      body: JSON.stringify({
        blueprintId: "bp_billing_dispute_golden_v4",
        tau: 0.68,
        elapsedSeconds: 195,
        stateVector: highDriftEmpiricalState,
        sipHeaderStripped: true,
        modalityHops: 2,
        spectralLoopEnergy: 0.56,
        useRecalibrated: true,
      }),
    });
    const recalEval = await recalEvalRes.json();

    const batchEvalRes = await fetch(evaluateUrl, {
      method: "POST",
      headers: { "content-type": MIME_JSON },
      body: JSON.stringify({
        states: [
          {
            blueprintId: "bp_billing_dispute_golden_v4",
            tau: 0.55,
            elapsedSeconds: 95,
            stateVector: nominalState,
          },
          {
            blueprintId: "bp_card_replace_golden_v3",
            tau: 0.68,
            elapsedSeconds: 195,
            stateVector: highDriftEmpiricalState,
            sipHeaderStripped: true,
            modalityHops: 2,
            spectralLoopEnergy: 0.56,
            useRecalibrated: true,
          },
        ],
      }),
    });
    const batchEval = await batchEvalRes.json();
    if (!batchEval.ok || batchEval.batchSize !== 2) {
      throw new Error("Batch manifold evaluation validation failed");
    }

    const routeUrl = [baseUrl, "v1", "a2a", "route"].join(SLASH);
    const routeRes = await fetch(routeUrl, {
      method: "POST",
      headers: { "content-type": MIME_JSON },
      body: JSON.stringify({
        stateVector: [
          0.90, 0.88, 0.46, 0.70, 0.82, 0.55, 0.76, 0.94,
          0.62, 0.58, 0.96, 0.94, 0.82, 0.28, 0.30, 0.80,
        ],
        loadOverrides: {
          cai_concierge: 0.45,
          fraud_trust_agent: 0.12,
        },
        maxRiskExposure: 0.86,
      }),
    });
    const routeData = await routeRes.json();

    const recalBpUrl = [baseUrl, "v1", "blueprints", "recalibrated"].join(SLASH);
    const recalBpRes = await fetch(recalBpUrl);
    const recalBpData = await recalBpRes.json();

    const streamUrl = [baseUrl, "v1", "stream?limit=3&interval=15"].join(SLASH);
    const streamRes = await fetch(streamUrl);
    const streamText = await streamRes.text();
    const sseEvents = [];
    for (const block of streamText.split("\n\n")) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      const lines = trimmed.split("\n");
      const dataLine = lines.find((line) => line.startsWith("data: "));
      if (dataLine) {
        sseEvents.push(JSON.parse(dataLine.slice(6)));
      }
    }

    if (sseEvents.length !== 3) {
      throw new Error("Expected 3 SSE events from /v1/stream?limit=3, got " + String(sseEvents.length));
    }

    console.log(
      "================================================================================================================",
    );
    console.log(
      "  CXOS UNIFIED REAL-TIME STREAMING CONTROL PLANE — END-TO-END SELF-TEST REPORT",
    );
    console.log(
      "================================================================================================================",
    );
    console.log(
      `  1. [GET /health]                 : ok=${health.ok} | port=${port} | taxonomies=${health.taxonomiesLoaded} | R^${health.continuousDimensions} | A2A=${health.a2aAgentsLoaded} | attractors=${health.goldenAttractorsLoaded}`,
    );
    console.log(
      `  2. [GET /v1/ontology/summary]    : terms=${summary.totals.glossaryTerms} | metrics=${summary.totals.metrics} (${summary.totals.engineKpis} Engine KPIs) | ODEs=${summary.totals.differentialEquations} | vars=${summary.totals.stateVariables}`,
    );
    console.log(
      `  3. [POST /v1/manifold/evaluate]  : Nominal D_M=${nominalEval.mahalanobisDrift} (${nominalEval.stabilityRegime}, lambda=${nominalEval.lyapunovExponent}) | action=${nominalEval.primaryControlAction} (${nominalEval.computeLatencyMs} ms)`,
    );
    console.log(
      `     Plane-1 Tube Comparison       : Prior Tube D_M=${priorEval.mahalanobisDrift} -> Recalibrated Tube D_M=${recalEval.mahalanobisDrift} (delta=-${round4(priorEval.mahalanobisDrift - recalEval.mahalanobisDrift)}) | action=${recalEval.primaryControlAction}`,
    );
    console.log(
      `  4. [POST /v1/a2a/route]          : Primary=${routeData.primaryAgent.agentId} (P=${routeData.primaryAgent.probability}, gate=${routeData.primaryAgent.authorityGate}) | ShadowCritic=${routeData.shadowCriticAgent.agentId} | H_a2a=${routeData.boltzmannShannonEntropy}`,
    );
    console.log(
      `  5. [GET /v1/blueprints/recalibrated] : tubes=${recalBpData.recalibratedBlueprints?.length ?? 0} | portfolio drift ${recalBpData.portfolioRecalibrationSummary?.meanPriorMahalanobisDrift} -> ${recalBpData.portfolioRecalibrationSummary?.meanCounterfactualPostDrift} (-${recalBpData.portfolioRecalibrationSummary?.overallDriftReductionPercent}%)`,
    );
    console.log(
      `  6. [GET /v1/stream?limit=3]      : received ${sseEvents.length} live SSE frames -> [${sseEvents.map((e) => `${e.journeyId}:${e.blueprintId}:D_M=${e.mahalanobisDrift}`).join(", ")}]`,
    );
    console.log(
      "================================================================================================================",
    );

    return {
      ok: true,
      health,
      summary,
      nominalEval,
      priorEval,
      recalEval,
      routeData,
      recalBpData,
      sseEvents,
    };
  } finally {
    await srv.stop();
  }
}

/**
 * CLI Entrypoint
 */

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === resolve(currentFile);

if (isDirectExecution) {
  const rawArgs = process.argv.slice(2);
  const argOf = (flag) => {
    const idx = rawArgs.indexOf(flag);
    return idx >= 0 ? rawArgs[idx + 1] : undefined;
  };

  if (rawArgs.includes("--self-test")) {
    runControlPlaneSelfTest()
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        console.error("Self-test failed:", err);
        process.exit(1);
      });
  } else {
    const cliPort = Number(argOf("--port") ?? process.env.CXOS_CONTROL_PLANE_PORT ?? 8120);
    const cliHost = argOf("--host") ?? "127.0.0.1";
    const srv = createControlPlaneServer({ port: cliPort, host: cliHost });
    srv
      .start(cliPort, cliHost)
      .then(({ baseUrl, port }) => {
        console.log(
          `CXOS Unified Real-Time Streaming Control Plane listening on ${baseUrl} (port ${port})`,
        );
        const shutdown = () => {
          srv.stop().then(() => process.exit(0));
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
      })
      .catch((err) => {
        console.error("Failed to start CXOS Control Plane:", err);
        process.exit(1);
      });
  }
}
