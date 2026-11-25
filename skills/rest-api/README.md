# rest-api

Checks HTTP APIs against the [Zalando RESTful API and Event Guidelines](https://opensource.zalando.com/restful-api-guidelines/). Agents follow `SKILL.md`; this page is for the people who use the skill.

## What it checks

The guidelines have 146 numbered rules. The skill handles them in four ways, from strict to judgement:

1. **Lint** (Spectral rules in `ruleset/`): the spec itself, for example naming, status codes, headers, pagination and error format. Each rule is named `zalando-<number>-<slug>`, for example `zalando-118-snake-case-properties`.
2. **Diff** (`scripts/diff.mjs`): the spec against its previous version, for breaking changes, version bumps, deprecation and sunset dates.
3. **Probe** (`scripts/probe.mjs`): the running service against its spec, for what only behaviour shows, such as the real status codes and headers.
4. **Review** (`references/review.md`): the 45 rules no tool can decide, as a list to answer in the pull request.

MUST rules are errors and SHOULD rules are warnings. Both fail the check.

## Try it on one spec

From the root of the repo, once the skill is installed (see the repo README):

1. Install the tools: `npm install --save-dev @stoplight/spectral-cli@6.17.1 yaml@2.9.1`
2. Create `.spectral.yaml` with one line: `extends: [./.agents/skills/rest-api/ruleset/rest-api.yaml]`
3. Write the report: `node .agents/skills/rest-api/scripts/report.mjs <spec> -o report.html`
4. Open `report.html` in a browser.

The report lists the findings per rule and per endpoint, most impact first. Each finding names the endpoint and the part of it, for example `POST /orders › request body › schema Order › customerName`. A finding in a shared schema lists every endpoint that uses it. You can filter on MUST or SHOULD and search on a path.

## Set it up in a repo

This makes every commit that changes a spec run the check, whoever or whatever makes the change:

1. In `package.json`, add the scripts `"prepare": "git config core.hooksPath .githooks"` and `"check:api": "node .agents/skills/rest-api/scripts/check.mjs"`, then run `npm install`.
2. Commit `.githooks/pre-commit` with: `node .agents/skills/rest-api/scripts/check.mjs --staged`
3. In CI, run `npm run check:api -- <every spec>`.

The hook finds staged specs by their top-level `openapi` key and refuses the commit when one fails.

## Commands

1. `npm run check:api -- <spec>...`: lint each spec and diff it with `origin/main` (`--base <ref>` for another branch).
2. `node scripts/report.mjs <spec> -o report.html`: the HTML report.
3. `node scripts/diff.mjs <old-spec> <new-spec>`: the diff alone (`--events` for event types).
4. `node scripts/probe.mjs <spec> --base-url <url> --header "Authorization: Bearer <token>"`: the probe. It only sends GET requests unless you add `--write-probes`, which sends invalid writes: use that against a test environment only.

For event type definitions (Nakadi), lint with `ruleset/event-types.yaml` instead. Inside Zalando, extend `ruleset/zalando-internal.yaml` as well.

## Exceptions

Fix a finding in the spec or the code. When a rule truly does not apply, the API owner decides, and the exception goes in `.spectral.yaml` as an `overrides` entry for that one location, with the reason as a comment.

## Limits

1. OpenAPI 3, one file per spec.
2. Some rules are checked only in part, and some checks use word lists (for example plural names), so they can miss a case or flag a false one. Report false findings as an issue on this repo.
3. The probe needs an `example` on path parameters and required query parameters, or it skips that operation.
4. The rules follow the guidelines as they were at commit `19a1905`. Later changes upstream are not picked up by themselves.
