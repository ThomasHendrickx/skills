# Ports-and-adapters scenarios

| ID | Kind | Given / When / Then |
| --- | --- | --- |
| S0.1 | script | Given CRUD, one entry point, one store, and no rules, when P0 runs, then `applies` is false and no port file exists. |
| S0.2 | script | Given a `paths.domain` file importing `infraModules`, when P0 runs, then it is in `violations`, `applies` is true, and problem 1 is present. |
| S0.3 | agent | Given an MCP tool for a REST-served use case, when P0 runs, then `problems` includes problem 3. |
| S1.1 | script | Given a use case that sends email, when P1 completes, then its port imports no `infraModules`, an in-memory adapter exists, and scenario tests pass against it. |
| S1.2 | script | Then the real adapter alone imports the email SDK. |
| S1.3 | agent | Given an external API type such as a Prisma model, when P1 completes, then the port returns a domain type and mapping is in the adapter. |
| S1.4 | script | Then `checks.dependencyDirection` passes. |
| S2.1 | agent | Given a REST handler with a business rule, when P2 adds MCP, then the rule exists once in the use case and both adapters call its inbound port. |
| S2.2 | agent | Then new-adapter tests cover input translation and error mapping only. |
| S3.1 | script | Given a handler with rules, when P3 completes, then captured scenarios pass and the handler imports only the inbound port. |
| S3.2 | agent | Then the handler contains no business decision. |
| S3.3 | script | Given untouched handlers with the same smell, when P3 completes, then they are unchanged. |
