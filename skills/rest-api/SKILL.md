---
name: rest-api
description: Use when designing, changing or reviewing an HTTP API, its OpenAPI spec or an event type definition.
---

# REST API

The standard is the Zalando RESTful API and Event Guidelines; #118 is https://opensource.zalando.com/restful-api-guidelines/#118. The tools beside this file check every rule they can decide; `references/review.md` lists the rest. The repo companion names the spec, its `.spectral.yaml`, the service URL for the probe and how to get a token.

Steps:
1. Tools: install the dependencies of this skill's `package.json` as devDependencies, at exactly those versions. Done when `npx spectral --version` prints the pinned version.
2. Triggers, once per repo: a `.spectral.yaml` that extends this skill's `ruleset/rest-api.yaml` (inside Zalando, `ruleset/zalando-internal.yaml` too); a committed `.githooks/pre-commit` that runs `node <this skill>/scripts/check.mjs --staged`; in `package.json`, `"prepare": "git config core.hooksPath .githooks"` and `"check:api": "node <this skill>/scripts/check.mjs"`; CI runs `npm run check:api -- <every spec>`. Done when a commit of a failing spec is refused.
3. Spec first (#100): change the OpenAPI 3 spec, one YAML file, before the code. Done when the spec holds the whole change.
4. Check: `npm run check:api -- <spec>...` lints each spec and diffs it with the main branch (`--base <ref>` for another). The pre-commit hook runs the same on every staged spec. Done when it exits 0.
5. Review: walk `references/review.md`. Done when every item the change touches has its answer in the pull request.
6. Probe: with the service running, `node scripts/probe.mjs <spec> --base-url <url> --header "Authorization: Bearer <token>"`; add `--write-probes` only against a test environment. Done when it exits 0 and no operation the change touches is "not run".
7. Event types: lint each definition with `ruleset/event-types.yaml` and diff it with `scripts/diff.mjs --events`. Done when both exit 0.

Rules:
- MUST rules report errors, SHOULD rules warnings; both fail. Each rule name carries its guideline number.
- Never skip the hook (`--no-verify`): CI fails the same check anyway.
- Fix a finding in the spec or the code. An exception is the owner's call: propose it with its reason, never add it. Once approved it is an `overrides` entry in `.spectral.yaml` for that one location, with the reason as a comment.
- The diff passes a breaking change only with a MAJOR version bump (MINOR before 1.0.0). That bump is the owner's call, after every consumer agreed (#106, #116).
- An addition needs a MINOR bump. A removal needs a released version that marks it `deprecated: true` with an explanation, and waits for its `x-sunset` date when one is set (#187, #185).
- Give path parameters and required query parameters an `example`, or the probe cannot call the operation.
