#!/usr/bin/env node
/**
 * Continuous Journey Manifold, Context Fidelity Decay & A2A Spectral Field Engine
 *
 * Replaces discrete CX enums, static A2A routing buckets, and binary context flags with a
 * vectorized 16-dimensional continuous state-space engine (Float64Array SIMD-friendly math):
 *   1. Omnichannel Context Field: exponential half-life decay F(t) in [0, 1]^6, modality loss,
 *      normalized Mutual Information retention I_norm(t), and Shannon context entropy H(C_t).
 *   2. A2A Continuous Capability Field: 16-D capability embeddings u_a, authority gate g_auth,
 *      Boltzmann/Softmax routing kernel P(a | z_t), assignment entropy H_a2a, and continuous
 *      spectral oscillation / loop energy L_spec(t) in [0, 1].
 *   3. Plane 1 Prescriptive Manifold (What we HOPE & plan): continuous Golden Attractor Tubes
 *      T*(tau) = (mu*(tau), Sigma*(tau)) parameterized by progress tau in [0, 1].
 *   4. Plane 2 Empirical Trajectory (What DID happen): continuous Kalman/EMA state assimilation
 *      z(t) in R^16, Mahalanobis & Wasserstein-2 conformance drift D_drift(t), and Lyapunov
 *      divergence exponent lambda_Lyap(t).
 *   5. Plane 3 Continuous Control Field (What IS happening & SHOULD happen): Hamiltonian / MPC
 *      continuous steering vector u*(t) in [0, 1]^6 + optional Tier-2 Strands 2B System-One
 *      boundary calibration on maximum-entropy frontier states.
 *
 * Supports multi-core parallel execution via node:worker_threads (--workers <W>).
 * Zero external dependencies. Zero regular expressions.
 */
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
if (!existsSync(specPath)) {
  console.error("Missing continuous scale specification at " + specPath);
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, "utf8"));

const DIM = 16;
const NUM_AGENTS = spec.a2aContinuousAgents.length;
const NUM_BLUEPRINTS = spec.goldenAttractorTubes.length;
const NUM_ACTIONS = 6;
const NUM_CTX_FIELDS = 6;
const GRID_BINS = 10;

// Precomputed 4096-entry Gaussian lookup table for sub-nanosecond sampling
const GAUSS_MASK = 4095;
const gaussTable = new Float64Array(4096);
for (let i = 0; i < 4096; i++) {
  const u1 = (i + 0.5) / 4096.0;
  const u2 = ((i * 2654435761) >>> 0) * 2.3283064365386963e-10;
  gaussTable[i] = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(6.283185307179586 * u2);
}

const clamp01 = (v) => (v < 0.0 ? 0.0 : v > 1.0 ? 1.0 : v);
const sigmoid = (x) => 1.0 / (1.0 + Math.exp(-x));

/* ---------- Pre-pack Plane 1 Golden Attractor Tubes into Float64Arrays ---------- */

const bpMu0 = new Float64Array(NUM_BLUEPRINTS * DIM);
const bpMu1 = new Float64Array(NUM_BLUEPRINTS * DIM);
const bpMu2 = new Float64Array(NUM_BLUEPRINTS * DIM);

const bpSig0 = new Float64Array(NUM_BLUEPRINTS * DIM);
const bpSig1 = new Float64Array(NUM_BLUEPRINTS * DIM);
const bpSig2 = new Float64Array(NUM_BLUEPRINTS * DIM);

const bpSlaBudget = new Float64Array(NUM_BLUEPRINTS);
const bpMotTau = new Float64Array(NUM_BLUEPRINTS);

