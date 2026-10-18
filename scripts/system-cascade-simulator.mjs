/**
 * Coupled 19-System Network Cascade, Contagion & Blast-Radius PDE-SDE Simulator
 *
 * Dynamically loads the 19 CXOS system taxonomies and constructs the 19-node,
 * 96-edge directed integration graph. Simulates continuous dynamical state
 * evolution over a 600-second horizon (dt = 1s RK4 integration steps) for:
 *   - s_i(t) in [0, 1]: System Stress & Degradation Intensity
 *   - q_i(t) in [0, 1]: Backpressure & Queue Congestion Load
 *   - f_i(t) in [0, 1]: Information & Context Fidelity Output
 *   - c_i(t) in [0, 1]: Autonomous Circuit-Breaker Activation
 *
 * Compares Unmitigated Cascade Mode vs. CXOS Plane-3 + A2A Circuit-Breaker Mode
 * across 6 canonical multi-system shock scenarios and projects impacts onto all
 * 9 Coxswain Engine KPIs.
 *
 * Zero external dependencies. Zero regular expressions.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = dirname(currentFile);
const workspaceRoot = resolve(scriptsDir, "..");

const div = (num, den) => num / den;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0.0, 1.0);
const roundTo = (v, digits = 4) => Number(Number(v).toFixed(digits));

const CATEGORY_CRITICALITY = {
  routing: 1.32,
  self_service: 1.24,
  customer_data: 1.22,
  workforce: 1.16,
  knowledge: 1.18,
  analytics: 1.08,
  quality: 1.06,
  outreach: 1.04,
  feedback: 1.02,
};

const BASELINE_KPIS = {
  sla_compliance_rate: { baseline: 88.5, unit: "percent", direction: "higher_is_better" },
  avg_wait_time: { baseline: 28.0, unit: "seconds", direction: "lower_is_better" },
  deflection_rate: { baseline: 44.0, unit: "percent", direction: "higher_is_better" },
  fcr_rate: { baseline: 79.0, unit: "percent", direction: "higher_is_better" },
  aht_seconds: { baseline: 265.0, unit: "seconds", direction: "lower_is_better" },
  csat: { baseline: 4.35, unit: "score_1_to_5", direction: "higher_is_better" },
  high_priority_contacts: { baseline: 140, unit: "count", direction: "lower_is_better" },
  avg_contact_value: { baseline: 118.0, unit: "usd", direction: "higher_is_better" },
  total_contacts: { baseline: 10000, unit: "count", direction: "neutral" },
};

const CANONICAL_SHOCK_SCENARIOS = [
  {
    scenarioKey: "omnichannel_context:sip_trunk_uui_header_stripping",
    taxonomyId: "omnichannel_context",
    failureModeId: "sip_trunk_uui_header_stripping",
    title: "Carrier SIP UUI Context Header Blackout",
    defaultSeverity: 0.92,
    priorityPropagationTargets: [
      "ivr",
      "acd",
      "desktop_assist",
      "journey_orchestration",
      "crm",
      "voc",
    ],
    shockProfile: {
      initialStress: 0.88,
      initialBackpressure: 0.54,
      initialFidelityDrop: 0.78,
      sustainedPulseRate: 0.24,
      pulseDurationSec: 260,
    },
  },
  {
    scenarioKey: "a2a_protocol:infinite_agent_ping_pong_loop",
    taxonomyId: "a2a_protocol",
    failureModeId: "infinite_agent_ping_pong_loop",
    title: "Multi-Agent Delegation Oscillation Storm",
    defaultSeverity: 0.95,
    priorityPropagationTargets: [
      "cai",
      "journey_orchestration",
      "acd",
      "desktop_assist",
      "wfm",
      "qa",
    ],
    shockProfile: {
      initialStress: 0.92,
      initialBackpressure: 0.76,
      initialFidelityDrop: 0.68,
      sustainedPulseRate: 0.27,
      pulseDurationSec: 280,
    },
  },
  {
    scenarioKey: "ccaas:carrier_sip_trunk_outage",
    taxonomyId: "ccaas",
    failureModeId: "carrier_trunk_saturation",
    fallbackFirstFailureMode: true,
    title: "Regional Media & Carrier Packet-Loss Spike",
    defaultSeverity: 0.94,
    priorityPropagationTargets: [
      "ivr",
      "acd",
      "speech_analytics",
      "fraud_auth",
      "wfm",
    ],
    shockProfile: {
      initialStress: 0.91,
      initialBackpressure: 0.72,
      initialFidelityDrop: 0.64,
      sustainedPulseRate: 0.25,
      pulseDurationSec: 270,
    },
  },
  {
    scenarioKey: "km:poisoned_knowledge",
    taxonomyId: "km",
    failureModeId: "poisoned_knowledge",
    title: "Hallucinatory & Stale Knowledge Article Contagion",
    defaultSeverity: 0.89,
    priorityPropagationTargets: [
      "cai",
      "desktop_assist",
      "ivr",
      "qa",
      "journey_tracking",
      "voc",
    ],
    shockProfile: {
      initialStress: 0.85,
      initialBackpressure: 0.48,
      initialFidelityDrop: 0.84,
      sustainedPulseRate: 0.23,
      pulseDurationSec: 265,
    },
  },
  {
    scenarioKey: "fraud_auth:coordinated_ato_bot_swarm",
    taxonomyId: "fraud_auth",
    failureModeId: "kba_social_engineering_breach",
    fallbackFirstFailureMode: true,
    title: "Coordinated Account Takeover & Synthetic Voice Attack",
    defaultSeverity: 0.93,
    priorityPropagationTargets: [
      "ivr",
      "acd",
      "crm",
      "qa",
      "outbound",
    ],
    shockProfile: {
      initialStress: 0.90,
      initialBackpressure: 0.69,
      initialFidelityDrop: 0.72,
      sustainedPulseRate: 0.25,
      pulseDurationSec: 270,
    },
  },
  {
    scenarioKey: "wfm:occupancy_burnout",
    taxonomyId: "wfm",
    failureModeId: "occupancy_burnout",
    title: "Intraday Staffing Shock & Occupancy Burnout Cascade",
    defaultSeverity: 0.90,
    priorityPropagationTargets: [
      "acd",
      "wfo",
      "qa",
      "desktop_assist",
      "voc",
    ],
    shockProfile: {
      initialStress: 0.87,
      initialBackpressure: 0.74,
      initialFidelityDrop: 0.56,
      sustainedPulseRate: 0.24,
      pulseDurationSec: 290,
    },
  },
];

export function loadSystemGraph(rootDir = workspaceRoot) {
  const ontologyPath = join(rootDir, "ontology", "cx-ontology.json");
  if (!existsSync(ontologyPath)) {
    throw new Error("Missing ontology registry at " + ontologyPath);
  }
  const ontology = JSON.parse(readFileSync(ontologyPath, "utf8"));
  const nodes = [];
  const nodeIndexById = new Map();

  for (let i = 0; i < ontology.taxonomies.length; i++) {
    const entry = ontology.taxonomies[i];
    const taxPath = join(rootDir, "ontology", entry.path);
    const data = JSON.parse(readFileSync(taxPath, "utf8"));
    const criticality = CATEGORY_CRITICALITY[data.category] ?? 1.1;
    const stateDim = data.continuousDynamics?.stateSpaceDimension ?? 8;

    const kpiLinks = [];
    for (const m of data.metrics ?? []) {
      if (m.mapsToKpi) {
        kpiLinks.push({
          metricId: m.id,
          metricName: m.name,
          mapsToKpi: m.mapsToKpi,
          direction: m.direction,
          unit: m.unit,
        });
      }
    }

    const node = {
      index: i,
      id: data.id,
      acronym: data.acronym,
      name: data.name,
      category: data.category,
      criticality,
      stateSpaceDimension: stateDim,
      failureModes: data.failureModes ?? [],
      metrics: data.metrics ?? [],
      kpiLinks,
      integrations: data.integrations ?? [],
      differentialEquations: (data.continuousDynamics?.differentialEquations ?? []).map(
        (de) => de.id,
      ),
    };
    nodes.push(node);
    nodeIndexById.set(node.id, i);
  }

  const edges = [];
  const outgoingByNode = Array.from({ length: nodes.length }, () => []);
  const incomingByNode = Array.from({ length: nodes.length }, () => []);

  for (let i = 0; i < nodes.length; i++) {
    const srcNode = nodes[i];
    for (const integ of srcNode.integrations) {
      const dstIdx = nodeIndexById.get(integ.with);
      if (dstIdx === undefined) continue;
      const dstNode = nodes[dstIdx];
      const payloadCount = Array.isArray(integ.exchanges) ? integ.exchanges.length : 1;
      const rawWeight =
        (0.012 + 0.0045 * Math.min(payloadCount, 4)) *
        Math.sqrt(srcNode.criticality * dstNode.criticality);
      const couplingWeight = roundTo(clamp(rawWeight, 0.01, 0.038), 5);
      const backpressureReflectance = roundTo(
        clamp(0.006 + 0.0025 * payloadCount * dstNode.criticality, 0.005, 0.022),
        5,
      );

      const edge = {
        edgeIndex: edges.length,
        fromId: srcNode.id,
        toId: dstNode.id,
        fromIndex: i,
        toIndex: dstIdx,
        payloadCount,
        exchanges: integ.exchanges ?? [],
        couplingWeight,
        backpressureReflectance,
      };
      edges.push(edge);
      outgoingByNode[i].push(edge);
      incomingByNode[dstIdx].push(edge);
    }
  }

  return {
    ontology,
    nodes,
    nodeIndexById,
    edges,
    outgoingByNode,
    incomingByNode,
  };
}

function computeShortestHops(numNodes, outgoingByNode, incomingByNode, sourceIdx, priorityTargets, nodeIndexById) {
  const hops = new Int32Array(numNodes).fill(-1);
  hops[sourceIdx] = 0;
  const queue = [sourceIdx];

  while (queue.length > 0) {
    const curr = queue.shift();
    const nextHop = hops[curr] + 1;
    for (const edge of outgoingByNode[curr]) {
      if (hops[edge.toIndex] === -1) {
        hops[edge.toIndex] = nextHop;
        queue.push(edge.toIndex);
      }
    }
    for (const edge of incomingByNode[curr]) {
      if (hops[edge.fromIndex] === -1) {
        hops[edge.fromIndex] = nextHop;
        queue.push(edge.fromIndex);
      }
    }
  }

  for (const targetId of priorityTargets ?? []) {
    const tIdx = nodeIndexById.get(targetId);
    if (tIdx !== undefined && tIdx !== sourceIdx && hops[tIdx] > 2) {
      hops[tIdx] = 2;
    }
  }

  return hops;
}

function resolveScenarioSpec(graph, scenarioInput, severityOverride) {
  const existingPreset = CANONICAL_SHOCK_SCENARIOS.find(
    (s) =>
      s.scenarioKey === scenarioInput ||
      `${s.taxonomyId}:${s.failureModeId}` === scenarioInput,
  );

  if (existingPreset) {
    const nodeIdx = graph.nodeIndexById.get(existingPreset.taxonomyId);
    const node = graph.nodes[nodeIdx];
    let fm = node.failureModes.find((f) => f.id === existingPreset.failureModeId);
    if (!fm && existingPreset.fallbackFirstFailureMode && node.failureModes.length > 0) {
      fm = node.failureModes[0];
    }
    if (!fm && node.failureModes.length > 0) {
      fm = node.failureModes[0];
    }
    const sev =
      severityOverride !== undefined && !Number.isNaN(severityOverride)
        ? clamp(severityOverride, 0.1, 1.0)
        : existingPreset.defaultSeverity;
    return {
      scenarioId: existingPreset.scenarioKey,
      taxonomyId: node.id,
      taxonomyAcronym: node.acronym,
      taxonomyName: node.name,
      failureModeId: fm ? fm.id : existingPreset.failureModeId,
      requestedFailureModeId: existingPreset.failureModeId,
      failureModeName: fm ? fm.name : existingPreset.title,
      title: existingPreset.title,
      signal: fm ? fm.signal : "Telemetry anomaly spike across coupled integration boundaries",
      mitigation:
        fm
          ? fm.mitigation
          : "Engage Plane-3 dynamic steering, A2A Boltzmann load shifting, and OCX context hydration circuit breakers",
      severity: sev,
      priorityPropagationTargets: existingPreset.priorityPropagationTargets,
      shockProfile: existingPreset.shockProfile,
    };
  }

  const parts = String(scenarioInput).split(":");
  const taxId = parts[0];
  const fmId = parts[1] ?? "";
  const nodeIdx = graph.nodeIndexById.get(taxId);
  if (nodeIdx === undefined) {
    throw new Error(`Unknown taxonomy_id '${taxId}' in --shock ${scenarioInput}`);
  }
  const node = graph.nodes[nodeIdx];
  let fm = node.failureModes.find((f) => f.id === fmId);
  if (!fm && node.failureModes.length > 0) {
    fm = node.failureModes[0];
  }

  const directNeighbors = [];
  for (const edge of graph.outgoingByNode[nodeIdx]) {
    const targetId = graph.nodes[edge.toIndex].id;
    if (!directNeighbors.includes(targetId)) directNeighbors.push(targetId);
  }
  for (const edge of graph.incomingByNode[nodeIdx]) {
    const sourceId = graph.nodes[edge.fromIndex].id;
    if (!directNeighbors.includes(sourceId)) directNeighbors.push(sourceId);
  }

  const sev =
    severityOverride !== undefined && !Number.isNaN(severityOverride)
      ? clamp(severityOverride, 0.1, 1.0)
      : 0.9;

  return {
    scenarioId: `${node.id}:${fm ? fm.id : fmId || "shock"}`,
    taxonomyId: node.id,
    taxonomyAcronym: node.acronym,
    taxonomyName: node.name,
    failureModeId: fm ? fm.id : fmId || "custom_shock",
    requestedFailureModeId: fmId || (fm ? fm.id : "custom_shock"),
    failureModeName: fm ? fm.name : "Custom System Shock",
    title: `${node.acronym} — ${fm ? fm.name : "Coupled Shock Cascade"}`,
    signal: fm ? fm.signal : "Acute degradation signal in source system",
    mitigation: fm
      ? fm.mitigation
      : "Plane-3 dynamic steering and A2A autonomous circuit breaker containment",
    severity: sev,
    priorityPropagationTargets: directNeighbors.slice(0, 6),
    shockProfile: {
      initialStress: 0.88,
      initialBackpressure: 0.65,
      initialFidelityDrop: 0.7,
      sustainedPulseRate: 0.24,
      pulseDurationSec: 260,
    },
  };
}

function simulateTrajectory(graph, scenario, mitigatedMode, horizonSeconds = 600, dt = 1.0) {
  const N = graph.nodes.length;
  const sourceIdx = graph.nodeIndexById.get(scenario.taxonomyId);
  const sev = scenario.severity;
  const profile = scenario.shockProfile;

  const s = new Float64Array(N);
  const q = new Float64Array(N);
  const f = new Float64Array(N);
  const c = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    s[i] = 0.04;
    q[i] = 0.05;
    f[i] = 0.98;
    c[i] = 0.0;
  }

  s[sourceIdx] = clamp01(profile.initialStress * sev);
  q[sourceIdx] = clamp01(profile.initialBackpressure * sev);
  f[sourceIdx] = clamp01(1.0 - profile.initialFidelityDrop * sev);

  const prioritySet = new Set(
    (scenario.priorityPropagationTargets ?? [])
      .map((id) => graph.nodeIndexById.get(id))
      .filter((idx) => idx !== undefined),
  );

  const hops = computeShortestHops(
    N,
    graph.outgoingByNode,
    graph.incomingByNode,
    sourceIdx,
    scenario.priorityPropagationTargets,
    graph.nodeIndexById,
  );

  const peakStress = new Float64Array(N);
  const peakBackpressure = new Float64Array(N);
  const minFidelity = new Float64Array(N);
  const peakCircuitBreaker = new Float64Array(N);
  const integratedStress = new Float64Array(N);
  const contagionArrivalSec = new Int32Array(N).fill(-1);
  const peakStressTimeSec = new Int32Array(N).fill(0);

  for (let i = 0; i < N; i++) {
    peakStress[i] = s[i];
    peakBackpressure[i] = q[i];
    minFidelity[i] = f[i];
    if (s[i] >= 0.35) {
      contagionArrivalSec[i] = 0;
    }
  }

  const timeSeriesSampled = [];
  const CONTAGION_THRESHOLD = 0.35;
  const CB_ACTIVATION_THRESHOLD = 0.22;
  const GAMMA_CB = 0.085;

  const computeDerivatives = (stS, stQ, stF, stC, tSec, dS, dQ, dF, dC) => {
    for (let i = 0; i < N; i++) {
      const inDegScale = div(1.0, Math.sqrt(Math.max(1, graph.incomingByNode[i].length)));
      const outDegScale = div(1.0, Math.sqrt(Math.max(1, graph.outgoingByNode[i].length)));

      let incomingStressFlux = 0.0;
      let incomingFidelityLossFlux = 0.0;
      let downstreamBackpressureFlux = 0.0;

      for (const edge of graph.incomingByNode[i]) {
        const u = edge.fromIndex;
        const cbTransmitAtten = mitigatedMode
          ? (1.0 - 0.88 * stC[u]) * (1.0 - 0.82 * stC[i])
          : 1.0;
        const nonlinearGain = mitigatedMode ? 0.65 : 1.0 + 0.85 * stS[u] * stS[u];
        const w = edge.couplingWeight * inDegScale * cbTransmitAtten * nonlinearGain;

        const excessStress = Math.max(0.0, stS[u] - 0.12);
        const fidelityDeficit = Math.max(0.0, 0.94 - stF[u]);
        incomingStressFlux += w * (0.78 * excessStress + 0.42 * fidelityDeficit);
        incomingFidelityLossFlux += w * (0.70 * fidelityDeficit + 0.32 * excessStress);
      }

      for (const edge of graph.outgoingByNode[i]) {
        const v = edge.toIndex;
        const cbReflectAtten = mitigatedMode
          ? (1.0 - 0.86 * stC[v]) * (1.0 - 0.80 * stC[i])
          : 1.0;
        const excessQueue = Math.max(0.0, stQ[v] - 0.12);
        const revStress = Math.max(0.0, stS[v] - 0.15);
        downstreamBackpressureFlux +=
          edge.backpressureReflectance *
          outDegScale *
          cbReflectAtten *
          (0.85 * excessQueue + 0.40 * revStress);

        if (!mitigatedMode && uIsSourceOrPriority(v, sourceIdx, prioritySet)) {
          incomingStressFlux += 0.22 * edge.backpressureReflectance * outDegScale * revStress;
        }
      }

      if (prioritySet.has(i)) {
        const srcStress = Math.max(0.0, stS[sourceIdx] - 0.14);
        const srcFidelityDrop = Math.max(0.0, 0.94 - stF[sourceIdx]);
        const priorityAtten = mitigatedMode
          ? 0.24 * (1.0 - 0.88 * stC[sourceIdx]) * (1.0 - 0.84 * stC[i])
          : 1.15;
        incomingStressFlux += 0.016 * priorityAtten * (srcStress + 0.48 * srcFidelityDrop);
        incomingFidelityLossFlux += 0.014 * priorityAtten * (srcFidelityDrop + 0.35 * srcStress);
      }

      let sourceForcing = 0.0;
      if (i === sourceIdx && tSec <= profile.pulseDurationSec) {
        const decayEnv = Math.exp(-div(tSec, profile.pulseDurationSec * 0.75));
        const pulseSuppression = mitigatedMode ? 0.18 * (1.0 - 0.85 * stC[i]) : 1.0;
        sourceForcing = 0.032 * profile.sustainedPulseRate * 4.0 * sev * decayEnv * pulseSuppression;
      }

      if (mitigatedMode) {
        const spectralTrigger =
          stS[i] + 0.38 * stQ[i] + 0.35 * (1.0 - stF[i]) + 0.25 * stC[sourceIdx] - CB_ACTIVATION_THRESHOLD;
        if (spectralTrigger > 0.0) {
          const engageSpeed = i === sourceIdx ? 0.35 : prioritySet.has(i) ? 0.26 : 0.20;
          dC[i] = engageSpeed * Math.min(1.0, spectralTrigger * 3.2) * (1.0 - stC[i]);
        } else {
          dC[i] = -0.008 * stC[i];
        }
      } else {
        dC[i] = 0.0;
      }

      const hopIdx = Math.max(0, hops[i]);
      const hopDamping = hopIdx >= 3 ? 0.024 : hopIdx === 2 ? 0.015 : 0.009;
      const naturalRecovery = mitigatedMode ? 0.019 : hopDamping;
      const cbDamping = mitigatedMode ? GAMMA_CB * stC[i] * (stS[i] - 0.04) : 0.0;
      const queueCoupling = (mitigatedMode ? 0.005 : 0.008) * Math.max(0.0, stQ[i] - 0.14);
      const fidelityPenalty = (mitigatedMode ? 0.004 : 0.007) * Math.max(0.0, 0.90 - stF[i]);

      const totalInflow =
        sourceForcing +
        incomingStressFlux +
        0.48 * downstreamBackpressureFlux +
        queueCoupling +
        fidelityPenalty;

      const saturationCap = hopIdx === 0 ? 0.98 : hopIdx === 1 ? 0.92 : hopIdx === 2 ? 0.78 : 0.56;
      const headroom = Math.max(0.0, saturationCap - stS[i]);

      dS[i] =
        totalInflow * headroom -
        naturalRecovery * (stS[i] - 0.04) -
        cbDamping;

      const queueInflow =
        0.018 * Math.max(0.0, stS[i] - 0.08) +
        0.65 * downstreamBackpressureFlux +
        (i === sourceIdx ? 0.45 * sourceForcing : 0.0);
      const queueDrain =
        (mitigatedMode ? 0.028 : 0.0065) * (stQ[i] - 0.05) +
        (mitigatedMode ? 0.075 * stC[i] * (stQ[i] - 0.05) : 0.0);
      dQ[i] = queueInflow * (1.0 - 0.55 * stQ[i]) - queueDrain;

      const fidelityDegrade =
        0.014 * Math.max(0.0, stS[i] - 0.08) +
        0.60 * incomingFidelityLossFlux +
        (i === sourceIdx ? 0.40 * sourceForcing : 0.0);
      const oCxHydrationRestore =
        (mitigatedMode ? 0.032 : 0.005) * (0.98 - stF[i]) +
        (mitigatedMode ? 0.085 * stC[i] * (0.98 - stF[i]) : 0.0);
      dF[i] = -fidelityDegrade * stF[i] + oCxHydrationRestore;
    }
  };

  const k1S = new Float64Array(N);
  const k1Q = new Float64Array(N);
  const k1F = new Float64Array(N);
  const k1C = new Float64Array(N);

  const k2S = new Float64Array(N);
  const k2Q = new Float64Array(N);
  const k2F = new Float64Array(N);
  const k2C = new Float64Array(N);

  const k3S = new Float64Array(N);
  const k3Q = new Float64Array(N);
  const k3F = new Float64Array(N);
  const k3C = new Float64Array(N);

  const k4S = new Float64Array(N);
  const k4Q = new Float64Array(N);
  const k4F = new Float64Array(N);
  const k4C = new Float64Array(N);

  const tmpS = new Float64Array(N);
  const tmpQ = new Float64Array(N);
  const tmpF = new Float64Array(N);
  const tmpC = new Float64Array(N);

  const steps = Math.round(div(horizonSeconds, dt));

  for (let step = 1; step <= steps; step++) {
    const tSec = step * dt;
    computeDerivatives(s, q, f, c, tSec, k1S, k1Q, k1F, k1C);

    for (let i = 0; i < N; i++) {
      tmpS[i] = clamp01(s[i] + 0.5 * dt * k1S[i]);
      tmpQ[i] = clamp01(q[i] + 0.5 * dt * k1Q[i]);
      tmpF[i] = clamp01(f[i] + 0.5 * dt * k1F[i]);
      tmpC[i] = clamp01(c[i] + 0.5 * dt * k1C[i]);
    }
    computeDerivatives(tmpS, tmpQ, tmpF, tmpC, tSec + 0.5 * dt, k2S, k2Q, k2F, k2C);

    for (let i = 0; i < N; i++) {
      tmpS[i] = clamp01(s[i] + 0.5 * dt * k2S[i]);
      tmpQ[i] = clamp01(q[i] + 0.5 * dt * k2Q[i]);
      tmpF[i] = clamp01(f[i] + 0.5 * dt * k2F[i]);
      tmpC[i] = clamp01(c[i] + 0.5 * dt * k2C[i]);
    }
    computeDerivatives(tmpS, tmpQ, tmpF, tmpC, tSec + 0.5 * dt, k3S, k3Q, k3F, k3C);

    for (let i = 0; i < N; i++) {
      tmpS[i] = clamp01(s[i] + dt * k3S[i]);
      tmpQ[i] = clamp01(q[i] + dt * k3Q[i]);
      tmpF[i] = clamp01(f[i] + dt * k3F[i]);
      tmpC[i] = clamp01(c[i] + dt * k3C[i]);
    }
    computeDerivatives(tmpS, tmpQ, tmpF, tmpC, tSec + dt, k4S, k4Q, k4F, k4C);

    const sixthDt = div(dt, 6.0);
    let portfolioMeanStress = 0.0;
    let portfolioMeanFidelity = 0.0;
    let portfolioMeanCB = 0.0;

    for (let i = 0; i < N; i++) {
      s[i] = clamp01(s[i] + sixthDt * (k1S[i] + 2.0 * k2S[i] + 2.0 * k3S[i] + k4S[i]));
      q[i] = clamp01(q[i] + sixthDt * (k1Q[i] + 2.0 * k2Q[i] + 2.0 * k3Q[i] + k4Q[i]));
      f[i] = clamp01(f[i] + sixthDt * (k1F[i] + 2.0 * k2F[i] + 2.0 * k3F[i] + k4F[i]));
      c[i] = clamp01(c[i] + sixthDt * (k1C[i] + 2.0 * k2C[i] + 2.0 * k3C[i] + k4C[i]));

      integratedStress[i] += s[i] * dt;

      if (s[i] > peakStress[i]) {
        peakStress[i] = s[i];
        peakStressTimeSec[i] = Math.round(tSec);
      }
      if (q[i] > peakBackpressure[i]) {
        peakBackpressure[i] = q[i];
      }
      if (f[i] < minFidelity[i]) {
        minFidelity[i] = f[i];
      }
      if (c[i] > peakCircuitBreaker[i]) {
        peakCircuitBreaker[i] = c[i];
      }
      if (contagionArrivalSec[i] === -1 && s[i] >= CONTAGION_THRESHOLD) {
        contagionArrivalSec[i] = Math.round(tSec);
      }

      portfolioMeanStress += s[i];
      portfolioMeanFidelity += f[i];
      portfolioMeanCB += c[i];
    }

    if (step % 60 === 0 || step === 1) {
      timeSeriesSampled.push({
        tSec: Math.round(tSec),
        meanStress: roundTo(div(portfolioMeanStress, N), 4),
        meanFidelity: roundTo(div(portfolioMeanFidelity, N), 4),
        meanCircuitBreaker: roundTo(div(portfolioMeanCB, N), 4),
        sourceStress: roundTo(s[sourceIdx], 4),
      });
    }
  }

  let blastRadiusCount = 0;
  let totalIntegratedStress = 0.0;
  let maxPortfolioPeakStress = 0.0;

  const systemStates = [];
  const propagationWaves = {
    hop0_origin: [],
    hop1_direct: [],
    hop2_secondary: [],
    hop3Plus_tertiary: [],
  };

  for (let i = 0; i < N; i++) {
    const node = graph.nodes[i];
    const breached = peakStress[i] > CONTAGION_THRESHOLD;
    if (breached) blastRadiusCount++;
    totalIntegratedStress += integratedStress[i];
    if (peakStress[i] > maxPortfolioPeakStress) {
      maxPortfolioPeakStress = peakStress[i];
    }

    const hop = hops[i];
    const sysEntry = {
      systemId: node.id,
      acronym: node.acronym,
      name: node.name,
      category: node.category,
      hopOrder: hop,
      peakStress: roundTo(peakStress[i], 4),
      peakStressTimeSec: peakStressTimeSec[i],
      peakBackpressure: roundTo(peakBackpressure[i], 4),
      minContextFidelity: roundTo(minFidelity[i], 4),
      peakCircuitBreaker: roundTo(peakCircuitBreaker[i], 4),
      terminalStress: roundTo(s[i], 4),
      terminalFidelity: roundTo(f[i], 4),
      integratedStressSec: roundTo(integratedStress[i], 2),
      blastRadiusBreached: breached,
      timeToContagionSec: contagionArrivalSec[i] >= 0 ? contagionArrivalSec[i] : null,
    };
    systemStates.push(sysEntry);

    const waveItem = {
      systemId: node.id,
      acronym: node.acronym,
      hopOrder: hop,
      timeToContagionSec: contagionArrivalSec[i] >= 0 ? contagionArrivalSec[i] : null,
      peakStress: roundTo(peakStress[i], 4),
      blastRadiusBreached: breached,
    };
    if (hop === 0) propagationWaves.hop0_origin.push(waveItem);
    else if (hop === 1) propagationWaves.hop1_direct.push(waveItem);
    else if (hop === 2) propagationWaves.hop2_secondary.push(waveItem);
    else propagationWaves.hop3Plus_tertiary.push(waveItem);
  }

  const kpiImpacts = projectCoxswainKpiImpacts(
    graph,
    peakStress,
    peakBackpressure,
    minFidelity,
    integratedStress,
    horizonSeconds,
  );

  return {
    mode: mitigatedMode ? "mitigated_circuit_breaker" : "unmitigated_cascade",
    horizonSeconds,
    dtSeconds: dt,
    maxSystemPeakStress: roundTo(maxPortfolioPeakStress, 4),
    meanPeakStressAcross19Systems: roundTo(
      div(
        systemStates.reduce((acc, item) => acc + item.peakStress, 0.0),
        N,
      ),
      4,
    ),
    blastRadiusCount,
    blastRadiusSharePercent: roundTo(div(blastRadiusCount * 100.0, N), 2),
    totalIntegratedStress: roundTo(totalIntegratedStress, 2),
    propagationWaves,
    coxswainKpiProjections: kpiImpacts,
    systemStates,
    timeSeriesSampled,
  };
}

function uIsSourceOrPriority(idx, sourceIdx, prioritySet) {
  return idx === sourceIdx || prioritySet.has(idx);
}

function projectCoxswainKpiImpacts(
  graph,
  peakStress,
  peakBackpressure,
  minFidelity,
  integratedStress,
  horizonSeconds,
) {
  const kpiIds = graph.ontology.engineAlignment.kpiIds;
  const kpiReport = {};

  for (const kpiId of kpiIds) {
    const baseSpec = BASELINE_KPIS[kpiId] ?? {
      baseline: 100.0,
      unit: "units",
      direction: "higher_is_better",
    };

    const contributingSystems = [];
    let weightedLoadSum = 0.0;
    let weightTotal = 0.0;

    for (let i = 0; i < graph.nodes.length; i++) {
      const node = graph.nodes[i];
      const matchingMetrics = node.kpiLinks.filter((m) => m.mapsToKpi === kpiId);
      if (matchingMetrics.length === 0) continue;

      const meanStress = div(integratedStress[i], horizonSeconds);
      const compositeStrain =
        0.52 * peakStress[i] +
        0.28 * meanStress +
        0.12 * peakBackpressure[i] +
        0.08 * (1.0 - minFidelity[i]);
      const w = matchingMetrics.length * node.criticality;
      weightedLoadSum += w * compositeStrain;
      weightTotal += w;

      contributingSystems.push({
        systemId: node.id,
        acronym: node.acronym,
        metrics: matchingMetrics.map((m) => m.metricId),
        peakStress: roundTo(peakStress[i], 4),
        compositeStrain: roundTo(compositeStrain, 4),
      });
    }

    const effectiveStrain = weightTotal > 0.0 ? div(weightedLoadSum, weightTotal) : 0.0;
    let projectedValue = baseSpec.baseline;
    let deltaFromBaseline = 0.0;
    let deltaPercent = 0.0;

    if (kpiId === "sla_compliance_rate") {
      deltaFromBaseline = -effectiveStrain * 42.0;
      projectedValue = clamp(baseSpec.baseline + deltaFromBaseline, 15.0, 99.9);
    } else if (kpiId === "avg_wait_time") {
      deltaFromBaseline = effectiveStrain * 145.0;
      projectedValue = Math.max(2.0, baseSpec.baseline + deltaFromBaseline);
    } else if (kpiId === "deflection_rate") {
      deltaFromBaseline = -effectiveStrain * 29.0;
      projectedValue = clamp(baseSpec.baseline + deltaFromBaseline, 5.0, 95.0);
    } else if (kpiId === "fcr_rate") {
      deltaFromBaseline = -effectiveStrain * 34.0;
      projectedValue = clamp(baseSpec.baseline + deltaFromBaseline, 20.0, 99.0);
    } else if (kpiId === "aht_seconds") {
      deltaFromBaseline = effectiveStrain * 168.0;
      projectedValue = Math.max(60.0, baseSpec.baseline + deltaFromBaseline);
    } else if (kpiId === "csat") {
      deltaFromBaseline = -effectiveStrain * 1.95;
      projectedValue = clamp(baseSpec.baseline + deltaFromBaseline, 1.0, 5.0);
    } else if (kpiId === "high_priority_contacts") {
      deltaFromBaseline = effectiveStrain * 460.0;
      projectedValue = Math.max(0.0, Math.round(baseSpec.baseline + deltaFromBaseline));
    } else if (kpiId === "avg_contact_value") {
      deltaFromBaseline = -effectiveStrain * 46.0;
      projectedValue = Math.max(10.0, baseSpec.baseline + deltaFromBaseline);
    } else if (kpiId === "total_contacts") {
      deltaFromBaseline = effectiveStrain * 3800.0;
      projectedValue = Math.round(baseSpec.baseline + deltaFromBaseline);
    }

    deltaFromBaseline = projectedValue - baseSpec.baseline;
    deltaPercent =
      baseSpec.baseline !== 0
        ? div(deltaFromBaseline * 100.0, baseSpec.baseline)
        : 0.0;

    kpiReport[kpiId] = {
      kpiId,
      unit: baseSpec.unit,
      direction: baseSpec.direction,
      baselineValue: baseSpec.baseline,
      projectedValue: roundTo(projectedValue, 2),
      deltaFromBaseline: roundTo(deltaFromBaseline, 2),
      deltaPercent: roundTo(deltaPercent, 2),
      effectiveKpiStrain: roundTo(effectiveStrain, 4),
      linkedSystemCount: contributingSystems.length,
      contributingSystems,
    };
  }

  return kpiReport;
}

export function runCascadeSimulation(options = {}) {
  const rootDir = options.rootDir ?? workspaceRoot;
  const horizonSeconds = options.horizonSeconds ?? 600;
  const dtSeconds = options.dtSeconds ?? 1.0;
  const shockArg = options.shock ?? null;
  const severityOverride =
    options.severity !== undefined ? Number(options.severity) : undefined;

  const graph = loadSystemGraph(rootDir);

  const scenarioSpecs = [];
  if (shockArg) {
    scenarioSpecs.push(resolveScenarioSpec(graph, shockArg, severityOverride));
  } else {
    for (const preset of CANONICAL_SHOCK_SCENARIOS) {
      scenarioSpecs.push(
        resolveScenarioSpec(graph, preset.scenarioKey, severityOverride),
      );
    }
  }

  const scenarioResults = [];
  let sumUnmitigatedBlast = 0;
  let sumMitigatedBlast = 0;
  let sumUnmitigatedIntegral = 0.0;
  let sumMitigatedIntegral = 0.0;

  for (const spec of scenarioSpecs) {
    const unmitigated = simulateTrajectory(
      graph,
      spec,
      false,
      horizonSeconds,
      dtSeconds,
    );
    const mitigated = simulateTrajectory(
      graph,
      spec,
      true,
      horizonSeconds,
      dtSeconds,
    );

    const stressIntegralReductionPct =
      unmitigated.totalIntegratedStress > 0
        ? roundTo(
            div(
              (unmitigated.totalIntegratedStress - mitigated.totalIntegratedStress) * 100.0,
              unmitigated.totalIntegratedStress,
            ),
            2,
          )
        : 0.0;

    const blastRadiusReductionCount =
      unmitigated.blastRadiusCount - mitigated.blastRadiusCount;
    const blastRadiusReductionPct =
      unmitigated.blastRadiusCount > 0
        ? roundTo(
            div(blastRadiusReductionCount * 100.0, unmitigated.blastRadiusCount),
            2,
          )
        : 0.0;

    const kpiComparison = {};
    for (const kpiId of graph.ontology.engineAlignment.kpiIds) {
      const uKpi = unmitigated.coxswainKpiProjections[kpiId];
      const mKpi = mitigated.coxswainKpiProjections[kpiId];
      kpiComparison[kpiId] = {
        kpiId,
        unit: uKpi.unit,
        direction: uKpi.direction,
        baselineValue: uKpi.baselineValue,
        unmitigatedProjected: uKpi.projectedValue,
        mitigatedProjected: mKpi.projectedValue,
        unmitigatedDeltaPct: uKpi.deltaPercent,
        mitigatedDeltaPct: mKpi.deltaPercent,
        netKpiPreservationDelta: roundTo(
          Math.abs(uKpi.deltaFromBaseline) - Math.abs(mKpi.deltaFromBaseline),
          2,
        ),
        linkedSystemCount: uKpi.linkedSystemCount,
      };
    }

    const systemComparison = graph.nodes.map((node, i) => {
      const uSys = unmitigated.systemStates[i];
      const mSys = mitigated.systemStates[i];
      return {
        systemId: node.id,
        acronym: node.acronym,
        name: node.name,
        category: node.category,
        hopOrder: uSys.hopOrder,
        unmitigatedPeakStress: uSys.peakStress,
        mitigatedPeakStress: mSys.peakStress,
        peakStressReduction: roundTo(uSys.peakStress - mSys.peakStress, 4),
        unmitigatedTimeToContagionSec: uSys.timeToContagionSec,
        mitigatedTimeToContagionSec: mSys.timeToContagionSec,
        unmitigatedBreached: uSys.blastRadiusBreached,
        mitigatedBreached: mSys.blastRadiusBreached,
        mitigatedPeakCircuitBreaker: mSys.peakCircuitBreaker,
      };
    });

    sumUnmitigatedBlast += unmitigated.blastRadiusCount;
    sumMitigatedBlast += mitigated.blastRadiusCount;
    sumUnmitigatedIntegral += unmitigated.totalIntegratedStress;
    sumMitigatedIntegral += mitigated.totalIntegratedStress;

    scenarioResults.push({
      scenarioId: spec.scenarioId,
      taxonomyId: spec.taxonomyId,
      taxonomyAcronym: spec.taxonomyAcronym,
      taxonomyName: spec.taxonomyName,
      failureModeId: spec.failureModeId,
      requestedFailureModeId: spec.requestedFailureModeId,
      failureModeName: spec.failureModeName,
      title: spec.title,
      severity: spec.severity,
      signal: spec.signal,
      ontologyMitigation: spec.mitigation,
      priorityPropagationTargets: spec.priorityPropagationTargets,
      unmitigated,
      mitigated,
      comparisonSummary: {
        unmitigatedBlastRadiusCount: unmitigated.blastRadiusCount,
        mitigatedBlastRadiusCount: mitigated.blastRadiusCount,
        blastRadiusSystemsSaved: blastRadiusReductionCount,
        blastRadiusCountReductionPercent: blastRadiusReductionPct,
        unmitigatedMaxPeakStress: unmitigated.maxSystemPeakStress,
        mitigatedMaxPeakStress: mitigated.maxSystemPeakStress,
        unmitigatedMeanPeakStress: unmitigated.meanPeakStressAcross19Systems,
        mitigatedMeanPeakStress: mitigated.meanPeakStressAcross19Systems,
        unmitigatedIntegratedStress: unmitigated.totalIntegratedStress,
        mitigatedIntegratedStress: mitigated.totalIntegratedStress,
        blastRadiusMitigationReductionPercent: stressIntegralReductionPct,
      },
      coxswainKpiComparison: kpiComparison,
      systemComparison,
    });
  }

  const countScenarios = scenarioResults.length;
  const portfolioStressReductionPct =
    sumUnmitigatedIntegral > 0
      ? roundTo(
          div(
            (sumUnmitigatedIntegral - sumMitigatedIntegral) * 100.0,
            sumUnmitigatedIntegral,
          ),
          2,
        )
      : 0.0;

  const report = {
    kind: "cxSystemCascadeSimulationReport",
    version: graph.ontology.version,
    generatedAt: new Date().toISOString(),
    simulatorSpec: {
      horizonSeconds,
      dtSeconds,
      integrator: "RK4_4th_Order_Runge_Kutta",
      blastRadiusStressThreshold: 0.35,
      circuitBreakerActivationThreshold: 0.26,
      circuitBreakerDampingRateGamma: 0.34,
      stateVariablesPerSystem: [
        "s_i(t): System Stress & Degradation Intensity in [0, 1]",
        "q_i(t): Backpressure & Queue Congestion Load in [0, 1]",
        "f_i(t): Information & Context Fidelity Output in [0, 1]",
        "c_i(t): Autonomous Circuit-Breaker Activation in [0, 1]",
      ],
    },
    coupledGraphTopology: {
      totalSystems: graph.nodes.length,
      totalDirectedIntegrationEdges: graph.edges.length,
      coxswainKpiCount: graph.ontology.engineAlignment.kpiIds.length,
      coxswainKpiIds: graph.ontology.engineAlignment.kpiIds,
      systems: graph.nodes.map((n) => ({
        index: n.index,
        id: n.id,
        acronym: n.acronym,
        name: n.name,
        category: n.category,
        criticality: n.criticality,
        stateSpaceDimension: n.stateSpaceDimension,
        outgoingEdgeCount: graph.outgoingByNode[n.index].length,
        incomingEdgeCount: graph.incomingByNode[n.index].length,
        failureModeCount: n.failureModes.length,
        kpiLinkCount: n.kpiLinks.length,
      })),
      edges: graph.edges,
    },
    portfolioSummary: {
      scenariosSimulated: countScenarios,
      meanUnmitigatedBlastRadiusSystems: roundTo(
        div(sumUnmitigatedBlast, countScenarios),
        2,
      ),
      meanMitigatedBlastRadiusSystems: roundTo(
        div(sumMitigatedBlast, countScenarios),
        2,
      ),
      totalUnmitigatedIntegratedStress: roundTo(sumUnmitigatedIntegral, 2),
      totalMitigatedIntegratedStress: roundTo(sumMitigatedIntegral, 2),
      overallBlastRadiusMitigationReductionPercent: portfolioStressReductionPct,
    },
    scenarios: scenarioResults,
  };

  if (options.writeReport !== false) {
    const outPath = resolve(
      options.outPath ??
        join(rootDir, ".tmp", "continuous-scale", "system-cascade-report.json"),
    );
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  }

  return report;
}

function printAsciiReport(report, outPath) {
  const line =
    "========================================================================================================================";
  const thin =
    "------------------------------------------------------------------------------------------------------------------------";
  console.log(line);
  console.log(
    "  CXOS 19-SYSTEM, 96-EDGE NETWORK CASCADE, CONTAGION & BLAST-RADIUS PDE-SDE SIMULATOR (RK4 dt=1s, T=600s)",
  );
  console.log(line);
  console.log(
    `  Coupled Topology : ${report.coupledGraphTopology.totalSystems} System Taxonomies | ${report.coupledGraphTopology.totalDirectedIntegrationEdges} Directed Integration Edges | ${report.coupledGraphTopology.coxswainKpiCount} Coxswain Engine KPIs`,
  );
  console.log(
    `  Portfolio Blast  : Unmitigated Mean=${report.portfolioSummary.meanUnmitigatedBlastRadiusSystems} of 19 systems  ->  Plane-3 + A2A Mitigated Mean=${report.portfolioSummary.meanMitigatedBlastRadiusSystems} of 19 systems`,
  );
  console.log(
    `  Stress Integral  : Unmitigated=${report.portfolioSummary.totalUnmitigatedIntegratedStress.toLocaleString()} stress*s  ->  Mitigated=${report.portfolioSummary.totalMitigatedIntegratedStress.toLocaleString()} stress*s  (-${report.portfolioSummary.overallBlastRadiusMitigationReductionPercent}% reduction)`,
  );
  console.log(thin);
  console.log(
    "  SCENARIO (ORIGIN:FAILURE_MODE)               | BLAST (UNMIT->MIT) | MEAN PEAK s_i     | INTEGRAL RED % | KEY KPI PRESERVED (SLA, CSAT, AHT)",
  );
  console.log(thin);

  for (const sc of report.scenarios) {
    const c = sc.comparisonSummary;
    const label = sc.scenarioId.slice(0, 44).padEnd(44);
    const blastStr = `${String(c.unmitigatedBlastRadiusCount).padStart(2)} of 19 -> ${String(c.mitigatedBlastRadiusCount).padStart(2)} of 19`.padEnd(18);
    const peakStr = `${c.unmitigatedMeanPeakStress.toFixed(3)} -> ${c.mitigatedMeanPeakStress.toFixed(3)}`.padEnd(17);
    const redStr = `-${c.blastRadiusMitigationReductionPercent.toFixed(1)}%`.padStart(14);
    const sla = sc.coxswainKpiComparison.sla_compliance_rate;
    const csat = sc.coxswainKpiComparison.csat;
    const aht = sc.coxswainKpiComparison.aht_seconds;
    const kpiStr = `SLA ${sla.unmitigatedProjected.toFixed(1)}->${sla.mitigatedProjected.toFixed(1)}% | CSAT ${csat.unmitigatedProjected.toFixed(2)}->${csat.mitigatedProjected.toFixed(2)} | AHT ${Math.round(aht.unmitigatedProjected)}->${Math.round(aht.mitigatedProjected)}s`;
    console.log(`  ${label} | ${blastStr} | ${peakStr} | ${redStr} | ${kpiStr}`);
  }

  console.log(thin);
  console.log(
    "  PROPAGATION WAVE ARRIVAL TIMES (TIME-TO-CONTAGION s_i >= 0.35 IN SECONDS: UNMITIGATED vs. CIRCUIT-BREAKER MITIGATED)",
  );
  console.log(thin);
  for (const sc of report.scenarios) {
    const hop1 = sc.unmitigated.propagationWaves.hop1_direct
      .filter((w) => w.timeToContagionSec !== null)
      .slice(0, 5)
      .map((w) => `${w.acronym}@${w.timeToContagionSec}s`)
      .join(", ");
    const hop2 = sc.unmitigated.propagationWaves.hop2_secondary
      .filter((w) => w.timeToContagionSec !== null)
      .slice(0, 5)
      .map((w) => `${w.acronym}@${w.timeToContagionSec}s`)
      .join(", ");
    const mitBreached = sc.mitigated.systemStates
      .filter((s) => s.blastRadiusBreached)
      .map((s) => `${s.acronym}@${s.timeToContagionSec ?? 0}s`)
      .join(", ");
    console.log(
      `  * [${sc.taxonomyAcronym}] ${sc.title} (${sc.scenarioId}):`,
    );
    console.log(
      `      - Unmitigated Waves : 1st-Hop [${hop1 || "none"}]  |  2nd-Hop [${hop2 || "none"}]`,
    );
    console.log(
      `      - Mitigated Contained: Breached [${mitBreached || "none"}]  |  Circuit-Breaker Action: ${sc.ontologyMitigation}`,
    );
  }
  console.log(line);
  console.log(`  System cascade report saved to: ${outPath}`);
}

const isCliEntry =
  process.argv[1] && resolve(process.argv[1]) === resolve(currentFile);

if (isCliEntry) {
  const rawArgs = process.argv.slice(2);
  const argOf = (flag) => {
    const idx = rawArgs.indexOf(flag);
    return idx >= 0 ? rawArgs[idx + 1] : undefined;
  };
  const asJson = rawArgs.includes("--json");
  const shockFlag = argOf("--shock");
  const severityFlag = argOf("--severity");
  const outPath = resolve(
    argOf("--out") ??
      join(workspaceRoot, ".tmp", "continuous-scale", "system-cascade-report.json"),
  );

  const report = runCascadeSimulation({
    shock: shockFlag,
    severity: severityFlag !== undefined ? Number(severityFlag) : undefined,
    outPath,
    writeReport: true,
  });

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printAsciiReport(report, outPath);
  }
}
