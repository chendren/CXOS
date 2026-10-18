import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ONTOLOGY_DIR = join(ROOT, "ontology");
const TAX_DIR = join(ONTOLOGY_DIR, "taxonomies");
const SCRIPTS_DIR = join(ROOT, "scripts");
const TEST_DIR = join(ROOT, "test");
const TMP_DIR = join(ROOT, ".tmp", "continuous-scale");
const SLASH = String.fromCharCode(47);

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));

function walkTaxon(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    walkTaxon(child, visit);
  }
}

function collectUniqueIds(items) {
  const seen = new Set();
  const duplicates = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      duplicates.push(item.id);
    }
    seen.add(item.id);
  }
  return { seen, duplicates };
}

describe("Test Group 1 — Closed-World Ontology & Schema Integrity (19 Taxonomies)", () => {
  const rootOntologyPath = join(ONTOLOGY_DIR, "cx-ontology.json");
  const rootOntology = readJson(rootOntologyPath);
  const registry = rootOntology.taxonomies ?? [];
  const kpiIds = new Set(rootOntology.engineAlignment?.kpiIds ?? []);
  const categories = new Set(Object.keys(rootOntology.categories ?? {}));

  it("verifies cx-ontology.json has 19 registered taxonomies, journeyTriad (3 planes), and contextEnvelopeSpec (12 required fields)", () => {
    assert.equal(rootOntology.kind, "cxOntology");
    assert.equal(registry.length, 19, "Expected exactly 19 registered taxonomies");

    const planes = rootOntology.core?.journeyTriad?.planes ?? [];
    assert.equal(planes.length, 3, "Expected exactly 3 planes in journeyTriad");
    assert.deepEqual(
      planes.map((p) => p.id),
      ["prescriptive_mapping", "descriptive_tracking", "interventionist_orchestration"],
    );

    const reqFields = rootOntology.core?.contextEnvelopeSpec?.requiredFields ?? [];
    assert.equal(reqFields.length, 12, "Expected 12 required fields in contextEnvelopeSpec");

    const onDiskFiles = readdirSync(TAX_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ["taxonomies", f].join(SLASH))
      .sort();
    const registeredPaths = registry.map((t) => t.path).sort();
    assert.deepEqual(onDiskFiles, registeredPaths, "Closed-world registry must match taxonomy files on disk");
  });

  const loadedTaxonomies = registry.map((entry) => {
    const fullPath = join(ONTOLOGY_DIR, ...entry.path.split(SLASH));
    return {
      entry,
      fullPath,
      tax: readJson(fullPath),
    };
  });

  it("verifies every taxonomy file parses cleanly, matches registry, has a 100-point weighted_rubric scoringModel summing to 100, and has valid continuousDynamics", () => {
    assert.equal(loadedTaxonomies.length, 19);

    for (const { entry, tax } of loadedTaxonomies) {
      assert.equal(tax.kind, "cxTaxonomy", `Invalid kind in ${entry.id}`);
      assert.equal(tax.id, entry.id, `Mismatched id for ${entry.id}`);
      assert.equal(tax.acronym, entry.acronym, `Mismatched acronym for ${entry.id}`);
      assert.equal(tax.category, entry.category, `Mismatched category for ${entry.id}`);
      assert.ok(categories.has(tax.category), `Unknown category ${tax.category} for ${entry.id}`);

      const sm = tax.scoringModel;
      assert.ok(sm && typeof sm === "object", `Missing scoringModel in ${entry.id}`);
      assert.equal(sm.scaleType, "weighted_rubric", `Expected weighted_rubric in ${entry.id}`);
      assert.equal(sm.maxPoints, 100, `Expected maxPoints=100 in ${entry.id}`);
      assert.ok(Array.isArray(sm.dimensions) && sm.dimensions.length > 0, `Missing scoring dimensions in ${entry.id}`);

      const dimCheck = collectUniqueIds(sm.dimensions);
      assert.equal(dimCheck.duplicates.length, 0, `Duplicate scoring dimension ids in ${entry.id}`);
      const weightSum = sm.dimensions.reduce((acc, d) => acc + Number(d.weightPercent ?? 0), 0);
      assert.equal(Math.round(weightSum), 100, `Scoring weights in ${entry.id} sum to ${weightSum}, expected 100`);

      const cd = tax.continuousDynamics;
      assert.ok(cd && typeof cd === "object", `Missing continuousDynamics in ${entry.id}`);
      assert.ok(
        typeof cd.stateSpaceDimension === "number" && cd.stateSpaceDimension >= 4,
        `Invalid stateSpaceDimension in ${entry.id}`,
      );
      const sv = cd.stateVariables ?? [];
      const de = cd.differentialEquations ?? [];
      assert.ok(sv.length >= 3, `Expected at least 3 stateVariables in ${entry.id}`);
      assert.ok(de.length >= 2, `Expected at least 2 differentialEquations in ${entry.id}`);

      const svCheck = collectUniqueIds(sv);
      const deCheck = collectUniqueIds(de);
      assert.equal(svCheck.duplicates.length, 0, `Duplicate stateVariables in ${entry.id}`);
      assert.equal(deCheck.duplicates.length, 0, `Duplicate differentialEquations in ${entry.id}`);
    }
  });

  it("verifies global referential integrity across mapsToKpi, seeAlso, and integrations[].with", () => {
    const registryIds = new Set(registry.map((r) => r.id));
    const globalTargets = new Set(registryIds);

    for (const { tax } of loadedTaxonomies) {
      for (const g of tax.glossary ?? []) {
        globalTargets.add(g.id);
      }
    }

    for (const { entry, tax } of loadedTaxonomies) {
      for (const m of tax.metrics ?? []) {
        if (m.mapsToKpi !== undefined) {
          assert.ok(
            kpiIds.has(m.mapsToKpi),
            `${entry.id}.metrics.${m.id} mapsToKpi "${m.mapsToKpi}" not in engineAlignment.kpiIds`,
          );
        }
      }

      for (const g of tax.glossary ?? []) {
        for (const ref of g.seeAlso ?? []) {
          assert.ok(
            globalTargets.has(ref),
            `${entry.id}.glossary.${g.id} seeAlso "${ref}" does not resolve`,
          );
        }
      }

      for (const facet of tax.facets ?? []) {
        walkTaxon(facet.root, (node) => {
          for (const ref of node.seeAlso ?? []) {
            assert.ok(
              globalTargets.has(ref),
              `${entry.id}.facets.${facet.id}.${node.id} seeAlso "${ref}" does not resolve`,
            );
          }
        });
      }

      for (const integ of tax.integrations ?? []) {
        assert.ok(
          registryIds.has(integ.with),
          `${entry.id}.integrations target "${integ.with}" not in registry`,
        );
      }
    }
  });
});

