#!/usr/bin/env node
/**
 * CXOS Ontology validator — deterministic, offline, zero-dep, zero-regex.
 *
 * Validates:
 *  1. Registry <-> filesystem: every ontology/cx-ontology.json registry entry has a file,
 *     and every file under ontology/taxonomies/ is registered (closed world).
 *  2. Schema conformance: every taxonomy file against ontology/taxonomy.schema.json
 *     (JSON-Schema subset: type/const/enum/pattern/length/minItems/required/
 *     properties/additionalProperties/items/$ref/$defs).
 *  3. Id hygiene: snake_case ids via native string checks, per-namespace uniqueness.
 *  4. Referential integrity: metric mapsToKpi in engine KPI ids, integration targets
 *     exist, seeAlso targets exist, schema enum == engineAlignment.kpiIds.
 *  5. Scoring model weights sum to 100 for weighted rubrics.
 *
 * Run: node scripts/validate-ontology.mjs   (or: npm run validate:ontology)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ONTOLOGY_DIR = join(ROOT, 'ontology');
const TAX_DIR = join(ONTOLOGY_DIR, 'taxonomies');

const errors = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => console.warn(`WARN  ${msg}`);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function fail([file, ...rest], message) {
  err(`${file}${rest.length ? ':' + rest.join('.') : ''} ${message}`);
}

/* ---------- native string checks (no regex) ---------- */

const isLower = (c) => c >= 'a' && c <= 'z';
const isUpper = (c) => c >= 'A' && c <= 'Z';
const isDigit = (c) => c >= '0' && c <= '9';
const isDigits = (s) => s.length > 0 && [...s].every(isDigit);

/** Closed set of patterns used by taxonomy.schema.json, checked with string methods. */
function matchesPattern(value, pattern) {
  if (pattern === '^[a-z][a-z0-9_]*$') {
    // snake_case identifier
    if (typeof value !== 'string' || value.length === 0) return false;
    if (!isLower(value[0])) return false;
    for (const c of value.slice(1)) {
      if (!(isLower(c) || isDigit(c) || c === '_')) return false;
    }
    return true;
  }
  if (pattern === '^\\d{4}\\.\\d{2}\\.\\d+$') {
    // calendar version: YYYY.MM.N
    if (typeof value !== 'string') return false;
    const parts = value.split('.');
    if (parts.length !== 3) return false;
    return (
      parts[0].length === 4 && isDigits(parts[0]) &&
      parts[1].length === 2 && isDigits(parts[1]) &&
      parts[2].length >= 1 && isDigits(parts[2])
    );
  }
  if (pattern === '^[A-Z][A-Za-z0-9-]*$') {
    // acronym: leading capital, alphanumeric or dash after
    if (typeof value !== 'string' || value.length === 0) return false;
    if (!isUpper(value[0])) return false;
    for (const c of value.slice(1)) {
      if (!(isLower(c) || isUpper(c) || isDigit(c) || c === '-')) return false;
    }
    return true;
  }
  warn(`unknown schema pattern "${pattern}" — skipped`);
  return true;
}

/* ---------- minimal JSON Schema subset validator ---------- */

function resolveRef(ref, root) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined;
  let node = root;
  for (const part of ref.slice(2).split('/')) {
    node = node?.[part];
  }
  return node;
}

function typeofMatches(value, type) {
  const jsType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (type === 'integer') return jsType === 'number' && Number.isInteger(value);
  return jsType === type;
}

