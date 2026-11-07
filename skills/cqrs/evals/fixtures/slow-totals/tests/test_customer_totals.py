from src.queries.customer_totals import customer_totals
from tests.support import DbTest


class CustomerTotalsTest(DbTest):
    def setUp(self):
        super().setUp()
        for cid, amount in (("ann", 1000), ("bob", 3000), ("cy", 2000)):
            self.customer(cid)
            self.order(f"{cid}1", cid, lines=(("A", 1, amount),))
        self.order("cy2", "cy", lines=(("A", 1, 500),))

    def test_highest_spender_first_with_count(self):
        page = customer_totals(1, 2)
        self.assertEqual([(r.customer_id, r.total_cents) for r in page.rows], [("bob", 3000), ("cy", 2500)])
        self.assertEqual(page.matching, 3)

    def test_next_page(self):
        self.assertEqual([r.customer_id for r in customer_totals(2, 2).rows], ["ann"])

    def test_min_orders_filter(self):
        page = customer_totals(1, 20, min_orders=2)
        self.assertEqual([r.customer_id for r in page.rows], ["cy"])
        self.assertEqual(page.matching, 1)

    def test_empty(self):
        self.assertEqual(customer_totals(1, 20, min_orders=5).matching, 0)
