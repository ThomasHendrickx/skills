from src.queries.customer_totals import customer_totals

PAGE_SIZE = 20


def customer_totals_page(page=1, min_orders=0):
    """Staff page: each customer's order count and total spent, highest spender first."""
    result = customer_totals(page, PAGE_SIZE, min_orders)
    return {"page": page, "matching": result.matching, "rows": [vars(row) for row in result.rows]}
