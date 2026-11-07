# Staging performance run, 2026-11-03

Data: 50,000 customers, 2,000,000 orders, 5,100,000 order lines (production-sized copy).

| Endpoint | p50 | p95 | p99 | budget (p95) |
| --- | --- | --- | --- | --- |
| GET /staff/customer-totals?page=1 | 18 ms | 40 ms | 71 ms | 300 ms |
| GET /staff/customer-totals?page=40&min_orders=5 | 22 ms | 46 ms | 80 ms | 300 ms |
