---
name: ports-and-adapters
description: Apply ports and adapters when business rules need infrastructure, test seams, multiple entry points, or a swappable dependency.
metadata:
  aip:
    spec: https://github.com/zach-blumenfeld/aip/tree/v0.3a3
    schemaId: https://raw.githubusercontent.com/zach-blumenfeld/aip/v0.3a3/assets/aip-schemas/procedure.schema.json
---

```yaml
purpose: Keep use cases independent of infrastructure and transport through domain-owned ports and boundary adapters.
trigger_when:
  - Domain or use-case code imports infrastructure.
  - Testing rules needs a DB or network.
  - A use case has multiple entry points or a changing external dependency.
do_not_use_when:
  - Pure CRUD or pass-through has one entry point, one store, and no test pain.
steps:
  - name: p0-scan-infrastructure-imports
    description: Scan domain paths for imports from infrastructure modules.
    script: scripts/scan_domain_imports.py
    inputs:
      - name: paths.domain
        type: string
      - name: infraModules
        type: list[string]
    outputs:
      - name: violations
        type: list[string]
  - name: p0-assess-applicability
    description: Check for test pain, multiple entry points, or changing dependencies; stop without ports when no problem exists.
    inputs:
      - name: violations
        type: list[string]
      - name: task
        type: object
    outputs:
      - name: problems
        type: list[integer]
      - name: applies
        type: boolean
  - name: p1-outbound-port-and-driven-adapter
    description: Define a domain-language outbound port, test it with an in-memory adapter, implement the use case, add the mapped real adapter, wire it, and run the direction check.
    inputs:
      - name: applies
        type: boolean
      - name: paths.ports
        type: string
      - name: paths.adapters
        type: string
      - name: paths.compositionRoot
        type: string
      - name: checks.dependencyDirection
        type: string
  - name: p2-driving-adapter
    description: Find the inbound port, extract first with P3 if needed, translate transport input and errors, test translation only, wire, and run the direction check.
    inputs:
      - name: applies
        type: boolean
      - name: paths.compositionRoot
        type: string
      - name: checks.dependencyDirection
        type: string
  - name: p3-extract-use-case
    description: For touched code only, capture scenarios, move rules behind an inbound port, reduce the boundary to translation, and run scenarios and the direction check.
    inputs:
      - name: applies
        type: boolean
      - name: paths.domain
        type: string
      - name: checks.dependencyDirection
        type: string
scenarios:
  - need: CRUD with no rules, one entry point, and one store.
    action: Run P0 and create no port.
    outcome: applies is false.
  - need: A domain file imports infrastructure.
    action: Run P0, then use P1 or P3 for touched code.
    outcome: The violation is reported and dependencies point inward.
anti_patterns:
  - Technology-shaped or generic table repository ports.
  - ORM or SDK types crossing into the domain.
  - Business rules in adapters or ports added without a problem.
```
