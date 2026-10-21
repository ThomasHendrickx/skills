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
- `typescript`: types, errors, validation, naming.
- `domain-modelling`: ports and adapters, invariants, use cases, events.
- `web-frontend`: feature structure, state, React rules.
- `code-review`: acceptance criteria and standards as two independent axes.
- `pull-request`: the shape of a pull request body.
- `writing-for-agents`: skills, CLAUDE.md and other docs agents read.
- `scenario-video`: an Aeolus use-case or explainer script to a video (the same story without and with Aeolus, or how an Aeolus part works and when to use it), as a page and an MP4; the look, engine and score ship with it.

## Repo companions

These skills state principles. Each repo keeps companion skills (`<repo>-<area>`) for its code shape, folders and what its lint enforces, loaded together with the shared skill they extend.

## Versions

Immutable semver tags (`v1.0.0`). Major: a skill removed or renamed, or a rule reversed. Minor: a new skill or rule. Patch: wording.

## Writing a skill

Follow `writing-for-agents`.

## Credits

`code-review`, `pull-request` and `writing-for-agents` adapt ideas from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).
