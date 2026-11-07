from dataclasses import dataclass

from src.db import connect


@dataclass(frozen=True)
class CustomerTotal:
    customer_id: str
    name: str
    orders: int
    total_cents: int


@dataclass(frozen=True)
class CustomerTotalsPage:
    rows: list
    matching: int


SQL = """
WITH totals AS (
    SELECT c.id, c.name, count(DISTINCT o.id) AS orders, coalesce(sum(l.quantity * l.unit_price_cents), 0) AS total_cents
    FROM customers c
    JOIN orders o ON o.customer_id = c.id AND o.status <> 'cancelled'
    JOIN order_lines l ON l.order_id = o.id
    GROUP BY c.id, c.name
    HAVING count(DISTINCT o.id) >= %(min_orders)s
)
SELECT id, name, orders, total_cents, count(*) OVER () AS matching
FROM totals
ORDER BY total_cents DESC, name
LIMIT %(limit)s OFFSET %(offset)s
"""


def customer_totals(page: int, page_size: int, min_orders: int = 0) -> CustomerTotalsPage:
    with connect() as conn:
        rows = conn.execute(SQL, {"min_orders": min_orders, "limit": page_size, "offset": (page - 1) * page_size}).fetchall()
    return CustomerTotalsPage([CustomerTotal(*row[:4]) for row in rows], rows[0][4] if rows else 0)
