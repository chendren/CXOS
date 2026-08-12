# Fleet operator commands

Operator cheatsheet for the CXOS workspace. All product logic lives in the
coxswain engine; this workspace proxies with `scripts/cox.mjs` and sets
`--cwd` to the fleet root.

## Prerequisites

1. Checkout and install coxswain (`pnpm install` in the engine repo).
2. Set `COXSWAIN_ROOT` to that checkout, or keep the engine at `~/coxswain`.
3. From this directory, use `pnpm cox …` or the `cx:*` npm scripts.

Pass flags after `--` for npm scripts, for example:

```bash
pnpm cx:doctor -- --mode offline
pnpm cx:run -- holiday-retail "Retail holiday returns and loyalty" --target all
```

## Offline golden path

```bash
export COXSWAIN_ROOT=/path/to/coxswain   # if not ~/coxswain
pnpm cx:doctor -- --mode offline
pnpm cx:quickstart                       # doctor + init + sample path + board
# or explicit program:
pnpm cox cx run holiday-retail "Retail holiday returns, loyalty, pickup" --target all
pnpm cx:board
pnpm cox cx cab-export holiday-retail
```

## Operate loop (human-gated)

Console / operate **propose only**. Humans claim, apply, and close tasks.

```bash
pnpm cox cx operate <name>                 # one-shot: console tick + board line
pnpm cox cx proposals <name>               # open | claimed work
pnpm cox cx claim <name> <proposalId>      # alias for apply → task + remediation
pnpm cox cx apply <name> <proposalId>      # same; --resolve marks proposal resolved
pnpm cox cx tasks <name>
pnpm cox cx task <name> <taskId> done      # done resolves source proposal by default
pnpm cox cx seed-operate <name>            # seed open proposals for drills
pnpm cox cx incident <name>                # status → seed-operate → operate → queue
```

## Fleet surfaces

```bash
pnpm cx:board
pnpm cx:queue
pnpm cx:fleet                              # fleet-status for deployed specs
pnpm cox cx dashboard ./cxos-dashboard.html
pnpm cox cx health-history <name>
```

## Govern and handoff

```bash
pnpm cox cx brief <name>
pnpm cox cx audit <name>
pnpm cox cx snapshot <name>
pnpm cox cx cab-export <name>
pnpm cox cx export-aws <name>
pnpm cox cx aws-drift <name>               # read-only live vs plan (optional AWS)
```

## npm script aliases

| Script | Engine command |
|--------|----------------|
| `cx:doctor` | `cx doctor` |
| `cx:init` | `cx init` |
| `cx:quickstart` | `cx quickstart` |
| `cx:run` | `cx run` |
| `cx:build` | `cx build` |
| `cx:status` | `cx status` |
| `cx:list` | `cx list` |
| `cx:operate` | `cx operate` |
| `cx:proposals` | `cx proposals` |
| `cx:claim` | `cx claim` |
| `cx:tasks` | `cx tasks` |
| `cx:board` | `cx board` |
| `cx:queue` | `cx queue` |
| `cx:fleet` | `cx fleet-status` |
| `cx:dashboard` | `cx dashboard` |
| `cx:catalog` | `cx catalog` |
| `cx:journeys` | `cx journeys` |
| `cx:simulate` | `cx simulate` |
| `cx:report` | `cx report` |
| `cx:brief` | `cx brief` |
| `cx:audit` | `cx audit` |
| `cx:snapshot` | `cx snapshot` |
| `cx:incident` | `cx incident` |
| `cx:seed-operate` | `cx seed-operate` |
| `cx:health-history` | `cx health-history` |
| `cx:autopilot` | `cx autopilot` |
| `cx:aws-drift` | `cx aws-drift` |
| `cx:cab-export` | `cx cab-export` |
| `cx:export-aws` | `cx export-aws` |

Deep engine map: [coxswain `docs/CXOS-COMPLETE.md`](https://github.com/chendren/coxswain/blob/main/docs/CXOS-COMPLETE.md).

## Hard rules

1. No silent production mutation. Console, watch, and daemon propose only.
2. AWS is plan-only (`template.yaml` + `APPLY.md`). Humans apply CFN.
3. Never CreateStack (or other live CFN mutate) from Coxswain / CXOS.
4. Offline-first: core golden path works without API keys or a live stack.
5. Strong graph first: packs and NBA are closed-world; weak models optional.
