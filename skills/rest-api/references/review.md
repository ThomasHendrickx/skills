# Review: the rules no tool decides

Answer each item the change touches. The lint, the diff and the probe check the other rules.

Design:
1. #100 The spec change came before the code and was reviewed by peers and client developers.
2. #138 An action is a resource (a cancellation, an article lock) the method acts on; the lint only catches verbs in URLs (#141).
3. #140 Resources cover about 90% of client use cases; filtering (#157) and embedding (#158) cover the rest.
4. #139 One API holds the complete business process, not a thin wrapper around a database.
5. #162 Resources, methods and status codes carry the meaning (maturity level 2).
6. #149 GET and HEAD are safe; GET, HEAD, PUT and DELETE are idempotent; none has intended side effects beyond its semantics.
7. #229 #231 A POST or PATCH clients may retry is idempotent: a secondary key (409 on repeat), If-Match, or Idempotency-Key (#230).
8. #226 Implicit filtering (only what the caller may see) is stated in the endpoint description.
9. #123 Absent and null mean the same; a real third state gets its own value.
10. #236 #237 Simple queries are name=value pairs with and-semantics; complex ones are JSON (POST documented as GET with body).
11. #244 Several representations of one resource are chosen through content negotiation.
12. #250 Input passed to tools that break on some Unicode (\u0000 in Postgres) is sanitized or rejected, and the spec says so.
13. #155 For high-traffic or mobile clients: compression, field filters, ETag, Prefer, pagination, caching.

Operations:
14. #256 Gateways and proxies keep the status code meaning: a missing route is 502, 503 or 504, never 404.
15. #184 Proprietary headers (X-Flow-ID and the like) pass unchanged to every downstream call.
16. #193 #188 Usage is monitored per client (the client id in the token); a feature scheduled for sunset especially.
17. #186 #185 External partners agreed to the time between deprecation and sunset; all clients agreed to the sunset date before shutdown.

As a client of other APIs:
18. #108 Tolerant reader: ignore unknown fields (keep them for a later PUT), handle unknown enum values and status codes, follow 301.
19. #191 Do not start using a deprecated API or feature.
20. #190 Monitor the Deprecation and Sunset headers and alert on them.
21. #257 A 404 may come from a router; check before concluding the resource is gone.

Events:
22. #194 #195 Event types are part of the interface: designed API first, schema and definition reviewed.
23. #201 Steps of a business process are general events with a process id and an order (ordering fields or parent_eids).
24. #202 Data changes are data change events carrying the complete entity with its id, published reliably.
25. #205 A data change event matches the API representation of the entity.
26. #199 Event types are useful business resources, not every internal change.
27. #211 #247 Producers set eid (the same eid on every retry) and occurred_at.
28. #214 #212 Consumers are robust against duplicates and process out of order idempotently.

Options, no obligation (MAY): #133 standard headers, #179 Content-Location, #181 Prefer, #182 ETag with If-Match and If-None-Match, #230 Idempotency-Key, #253 asynchronous processing (202, a job resource), #163 HATEOAS, #168 non-JSON media types, #241 compound keys, #145 nested URLs.
