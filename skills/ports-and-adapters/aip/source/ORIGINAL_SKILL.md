---
name: ports-and-adapters
description: Use when business rules need infrastructure, test seams, multiple entry points, or a swappable external dependency. Keep domain use cases independent of transport and infrastructure.
---

# Problem

Use this when domain or use-case code imports a DB, HTTP client, SDK, or queue; testing a rule needs a DB or network; handlers duplicate a use case; or replacing a vendor, API version, or store changes business logic.

# Solution

The core owns domain-language ports for what it needs. Driven adapters implement outbound ports; driving adapters translate REST, MCP, CLI, queue, or cron input to one inbound port. Use in-memory adapters for core tests. Point dependencies inward and wire only in the composition root.

# Not needed when

For pure CRUD or pass-through with one entry point, one store, and no test pain, add no ports. Add them when a problem appears.

# Rules

- Port signatures use domain types only; adapter types stay outside.
- Map external and domain types inside adapters.
- Shape each port around one use case need, not an adapter API.
- Keep business rules out of adapters.

# Failure modes

- Technology-shaped ports such as `runQuery` or `findByPrismaWhere`.
- One generic repository port per table.
- ORM or SDK types in the domain.
- Validation or business decisions in a handler or adapter.
- Ports added for later without a present problem.

# Procedures

Read the repo companion for `paths.domain`, `paths.ports`, `paths.adapters`, `paths.compositionRoot`, `checks.dependencyDirection`, and `infraModules`.

## P0: applicability gate

1. Scan `paths.domain` for imports from `infraModules` to produce `violations`.
2. Check the task for test pain, multiple entry points, or a changing dependency to produce `problems`.
3. If neither finds a problem, stop without ports; otherwise set `applies` true.

## P1: outbound port and driven adapter

1. Name the per-use-case need in domain language.
2. Define its domain-only port in `paths.ports`, then an in-memory adapter.
3. Write acceptance-criteria scenario tests against the fake before use-case code; use `behaviour-driven-development` for their rules.
4. Implement until scenarios pass, then add the real adapter with its mapping inside it.
5. Wire at `paths.compositionRoot`; run `checks.dependencyDirection`.

## P2: driving adapter

1. Find the inbound port. If the rule is in another handler, run P3 first.
2. Translate transport input to a domain command, call the port, and map results and errors at the boundary.
3. Test translation and error mapping only; wire and run `checks.dependencyDirection`.

## P3: extract a use case

1. For touched code only, capture current behaviour as scenarios.
2. Move rules behind an inbound port in `paths.domain`.
3. Reduce the handler or adapter to translation; run the direction check and scenarios.

# Scenarios

Run [evals/scenarios.md](evals/scenarios.md) against this skill and its compiled AIP form.
