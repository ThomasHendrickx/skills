# skills

Shared agent skills in the open [Agent Skills](https://agentskills.io) format, for Claude Code and Codex alike.

Each skill is a folder under `skills/` with a `SKILL.md` (front matter `name` and `description`) and optional `scripts/`, `references/` and `assets/`.

## Install into a repo

```sh
npx skills@1.7.2 add ThomasHendrickx/skills#<tag> --agent claude-code codex -y
```

This installs into `.agents/skills/` (read by Codex) and links each skill into `.claude/skills/` (read by Claude Code), and writes `skills-lock.json`. Commit both folders and the lock file. Pin a release tag; update by installing a newer tag.

## Skills

- `software-development`: small incremental commits, sub-agent models.
- `test-driven-development`: red-green-refactor, commit evidence, test layers and rules.
- `behaviour-driven-development`: tests only from approved scenarios and guarantees, outside in; replaces `test-driven-development` in a repo that adopts it.
- `typescript`: types, errors, validation, naming.
- `domain-modelling`: ports and adapters, invariants, use cases, events.
- `ports-and-adapters`: applies domain-owned ports and boundary adapters when business rules need infrastructure, test seams, or multiple entry points.
- `repository`: aggregate-root repositories, need-named finders, contract tests, and paging.
- `cqrs`: query ports returning read types, projections only on measured need, intent-named commands.
- `domain-events`: past-tense events through an outbox and a relay, versioned integration events across contexts, idempotent consumers; explicit calls inside one context.
- `remote-calls`: timeouts, capped retries with jitter, evidence-based circuit breakers and per-dependency concurrency limits in driven adapters.
- `aip-skill-writing`: writing a SKILL.md that compiles cleanly to AIP and passes its scenarios on both forms.
- `web-frontend`: feature structure, state, React rules.
- `performance`: scale targets and budget, API design, the toolbelt, live updates, proof at scale, UI states.
- `rest-api`: the Zalando RESTful API and Event Guidelines as Spectral rules, a spec diff for compatibility, versioning and deprecation, a runtime probe, an HTML report per endpoint, and a review list for the rules no tool decides.
- `code-review`: acceptance criteria and standards as two independent axes; reports against a repository's numbered `pitfalls.md` when it has one.
- `pull-request`: the shape of a pull request body.
- `writing-for-agents`: skills, CLAUDE.md and other docs agents read.
- `scenario-video`: an Aeolus use-case or explainer script to a video (the same story without and with Aeolus, or how an Aeolus part works and when to use it), as a page and an MP4; the look, engine and score ship with it.

Example Aeolus guard rule sets are in `guard-rules/`.

## Squadron templates

Ship templates for Aeolus squadrons, in `squadrons/templates/`. squadrons reads them straight from this repository (configure it as a template repository with `path: squadrons`), so every fleet shares one copy and nothing is installed. A template's version is its tag `<name>@<n>` (`designer@1`), beside the skills' semver tags.

- `designer`: turns the owner's intent into an approved design with its acceptance criteria as Given/When/Then scenarios.

## Workflow files

Stage-by-stage runs for an agent workflow runner, in `workflows/`, read at a release tag like the skills. Each file names its stages, the role, tier, model family, deadline, input, result schema, checks and tests of each, where each decision goes, and the stuck situations with the decisions each allows. `python workflows/validate.py workflows/*.yaml` checks a file against the format's rules; CI runs it with its tests.

- `bug-fix`: analyse the issue, implement the fix test first, review it in the other model family, fix what the review blocks.

The feature workflow and format version 2 are designed in `workflows/feature-design.md`.

Both workflow format versions support four optional stage keys.

- `harness` selects `claude-code`, `codex`, `copilot`, `antigravity` or `local`.
- `model` specifies a non-empty model ID. IDs starting with `claude-` belong to the `claude` family and IDs starting with `gpt-` belong to the `gpt` family. Other IDs require `family: any`. The validator checks `sameAs` and `otherThan` against known families, and the runner checks them when a family is resolved at run start.
- `options` is a mapping with string keys. The runner checks the options declared by the selected harness at run start.
- `mcpServers` is a list of server names matching `[A-Za-z0-9_-]+`. An empty list is valid.

The validator rejects unknown stage keys. A Copilot stage without a `model` requires a compatible `models.default` from a repository profile. Pass the profile when validating a workflow that uses this fallback.

```sh
python workflows/validate.py --profile .aeolus/workflow.yml workflows/*.yaml
```

## Repo companions

These skills state principles. Each repo keeps companion skills (`<repo>-<area>`) for its code shape, folders and what its lint enforces, loaded together with the shared skill they extend.

## Versions

Immutable semver tags (`v1.0.0`). Major: a skill removed or renamed, or a rule reversed. Minor: a new skill or rule. Patch: wording.

## Writing a skill

Follow `writing-for-agents`.

## Credits

`code-review`, `pull-request` and `writing-for-agents` adapt ideas from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).