function validateSchema(value, schema, root, file, path, seen = new Set()) {
  const s = schema?.$ref ? resolveRef(schema.$ref, root) : schema;
  if (!s || typeof s !== 'object') return;

  // guard against $ref cycles
  const nodeKey = `${path.join('.')}|${JSON.stringify(s)}`;
  if (seen.has(nodeKey)) return;
  const nextSeen = new Set(seen);
  nextSeen.add(nodeKey);

  if (s.const !== undefined && value !== s.const) {
    fail([file, ...path], `must equal ${JSON.stringify(s.const)}, got ${JSON.stringify(value)}`);
  }
  if (Array.isArray(s.enum) && !s.enum.includes(value)) {
    fail([file, ...path], `${JSON.stringify(value)} not in enum [${s.enum.join(', ')}]`);
  }

  if (s.type !== undefined) {
    const ok = Array.isArray(s.type) ? s.type.some((t) => typeofMatches(value, t)) : typeofMatches(value, s.type);
    if (!ok) {
      fail([file, ...path], `expected ${s.type}, got ${Array.isArray(value) ? 'array' : typeof value}`);
      return;
    }
  }

  if (typeof value === 'string') {
    if (s.pattern !== undefined && !matchesPattern(value, s.pattern)) {
      fail([file, ...path], `${JSON.stringify(value)} violates pattern ${s.pattern}`);
    }
    if (s.minLength !== undefined && value.length < s.minLength) {
      fail([file, ...path], `shorter than minLength ${s.minLength}`);
    }
  }

  if (typeof value === 'number') {
    if (s.minimum !== undefined && value < s.minimum) fail([file, ...path], `below minimum ${s.minimum}`);
    if (s.maximum !== undefined && value > s.maximum) fail([file, ...path], `above maximum ${s.maximum}`);
    if (s.exclusiveMinimum !== undefined && value <= s.exclusiveMinimum) fail([file, ...path], `must exceed ${s.exclusiveMinimum}`);
  }

  if (Array.isArray(value)) {
    if (s.minItems !== undefined && value.length < s.minItems) {
      fail([file, ...path], `needs at least ${s.minItems} items, has ${value.length}`);
    }
    if (s.items) {
      value.forEach((item, i) => validateSchema(item, s.items, root, file, [...path, i], nextSeen));
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const reqKey of s.required ?? []) {
      if (!(reqKey in value)) fail([file, ...path], `missing required property "${reqKey}"`);
    }
    if (s.properties) {
      for (const [key, sub] of Object.entries(s.properties)) {
        if (key in value) validateSchema(value[key], sub, root, file, [...path, key], nextSeen);
      }
    }
    if (s.additionalProperties === false) {
      const allowed = new Set(Object.keys(s.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) fail([file, ...path], `unexpected property "${key}"`);
      }
    }
  }
}

/* ---------- helpers ---------- */

function walkTaxon(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walkTaxon(child, visit);
}

function uniqIds(items, file, label) {
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.id)) fail([file, label], `duplicate id "${it.id}"`);
    seen.add(it.id);
  }
}

/* ---------- main ---------- */

const summary = { taxonomies: 0, terms: 0, facetNodes: 0, metricLinks: 0, failureModes: 0, integrations: 0 };

// 1. Root ontology must parse and be shaped correctly
const rootPath = join(ONTOLOGY_DIR, 'cx-ontology.json');
if (!existsSync(rootPath)) {
  console.error('FATAL: ontology/cx-ontology.json missing');
  process.exit(1);
}
const ontology = readJson(rootPath);
if (ontology.kind !== 'cxOntology') fail(['cx-ontology.json'], 'kind must be "cxOntology"');

const kpiIds = ontology.engineAlignment?.kpiIds ?? [];
const categories = new Set(Object.keys(ontology.categories ?? {}));
const registry = Array.isArray(ontology.taxonomies) ? ontology.taxonomies : [];
const registryIds = new Set();

for (const t of registry) {
  for (const key of ['id', 'acronym', 'name', 'category', 'path', 'summary']) {
    if (!(key in t)) fail(['cx-ontology.json', 'taxonomies', t.id ?? '?'], `registry entry missing "${key}"`);
  }
  if (!categories.has(t.category)) fail(['cx-ontology.json', 'taxonomies', t.id], `unknown category "${t.category}"`);
  const file = join(ONTOLOGY_DIR, t.path);
  if (!existsSync(file)) fail(['cx-ontology.json', 'taxonomies', t.id], `path "${t.path}" does not exist`);
  if (registryIds.has(t.id)) fail(['cx-ontology.json'], `duplicate registry id "${t.id}"`);
  registryIds.add(t.id);
}

// 2. No orphan taxonomy files (closed world cuts both ways)
const onDisk = readdirSync(TAX_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => `taxonomies/${f}`);
for (const rel of onDisk) {
  if (!registry.some((t) => t.path === rel)) {
    fail(['cx-ontology.json'], `orphan taxonomy file "${rel}" — register it or remove it`);
  }
}

// 3. Schema file and enum alignment with engine KPI ids
const schema = readJson(join(ONTOLOGY_DIR, 'taxonomy.schema.json'));
const schemaKpiEnum = schema.$defs?.metricEntry?.properties?.mapsToKpi?.enum ?? [];
const sortedJoin = (a) => [...a].sort().join(',');
if (sortedJoin(schemaKpiEnum) !== sortedJoin(kpiIds)) {
  fail(['taxonomy.schema.json', '$defs.metricEntry.properties.mapsToKpi.enum'], 'must exactly match engineAlignment.kpiIds in cx-ontology.json');
}