describe("Test Group 2 — Coxswain Engine Extension Pack (cxos-systems-pack.json)", () => {
  const packPath = join(ONTOLOGY_DIR, "cxos-systems-pack.json");
  const pack = readJson(packPath);

  it("verifies all 19 sys_* domains, 148 operational intents, 4 journeys, 7 NBA rules, and 9 aligned KPIs", () => {
    assert.equal(pack.source, "cxos-systems-ontology");

    const domains = pack.domains ?? [];
    assert.equal(domains.length, 19, "Expected 19 sys_* domains");
    for (const dom of domains) {
      assert.ok(dom.id.startsWith("sys_"), `Domain id ${dom.id} must start with sys_`);
      assert.ok(Array.isArray(dom.intents) && dom.intents.length > 0, `Domain ${dom.id} must have intents`);
    }

    const totalIntents = domains.reduce((acc, d) => acc + d.intents.length, 0);
    assert.equal(totalIntents, 148, `Expected 148 operational intents, found ${totalIntents}`);

    const journeys = pack.journeys ?? [];
    assert.equal(journeys.length, 4, "Expected 4 operational journeys");
    const expectedJourneys = [
      "cxos_interaction_lifecycle",
      "cxos_qa_calibration_loop",
      "cxos_three_plane_journey_loop",
      "cxos_a2a_omnichannel_handoff",
    ];
    assert.deepEqual(
      journeys.map((j) => j.id),
      expectedJourneys,
    );
    for (const j of journeys) {
      assert.ok(Array.isArray(j.stages) && j.stages.length >= 2, `Journey ${j.id} must define stages`);
      assert.ok(
        Array.isArray(j.terminalStages) && j.terminalStages.length >= 1,
        `Journey ${j.id} must define terminalStages`,
      );
    }

    const nbaRules = pack.nbaRules ?? [];
    assert.equal(nbaRules.length, 7, "Expected 7 NBA rules");
    for (const rule of nbaRules) {
      assert.ok(typeof rule.id === "string" && rule.id.length > 0);
      assert.ok(typeof rule.priority === "number" && rule.priority > 0);
      assert.ok(Array.isArray(rule.conditions) && rule.conditions.length > 0);
      assert.ok(typeof rule.action === "string" && rule.action.length > 0);
    }

    const kpis = pack.kpis ?? [];
    assert.equal(kpis.length, 9, "Expected 9 aligned KPIs");
  });
});

