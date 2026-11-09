# Scenario results

Observed on 2026-11-09 in 16 fresh Codex exec sessions (eight task groups per form, two workers at a time), followed by two independent fresh judges for S0.4, S0.5 and S3.5. Root model: `gpt-6.1-sol`; worker CLI invocations used default model selection with no override. Each group ran in its own repository from the same fixture baseline. Multiple scenarios share a task's setup, as documented in `../README.md`. These are individual observations, not a pass-rate estimate.

The evaluated instructions equal the shipped forms. Both forms have byte-identical deterministic helpers. Each agent received its own task, form and companion, without the hidden behavioral checks. Fake dependencies control external latency/status and a Sinon clock controls timing; resilience runs through Cockatiel 4.0.0. Fixture dependencies are locked, and immutable-boundary/instruction audits passed for all 16 runs.

| Scenario | SKILL.md | AIP |
| --- | --- | --- |
| S0.1 | pass | pass |
| S0.2 | pass | pass |
| S0.3 | pass | pass |
| S0.4 | pass | pass |
| S0.5 | pass | pass |
| S1.1 | pass | pass |
| S1.2 | pass | pass |
| S2.1 | pass | pass |
| S2.2 | pass | pass |
| S2.3 | not run | not run |
| S2.4 | pass | pass |
| S3.1 | pass | pass |
| S3.2 | pass | pass |
| S3.3 | pass | pass |
| S3.4 | pass | pass |
| S3.5 | pass | pass |
| S3.6 | pass | pass |
| S3.7 | pass | pass |
| S4.1 | pass | pass |

Each form: 18 pass, 0 fail, 1 not run.

S2.3 is **not run** on both forms: P0 stopped for the existing SDK mechanism, recording `applies: false` and only `P0` in `proceduresRun`. Both agents removed the duplicate adapter retry and configured the existing SDK layer. A separate behavior observation confirms three SDK attempts (`sdk-observation.txt`), but P2 never ran, so that observation is not scored as a scenario pass. Thomas's supplied source and compiled gate remain unchanged.

**Merge blocked:** `aip-skill-writing` rule 7 requires every scenario to pass on both forms; `not run` blocks. The PR remains draft. Any decision to merge despite this result requires Thomas's explicit call and a tracked failure, as that skill states. No source redesign or merge was performed.

Evidence: `results.json` holds every verdict and observation; `check-output.md` is the actual harness output; `judge-*.{json,md}` hold independent judgements and commands. `transcripts/` holds each exact prompt, report, observable command transcript, application diff, execution metadata and `RESULT.json`. `fixture-audit.txt` checks unchanged boundaries, measured inputs and instruction identity. `baseline.txt` proves the checks reject missing positive behavior and preserve negative controls; it is not a fresh-agent scenario run. `validate-aip.txt`, `check-aip.txt` and `scan-unit-test.txt` are structural checks, not scenario passes.

The evaluator runner invoked `codex exec --ignore-user-config --ephemeral --skip-git-repo-check -C <run>/repo -s danger-full-access --json -o <run>/LAST_MESSAGE.md -`, with the recorded `PROMPT.md` on stdin. Observable transcripts were extracted from completed command and agent-message events; no acceptance instructions were supplied to the workers.

Deferred manual breaker override: [issue #55](https://github.com/ThomasHendrickx/skills/issues/55).