// 4. Load and validate every taxonomy
const taxonomies = [];
for (const entry of registry) {
  const file = entry.path.split('/').pop() ?? entry.id + '.json';
  let tax;
  try {
    tax = readJson(join(ONTOLOGY_DIR, entry.path));
  } catch (e) {
    fail([file], `invalid JSON: ${e.message}`);
    continue;
  }
  taxonomies.push({ entry, tax, file });

  validateSchema(tax, schema, schema, file, []);

  if (tax.id !== entry.id) fail([file], `id "${tax.id}" does not match registry id "${entry.id}"`);
  if (tax.category !== entry.category) fail([file], `category "${tax.category}" does not match registry category "${entry.category}"`);

  uniqIds(tax.glossary ?? [], file, 'glossary');
  uniqIds(tax.metrics ?? [], file, 'metrics');
  uniqIds(tax.failureModes ?? [], file, 'failureModes');

  const facetIds = new Set();
  for (const facet of tax.facets ?? []) {
    walkTaxon(facet.root, (n) => {
      summary.facetNodes += 1;
      if (facetIds.has(n.id)) fail([file, 'facets', facet.id], `duplicate taxon id "${n.id}" across facets in this taxonomy`);
      facetIds.add(n.id);
    });
  }

  if (tax.scoringModel) {
    const dims = tax.scoringModel.dimensions ?? [];
    uniqIds(dims, file, 'scoringModel.dimensions');
    let sum = 0;
    for (const d of dims) {
      if (typeof d.weightPercent !== 'number') {
        fail([file, 'scoringModel.dimensions', d.id], 'dimension must define numeric weightPercent');
      } else {
        sum += d.weightPercent;
      }
    }
    if (tax.scoringModel.scaleType === 'weighted_rubric' && dims.length > 0 && Math.round(sum) !== 100) {
      fail([file, 'scoringModel'], `weighted_rubric dimension weights sum to ${sum}, expected 100`);
    }
  }

  summary.taxonomies += 1;
  summary.terms += (tax.glossary ?? []).length;
  summary.failureModes += (tax.failureModes ?? []).length;
  summary.integrations += (tax.integrations ?? []).length;
  summary.metricLinks += (tax.metrics ?? []).filter((m) => m.mapsToKpi).length;
}

// 5. Referential integrity — collect the full global id set first (two-phase for forward refs)
const globalTargets = new Set(registryIds);
for (const { tax } of taxonomies) {
  for (const g of tax.glossary ?? []) globalTargets.add(g.id);
}
for (const { tax, file } of taxonomies) {
  for (const g of tax.glossary ?? []) {
    for (const ref of g.seeAlso ?? []) {
      if (!globalTargets.has(ref)) fail([file, 'glossary', g.id], `seeAlso "${ref}" does not exist in any taxonomy or glossary`);
    }
  }
  for (const facet of tax.facets ?? []) {
    walkTaxon(facet.root, (n) => {
      for (const ref of n.seeAlso ?? []) {
        if (!globalTargets.has(ref)) fail([file, 'facets', facet.id, n.id], `seeAlso "${ref}" does not exist in any taxonomy or glossary`);
      }
    });
  }
  for (const m of tax.metrics ?? []) {
    if (m.mapsToKpi !== undefined && !kpiIds.includes(m.mapsToKpi)) {
      fail([file, 'metrics', m.id], `mapsToKpi "${m.mapsToKpi}" is not an engine KPI id`);
    }
  }
  for (const int of tax.integrations ?? []) {
    if (!registryIds.has(int.with)) fail([file, 'integrations'], `target taxonomy "${int.with}" does not exist in the registry`);
  }
}

/* ---------- report ---------- */

if (errors.length > 0) {
  console.error(`\nCXOS ontology INVALID — ${errors.length} error(s):`);
  for (const e of errors) console.error(`  ERROR ${e}`);
  process.exit(1);
}

console.log(`\nCXOS ontology valid:
  ${summary.taxonomies} taxonomies, ${summary.terms} glossary terms,
  ${summary.facetNodes} facet nodes, ${summary.metricLinks} KPI-linked metrics,
  ${summary.failureModes} failure modes, ${summary.integrations} cross-taxonomy integrations.
Engine alignment: ${kpiIds.length} KPI ids, ${ontology.engineAlignment.actionTypes?.length ?? 0} action types, ${ontology.engineAlignment.channels?.length ?? 0} channels.
Closed world: registry = filesystem; all mapsToKpi / seeAlso / integration references resolve.
`);