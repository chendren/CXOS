# Strands Decider — Local Decision Model

CXOS uses [`StrandsAgents/strands-decider-2B-hobson-v21`](https://hf.co/StrandsAgents/strands-decider-2B-hobson-v21)
locally as its **decision model**: a small (2B, Qwen3.5-Base + LoRA + readout head),
calibrated model that answers **typed questions** instead of generating text.

| Primitive | Format | Example |
|---|---|---|
| `noul` | yes/no | `--noul "Does this convey urgency?"` |
| `choice` | pick one of N | `--choice "Which team should own this?=billing,sales,support"` |
| `score` | rate on an ordered scale | `--score "How frustrated is the writer?=calm,frustrated,depressed"` |

Every answer carries a **calibrated confidence** (JevBench public: 176/231 accuracy,
Brier 0.323, ECE 0.064). JevBench's typesafe adapter runs against the local server unchanged.

## Why it belongs in CXOS

The Coxswain engine separates duties: models may narrate, pure evaluators decide on the
closed world. The Strands Decider covers the middle ground — *rote* decisions that need
judgement but not generation (the QA `noul`/`choice`/`score` rubric triage, routing picks
inside registered closed sets, contact severity rating). It runs fully **offline** on
Apple Silicon (`mps`), which keeps the workspace's offline-first hard rule intact.

## Setup (once)

```bash
cd ~/CXOS
python3 -m venv .venv          # if not present
.venv/bin/pip install strands-decider
```

The first `ask` downloads the base weights (~4 GB) into `~/.cache/huggingface`.
The venv is git-ignored; the pinned checkpoint is in `scripts/decide.mjs`
(override with `STRANDS_DECIDER_CHECKPOINT`).

## Use in this repo

```bash
# One-shot CLI decision (proxy: scripts/decide.mjs -> .venv/bin/strands-decider)
npm run decide -- --state "Customer called about a double charge..." \
  --noul "Does this handling show compliance-safe behavior?" \
  --choice "Which follow-up team should own this?=billing,sales,support" \
  --score "How would you rate the customer frustration?=calm,mild,upset" --json

# Serve POST /v1/systemone on 127.0.0.1:8000
npm run decide -- --serve
```

### QA triage (uses the decider over a local server)

```bash
# Batch: triage a JSON array or JSONL of contacts, accumulate history
npm run qa-triage -- --file fixtures/qa-triage-contacts.sample.json \
  --out .tmp/qa-triage/history.jsonl

# Live: tail -f a contacts JSONL — appended contacts are triaged as they arrive
npm run qa-triage -- --file .tmp/qa-triage/live-contacts.jsonl --watch \
  --out .tmp/qa-triage/history.jsonl --json --interval 2000

# Report: standalone offline HTML summary from one or more history files
npm run qa-report -- --results .tmp/qa-triage/history.jsonl --out qa-triage-report.html

# Calibration harness: Brier, ECE, and threshold sweep against gold QA fixture
npm run qa-calibrate

# ACD Routing Decider: skill queue choice + VIP priority noul + EWT callback noul
npm run routing-decide -- --file fixtures/routing-contacts.sample.json

# WFM Intraday Decider: SLA breach score + intraday staffing choice + burnout noul
npm run wfm-decide -- --file fixtures/wfm-intervals.sample.json

# IVR Containment Decider: failure mode choice + zero-out risk noul + friction score
npm run ivr-decide -- --file fixtures/ivr-sessions.sample.json

# Wire ontology + triage + calibration into cxos-dashboard.html
npm run dashboard:ontology
```

Policy (confidence bands, in precedence order): compliance noul ≥ 0.70 → targeted
human QA; severity ≥ 1.5 with confidence ≥ 0.70 → targeted human QA; noul < 0.20
with score < 1.0 → auto-only (clear low risk); severity confidence < 0.40 →
needs_review; otherwise auto-only full-coverage scoring. Everything not
human-sampled still receives auto QA.

Example server round-trip:

```bash
curl -s localhost:8000/v1/systemone -H 'content-type: application/json' -d '{
  "state": "Help! My payouts have been failing for 3 days!",
  "questions": {"is_urgent": {"type": "noul", "instructions": "Does this convey urgency?"}}
}'
```

## Where decisions are expected

- **QA scoring triage** (`ontology/taxonomies/qa.json`): which sample plan an evaluation
  belongs to, whether an interaction meets an auto-fail screen, rubric level scores.
- **Routing picks inside closed sets**: any `noul`/`choice` question whose options are
  registered ontology ids (queues, skills, dispositions).
- **Operate-loop gating**: propose/claim screening in the deterministic layer, where the
  options are enumerable and the confidence bands map to the engine's
  `confidenceBands` (high ≥ 0.7 act immediately; medium ≥ 0.4 verify; low, gather more).

## Limitations (from the model card — respect these)

- Phrase questions so the obvious reading is the intended one; questions are read less
  than documents.
- Long, multi-step documents are the weak spot; keep states short.
- `score`/`noul` transfer poorly to rubrics unlike the training mix — calibrate on your
  own traffic before trusting thresholds.
- Calibration is per-primitive; measure before wiring high-stakes thresholds.