for (let b = 0; b < NUM_BLUEPRINTS; b++) {
  const tube = spec.goldenAttractorTubes[b];
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

/**
 * Evaluates Plane 1 continuous Golden Attractor Tube T*(tau) = (mu*(tau), sigma*(tau))
 * at any continuous progress tau in [0, 1] using smooth quadratic Bezier / spline interpolation.
 */
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

/* ---------- Pre-pack A2A Continuous Agent Capability Vectors ---------- */

const agentCapMatrix = new Float64Array(NUM_AGENTS * DIM);
const agentCapNorms = new Float64Array(NUM_AGENTS);
const agentAuthRadius = new Float64Array(NUM_AGENTS);
const agentLatencyHazard = new Float64Array(NUM_AGENTS);
const agentBaseLoad = new Float64Array(NUM_AGENTS);

for (let a = 0; a < NUM_AGENTS; a++) {
  const ag = spec.a2aContinuousAgents[a];
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

/* ---------- Context Decay Constants ---------- */

const ctxDecayLambdas = new Float64Array([
  0.00002, // identity_binding
  0.00055, // auth_assurance
  0.00018, // intent_embedding
  0.00012, // slot_ledger
  0.00025, // provenance_digest
  0.00001, // consent_vector
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
const modalitySynchronicity = new Float64Array([0.72, 0.65, 0.42, 0.76, 0.84, 0.94, 0.98]);

// 7x7 continuous modality transition loss matrix eta_mod(c_prev, c_curr)
const modalityLossMatrix = new Float64Array([
  // to: app,  web,  sms, chat,  ivr,  acd, video
  0.008, 0.06, 0.05, 0.07, 0.22, 0.28, 0.09, // from mobile_app
  0.07, 0.01, 0.08, 0.06, 0.31, 0.35, 0.11, // from web_portal
  0.05, 0.08, 0.006, 0.07, 0.15, 0.16, 0.12, // from async_sms_whatsapp
  0.06, 0.05, 0.06, 0.008, 0.16, 0.18, 0.08, // from web_chat_cai
  0.12, 0.18, 0.11, 0.14, 0.012, 0.14, 0.15, // from ivr_voicebot
  0.14, 0.2, 0.1, 0.12, 0.18, 0.01, 0.06, // from voice_pstn_acd
  0.08, 0.09, 0.1, 0.07, 0.16, 0.05, 0.008, // from video_cobrowse
]);

const BETA_TEMP = spec.continuousFormulations.a2aContinuousField.hyperparameters.inverseTemperatureBeta;
const GAMMA_LOAD = spec.continuousFormulations.a2aContinuousField.hyperparameters.loadPenaltyGamma;
const ETA_LAT = spec.continuousFormulations.a2aContinuousField.hyperparameters.latencyPenaltyEta;
const KAPPA_AUTH = spec.continuousFormulations.a2aContinuousField.hyperparameters.authoritySlopeKappa;
const LOG_NUM_AGENTS = Math.log(NUM_AGENTS);

/**
 * Runs a partition of journeys [startIdx, endIdx) with deterministic seed.
 */
function runPartition({
  startIdx,
  endIdx,
  totalScale,
  workerSeed,
  deciderSamplesCount,
  reservoirCap,
  maxManifoldSamples,
}) {
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

  // Scratch buffers reused per journey for zero GC pressure in the tight loop
  const zState = new Float64Array(DIM);
  const zPrev = new Float64Array(DIM);
  const yObs = new Float64Array(DIM);
  const muPlan = new Float64Array(DIM);
  const sigPlan = new Float64Array(DIM);
  const stepVecPrev = new Float64Array(DIM);
  const ctxTensor = new Float64Array(NUM_CTX_FIELDS);
  const a2aProbs = new Float64Array(NUM_AGENTS);
  const a2aLogits = new Float64Array(NUM_AGENTS);
  const controlVec = new Float64Array(NUM_ACTIONS);

  // Aggregators across this partition
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
  let countHighSpectralLoop = 0;

  const sumLatentAxes = new Float64Array(DIM);
  const controlWeightSums = new Float64Array(NUM_ACTIONS);
  const controlDominantCounts = new Uint32Array(NUM_ACTIONS);
  const agentSoftMass = new Float64Array(NUM_AGENTS);
  const agentTop1Counts = new Uint32Array(NUM_AGENTS);
  const a2aFlowMatrix = new Float64Array(NUM_AGENTS * NUM_AGENTS);

  const blueprintCounts = new Uint32Array(NUM_BLUEPRINTS);
  const blueprintDriftSums = new Float64Array(NUM_BLUEPRINTS);
  const blueprintFidelitySums = new Float64Array(NUM_BLUEPRINTS);
  const blueprintLyapSums = new Float64Array(NUM_BLUEPRINTS);
  const blueprintTauSums = new Float64Array(NUM_BLUEPRINTS);
  const blueprintElapsedSecSums = new Float64Array(NUM_BLUEPRINTS);
  const blueprintSipStrippedCounts = new Uint32Array(NUM_BLUEPRINTS);
  const blueprintConvergentCounts = new Uint32Array(NUM_BLUEPRINTS);
  const blueprintDivergentCounts = new Uint32Array(NUM_BLUEPRINTS);
  const blueprintAxisSums = new Float64Array(NUM_BLUEPRINTS * DIM);
  const blueprintAxisSqSums = new Float64Array(NUM_BLUEPRINTS * DIM);
  const blueprintControlSums = new Float64Array(NUM_BLUEPRINTS * NUM_ACTIONS);

  const phaseSpaceTauDriftGrid = new Uint32Array(GRID_BINS * GRID_BINS);
  const phaseSpaceFidelityLoopGrid = new Uint32Array(GRID_BINS * GRID_BINS);

  const resLen = Math.min(count, reservoirCap);
  const resStride = Math.max(1, Math.floor(count / resLen));
  const resDrifts = new Float64Array(resLen);
  const resFidelities = new Float64Array(resLen);
  const resLyapunovs = new Float64Array(resLen);
  const resA2AEntropies = new Float64Array(resLen);
  let resIdx = 0;

  const sampleStride = Math.max(1, Math.floor(totalScale / maxManifoldSamples));
  const manifoldSamples = [];
  const frontierCandidates = [];

  for (let j = startIdx; j < endIdx; j++) {
    const bpIdx = j % NUM_BLUEPRINTS;
    blueprintCounts[bpIdx]++;

    const regimeRoll = nextFloat();
    const numSteps = 4 + (nextU32() % 11);
    totalEventsProcessed += numSteps;

    for (let k = 0; k < NUM_CTX_FIELDS; k++) {
      ctxTensor[k] = 0.94 + 0.06 * nextFloat();
    }

    let tau = 0.02 + 0.06 * nextFloat();
    let elapsedSec = 0.0;
    let prevModality = nextU32() & 1;
    let prevAgent = 0;

    evaluateAttractorTube(bpIdx, tau, muPlan, sigPlan);

    let initialDriftSq = 0.0;
    for (let d = 0; d < DIM; d++) {
      const noise = nextGaussian() * sigPlan[d] * 0.85;
      const z0 = clamp01(muPlan[d] + noise);
      zState[d] = z0;
      zPrev[d] = z0;
      stepVecPrev[d] = 0.0;
      const diff = (z0 - muPlan[d]) / sigPlan[d];
      initialDriftSq += diff * diff;
    }
    const initialDrift = Math.sqrt(initialDriftSq / DIM);

    let spectralOscEnergy = 0.0;
    let sipStrippedOccurred = false;

    for (let step = 1; step <= numSteps; step++) {
      const dt = 4.0 + nextFloat() * (regimeRoll > 0.78 ? 48.0 : 18.0);
      elapsedSec += dt;

      let currModality = prevModality;
      let sipHeaderStripped = false;
      if (nextFloat() < (regimeRoll > 0.68 ? 0.36 : 0.10)) {
        currModality = (prevModality + 1 + (nextU32() % (MODALITIES.length - 1))) % MODALITIES.length;
        if ((currModality === 4 || currModality === 5) && nextFloat() < (regimeRoll > 0.78 ? 0.45 : 0.06)) {
          sipHeaderStripped = true;
          sipStrippedOccurred = true;
        }
      }

      const modLoss = modalityLossMatrix[prevModality * MODALITIES.length + currModality];
      const carrierPenalty = sipHeaderStripped ? 0.44 : 0.0;
      const lossRetention = (1.0 - modLoss) * (1.0 - carrierPenalty);
      let mutualInfoRetention = 0.0;
      for (let k = 0; k < NUM_CTX_FIELDS; k++) {
        const timeDecay = 1.0 / (1.0 + ctxDecayLambdas[k] * dt);
        ctxTensor[k] = clamp01(ctxTensor[k] * timeDecay * lossRetention);
        mutualInfoRetention += ctxWeights[k] * ctxTensor[k];
      }

      const targetHorizonTau = 0.22 + 0.78 * ((j * 7919 + step * 131) % 1000) * 0.001;
      let dTau = (targetHorizonTau / numSteps) * (0.68 + 0.52 * mutualInfoRetention);
      if (regimeRoll > 0.84) {
        dTau *= 0.25 + 0.22 * nextFloat();
      } else if (regimeRoll < 0.62) {
        dTau *= 1.05;
      }
      tau = clamp01(tau + dTau);

      evaluateAttractorTube(bpIdx, tau, muPlan, sigPlan);

      const slaRatio = elapsedSec / bpSlaBudget[bpIdx];
      const contextLossPenalty = 1.0 - mutualInfoRetention;

      const noiseScale =
        regimeRoll < 0.62
          ? 0.28 * (1.0 - 0.55 * tau)
          : regimeRoll < 0.80
            ? 0.68
            : 1.45;

      for (let d = 0; d < DIM; d++) {
        const perturb = nextGaussian() * sigPlan[d] * noiseScale;
        yObs[d] = clamp01(muPlan[d] + perturb);
      }

      if (regimeRoll >= 0.62) {
        const xLat = 3.2 * (slaRatio - 0.85);
        const latencyPressureObs = clamp01(0.5 + 0.5 * (xLat / (1.0 + Math.abs(xLat))));
        yObs[0] = clamp01(muPlan[0] * (0.55 + 0.45 * mutualInfoRetention) - 0.22 * contextLossPenalty);
        yObs[2] = clamp01(muPlan[2] - 0.42 * contextLossPenalty - 0.28 * Math.max(0.0, slaRatio - 1.0));
        yObs[3] = clamp01(muPlan[3] + 0.45 * contextLossPenalty + 0.30 * Math.max(0.0, slaRatio - 0.9));
        yObs[5] = clamp01(muPlan[5] + 0.38 * contextLossPenalty + (regimeRoll > 0.82 ? 0.28 : 0.0));
        yObs[11] = clamp01(ctxTensor[1]);
        yObs[12] = modalitySynchronicity[currModality];
        yObs[13] = latencyPressureObs;
        yObs[14] = clamp01(muPlan[14] + 0.58 * contextLossPenalty + (sipHeaderStripped ? 0.28 : 0.0));
        yObs[15] = clamp01(dTau * numSteps * 0.82);
      }

      const kalmanGain = 0.64;
      const oneMinusK = 0.36;
      let stepNormSq = 0.0;
      let prevStepNormSq = 0.0;
      let dotStep = 0.0;

      for (let d = 0; d < DIM; d++) {
        const oldZ = zState[d];
        const newZ = oneMinusK * oldZ + kalmanGain * yObs[d];
        const dv = newZ - oldZ;
        const effectiveDv = regimeRoll > 0.84 && (step & 1) === 0 ? -stepVecPrev[d] * 0.9 : dv;
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

    if (sipStrippedOccurred) {
      countSipStripped++;
      blueprintSipStrippedCounts[bpIdx]++;
    }
    if (spectralOscEnergy >= 0.52) countHighSpectralLoop++;

    let mahaSq = 0.0;
    let wassSq = 0.0;
    let zNormSq = 0.0;
    const bpAxisBase = bpIdx * DIM;
    for (let d = 0; d < DIM; d++) {
      const zVal = zState[d];
      sumLatentAxes[d] += zVal;
      blueprintAxisSums[bpAxisBase + d] += zVal;
      blueprintAxisSqSums[bpAxisBase + d] += zVal * zVal;
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

    const lyapunovExp =
      (1.0 / Math.max(elapsedSec, 10.0)) * Math.log((driftScore + 0.05) / (initialDrift + 0.05));

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
      if (a === 0)
        domainAffinity = 0.26 * zState[6] * finalContextFidelity * (1.0 - Math.max(0.0, tau - 0.88));
      else if (a === 1) domainAffinity = 0.28 * zState[9];
      else if (a === 2) domainAffinity = 0.28 * zState[8];
      else if (a === 3) domainAffinity = 0.30 * zState[10];
      else if (a === 4) domainAffinity = 0.28 * zState[4] * zState[5];
      else if (a === 5) domainAffinity = 0.32 * (1.0 - finalContextFidelity);
      else if (a === 6) domainAffinity = 0.28 * zState[13] * zState[6];
      else if (a === 7) domainAffinity = bpIdx === 4 ? 0.26 : 0.09 * zState[6];
      else if (a === 8) domainAffinity = 0.18 * zState[7] * zState[9];
      else if (a === 9) domainAffinity = tau > 0.91 && driftScore < 0.45 ? 0.26 : -0.08;
      else if (a === 10) domainAffinity = 0.24 * Math.max(0.0, driftScore - 0.85);
      else if (a === 11) domainAffinity = 0.30 * spectralOscEnergy + 0.22 * Math.max(0.0, driftScore - 1.25);

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
    let secondAgent = 0;
    let topProb = -1.0;
    let secondProb = -1.0;

    for (let a = 0; a < NUM_AGENTS; a++) {
      const p = a2aProbs[a] / sumExp;
      a2aProbs[a] = p;
      agentSoftMass[a] += p;
      if (p > 1e-9) {
        a2aEntropy -= p * Math.log(p);
      }
      if (p > topProb) {
        secondProb = topProb;
        secondAgent = topAgent;
        topProb = p;
        topAgent = a;
      } else if (p > secondProb) {
        secondProb = p;
        secondAgent = a;
      }
    }
    a2aEntropy /= LOG_NUM_AGENTS;
    agentTop1Counts[topAgent]++;
    a2aFlowMatrix[prevAgent * NUM_AGENTS + topAgent] += topProb;
    a2aFlowMatrix[topAgent * NUM_AGENTS + secondAgent] += secondProb;

    const rawU0 =
      3.4 * zState[6] * finalContextFidelity * (1.0 - spectralOscEnergy) -
      1.5 * Math.max(0.0, driftScore - 0.55) +
      (tau < 0.88 && driftScore < 0.55 ? 0.85 : 0.0);
    const rawU1 =
      4.2 * (1.0 - finalContextFidelity) + 1.3 * zState[14] + (sipStrippedOccurred ? 1.85 : -0.25);
    const rawU2 =
      2.9 * Math.max(zState[8], zState[9], zState[10], zState[5] * zState[4]) +
      (topAgent >= 1 && topAgent <= 8 ? 0.85 : -0.2);
    const rawU3 =
      3.1 * zState[13] * zState[6] + (zState[12] > 0.80 && zState[13] > 0.35 ? 1.65 : -0.2);
    const rawU4 =
      2.6 * Math.max(0.0, driftScore - 1.15) +
      2.8 * spectralOscEnergy +
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
    let sumActExp = 0.0;
    for (let c = 0; c < NUM_ACTIONS; c++) {
      const e = Math.exp(rawActions[c] - maxActLogit);
      controlVec[c] = e;
      sumActExp += e;
    }
    let topAction = 0;
    let topActionWeight = -1.0;
    const bpCtrlBase = bpIdx * NUM_ACTIONS;
    for (let c = 0; c < NUM_ACTIONS; c++) {
      const w = controlVec[c] / sumActExp;
      controlVec[c] = w;
      controlWeightSums[c] += w;
      blueprintControlSums[bpCtrlBase + c] += w;
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
      resLyapunovs[resIdx] = lyapunovExp;
      resA2AEntropies[resIdx] = a2aEntropy;
      resIdx++;
    }

    const tauBin = Math.min(GRID_BINS - 1, Math.max(0, Math.floor(tau * GRID_BINS)));
    const driftBin = Math.min(GRID_BINS - 1, Math.max(0, Math.floor((driftScore / 2.5) * GRID_BINS)));
    phaseSpaceTauDriftGrid[tauBin * GRID_BINS + driftBin]++;

    const fidBin = Math.min(GRID_BINS - 1, Math.max(0, Math.floor(finalContextFidelity * GRID_BINS)));
    const loopBin = Math.min(GRID_BINS - 1, Math.max(0, Math.floor(spectralOscEnergy * GRID_BINS)));
    phaseSpaceFidelityLoopGrid[fidBin * GRID_BINS + loopBin]++;

    if (j % sampleStride === 0 && manifoldSamples.length < maxManifoldSamples) {
      manifoldSamples.push({
        journeyId: "JRN-" + String(j + 1).padStart(7, "0"),
        blueprintId: spec.goldenAttractorTubes[bpIdx].blueprintId,
        tau: Number(tau.toFixed(4)),
        driftMahalanobis: Number(driftScore.toFixed(4)),
        wassersteinCost: Number(wassersteinCost.toFixed(4)),
        lyapunovExponent: Number(lyapunovExp.toFixed(5)),
        contextFidelity: Number(finalContextFidelity.toFixed(4)),
        spectralLoopEnergy: Number(spectralOscEnergy.toFixed(4)),
        a2aEntropy: Number(a2aEntropy.toFixed(4)),
        topA2AAgent: spec.a2aContinuousAgents[topAgent].id,
        topA2AWeight: Number(topProb.toFixed(4)),
        secondA2AAgent: spec.a2aContinuousAgents[secondAgent].id,
        secondA2AWeight: Number(secondProb.toFixed(4)),
        primaryControlAction:
          spec.continuousFormulations.plane3ControlField.controlActionBasis[topAction].id,
        controlVector: Array.from(controlVec, (v) => Number(v.toFixed(4))),
        stateVector16D: Array.from(zState, (v) => Number(v.toFixed(4))),
      });
    }

    const frontierScore =
      a2aEntropy * 0.55 + Math.min(1.0, Math.abs(driftScore - 1.0)) * 0.25 + spectralOscEnergy * 0.2;
    if (frontierCandidates.length < deciderSamplesCount) {
      frontierCandidates.push({
        journeyId: "JRN-" + String(j + 1).padStart(7, "0"),
        blueprintId: spec.goldenAttractorTubes[bpIdx].blueprintId,
        frontierScore: Number(frontierScore.toFixed(4)),
        tau: Number(tau.toFixed(3)),
        elapsedSec: Math.round(elapsedSec),
        slaBudgetSec: bpSlaBudget[bpIdx],
        driftMahalanobis: Number(driftScore.toFixed(4)),
        lyapunovExponent: Number(lyapunovExp.toFixed(5)),
        contextFidelity: Number(finalContextFidelity.toFixed(4)),
        spectralLoopEnergy: Number(spectralOscEnergy.toFixed(4)),
        a2aEntropy: Number(a2aEntropy.toFixed(4)),
        topA2AAgent: spec.a2aContinuousAgents[topAgent].id,
        topA2AWeight: Number(topProb.toFixed(4)),
        fastControlAction:
          spec.continuousFormulations.plane3ControlField.controlActionBasis[topAction].id,
        fastControlVector: Array.from(controlVec, (v) => Number(v.toFixed(4))),
      });
      frontierCandidates.sort((a, b) => b.frontierScore - a.frontierScore);
    } else if (frontierScore > frontierCandidates[frontierCandidates.length - 1].frontierScore) {
      frontierCandidates[frontierCandidates.length - 1] = {
        journeyId: "JRN-" + String(j + 1).padStart(7, "0"),
        blueprintId: spec.goldenAttractorTubes[bpIdx].blueprintId,
        frontierScore: Number(frontierScore.toFixed(4)),
        tau: Number(tau.toFixed(3)),
        elapsedSec: Math.round(elapsedSec),
        slaBudgetSec: bpSlaBudget[bpIdx],
        driftMahalanobis: Number(driftScore.toFixed(4)),
        lyapunovExponent: Number(lyapunovExp.toFixed(5)),
        contextFidelity: Number(finalContextFidelity.toFixed(4)),
        spectralLoopEnergy: Number(spectralOscEnergy.toFixed(4)),
        a2aEntropy: Number(a2aEntropy.toFixed(4)),
        topA2AAgent: spec.a2aContinuousAgents[topAgent].id,
        topA2AWeight: Number(topProb.toFixed(4)),
        fastControlAction:
          spec.continuousFormulations.plane3ControlField.controlActionBasis[topAction].id,
        fastControlVector: Array.from(controlVec, (v) => Number(v.toFixed(4))),
      };
      frontierCandidates.sort((a, b) => b.frontierScore - a.frontierScore);
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
    countHighSpectralLoop,
    sumLatentAxes,
    controlWeightSums,
    controlDominantCounts,
    agentSoftMass,
    agentTop1Counts,
    a2aFlowMatrix,
    blueprintCounts,
    blueprintDriftSums,
    blueprintFidelitySums,
    blueprintLyapSums,
    blueprintTauSums,
    blueprintElapsedSecSums,
    blueprintSipStrippedCounts,
    blueprintConvergentCounts,
    blueprintDivergentCounts,
    blueprintAxisSums,
    blueprintAxisSqSums,
    blueprintControlSums,
    phaseSpaceTauDriftGrid,
    phaseSpaceFidelityLoopGrid,
    resDrifts: resDrifts.subarray(0, resIdx),
    resFidelities: resFidelities.subarray(0, resIdx),
    resLyapunovs: resLyapunovs.subarray(0, resIdx),
    resA2AEntropies: resA2AEntropies.subarray(0, resIdx),
    manifoldSamples,
    frontierCandidates,
  };
}

/* ---------- Worker Thread Entrypoint ---------- */

if (!isMainThread) {
  const partResult = runPartition(workerData);
  parentPort.postMessage(partResult);
  process.exit(0);
}

/* ---------- Main Thread Orchestration ---------- */

const rawArgs = process.argv.slice(2);
const argOf = (flag) => {
  const idx = rawArgs.indexOf(flag);
  return idx >= 0 ? rawArgs[idx + 1] : undefined;
};

const scaleJourneys = Math.max(100, Number(argOf("--scale") ?? 10000));
const seedInput = Number(argOf("--seed") ?? 20261017);
const explicitWorkers = argOf("--workers");
const workersUsed = Math.max(
  1,
  explicitWorkers !== undefined
    ? Number(explicitWorkers)
    : scaleJourneys >= 50000
      ? Math.min(os.availableParallelism(), 8)
      : 1,
);
const withDecider = rawArgs.includes("--with-decider");
const deciderSamplesCount = Math.max(1, Number(argOf("--decider-samples") ?? 12));
const deciderPort = Number(argOf("--port") ?? process.env.STRANDS_DECIDER_PORT ?? 8111);
const asJson = rawArgs.includes("--json");
const outFile = resolve(
  argOf("--out") ?? join(workspaceRoot, ".tmp", "continuous-scale", "manifold-summary.json"),
);

const MAX_MANIFOLD_SAMPLES = 120;
const TOTAL_RESERVOIR_CAP = 100000;

const tStart = performance.now();

let partials = [];
if (workersUsed === 1) {
  partials = [
    runPartition({
      startIdx: 0,
      endIdx: scaleJourneys,
      totalScale: scaleJourneys,
      workerSeed: seedInput,
      deciderSamplesCount,
      reservoirCap: TOTAL_RESERVOIR_CAP,
      maxManifoldSamples: MAX_MANIFOLD_SAMPLES,
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
            totalScale: scaleJourneys,
            workerSeed,
            deciderSamplesCount,
            reservoirCap: perWorkerReservoir,
            maxManifoldSamples: MAX_MANIFOLD_SAMPLES,
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

/* ---------- Deterministic Merge of Worker Partials ---------- */

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
let countHighSpectralLoop = 0;

const sumLatentAxes = new Float64Array(DIM);
const controlWeightSums = new Float64Array(NUM_ACTIONS);
const controlDominantCounts = new Uint32Array(NUM_ACTIONS);
const agentSoftMass = new Float64Array(NUM_AGENTS);
const agentTop1Counts = new Uint32Array(NUM_AGENTS);
const a2aFlowMatrix = new Float64Array(NUM_AGENTS * NUM_AGENTS);

const blueprintCounts = new Uint32Array(NUM_BLUEPRINTS);
const blueprintDriftSums = new Float64Array(NUM_BLUEPRINTS);
const blueprintFidelitySums = new Float64Array(NUM_BLUEPRINTS);
const blueprintLyapSums = new Float64Array(NUM_BLUEPRINTS);
const blueprintTauSums = new Float64Array(NUM_BLUEPRINTS);
const blueprintElapsedSecSums = new Float64Array(NUM_BLUEPRINTS);
const blueprintSipStrippedCounts = new Uint32Array(NUM_BLUEPRINTS);
const blueprintConvergentCounts = new Uint32Array(NUM_BLUEPRINTS);
const blueprintDivergentCounts = new Uint32Array(NUM_BLUEPRINTS);
const blueprintAxisSums = new Float64Array(NUM_BLUEPRINTS * DIM);
const blueprintAxisSqSums = new Float64Array(NUM_BLUEPRINTS * DIM);
const blueprintControlSums = new Float64Array(NUM_BLUEPRINTS * NUM_ACTIONS);

const phaseSpaceTauDriftGrid = new Uint32Array(GRID_BINS * GRID_BINS);
const phaseSpaceFidelityLoopGrid = new Uint32Array(GRID_BINS * GRID_BINS);

let totalReservoirItems = 0;
for (const p of partials) {
  totalReservoirItems += p.resDrifts.length;
}
const allDrifts = new Float64Array(totalReservoirItems);
const allFidelities = new Float64Array(totalReservoirItems);
const allLyapunovs = new Float64Array(totalReservoirItems);
const allA2AEntropies = new Float64Array(totalReservoirItems);
let rOffset = 0;

const mergedManifoldSamples = [];
const mergedFrontierCandidates = [];

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
  countHighSpectralLoop += p.countHighSpectralLoop;

  for (let d = 0; d < DIM; d++) sumLatentAxes[d] += p.sumLatentAxes[d];
  for (let c = 0; c < NUM_ACTIONS; c++) {
    controlWeightSums[c] += p.controlWeightSums[c];
    controlDominantCounts[c] += p.controlDominantCounts[c];
  }
  for (let a = 0; a < NUM_AGENTS; a++) {
    agentSoftMass[a] += p.agentSoftMass[a];
    agentTop1Counts[a] += p.agentTop1Counts[a];
  }
  for (let i = 0; i < NUM_AGENTS * NUM_AGENTS; i++) {
    a2aFlowMatrix[i] += p.a2aFlowMatrix[i];
  }
  for (let b = 0; b < NUM_BLUEPRINTS; b++) {
    blueprintCounts[b] += p.blueprintCounts[b];
    blueprintDriftSums[b] += p.blueprintDriftSums[b];
    blueprintFidelitySums[b] += p.blueprintFidelitySums[b];
    blueprintLyapSums[b] += p.blueprintLyapSums[b];
    blueprintTauSums[b] += p.blueprintTauSums[b];
    blueprintElapsedSecSums[b] += p.blueprintElapsedSecSums[b];
    blueprintSipStrippedCounts[b] += p.blueprintSipStrippedCounts[b];
    blueprintConvergentCounts[b] += p.blueprintConvergentCounts[b];
    blueprintDivergentCounts[b] += p.blueprintDivergentCounts[b];
  }
  for (let i = 0; i < NUM_BLUEPRINTS * DIM; i++) {
    blueprintAxisSums[i] += p.blueprintAxisSums[i];
    blueprintAxisSqSums[i] += p.blueprintAxisSqSums[i];
  }
  for (let i = 0; i < NUM_BLUEPRINTS * NUM_ACTIONS; i++) {
    blueprintControlSums[i] += p.blueprintControlSums[i];
  }
  for (let i = 0; i < GRID_BINS * GRID_BINS; i++) {
    phaseSpaceTauDriftGrid[i] += p.phaseSpaceTauDriftGrid[i];
    phaseSpaceFidelityLoopGrid[i] += p.phaseSpaceFidelityLoopGrid[i];
  }

  allDrifts.set(p.resDrifts, rOffset);
  allFidelities.set(p.resFidelities, rOffset);
  allLyapunovs.set(p.resLyapunovs, rOffset);
  allA2AEntropies.set(p.resA2AEntropies, rOffset);
  rOffset += p.resDrifts.length;

  for (const s of p.manifoldSamples) {
    if (mergedManifoldSamples.length < MAX_MANIFOLD_SAMPLES) {
      mergedManifoldSamples.push(s);
    }
  }
  for (const fc of p.frontierCandidates) {
    mergedFrontierCandidates.push(fc);
  }
}

mergedFrontierCandidates.sort((a, b) => b.frontierScore - a.frontierScore);
const frontierCandidates = mergedFrontierCandidates.slice(0, deciderSamplesCount);
const manifoldSamples = mergedManifoldSamples.slice(0, MAX_MANIFOLD_SAMPLES);

const tFastEnd = performance.now();
const elapsedMs = Math.max(0.1, tFastEnd - tStart);
const journeysPerSec = Math.round((scaleJourneys / elapsedMs) * 1000);
const eventsPerSec = Math.round((totalEventsProcessed / elapsedMs) * 1000);

/* ---------- Exact / Reservoir Order-Statistic Quantiles ---------- */

const sortedDrifts = Float64Array.from(allDrifts).sort();
const sortedFidelities = Float64Array.from(allFidelities).sort();
const sortedLyapunovs = Float64Array.from(allLyapunovs).sort();
const sortedEntropies = Float64Array.from(allA2AEntropies).sort();

const quantile = (sortedArr, q) => {
  const pos = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(q * sortedArr.length)));
  return Number(sortedArr[pos].toFixed(4));
};

/* ---------- Optional Tier-2 Strands 2B System-One Boundary Calibration ---------- */

const calibratedFrontier = [];
if (withDecider) {
  const base = "http://127.0.0.1:" + String(deciderPort);
  const systemOneUrl = [base, "v1", "systemone"].join("/");
  for (const cand of frontierCandidates) {
    try {
      const statePrompt =
        `Continuous Manifold Frontier State (${cand.journeyId}, blueprint=${cand.blueprintId}): ` +
        `progress_tau=${cand.tau}, elapsed=${cand.elapsedSec}s/${cand.slaBudgetSec}s, ` +
        `mahalanobis_drift=${cand.driftMahalanobis}, lyapunov_exp=${cand.lyapunovExponent}, ` +
        `context_fidelity=${cand.contextFidelity}, spectral_loop_energy=${cand.spectralLoopEnergy}, ` +
        `a2a_boltzmann_entropy=${cand.a2aEntropy}, top_a2a=${cand.topA2AAgent}(${cand.topA2AWeight})`;
      const res = await fetch(systemOneUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
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
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data = await res.json();
        calibratedFrontier.push({
          ...cand,
          strandsChoice: data.answers?.orchestration_action?.choice ?? null,
          strandsConfidence: Number((data.answers?.orchestration_action?.confidence ?? 0).toFixed(4)),
        });
      }
    } catch {
      // Server not running or timed out; continue gracefully
    }
  }
}

/* ---------- Assemble Rich Summary Artifact ---------- */

const latentAxisAverages = spec.latentManifoldAxes.map((ax, i) => ({
  index: i,
  id: ax.id,
  name: ax.name,
  meanValue: Number((sumLatentAxes[i] / scaleJourneys).toFixed(4)),
}));

const controlActionSummary =
  spec.continuousFormulations.plane3ControlField.controlActionBasis.map((act, i) => ({
    index: i,
    id: act.id,
    mapsToDiscreteAction: act.mapsToDiscreteAction,
    meanContinuousWeight: Number((controlWeightSums[i] / scaleJourneys).toFixed(4)),
    primaryDominantCount: controlDominantCounts[i],
    primaryDominantShare: Number(((controlDominantCounts[i] / scaleJourneys) * 100).toFixed(2)),
  }));

const a2aAgentFieldSummary = spec.a2aContinuousAgents.map((ag, a) => ({
  id: ag.id,
  name: ag.name,
  role: ag.role,
  authorityRadius: ag.authorityRadius,
  latencyHazard: ag.latencyHazard,
  meanBoltzmannWeight: Number((agentSoftMass[a] / scaleJourneys).toFixed(4)),
  top1AssignmentCount: agentTop1Counts[a],
  top1AssignmentShare: Number(((agentTop1Counts[a] / scaleJourneys) * 100).toFixed(2)),
}));

const blueprintAttractorSummary = spec.goldenAttractorTubes.map((tube, b) => {
  const cnt = Math.max(1, blueprintCounts[b]);
  const axisBase = b * DIM;
  const ctrlBase = b * NUM_ACTIONS;
  const empiricalMeanVector = [];
  const empiricalStdVector = [];
  for (let d = 0; d < DIM; d++) {
    const meanVal = blueprintAxisSums[axisBase + d] / cnt;
    const meanSq = blueprintAxisSqSums[axisBase + d] / cnt;
    const variance = Math.max(1e-6, meanSq - meanVal * meanVal);
    empiricalMeanVector.push(Number(meanVal.toFixed(4)));
    empiricalStdVector.push(Number(Math.sqrt(variance).toFixed(4)));
  }
  const meanControlVector = [];
  for (let c = 0; c < NUM_ACTIONS; c++) {
    meanControlVector.push(Number((blueprintControlSums[ctrlBase + c] / cnt).toFixed(4)));
  }
  return {
    blueprintId: tube.blueprintId,
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
    sipStrippedSharePercent: Number(((blueprintSipStrippedCounts[b] / cnt) * 100).toFixed(2)),
    empiricalMeanVector,
    empiricalStdVector,
    meanControlVector,
  };
});

// Top A2A continuous routing flows (chords)
const a2aContinuousFlows = [];
for (let from = 0; from < NUM_AGENTS; from++) {
  for (let to = 0; to < NUM_AGENTS; to++) {
    const mass = a2aFlowMatrix[from * NUM_AGENTS + to];
    if (mass > scaleJourneys * 0.005) {
      a2aContinuousFlows.push({
        fromAgent: spec.a2aContinuousAgents[from].id,
        toAgent: spec.a2aContinuousAgents[to].id,
        continuousProbabilityMass: Number(mass.toFixed(2)),
        normalizedFlowShare: Number((mass / (scaleJourneys * 2.0)).toFixed(4)),
      });
    }
  }
}
a2aContinuousFlows.sort((a, b) => b.continuousProbabilityMass - a.continuousProbabilityMass);

const summaryArtifact = {
  kind: "cxContinuousManifoldSummary",
  version: spec.version,
  generatedAt: new Date().toISOString(),
  benchmark: {
    scaleJourneys,
    totalEventsProcessed,
    workersUsed,
    elapsedMilliseconds: Number(elapsedMs.toFixed(2)),
    throughputJourneysPerSec: journeysPerSec,
    throughputEventsPerSec: eventsPerSec,
    dimensions: DIM,
    a2aAgentsCount: NUM_AGENTS,
    goldenAttractorsCount: NUM_BLUEPRINTS,
  },
  continuousFieldMetrics: {
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
      p10Exponent: quantile(sortedLyapunovs, 0.1),
      p50Exponent: quantile(sortedLyapunovs, 0.5),
      p90Exponent: quantile(sortedLyapunovs, 0.9),
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
    },
    a2aSpectralField: {
      meanBoltzmannEntropy: Number((sumA2AEntropy / scaleJourneys).toFixed(4)),
      p50BoltzmannEntropy: quantile(sortedEntropies, 0.5),
      p95BoltzmannEntropy: quantile(sortedEntropies, 0.95),
      meanSpectralLoopEnergy: Number((sumSpectralLoopEnergy / scaleJourneys).toFixed(4)),
      highOscillationSharePercent: Number(
        ((countHighSpectralLoop / scaleJourneys) * 100).toFixed(2),
      ),
    },
    meanNormalizedProgressTau: Number((sumTauProgress / scaleJourneys).toFixed(4)),
  },
  latentAxisAverages,
  controlActionSummary,
  a2aAgentFieldSummary,
  a2aContinuousFlows: a2aContinuousFlows.slice(0, 28),
  blueprintAttractorSummary,
  phaseSpaceGrids: {
    bins: GRID_BINS,
    tauVsDriftMatrix: Array.from({ length: GRID_BINS }, (_, r) =>
      Array.from(phaseSpaceTauDriftGrid.subarray(r * GRID_BINS, (r + 1) * GRID_BINS)),
    ),
    fidelityVsLoopMatrix: Array.from({ length: GRID_BINS }, (_, r) =>
      Array.from(phaseSpaceFidelityLoopGrid.subarray(r * GRID_BINS, (r + 1) * GRID_BINS)),
    ),
  },
  frontierBoundaryStates: calibratedFrontier.length > 0 ? calibratedFrontier : frontierCandidates,
  manifoldProjectionSamples: manifoldSamples,
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(summaryArtifact, null, 2) + "\n", "utf8");

if (asJson) {
  console.log(JSON.stringify(summaryArtifact, null, 2));
  process.exit(0);
}

console.log(
  "================================================================================================",
);
console.log(
  "  CXOS CONTINUOUS JOURNEY MANIFOLD, CONTEXT FIDELITY DECAY & A2A SPECTRAL FIELD ENGINE (R^16)",
);
console.log(
  "================================================================================================",
);
console.log(
  `  Scale Simulated      : ${scaleJourneys.toLocaleString()} continuous trajectories (${totalEventsProcessed.toLocaleString()} assimilated events)`,
);
console.log(
  `  Worker Threads       : ${workersUsed} parallel worker(s)  |  Compute Wall Time: ${elapsedMs.toFixed(2)} ms`,
);
console.log(
  `  Vector Throughput    : ${journeysPerSec.toLocaleString()} journeys/sec  |  ${eventsPerSec.toLocaleString()} events/sec`,
);
console.log(
  "------------------------------------------------------------------------------------------------",
);
console.log("  PLANE 1 & PLANE 2 — CONTINUOUS CONFORMANCE DRIFT & LYAPUNOV STABILITY FIELD");
console.log(
  `  Mahalanobis Drift D  : mean=${summaryArtifact.continuousFieldMetrics.mahalanobisDrift.mean}  p50=${summaryArtifact.continuousFieldMetrics.mahalanobisDrift.p50}  p95=${summaryArtifact.continuousFieldMetrics.mahalanobisDrift.p95}  p99=${summaryArtifact.continuousFieldMetrics.mahalanobisDrift.p99}`,
);
console.log(
  `  Wasserstein-2 Cost   : mean=${summaryArtifact.continuousFieldMetrics.wassersteinTransportCostMean}`,
);
console.log(
  `  Lyapunov Regimes     : Convergent=${summaryArtifact.continuousFieldMetrics.lyapunovStability.convergentSharePercent}%  |  Orbital=${summaryArtifact.continuousFieldMetrics.lyapunovStability.orbitalSharePercent}%  |  Divergent=${summaryArtifact.continuousFieldMetrics.lyapunovStability.divergentSharePercent}%`,
);
console.log(
  "------------------------------------------------------------------------------------------------",
);
console.log("  OMNICHANNEL CONTEXT FIDELITY TENSOR F(t) & A2A SPECTRAL FIELD");
console.log(
  `  Context Fidelity I/H : mean=${summaryArtifact.continuousFieldMetrics.omnichannelContextField.meanMutualInfoRetention}  p10=${summaryArtifact.continuousFieldMetrics.omnichannelContextField.p10Fidelity}  p50=${summaryArtifact.continuousFieldMetrics.omnichannelContextField.p50Fidelity}  p90=${summaryArtifact.continuousFieldMetrics.omnichannelContextField.p90Fidelity}`,
);
console.log(
  `  Context Entropy H(C) : mean=${summaryArtifact.continuousFieldMetrics.omnichannelContextField.meanShannonContextEntropy}  |  SIP Header Stripped=${summaryArtifact.continuousFieldMetrics.omnichannelContextField.sipHeaderStrippedIncidencePercent}%`,
);
console.log(
  `  A2A Boltzmann Entropy: mean=${summaryArtifact.continuousFieldMetrics.a2aSpectralField.meanBoltzmannEntropy}  p95=${summaryArtifact.continuousFieldMetrics.a2aSpectralField.p95BoltzmannEntropy}  |  Spectral Loop Energy=${summaryArtifact.continuousFieldMetrics.a2aSpectralField.meanSpectralLoopEnergy}`,
);
console.log(
  "------------------------------------------------------------------------------------------------",
);
console.log("  PLANE 3 — HAMILTONIAN / MPC CONTINUOUS CONTROL VECTOR BLEND u*(t) in [0, 1]^6");
for (const act of controlActionSummary) {
  console.log(
    `    ${act.id.padEnd(30)} mean_weight=${String(act.meanContinuousWeight).padEnd(8)} dominant_share=${String(act.primaryDominantShare).padStart(5)}% (${act.primaryDominantCount.toLocaleString()})`,
  );
}
console.log(
  "------------------------------------------------------------------------------------------------",
);
console.log("  A2A CONTINUOUS CAPABILITY FIELD — BOLTZMANN PROBABILITY MASS DISTRIBUTION");
for (const ag of a2aAgentFieldSummary) {
  console.log(
    `    ${ag.id.padEnd(34)} boltzmann_mass=${String(ag.meanBoltzmannWeight).padEnd(8)} top1_share=${String(ag.top1AssignmentShare).padStart(5)}%`,
  );
}
console.log(
  "================================================================================================",
);
console.log(`  Manifold summary written to: ${outFile}`);
