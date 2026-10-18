# CX Ontology — Structured CX Taxonomies

The CXOS workspace ships a **closed-world CX ontology** at `ontology/`: a JSON-structured
model of the contact-center system landscape (IVR, ACD, WFM, QA, CRM, KM, Speech Analytics,
Outbound, VOC) aligned with the [Coxswain](https://github.com/chendren/coxswain) engine
ontology (`packages/cx-core/src/ontology/catalogs/default.json`, version `2026.08.0`).

## Why

The engine ontology already closes the world for **customer-facing** vocabulary: intents,
journeys, NBA rules, KPIs, channels. This workspace ontology closes the world for the
**system side**: what the platforms in a contact center are, the parts of each, the
metrics each produces, how they fail, and how they interconnect. Together the two layers
let design and operate artifacts reference one shared, deterministic vocabulary instead
of free-form prose.

## Layout

```
ontology/
  cx-ontology.json           # Root ontology: version, engine alignment, core lifecycle,
                             # channel facets, cross-cutting concerns, taxonomy registry
  taxonomy.schema.json       # Uniform JSON Schema (draft 2020-12) every taxonomy satisfies
  taxonomies/
    ivr.json                  # Voice self-service: menus, ASR/DTMF, containment, outcomes
    acd.json                  # Routing: queues, skills, SL strategies, transfer types
    wfm.json                  # Workforce: forecasting, shrinkage, adherence, scheduling
    qa.json                   # Quality: evaluation scopes, root causes, scoring model
    crm.json                  # Customer data: record hierarchy, screen pops, consent
    km.json                   # Knowledge: audiences, content types, article lifecycle
    speech-analytics.json     # Analytics: analyte classes, use cases, precision
    outbound.json              # Outreach: dialing modes, campaign types, compliance controls
    voc.json                  # Feedback: listening posts, instruments, drivers
scripts/
  validate-ontology.mjs       # Deterministic offline validator (zero deps, zero regex)
```

## Taxonomy file shape

Every taxonomy file follows `taxonomy.schema.json` — the same envelope everywhere:

| Section | Purpose | Notes |
|---|---|---|
| `glossary` | Term → id + definition (+ tags, aliases, `seeAlso`) | `seeAlso` targets must resolve in some taxonomy |
| `facets` | Hierarchical classifications (trees of `taxonNode`) | A taxonomy in the true sense: nested facets |
| `metrics` | Metric → unit, direction, definition, `mapsToKpi` | `mapsToKpi` **must** be an engine KPI id |
| `failureModes` | Named failure → observable signal → mitigation | Feeds health/ops playbooks |
| `scoringModel` | Optional weighted rubric (QA uses it) | `weighted_rubric` weights must sum to 100 |
| `integrations` | Point-to-point exchanges with other taxonomies | `with` must be a registered taxonomy id |

## Engine alignment

`cx-ontology.json > engineAlignment` pins the engine vocabulary this workspace aligns to:
9 KPI ids, 10 action types, 7 channels, 6 sentiments, 4 urgencies, and the confidence bands.
The schema's `mapsToKpi` enum is checked against that list by the validator, so drift in
either direction fails validation rather than silently diverging. `core.interactionLifecycle`
gives both layers a shared nine-stage spine (arrival → identity → self-service → queue →
routing → handling → wrap-up → resolution → feedback) that every taxonomy relates to.

## Validation

```bash
npm run validate:ontology
```

The validator is deterministic, offline, dependency-free, and regex-free. It checks:

1. **Registry = filesystem.** Every registry entry points at a real file; every file in
   `taxonomies/` is registered. No orphans, no ghosts.
2. **Schema conformance** per taxonomy (types, enums, patterns, required keys, no
   unexpected properties).
3. **Id hygiene**: snake_case everywhere, per-namespace uniqueness, no duplicate taxon
   ids within a taxonomy.
4. **Referential integrity**: `mapsToKpi` ∈ engine KPI ids; `integrations[].with` is a
   registered taxonomy; all `seeAlso` links (glossary and facet nodes) resolve globally.
5. **Scoring model weights**: `weighted_rubric` dimensions sum to exactly 100.

Validation also runs as part of `npm run validate`.

## Extending

1. Add `ontology/taxonomies/<system>.json` using the schema envelope.
2. Register it in `cx-ontology.json > taxonomies` (id, acronym, name, category, path, summary).
   If it opens a new category, add it to `categories`.
3. Ensure every metric that should roll up carries a `mapsToKpi` from the pinned list —
   if the concept needs a new KPI, that is an engine-side change first.
4. If you introduce a new schema pattern, teach it to `matchesPattern` in the validator
   (native string checks only) and to `taxonomy.schema.json` in lockstep.
5. Run `npm run validate:ontology`. A red validator is the closed world refusing the edit.

Versioning is calendar-style (`YYYY.MM.N`, e.g. `2026.10.0`); bump the root ontology and the
touched taxonomies together.