describe("Test Group 3 — Continuous R^16 Manifold & A2A Spectral Field Mathematical Invariants", () => {
  const specPath = join(ONTOLOGY_DIR, "continuous-scale-spec.json");
  const spec = readJson(specPath);

  it("verifies continuous-scale-spec.json defines 16 latent dimensions, 12 A2A agents in [0, 1]^16, and 6 Golden Attractor Tubes with knots at tau in [0, 1]", () => {
    assert.equal(spec.dimensions, 16);
    assert.equal(spec.latentManifoldAxes?.length, 16);

    const agents = spec.a2aContinuousAgents ?? [];
    assert.equal(agents.length, 12, "Expected 12 A2A continuous agents");
    for (const ag of agents) {
      assert.equal(ag.capabilityVector16D?.length, 16, `Agent ${ag.id} must have 16-D capability vector`);
      for (const v of ag.capabilityVector16D) {
        assert.ok(typeof v === "number" && v >= 0.0 && v <= 1.0, `Capability value out of [0,1] for ${ag.id}`);
      }
    }

    const tubes = spec.goldenAttractorTubes ?? [];
    assert.equal(tubes.length, 6, "Expected 6 Golden Attractor Tubes");
    for (const tube of tubes) {
      assert.ok(Array.isArray(tube.knots) && tube.knots.length >= 3, `Tube ${tube.blueprintId} needs >= 3 knots`);
      for (const knot of tube.knots) {
        assert.ok(typeof knot.tau === "number" && knot.tau >= 0.0 && knot.tau <= 1.0, "Knot tau must be in [0, 1]");
        assert.equal(knot.mu?.length, 16, `Knot mu must have length 16 in ${tube.blueprintId}`);
        assert.equal(knot.sigmaDiag?.length, 16, `Knot sigmaDiag must have length 16 in ${tube.blueprintId}`);
      }
    }
  });

  it("runs continuous-journey-engine.mjs at --scale 2000 --workers 2 and verifies probability conservation, Lyapunov counts, context fidelity and entropy bounds, and Plane 3 control weights", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const testSummaryPath = join(TMP_DIR, "test-manifold-summary-2000.json");
    const engineScript = join(SCRIPTS_DIR, "continuous-journey-engine.mjs");

    const proc = spawnSync(
      process.execPath,
      [engineScript, "--scale", "2000", "--workers", "2", "--out", testSummaryPath],
      { cwd: ROOT, encoding: "utf8", timeout: 30000 },
    );

    assert.equal(proc.status, 0, `Engine exited with non-zero status: ${proc.stderr}`);
    assert.ok(existsSync(testSummaryPath), "Expected engine summary output file to exist");
    const summary = readJson(testSummaryPath);

    assert.equal(summary.benchmark.scaleJourneys, 2000);
    assert.equal(summary.benchmark.workersUsed, 2);

    const agentWeightSum = summary.a2aAgentFieldSummary.reduce(
      (acc, ag) => acc + ag.meanBoltzmannWeight,
      0,
    );
    assert.ok(
      Math.abs(agentWeightSum - 1.0) <= 0.01,
      `Expected A2A Boltzmann mean weights to sum to 1.0 (within 0.01), got ${agentWeightSum}`,
    );

    const lyap = summary.continuousFieldMetrics.lyapunovStability;
    assert.equal(
      lyap.convergentCount + lyap.orbitalCount + lyap.divergentCount,
      2000,
      "Lyapunov stability counts must sum to 2000",
    );

    const ctxField = summary.continuousFieldMetrics.omnichannelContextField;
    assert.ok(
      ctxField.meanMutualInfoRetention > 0.0 && ctxField.meanMutualInfoRetention <= 1.0,
      `Expected meanMutualInfoRetention in (0, 1], got ${ctxField.meanMutualInfoRetention}`,
    );
    assert.ok(
      ctxField.meanShannonContextEntropy >= 0.0 && ctxField.meanShannonContextEntropy <= 1.0,
      `Expected meanShannonContextEntropy in [0, 1], got ${ctxField.meanShannonContextEntropy}`,
    );

    assert.equal(summary.controlActionSummary.length, 6);
    const controlWeightSum = summary.controlActionSummary.reduce(
      (acc, act) => acc + act.meanContinuousWeight,
      0,
    );
    assert.ok(
      Math.abs(controlWeightSum - 1.0) <= 0.01,
      `Expected Plane 3 continuous control weights to sum to 1.0 (within 0.01), got ${controlWeightSum}`,
    );
    for (const act of summary.controlActionSummary) {
      assert.ok(
        act.meanContinuousWeight >= 0.0 && act.meanContinuousWeight <= 1.0,
        `Control weight ${act.id} out of [0, 1]`,
      );
    }
  });
});

