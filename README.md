# CXOS

**Domain-agnostic Customer Experience Operating System workspace**

This repo is a **fleet workspace**: CX programs, operate state, dashboards, and CAB exports. The engine is **[Coxswain](https://github.com/chendren/coxswain)** (`cox` CLI). CXOS does not reimplement the agent; it points at the engine via `COXSWAIN_ROOT`.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Engine](https://img.shields.io/badge/engine-coxswain-informational)](https://github.com/chendren/coxswain)
[![Offline-first](https://img.shields.io/badge/offline--first-yes-success)](#offline-quickstart)

| | |
|---|---|
| **Engine** | [chendren/coxswain](https://github.com/chendren/coxswain) (`pnpm cox` / `pnpm cox cx …`) |
| **This repo** | Programs under `.cox/cx/`, fleet board, dashboards, CAB packages |
| **Targets** | `artifacts` · `local` (offline) · `aws` (**plan-only** CFN) |
| **Packs** | Retail, financial, healthcare, travel + default ontology (via engine) |
| **Hard rules** | Offline-first · human-gated propose-only ops · never CreateStack from Coxswain |

> **TelcoCXOS** is a **separate** telco-specific demo (keyword-triggered). This workspace is the **domain-agnostic primary**. Avoid telco/mobile/broadband keywords here when you want retail/financial/healthcare/travel or default packs.

---

## Architecture (engine × fleet)

```text
CXOS (this repo)                    Coxswain (engine)
─────────────────                   ─────────────────
.cox/cx/<program>/      ──uses──▶   packages/cli + cx-* + packs
board · dashboard · cab             routing · ledger · adapters
```

Diagrams: [docs/CXOS-ARCHITECTURE.png](./docs/CXOS-ARCHITECTURE.png) · [docs/COMBINED-ARCHITECTURE.png](./docs/COMBINED-ARCHITECTURE.png)  
Engine narrative: [coxswain/docs/HOW-IT-WORKS.md](https://github.com/chendren/coxswain/blob/main/docs/HOW-IT-WORKS.md)

---

## Prerequisites

1. **Node 20+** and **pnpm**  
2. Clone and install the engine once:

```bash
git clone https://github.com/chendren/coxswain.git ~/coxswain
cd ~/coxswain && pnpm install
export COXSWAIN_ROOT=~/coxswain
```

3. Clone this workspace:

```bash
git clone https://github.com/chendren/CXOS.git ~/CXOS
cd ~/CXOS
```

There is **no** need for `pnpm install` in this repo for normal use. The `pnpm cox` script proxies into `$COXSWAIN_ROOT` (see `scripts/cox.mjs`).

---

## Offline quickstart

Always run from **this directory**. Keep the idea string free of telco keywords for domain-agnostic packs.

```bash
cd ~/CXOS
export COXSWAIN_ROOT=~/coxswain

pnpm cox cx doctor --mode offline
pnpm cox cx run core \
  "Customer experience for a national retail brand: returns and refunds, loyalty program, store pickup, online order support, and retention" \
  --target all
pnpm cox cx status core
pnpm cox cx board
pnpm cox cx brief core
pnpm cox cx dashboard ./cxos-dashboard.html
pnpm cox cx cab-export core
```

What you get:

- Multi-target program under `.cox/cx/core/` (artifacts, local, plan-only aws)  
- Fleet board line and HTML dashboard  
- CAB package (MANIFEST, BRIEF, plan CFN, remediations) for human review  

Coxswain **never** runs `CreateStack`. Apply CloudFormation yourself with scoped credentials using `aws/APPLY.md` from the export.

### More vertical examples

```bash
# Financial
pnpm cox cx run fin-core \
  "Retail bank CX: account inquiry, fraud alerts, loan support, onboarding, retention" \
  --target all

# Healthcare (no PHI in idea strings or ontology)
pnpm cox cx run health-core \
  "Provider CX: appointments, claims, prior auth, benefits, retention" \
  --target all

# Travel
pnpm cox cx run travel-core \
  "Airline and hotel CX: booking, disruption rebooking, loyalty, check-in, retention" \
  --target all
```

---

## Hard rules (quote these)

1. **No silent production mutation.** Console, watch, and daemon propose only.  
2. **AWS is plan-only.** `template.yaml` + `APPLY.md`; humans apply CFN.  
3. **Never CreateStack from Coxswain.** Product promise.  
4. **Offline-first.** Golden path works without API keys or a live stack.  
5. **Strong graph first.** Packs and NBA match are closed-world; weak models optional.

---

## What lives in this workspace

| Path / surface | Purpose |
|---|---|
| `.cox/cx/<name>/` | Program state (created by `cx run` / `cx new`) |
| `cx-cab-*/` or `./cx-cab/` | CAB export packages |
| `cxos-dashboard*.html` | Fleet HTML dashboards |
| `docs/` | Architecture diagrams, PRFAQ, user scenarios |
| `scripts/cox.mjs` | Proxy into `$COXSWAIN_ROOT` with default `--cwd` here |
| `cox.config.json` | Workspace config (merged by engine) |

You do not need to commit secrets. Model keys (if used) live in the environment for the engine, never in this repo.

---

## Common commands

All commands are engine commands; prefix with `pnpm cox` from this directory.
Short aliases also exist as `pnpm cx:*` (see [docs/FLEET-COMMANDS.md](./docs/FLEET-COMMANDS.md)).

```bash
pnpm cox cx doctor --mode offline
pnpm cox cx quickstart
pnpm cox cx init
pnpm cox cx list
pnpm cox cx run <name> "<idea>" --target all
pnpm cox cx status <name>
pnpm cox cx operate <name>
pnpm cox cx proposals <name>
pnpm cox cx claim <name> <proposalId>
pnpm cox cx incident <name>
pnpm cox cx board
pnpm cox cx queue
pnpm cox cx fleet-status
pnpm cox cx snapshot <name>
pnpm cox cx dashboard ./cxos-dashboard.html
pnpm cox cx brief <name>
pnpm cox cx audit <name>
pnpm cox cx cab-export <name>
pnpm cox cx export-aws <name>
```

Operator cheatsheet: [docs/FLEET-COMMANDS.md](./docs/FLEET-COMMANDS.md)  
Deep command map: [coxswain docs/CXOS-COMPLETE.md](https://github.com/chendren/coxswain/blob/main/docs/CXOS-COMPLETE.md)

---

## Targets

| Target | Meaning |
|---|---|
| `artifacts` | Platform-neutral journey maps, personas, intents, NBA, KPI, architecture |
| `local` | Offline local bind (no live stack required) |
| `aws` | Plan-only `template.yaml` + `APPLY.md` |

Order is always **artifacts first**, then local and aws.

---

## Status and docs

**v0.1** companion to Coxswain `0.1.0`. Offline operate loop is the supported golden path.

| Doc | Location |
|---|---|
| Engine landing | [coxswain README](https://github.com/chendren/coxswain) |
| Why / tenets | [coxswain/docs/WHY.md](https://github.com/chendren/coxswain/blob/main/docs/WHY.md) |
| How it works | [coxswain/docs/HOW-IT-WORKS.md](https://github.com/chendren/coxswain/blob/main/docs/HOW-IT-WORKS.md) |
| Comparison | [coxswain/docs/COMPARISON.md](https://github.com/chendren/coxswain/blob/main/docs/COMPARISON.md) |
| Adoption | [coxswain/docs/ADOPTION.md](https://github.com/chendren/coxswain/blob/main/docs/ADOPTION.md) |
| Pack authoring | [coxswain/docs/PACK-AUTHORING.md](https://github.com/chendren/coxswain/blob/main/docs/PACK-AUTHORING.md) |
| PRFAQ | [docs/PRFAQ-CXOS-Coxswain.md](./docs/PRFAQ-CXOS-Coxswain.md) |
| OSS plan | [docs/OSS-RELEASE-SUPERHEAVY-PLAN.md](./docs/OSS-RELEASE-SUPERHEAVY-PLAN.md) |

---

## Non-goals

- Replacing Amazon Connect as a live runtime  
- Auto CreateStack or silent production remediation  
- Treating TelcoCXOS as the primary product narrative  
- Requiring API keys to demonstrate core value  

---

## License

Licensed under the **Apache License, Version 2.0**. See [LICENSE](./LICENSE) (or the engine license until a workspace LICENSE is committed).
