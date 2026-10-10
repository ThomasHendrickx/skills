# skills

Shared agent skills in the open [Agent Skills](https://agentskills.io) format, for Claude Code and Codex alike.

Each skill is a folder under `skills/` with a `SKILL.md` (front matter `name` and `description`) and optional `scripts/`, `references/` and `assets/`.

## Install into a repo

```sh
npx skills add ThomasHendrickx/skills#<tag> --agent claude-code codex
```

This installs into `.agents/skills/` (read by Codex) and links each skill into `.claude/skills/` (read by Claude Code), and writes `skills-lock.json`. Commit both folders and the lock file. Pin a release tag; update by installing a newer tag.