describe("Test Group 4 — Closed-Loop Plane 1 from Plane 2 and 3 Robbins-Monro Blueprint Recalibration Invariants", () => {
  it("verifies recalibrated-blueprints.json and recalibrate-blueprints.mjs recalibrate all 6 Golden Attractor Tubes with strict drift reduction and convergence lift", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const recalScript = join(SCRIPTS_DIR, "recalibrate-blueprints.mjs");
    const testSummaryPath = join(TMP_DIR, "test-manifold-summary-2000.json");
    const testRecalOutPath = join(TMP_DIR, "test-recalibrated-blueprints.json");

    const proc = spawnSync(
      process.execPath,
      [recalScript, "--summary", testSummaryPath, "--out", testRecalOutPath],
      { cwd: ROOT, encoding: "utf8", timeout: 15000 },
    );
    assert.equal(proc.status, 0, `recalibrate-blueprints.mjs failed: ${proc.stderr}`);
    assert.ok(existsSync(testRecalOutPath), "Expected recalibrated blueprints output file to exist");

    const artifactsToVerify = [readJson(testRecalOutPath)];
    const canonicalRecalPath = join(TMP_DIR, "recalibrated-blueprints.json");
    if (existsSync(canonicalRecalPath)) {
      artifactsToVerify.push(readJson(canonicalRecalPath));
    }

    for (const artifact of artifactsToVerify) {
      assert.equal(artifact.kind, "cxPlane1RecalibratedBlueprints");
      assert.equal(artifact.portfolioRecalibrationSummary.blueprintsRecalibrated, 6);
      assert.equal(artifact.recalibratedBlueprints.length, 6);

      for (const bp of artifact.recalibratedBlueprints) {
        const impact = bp.counterfactualImpact;
        assert.ok(
          impact.counterfactualPostDrift < impact.priorMahalanobisDrift,
          `Blueprint ${bp.blueprintId}: expected counterfactualPostDrift (${impact.counterfactualPostDrift}) < priorMahalanobisDrift (${impact.priorMahalanobisDrift})`,
        );
        assert.ok(
          impact.projectedPostConvergentSharePercent > impact.priorConvergentSharePercent,
          `Blueprint ${bp.blueprintId}: expected projectedPostConvergentSharePercent (${impact.projectedPostConvergentSharePercent}) > priorConvergentSharePercent (${impact.priorConvergentSharePercent})`,
        );
      }
    }

    rmSync(testSummaryPath, { force: true });
    rmSync(testRecalOutPath, { force: true });
  });
});

