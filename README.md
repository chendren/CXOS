# CXOS — Customer Experience Operating System (Domain-Agnostic)

**Domain-agnostic** CXOS workspace driven by [Coxswain CXOS](https://github.com/chendren/coxswain). Works for any vertical — retail, financial services, healthcare, travel, SaaS — not just telco.

This repo is a **ready CX program** with a generic design pack: multi-journey, personas, architecture, offline local bind, and **plan-only** AWS CloudFormation export. It is not a live stack and does not auto-deploy AWS.

| | |
|---|---|
| **Engine** | [chendren/coxswain](https://github.com/chendren/coxswain) (`cox` CLI) |
| **Program** | `core` under `.cox/cx/core/` (generic, not `telco-core`) |
| **Design** | Journey maps · personas · architecture · intents · NBA · KPIs (generic, from `default` ontology) |
| **Targets** | `artifacts` · `local` (offline) · `aws` (plan-only CFN) |
| **Hard rules** | Offline-first · human-gated ops · never CreateStack from Coxswain |

> **TelcoCXOS** (`~/TelcoCXOS`) is a separate **telco-specific** demo that triggers the telco pack when the idea contains words like `telco`, `mobile`, `broadband`. This workspace (`~/CXOS`) is the **domain-agnostic** primary — it uses the `default` ontology and works for any industry.

---

## Prerequisites

1. **Node 20+** and **pnpm**
2. Clone and install Coxswain:

```bash
git clone git@github.com:chendren/coxswain.git ~/coxswain
cd ~/coxswain && pnpm install
export COXSWAIN_ROOT=~/coxswain
```

3. Clone this workspace:

```bash
git clone git@github.com:chendren/CXOS.git ~/CXOS
cd ~/CXOS
```

There is **no** need for `pnpm install` in this repo for normal use. The `pnpm cox` script proxies into `$COXSWAIN_ROOT`.

---

## Quick start (domain-agnostic)

Always run from **this directory**. Use a **generic** idea string that does NOT contain telco keywords (`telco`, `mobile`, `broadband`, `fiber`, `carrier`, etc.) to get the default pack.

```bash
cd ~/CXOS
export COXSWAIN_ROOT=~/coxswain

pnpm cox cx doctor
pnpm cox cx run core "Customer experience for a national retail brand: returns and refunds, loyalty program, store pickup, online order support, and retention" --target all
pnpm cox cx status core
pnpm cox cx brief core
pnpm cox cx board
pnpm cox cx dashboard ./cxos-dashboard.html
```

For a telco-specific demo, use `~/TelcoCXOS` with an idea like `telco mobile and broadband CX: billing disputes, network outages, plan upgrades...` which triggers `telco-design-pack.ts`.

---

## What is in the design pack (generic)

The `default` ontology provides closed-world journeys, personas, intents, KPIs, and NBA rules that are **vertical-agnostic**. Artifacts land under `.cox/cx/core/artifacts/` after `build`.

---

## Targets

- `artifacts` — platform-neutral journey maps, personas, intents, Nba, KPI, architecture docs
- `local` — offline local bind (no live stack)
- `aws` — plan-only `template.yaml` + `APPLY.md` (human applies with scoped credentials)

Coxswain never runs `CreateStack` automatically.
