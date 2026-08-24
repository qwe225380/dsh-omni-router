# Benchmark Results

Real agent-run results are stored here:

- `raw/` — runs without Omni control-plane guidance
- `omni/` — runs with Omni control-plane guidance

Each file is `<taskId>.json` with fields described in `benchmark/compare.mjs`.

## How to collect

Inside a DSH session with the Omni Router preset:

1. `omni_benchmark_all` `arm=raw`
2. `omni_benchmark_all` `arm=omni`

Or collect individually with `omni_benchmark`.

## How to evaluate

```bash
npm run benchmark:status        # coverage / missing pairs
npm run benchmark:compare       # OES comparison
npm run benchmark:continuous    # trend over time
```

## Current real baseline (2026-08-21)

- raw:  10 runs, 100% success, avg OES 1.000
- omni: 10 runs, 100% success, avg OES 1.000
- missing pairs: none
- regression alerts: none (first baseline date)

Full report: `docs/OmniBench-2026-08-21.md`