describe("Test Group 5 — Repository-Wide Zero-Regex & Offline Self-Containment Guard", () => {
  it("scans all .mjs files in scripts and test directories to ensure only node:* or relative imports and no RegExp usage", () => {
    const mjsFiles = [
      ...readdirSync(SCRIPTS_DIR)
        .filter((f) => f.endsWith(".mjs"))
        .map((f) => join(SCRIPTS_DIR, f)),
      ...readdirSync(TEST_DIR)
        .filter((f) => f.endsWith(".mjs"))
        .map((f) => join(TEST_DIR, f)),
    ];

    assert.ok(mjsFiles.length >= 16, "Expected scripts and test .mjs files to be scanned");
    const forbiddenRegExpToken = "new " + "RegExp(";

    for (const filePath of mjsFiles) {
      const content = readFileSync(filePath, "utf8");
      assert.equal(
        content.includes(forbiddenRegExpToken),
        false,
        `Forbidden RegExp constructor found in ${filePath}`,
      );

      const lines = content.split("\n");
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith("import ") && line.includes(" from ")) {
          const fromIdx = line.lastIndexOf(" from ");
          const specPart = line.slice(fromIdx + 6).trim();
          const quoteChar = specPart[0];
          if (quoteChar === '"' || quoteChar === "'") {
            const endQuoteIdx = specPart.indexOf(quoteChar, 1);
            const moduleSpec = specPart.slice(1, endQuoteIdx);
            const isNodeBuiltin = moduleSpec.startsWith("node:");
            const isRelative =
              moduleSpec.startsWith("." + SLASH) || moduleSpec.startsWith(".." + SLASH);
            assert.ok(
              isNodeBuiltin || isRelative,
              `External package import "${moduleSpec}" forbidden in ${filePath}`,
            );
          }
        }
      }
    }
  });

  it("verifies cxos-ontology-explorer.html and cxos-dashboard.html contain no external CDN script or style tags", () => {
    const htmlFiles = [
      join(ROOT, "cxos-ontology-explorer.html"),
      join(ROOT, "cxos-dashboard.html"),
    ];
    const forbiddenCdnPrefix = ["https:", "", "cdn"].join(SLASH);

    for (const htmlPath of htmlFiles) {
      assert.ok(existsSync(htmlPath), `Expected HTML artifact at ${htmlPath}`);
      const html = readFileSync(htmlPath, "utf8").toLowerCase();
    assert.equal(
      html.includes(forbiddenCdnPrefix),
      false,
      `Found forbidden external CDN reference in ${htmlPath}`,
    );
    }
  });
});

describe("Test Group 6 — Coupled 19-System Cascade Simulator, Vertical Telco Overlay & Streaming Control Plane", () => {
  it("verifies system-cascade-simulator.mjs contains 19-system blast radius and reduces integrated stress by >80%", () => {
    const cascadePath = join(TMP_DIR, "system-cascade-report.json");
    assert.ok(existsSync(cascadePath), "Expected system-cascade-report.json to exist");
    const report = readJson(cascadePath);

    assert.equal(report.coupledGraphTopology.totalSystems, 19);
    assert.equal(report.coupledGraphTopology.totalDirectedIntegrationEdges, 96);
    assert.equal(report.scenarios.length, 6);
    assert.ok(report.portfolioSummary.overallBlastRadiusMitigationReductionPercent >= 80);

    for (const sc of report.scenarios) {
      assert.ok(
        sc.comparisonSummary.blastRadiusMitigationReductionPercent >= 80,
        `Scenario ${sc.scenarioId} expected >=80% stress reduction, got ${sc.comparisonSummary.blastRadiusMitigationReductionPercent}%`,
      );
      assert.ok(
        sc.mitigated.blastRadiusCount < sc.unmitigated.blastRadiusCount,
        `Scenario ${sc.scenarioId} expected mitigated blast radius < unmitigated`,
      );
    }
  });

  it("verifies ontology/verticals/telco-carrier-overlay.json and 50,000-journey vertical projection", () => {
    const overlayPath = join(ONTOLOGY_DIR, "verticals", "telco-carrier-overlay.json");
    const projPath = join(TMP_DIR, "vertical-telco-projection.json");
    assert.ok(existsSync(overlayPath), "Expected telco-carrier-overlay.json to exist");
    assert.ok(existsSync(projPath), "Expected vertical-telco-projection.json to exist");

    const overlay = readJson(overlayPath);
    const proj = readJson(projPath);
    assert.equal(overlay.verticalGoldenAttractorTubes.length, 4);
    assert.equal(overlay.verticalA2ASpecialistAgents.length, 5);
    assert.equal(overlay.omnichannelContextExtensions.length, 4);
    assert.equal(proj.benchmark.scaleJourneys, 50000);
    assert.ok(proj.benchmark.throughputJourneysPerSec > 50000);
  });

  it("runs cxos-control-plane.mjs --self-test and verifies HTTP + SSE endpoints", () => {
    const cpScript = join(SCRIPTS_DIR, "cxos-control-plane.mjs");
    const proc = spawnSync(process.execPath, [cpScript, "--self-test"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 20000,
    });
    assert.equal(proc.status, 0, `cxos-control-plane.mjs --self-test failed: ${proc.stderr}`);
    assert.ok(proc.stdout.includes("CXOS UNIFIED REAL-TIME STREAMING CONTROL PLANE — END-TO-END SELF-TEST REPORT"));
    assert.ok(proc.stdout.includes("1. [GET /health]"));
    assert.ok(proc.stdout.includes("6. [GET /v1/stream?limit=3]"));
  });
});

