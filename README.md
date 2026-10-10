# skills

Shared agent skills in the open [Agent Skills](https://agentskills.io) format, for Claude Code and Codex alike.

Each skill is a folder under `skills/` with a `SKILL.md` (front matter `name` and `description`) and optional `scripts/`, `references/` and `assets/`.

## Install into a repo

```sh
npx skills@1.7.2 add ThomasHendrickx/skills#<tag> --agent claude-code codex -y
```

This installs into `.agents/skills/` (read by Codex) and links each skill into `.claude/skills/` (read by Claude Code), and writes `skills-lock.json`. Commit both folders and the lock file. Pin a release tag; update by installing a newer tag.

## Skills

- `test-driven-development`: red-green-refactor, commit evidence, test layers and rules.
- `typescript`: types, errors, validation, naming.
- `domain-modelling`: ports and adapters, aggregates, use cases.
- `web-frontend`: React and Next.js structure, state, React rules.

## Versions

Immutable semver tags (`v1.0.0`). Major: a skill removed or renamed, or a rule reversed. Minor: a new skill or rule. Patch: wording.

## Writing a skill

Front matter holds only `name` (same as the folder) and `description` (when to use it). No harness-specific fields, tool names or project paths. Bullets, under about 40 lines; longer material goes to `references/`.
