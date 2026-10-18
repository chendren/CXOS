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