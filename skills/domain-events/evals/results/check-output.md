| Scenario | SKILL.md | AIP | notes (SKILL.md / AIP) |
| --- | --- | --- | --- |
| S0.1 | PASS | PASS | applies=False event list or events module changed=[] / applies=False event list or events module changed=[] |
| S0.2 | PASS | PASS | violations=['src/sales/core/commands/cancel_invoice.py', 'src/sales/core/commands/pay_invoice.py'] / violations=['src/sales/core/commands/cancel_invoice.py', 'src/sales/core/commands/pay_invoice.py'] |
| S0.3 | PASS | PASS | problems=[1, 2] applies=True (agent's P0 output) / problems=[1, 3] applies=True (agent's P0 output) |
| S1.1 | PASS | PASS | rolled-back payment: raised RaiseException, tables changed=[]; committed payment: committed, rows gained in new tables={'sales_outbox': 1} / rolled-back payment: raised RaiseException, tables changed=[]; committed payment: committed, rows gained in new tables={'sales_outbox': 1} |
| S1.2 | PASS | PASS | domain or use case files importing the bus client=[] / domain or use case files importing the bus client=[] |
| S1.3 | PASS | PASS | InvoicePaid (src/sales/core/events.py) is a past-tense fact, recorded by Invoice.pay, and docs/event-list.md (paths.eventList) now lists 'InvoicePaid: a customer paid an invoice'. / InvoicePaid is a past-tense fact (src/sales/core/events.py, recorded in Invoice.pay) and is listed in docs/event-list.md, the companion's paths.eventList. |
| S2.1 | PASS | PASS | contract files=['sales.py'] versioned={'sales.py': True} shipping imports of sales=[] / contract files=['invoice_paid.py'] versioned={'invoice_paid.py': True} shipping imports of sales=[] |
| S2.2 | PASS | PASS | src/contracts/sales.py InvoicePaidV1 carries order_id and paid_on (what shipping needs) plus invoice_id, event_id and invoice_version. The docstring declares the version and dedupe key and says there is no state transfer. invoice_id is an extra field the docstring does not explain, so this is a lenient pass. / src/contracts/invoice_paid.py carries order_id and paid_on, the two fields shipping needs. The extra event_id, invoice_id and version are identifiers or declared metadata, and the docstring declares them, with no invoice state carried. |
| S2.3 | PASS | PASS | applies=False contract files added=[] / applies=False contract files added=[] |
| S3.1 | PASS | PASS | same InvoicePaid delivered twice -> fulfilments for o1=[('requested',)] deliver exits=[0, 0, 0] / same InvoicePaid delivered twice -> fulfilments for o1=[('requested',)] deliver exits=[0, 0, 0] |
| S3.2 | PASS | PASS | InvoiceRefunded v3 then InvoicePaid v2 -> fulfilments for o2=[] deliver exits=[0, 0, 0] / InvoiceRefunded v3 then InvoicePaid v2 -> fulfilments for o2=[] deliver exits=[0, 0, 0] |
| S3.3 | PASS | PASS | handler attempts=5 dead-letter rows=['(1,"{""type"": ""InvoicePaid"", ""event_id"": ""e4"", ""order_id"": ""o3"", ""invoice_id"": ""i3"", ""occurred_on"": ""2026-11-02"", ""invoice_version"": 2}",5,"RaiseException(\'harness: fulfilment refused\\\\nCONTEXT:  PL/pgSQL function harness_fail_o3() line 3 at RAISE\')","2026-11-07 16:19:32.023562+00")'] message e4 (bus id 1) dead-lettered=True deliver ex / handler attempts=3 dead-letter rows=['(1,"{""type"": ""InvoicePaid"", ""event_id"": ""e4"", ""order_id"": ""o3"", ""invoice_id"": ""i3"", ""occurred_on"": ""2026-11-02"", ""invoice_version"": 2}",3,"RaiseException: harness: fulfilment refused\nCONTEXT:  PL/pgSQL function harness_fail_o3() line 3 at RAISE","2026-11-07 16:19:47.886159+00")'] message e4 (bus id 1) dead-lettered=True deliver exits=[0, |
| S4.1 | PASS | PASS | rolled-back payment: raised RaiseException, tables changed=[]; committed payment: committed, rows gained in new tables={'sales_outbox': 1}; cancel_invoice.py unchanged=True / rolled-back payment: raised RaiseException, tables changed=[]; committed payment: committed, rows gained in new tables={'sales_outbox': 1}; cancel_invoice.py unchanged=True |
| S4.2 | FAIL | FAIL | The handler-chain repo is unchanged apart from RESULT.json (applies:false). src/sales/core/handlers.py still has the same-transaction credit_customer_account update, dispatched by the unit of work in src/sales/adapters/pg.py, not called explicitly from the use case. / The agent changed nothing. The handler-chain diff holds only RESULT.json, so src/sales/core/commands/pay_invoice.py has no explicit call and the update still runs through HANDLERS in handlers.py, dispatched by the unit of work in adapters/pg.py. |

### S1.3 [skill-md] Then the event is a past-tense fact and listed in paths.eventList.
diff base -> repo:
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/docs/event-list.md ../repo/docs/event-list.md
--- ../base/docs/event-list.md	2026-11-07 17:08:07.021316218 +0100
+++ ../repo/docs/event-list.md	2026-11-07 17:16:28.452274587 +0100
@@ -6,6 +6,7 @@
 
 - OrderPlaced: a customer placed an order (order id, customer id, total).
 - InvoiceIssued: an invoice was issued for an order (invoice id, order id, amount).
+- InvoicePaid: a customer paid an invoice (invoice id, order id, paid on, invoice version after payment).
 
 ## shipping
 
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/schema.sql ../repo/schema.sql
--- ../base/schema.sql	2026-11-07 17:08:07.021316218 +0100
+++ ../repo/schema.sql	2026-11-07 17:16:28.453274577 +0100
@@ -25,6 +25,16 @@
     version integer NOT NULL DEFAULT 1
 );
 
+-- Sales outbox: written in the same transaction as the change; src/sales/adapters/relay.py publishes it.
+CREATE TABLE sales_outbox (
+    id bigserial PRIMARY KEY,
+    event_type text NOT NULL,
+    aggregate_id text NOT NULL,
+    payload jsonb NOT NULL,
+    created_at timestamptz NOT NULL DEFAULT now(),
+    published_at timestamptz
+);
+
 -- Shipping context
 CREATE TABLE fulfilments (
     id text PRIMARY KEY,
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/contracts/sales.py ../repo/src/contracts/sales.py
--- ../base/src/contracts/sales.py	1970-01-01 01:00:00.000000000 +0100
+++ ../repo/src/contracts/sales.py	2026-11-07 17:16:28.457274536 +0100
@@ -0,0 +1,24 @@
+"""Sales integration events (published contracts, one producer: Sales). Changes are additive; a breaking change is a new version."""
+from dataclasses import dataclass
+from datetime import date
+
+INVOICE_PAID_TOPIC = "sales.invoice-paid.v1"
+
+
+@dataclass(frozen=True)
+class InvoicePaidV1:
+    """An invoice was paid. Carries ids and the facts of the change (no state transfer).
+    `invoice_version` lets consumers ignore a stale redelivery; `event_id` is the dedupe key."""
+    event_id: str
+    invoice_id: str
+    order_id: str
+    paid_on: date
+    invoice_version: int
+
+    def to_payload(self) -> dict:
+        return {"version": 1, "event_id": self.event_id, "invoice_id": self.invoice_id, "order_id": self.order_id,
+                "paid_on": self.paid_on.isoformat(), "invoice_version": self.invoice_version}
+
+    @classmethod
+    def from_payload(cls, p: dict) -> "InvoicePaidV1":
+        return cls(p["event_id"], p["invoice_id"], p["order_id"], date.fromisoformat(p["paid_on"]), p["invoice_version"])
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/main.py ../repo/src/main.py
--- ../base/src/main.py	2026-11-07 17:08:07.034316087 +0100
+++ ../repo/src/main.py	2026-11-07 17:16:28.458274526 +0100
@@ -30,3 +30,9 @@
 
 def cancel_fulfilment(order_id):
     return shipping.cancel_fulfilment(PgShippingUnitOfWork(), order_id)
+
+
+def relay_sales_outbox():
+    """Run by a scheduler/worker after commits; publishes pending Sales integration events."""
+    from src.sales.adapters.relay import relay_once
+    return relay_once()
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/adapters/pg.py ../repo/src/sales/adapters/pg.py
--- ../base/src/sales/adapters/pg.py	2026-11-07 17:08:07.031316118 +0100
+++ ../repo/src/sales/adapters/pg.py	2026-11-07 17:16:28.453274577 +0100
@@ -1,3 +1,7 @@
+import dataclasses
+
+from psycopg.types.json import Jsonb
+
 from src.db import connect
 from src.sales.core.invoices import Invoice
 from src.sales.core.orders import Order, OrderLine
@@ -48,6 +52,13 @@
         if row is None:
             raise StaleInvoice(invoice.id)
         invoice.version = row[0]
+        for event in invoice.events:
+            if type(event).__name__ == "InvoicePaid":
+                payload = dataclasses.asdict(event)
+                payload["paid_on"] = event.paid_on.isoformat()
+                self.conn.execute("INSERT INTO sales_outbox (event_type, aggregate_id, payload) VALUES (%s, %s, %s)",
+                                  ("InvoicePaid", invoice.id, Jsonb(payload)))
+        invoice.events.clear()
 
 
 class PgSalesUnitOfWork:
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/adapters/relay.py ../repo/src/sales/adapters/relay.py
--- ../base/src/sales/adapters/relay.py	1970-01-01 01:00:00.000000000 +0100
+++ ../repo/src/sales/adapters/relay.py	2026-11-07 17:16:28.457274536 +0100
@@ -0,0 +1,39 @@
+"""Outbox relay: publishes committed sales_outbox rows to the bus, at least once, with retry.
+A crash between publish and marking republishes the row; consumers dedupe on event_id."""
+import time
+from datetime import date
+
+from src.contracts.sales import INVOICE_PAID_TOPIC, InvoicePaidV1
+from src.db import connect
+from src.infra import bus
+
+
+def to_contract(row_id: int, event_type: str, payload: dict):
+    """Map an internal event to its published contract; None when no contract exists (internal-only)."""
+    if event_type == "InvoicePaid":
+        return INVOICE_PAID_TOPIC, InvoicePaidV1(f"sales-outbox-{row_id}", payload["invoice_id"], payload["order_id"],
+                                                 date.fromisoformat(payload["paid_on"]), payload["version"]).to_payload()
+    return None
+
+
+def relay_once(retries: int = 3, delay: float = 0.1) -> int:
+    """Publish pending rows in order; returns how many were published. Raises after `retries` failures of one row."""
+    published = 0
+    with connect() as conn:
+        rows = conn.execute("SELECT id, event_type, payload FROM sales_outbox WHERE published_at IS NULL"
+                            " ORDER BY id FOR UPDATE SKIP LOCKED").fetchall()
+        for row_id, event_type, payload in rows:
+            mapped = to_contract(row_id, event_type, payload)
+            if mapped is not None:
+                for attempt in range(retries):
+                    try:
+                        bus.publish(*mapped)
+                        break
+                    except Exception:
+                        if attempt == retries - 1:
+                            raise
+                        time.sleep(delay * 2 ** attempt)
+                published += 1
+            conn.execute("UPDATE sales_outbox SET published_at = now() WHERE id = %s", (row_id,))
+            conn.commit()
+    return published
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/core/events.py ../repo/src/sales/core/events.py
--- ../base/src/sales/core/events.py	2026-11-07 17:08:07.025316178 +0100
+++ ../repo/src/sales/core/events.py	2026-11-07 17:16:28.453274577 +0100
@@ -1,5 +1,6 @@
 """Sales domain events (see docs/event-list.md). Aggregates record them in `events`."""
 from dataclasses import dataclass
+from datetime import date
 
 
 @dataclass(frozen=True)
@@ -14,3 +15,11 @@
     invoice_id: str
     order_id: str
     amount_cents: int
+
+
+@dataclass(frozen=True)
+class InvoicePaid:
+    invoice_id: str
+    order_id: str
+    paid_on: date
+    version: int  # the invoice version this payment produces
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/core/invoices.py ../repo/src/sales/core/invoices.py
--- ../base/src/sales/core/invoices.py	2026-11-07 17:08:07.027316158 +0100
+++ ../repo/src/sales/core/invoices.py	2026-11-07 17:16:28.453274577 +0100
@@ -1,7 +1,7 @@
 from dataclasses import dataclass, field
 from datetime import date
 
-from src.sales.core.events import InvoiceIssued
+from src.sales.core.events import InvoiceIssued, InvoicePaid
 
 
 class InvoiceNotPayable(Exception):
@@ -29,6 +29,7 @@
         if self.status != "issued":
             raise InvoiceNotPayable(f"invoice {self.id} is {self.status}")
         self.status, self.paid_on = "paid", on
+        self.events.append(InvoicePaid(self.id, self.order_id, on, self.version + 1))
 
     def cancel(self) -> None:
         if self.status != "issued":
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/tests/test_sales.py ../repo/tests/test_sales.py
--- ../base/tests/test_sales.py	2026-11-07 17:08:07.035316077 +0100
+++ ../repo/tests/test_sales.py	2026-11-07 17:16:28.458274526 +0100
@@ -26,3 +26,74 @@
         self.invoice()
         main.cancel_invoice("i1")
         self.assertEqual(self.rows("SELECT status FROM invoices"), [("cancelled",)])
+
+
+class InvoicePaidEventTest(DbTest):
+    def outbox(self):
+        return self.rows("SELECT event_type, aggregate_id, payload FROM sales_outbox ORDER BY id")
+
+    def test_paying_writes_one_outbox_row(self):
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        self.assertEqual(self.outbox(), [("InvoicePaid", "i1", {"invoice_id": "i1", "order_id": "o1", "paid_on": "2026-11-02", "version": 2})])
+
+    def test_rejected_payment_writes_nothing(self):
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        with self.assertRaises(InvoiceNotPayable):
+            main.pay_invoice("i1", date(2026, 11, 3))
+        self.assertEqual(len(self.outbox()), 1)
+
+    def test_rollback_after_save_writes_nothing(self):
+        from src.sales.adapters.pg import PgSalesUnitOfWork
+        self.invoice()
+        with self.assertRaises(RuntimeError):
+            with PgSalesUnitOfWork() as uow:
+                invoice = uow.invoices.get("i1")
+                invoice.pay(date(2026, 11, 2))
+                uow.invoices.save(invoice)
+                raise RuntimeError("boom")
+        self.assertEqual(self.outbox(), [])
+        self.assertEqual(self.rows("SELECT status FROM invoices"), [("issued",)])
+
+    def test_nothing_is_published_before_the_relay_runs(self):
+        from src.infra import bus
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        self.assertEqual(bus.fetch("sales.invoice-paid.v1"), [])
+
+
+class InvoicePaidContractTest(DbTest):
+    def test_relay_publishes_the_contract_once(self):
+        from src.infra import bus
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        self.assertEqual(main.relay_sales_outbox(), 1)
+        self.assertEqual(main.relay_sales_outbox(), 0)
+        [(_, body)] = bus.fetch("sales.invoice-paid.v1")
+        self.assertEqual(body, {"version": 1, "event_id": body["event_id"], "invoice_id": "i1", "order_id": "o1",
+                                "paid_on": "2026-11-02", "invoice_version": 2})
+
+    def test_failed_publish_is_retried_and_not_lost(self):
+        from unittest import mock
+        from src.infra import bus
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        real = bus.publish
+        calls = []
+
+        def flaky(topic, body):
+            calls.append(1)
+            if len(calls) < 3:
+                raise ConnectionError("bus down")
+            real(topic, body)
+        with mock.patch.object(bus, "publish", flaky):
+            self.assertEqual(main.relay_sales_outbox(), 1)
+        self.assertEqual(len(bus.fetch("sales.invoice-paid.v1")), 1)
+
+    def test_cancelled_invoice_publishes_nothing(self):
+        from src.infra import bus
+        self.invoice()
+        main.cancel_invoice("i1")
+        main.relay_sales_outbox()
+        self.assertEqual(bus.fetch("sales.invoice-paid.v1"), [])

### S2.2 [skill-md] Then the payload holds only the fields shipping's need names; any carried state is declared.
diff base -> repo:
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/docs/event-list.md ../repo/docs/event-list.md
--- ../base/docs/event-list.md	2026-11-07 17:08:07.021316218 +0100
+++ ../repo/docs/event-list.md	2026-11-07 17:16:28.452274587 +0100
@@ -6,6 +6,7 @@
 
 - OrderPlaced: a customer placed an order (order id, customer id, total).
 - InvoiceIssued: an invoice was issued for an order (invoice id, order id, amount).
+- InvoicePaid: a customer paid an invoice (invoice id, order id, paid on, invoice version after payment).
 
 ## shipping
 
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/schema.sql ../repo/schema.sql
--- ../base/schema.sql	2026-11-07 17:08:07.021316218 +0100
+++ ../repo/schema.sql	2026-11-07 17:16:28.453274577 +0100
@@ -25,6 +25,16 @@
     version integer NOT NULL DEFAULT 1
 );
 
+-- Sales outbox: written in the same transaction as the change; src/sales/adapters/relay.py publishes it.
+CREATE TABLE sales_outbox (
+    id bigserial PRIMARY KEY,
+    event_type text NOT NULL,
+    aggregate_id text NOT NULL,
+    payload jsonb NOT NULL,
+    created_at timestamptz NOT NULL DEFAULT now(),
+    published_at timestamptz
+);
+
 -- Shipping context
 CREATE TABLE fulfilments (
     id text PRIMARY KEY,
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/contracts/sales.py ../repo/src/contracts/sales.py
--- ../base/src/contracts/sales.py	1970-01-01 01:00:00.000000000 +0100
+++ ../repo/src/contracts/sales.py	2026-11-07 17:16:28.457274536 +0100
@@ -0,0 +1,24 @@
+"""Sales integration events (published contracts, one producer: Sales). Changes are additive; a breaking change is a new version."""
+from dataclasses import dataclass
+from datetime import date
+
+INVOICE_PAID_TOPIC = "sales.invoice-paid.v1"
+
+
+@dataclass(frozen=True)
+class InvoicePaidV1:
+    """An invoice was paid. Carries ids and the facts of the change (no state transfer).
+    `invoice_version` lets consumers ignore a stale redelivery; `event_id` is the dedupe key."""
+    event_id: str
+    invoice_id: str
+    order_id: str
+    paid_on: date
+    invoice_version: int
+
+    def to_payload(self) -> dict:
+        return {"version": 1, "event_id": self.event_id, "invoice_id": self.invoice_id, "order_id": self.order_id,
+                "paid_on": self.paid_on.isoformat(), "invoice_version": self.invoice_version}
+
+    @classmethod
+    def from_payload(cls, p: dict) -> "InvoicePaidV1":
+        return cls(p["event_id"], p["invoice_id"], p["order_id"], date.fromisoformat(p["paid_on"]), p["invoice_version"])
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/main.py ../repo/src/main.py
--- ../base/src/main.py	2026-11-07 17:08:07.034316087 +0100
+++ ../repo/src/main.py	2026-11-07 17:16:28.458274526 +0100
@@ -30,3 +30,9 @@
 
 def cancel_fulfilment(order_id):
     return shipping.cancel_fulfilment(PgShippingUnitOfWork(), order_id)
+
+
+def relay_sales_outbox():
+    """Run by a scheduler/worker after commits; publishes pending Sales integration events."""
+    from src.sales.adapters.relay import relay_once
+    return relay_once()
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/adapters/pg.py ../repo/src/sales/adapters/pg.py
--- ../base/src/sales/adapters/pg.py	2026-11-07 17:08:07.031316118 +0100
+++ ../repo/src/sales/adapters/pg.py	2026-11-07 17:16:28.453274577 +0100
@@ -1,3 +1,7 @@
+import dataclasses
+
+from psycopg.types.json import Jsonb
+
 from src.db import connect
 from src.sales.core.invoices import Invoice
 from src.sales.core.orders import Order, OrderLine
@@ -48,6 +52,13 @@
         if row is None:
             raise StaleInvoice(invoice.id)
         invoice.version = row[0]
+        for event in invoice.events:
+            if type(event).__name__ == "InvoicePaid":
+                payload = dataclasses.asdict(event)
+                payload["paid_on"] = event.paid_on.isoformat()
+                self.conn.execute("INSERT INTO sales_outbox (event_type, aggregate_id, payload) VALUES (%s, %s, %s)",
+                                  ("InvoicePaid", invoice.id, Jsonb(payload)))
+        invoice.events.clear()
 
 
 class PgSalesUnitOfWork:
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/adapters/relay.py ../repo/src/sales/adapters/relay.py
--- ../base/src/sales/adapters/relay.py	1970-01-01 01:00:00.000000000 +0100
+++ ../repo/src/sales/adapters/relay.py	2026-11-07 17:16:28.457274536 +0100
@@ -0,0 +1,39 @@
+"""Outbox relay: publishes committed sales_outbox rows to the bus, at least once, with retry.
+A crash between publish and marking republishes the row; consumers dedupe on event_id."""
+import time
+from datetime import date
+
+from src.contracts.sales import INVOICE_PAID_TOPIC, InvoicePaidV1
+from src.db import connect
+from src.infra import bus
+
+
+def to_contract(row_id: int, event_type: str, payload: dict):
+    """Map an internal event to its published contract; None when no contract exists (internal-only)."""
+    if event_type == "InvoicePaid":
+        return INVOICE_PAID_TOPIC, InvoicePaidV1(f"sales-outbox-{row_id}", payload["invoice_id"], payload["order_id"],
+                                                 date.fromisoformat(payload["paid_on"]), payload["version"]).to_payload()
+    return None
+
+
+def relay_once(retries: int = 3, delay: float = 0.1) -> int:
+    """Publish pending rows in order; returns how many were published. Raises after `retries` failures of one row."""
+    published = 0
+    with connect() as conn:
+        rows = conn.execute("SELECT id, event_type, payload FROM sales_outbox WHERE published_at IS NULL"
+                            " ORDER BY id FOR UPDATE SKIP LOCKED").fetchall()
+        for row_id, event_type, payload in rows:
+            mapped = to_contract(row_id, event_type, payload)
+            if mapped is not None:
+                for attempt in range(retries):
+                    try:
+                        bus.publish(*mapped)
+                        break
+                    except Exception:
+                        if attempt == retries - 1:
+                            raise
+                        time.sleep(delay * 2 ** attempt)
+                published += 1
+            conn.execute("UPDATE sales_outbox SET published_at = now() WHERE id = %s", (row_id,))
+            conn.commit()
+    return published
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/core/events.py ../repo/src/sales/core/events.py
--- ../base/src/sales/core/events.py	2026-11-07 17:08:07.025316178 +0100
+++ ../repo/src/sales/core/events.py	2026-11-07 17:16:28.453274577 +0100
@@ -1,5 +1,6 @@
 """Sales domain events (see docs/event-list.md). Aggregates record them in `events`."""
 from dataclasses import dataclass
+from datetime import date
 
 
 @dataclass(frozen=True)
@@ -14,3 +15,11 @@
     invoice_id: str
     order_id: str
     amount_cents: int
+
+
+@dataclass(frozen=True)
+class InvoicePaid:
+    invoice_id: str
+    order_id: str
+    paid_on: date
+    version: int  # the invoice version this payment produces
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/core/invoices.py ../repo/src/sales/core/invoices.py
--- ../base/src/sales/core/invoices.py	2026-11-07 17:08:07.027316158 +0100
+++ ../repo/src/sales/core/invoices.py	2026-11-07 17:16:28.453274577 +0100
@@ -1,7 +1,7 @@
 from dataclasses import dataclass, field
 from datetime import date
 
-from src.sales.core.events import InvoiceIssued
+from src.sales.core.events import InvoiceIssued, InvoicePaid
 
 
 class InvoiceNotPayable(Exception):
@@ -29,6 +29,7 @@
         if self.status != "issued":
             raise InvoiceNotPayable(f"invoice {self.id} is {self.status}")
         self.status, self.paid_on = "paid", on
+        self.events.append(InvoicePaid(self.id, self.order_id, on, self.version + 1))
 
     def cancel(self) -> None:
         if self.status != "issued":
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/tests/test_sales.py ../repo/tests/test_sales.py
--- ../base/tests/test_sales.py	2026-11-07 17:08:07.035316077 +0100
+++ ../repo/tests/test_sales.py	2026-11-07 17:16:28.458274526 +0100
@@ -26,3 +26,74 @@
         self.invoice()
         main.cancel_invoice("i1")
         self.assertEqual(self.rows("SELECT status FROM invoices"), [("cancelled",)])
+
+
+class InvoicePaidEventTest(DbTest):
+    def outbox(self):
+        return self.rows("SELECT event_type, aggregate_id, payload FROM sales_outbox ORDER BY id")
+
+    def test_paying_writes_one_outbox_row(self):
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        self.assertEqual(self.outbox(), [("InvoicePaid", "i1", {"invoice_id": "i1", "order_id": "o1", "paid_on": "2026-11-02", "version": 2})])
+
+    def test_rejected_payment_writes_nothing(self):
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        with self.assertRaises(InvoiceNotPayable):
+            main.pay_invoice("i1", date(2026, 11, 3))
+        self.assertEqual(len(self.outbox()), 1)
+
+    def test_rollback_after_save_writes_nothing(self):
+        from src.sales.adapters.pg import PgSalesUnitOfWork
+        self.invoice()
+        with self.assertRaises(RuntimeError):
+            with PgSalesUnitOfWork() as uow:
+                invoice = uow.invoices.get("i1")
+                invoice.pay(date(2026, 11, 2))
+                uow.invoices.save(invoice)
+                raise RuntimeError("boom")
+        self.assertEqual(self.outbox(), [])
+        self.assertEqual(self.rows("SELECT status FROM invoices"), [("issued",)])
+
+    def test_nothing_is_published_before_the_relay_runs(self):
+        from src.infra import bus
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        self.assertEqual(bus.fetch("sales.invoice-paid.v1"), [])
+
+
+class InvoicePaidContractTest(DbTest):
+    def test_relay_publishes_the_contract_once(self):
+        from src.infra import bus
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        self.assertEqual(main.relay_sales_outbox(), 1)
+        self.assertEqual(main.relay_sales_outbox(), 0)
+        [(_, body)] = bus.fetch("sales.invoice-paid.v1")
+        self.assertEqual(body, {"version": 1, "event_id": body["event_id"], "invoice_id": "i1", "order_id": "o1",
+                                "paid_on": "2026-11-02", "invoice_version": 2})
+
+    def test_failed_publish_is_retried_and_not_lost(self):
+        from unittest import mock
+        from src.infra import bus
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        real = bus.publish
+        calls = []
+
+        def flaky(topic, body):
+            calls.append(1)
+            if len(calls) < 3:
+                raise ConnectionError("bus down")
+            real(topic, body)
+        with mock.patch.object(bus, "publish", flaky):
+            self.assertEqual(main.relay_sales_outbox(), 1)
+        self.assertEqual(len(bus.fetch("sales.invoice-paid.v1")), 1)
+
+    def test_cancelled_invoice_publishes_nothing(self):
+        from src.infra import bus
+        self.invoice()
+        main.cancel_invoice("i1")
+        main.relay_sales_outbox()
+        self.assertEqual(bus.fetch("sales.invoice-paid.v1"), [])

### S4.2 [skill-md] Given an in-process handler doing a same-transaction update, When P4 completes, Then it is an explicit call in the use case.
diff base -> repo:


### S1.3 [aip] Then the event is a past-tense fact and listed in paths.eventList.
diff base -> repo:
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/docs/event-list.md ../repo/docs/event-list.md
--- ../base/docs/event-list.md	2026-11-07 17:08:07.021316218 +0100
+++ ../repo/docs/event-list.md	2026-11-07 17:16:31.047248503 +0100
@@ -6,6 +6,7 @@
 
 - OrderPlaced: a customer placed an order (order id, customer id, total).
 - InvoiceIssued: an invoice was issued for an order (invoice id, order id, amount).
+- InvoicePaid: an invoice was paid (invoice id, order id, paid date, invoice version).
 
 ## shipping
 
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/schema.sql ../repo/schema.sql
--- ../base/schema.sql	2026-11-07 17:08:07.021316218 +0100
+++ ../repo/schema.sql	2026-11-07 17:16:31.048248493 +0100
@@ -25,6 +25,15 @@
     version integer NOT NULL DEFAULT 1
 );
 
+-- Sales outbox: events written in the same transaction as the change; the relay publishes them after commit.
+CREATE TABLE sales_outbox (
+    id bigserial PRIMARY KEY,
+    event_type text NOT NULL,
+    payload jsonb NOT NULL,
+    created_at timestamptz NOT NULL DEFAULT now(),
+    published_at timestamptz
+);
+
 -- Shipping context
 CREATE TABLE fulfilments (
     id text PRIMARY KEY,
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/contracts/invoice_paid.py ../repo/src/contracts/invoice_paid.py
--- ../base/src/contracts/invoice_paid.py	1970-01-01 01:00:00.000000000 +0100
+++ ../repo/src/contracts/invoice_paid.py	2026-11-07 17:16:31.053248443 +0100
@@ -0,0 +1,11 @@
+"""Integration event sales.invoice-paid, version 1. Producer: Sales. Additive changes only; a breaking change is v2.
+
+Carries ids and the facts of the payment only (no invoice state). `event_id` is unique per event and stable
+across redelivery; `version` is the invoice version, so a consumer can ignore an older event than one it has seen.
+"""
+TOPIC = "sales.invoice-paid.v1"
+FIELDS = ("event_id", "invoice_id", "order_id", "paid_on", "version")
+
+
+def payload(event_id: int, invoice_id: str, order_id: str, paid_on: str, version: int) -> dict:
+    return {"event_id": event_id, "invoice_id": invoice_id, "order_id": order_id, "paid_on": paid_on, "version": version}
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/main.py ../repo/src/main.py
--- ../base/src/main.py	2026-11-07 17:08:07.034316087 +0100
+++ ../repo/src/main.py	2026-11-07 17:16:31.048248493 +0100
@@ -4,6 +4,7 @@
 from src.sales.core.commands.issue_invoice import issue_invoice as _issue_invoice
 from src.sales.core.commands.pay_invoice import pay_invoice as _pay_invoice
 from src.sales.core.commands.place_order import place_order as _place_order
+from src.sales.adapters import relay
 from src.shipping.adapters.pg import PgShippingUnitOfWork
 from src.shipping.core import commands as shipping
 
@@ -24,6 +25,11 @@
     return _cancel_invoice(PgSalesUnitOfWork(), invoice_id)
 
 
+def relay_outbox():
+    """Publish pending Sales outbox rows to the bus (run repeatedly; at least once)."""
+    return relay.publish_pending()
+
+
 def request_fulfilment(fulfilment_id, order_id, on):
     return shipping.request_fulfilment(PgShippingUnitOfWork(), fulfilment_id, order_id, on)
 
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/adapters/pg.py ../repo/src/sales/adapters/pg.py
--- ../base/src/sales/adapters/pg.py	2026-11-07 17:08:07.031316118 +0100
+++ ../repo/src/sales/adapters/pg.py	2026-11-07 17:16:31.048248493 +0100
@@ -1,3 +1,7 @@
+from datetime import date
+
+from psycopg.types.json import Jsonb
+
 from src.db import connect
 from src.sales.core.invoices import Invoice
 from src.sales.core.orders import Order, OrderLine
@@ -50,6 +54,16 @@
         invoice.version = row[0]
 
 
+class PgOutbox:
+    def __init__(self, conn):
+        self.conn = conn
+
+    def add(self, event):
+        payload = {k: v.isoformat() if isinstance(v, date) else v for k, v in vars(event).items()}
+        self.conn.execute("INSERT INTO sales_outbox (event_type, payload) VALUES (%s, %s)",
+                          (type(event).__name__, Jsonb(payload)))
+
+
 class PgSalesUnitOfWork:
     """One transaction per use case: commits when the block succeeds, rolls back when it raises."""
 
@@ -59,6 +73,7 @@
         self.tx.__enter__()
         self.orders = PgOrderRepository(self.conn)
         self.invoices = PgInvoiceRepository(self.conn)
+        self.outbox = PgOutbox(self.conn)
         return self
 
     def __exit__(self, *exc):
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/adapters/relay.py ../repo/src/sales/adapters/relay.py
--- ../base/src/sales/adapters/relay.py	1970-01-01 01:00:00.000000000 +0100
+++ ../repo/src/sales/adapters/relay.py	2026-11-07 17:16:31.053248443 +0100
@@ -0,0 +1,29 @@
+"""Outbox relay: publishes committed Sales outbox rows to the bus, mapping internal events to contracts.
+
+At least once: a row is marked published only after the publish succeeded, so a crash in between republishes it.
+A failing publish leaves the row pending; the next run retries it (and stops the batch to keep order).
+"""
+from src.contracts import invoice_paid
+from src.db import connect
+from src.infra import bus
+
+
+def _map(row_id, event_type, p):
+    """Internal event -> integration event; None for events with no consumer (not published)."""
+    if event_type == "InvoicePaid":
+        return invoice_paid.TOPIC, invoice_paid.payload(row_id, p["invoice_id"], p["order_id"], p["paid_on"], p["version"])
+    return None
+
+
+def publish_pending(limit: int = 100) -> int:
+    published = 0
+    with connect() as conn, conn.transaction():
+        rows = conn.execute("SELECT id, event_type, payload FROM sales_outbox WHERE published_at IS NULL"
+                            " ORDER BY id LIMIT %s FOR UPDATE SKIP LOCKED", (limit,)).fetchall()
+        for row_id, event_type, payload in rows:
+            message = _map(row_id, event_type, payload)
+            if message:
+                bus.publish(*message)
+            conn.execute("UPDATE sales_outbox SET published_at = now() WHERE id = %s", (row_id,))
+            published += 1
+    return published
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/core/commands/pay_invoice.py ../repo/src/sales/core/commands/pay_invoice.py
--- ../base/src/sales/core/commands/pay_invoice.py	2026-11-07 17:08:07.029316138 +0100
+++ ../repo/src/sales/core/commands/pay_invoice.py	2026-11-07 17:16:31.048248493 +0100
@@ -6,4 +6,6 @@
         invoice = uow.invoices.get(invoice_id)
         invoice.pay(paid_on)
         uow.invoices.save(invoice)
+        for event in invoice.events:
+            uow.outbox.add(event)
     return invoice.version
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/core/events.py ../repo/src/sales/core/events.py
--- ../base/src/sales/core/events.py	2026-11-07 17:08:07.025316178 +0100
+++ ../repo/src/sales/core/events.py	2026-11-07 17:16:31.048248493 +0100
@@ -1,5 +1,6 @@
 """Sales domain events (see docs/event-list.md). Aggregates record them in `events`."""
 from dataclasses import dataclass
+from datetime import date
 
 
 @dataclass(frozen=True)
@@ -14,3 +15,11 @@
     invoice_id: str
     order_id: str
     amount_cents: int
+
+
+@dataclass(frozen=True)
+class InvoicePaid:
+    invoice_id: str
+    order_id: str
+    paid_on: date
+    version: int  # the invoice version this payment produced
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/core/invoices.py ../repo/src/sales/core/invoices.py
--- ../base/src/sales/core/invoices.py	2026-11-07 17:08:07.027316158 +0100
+++ ../repo/src/sales/core/invoices.py	2026-11-07 17:16:31.048248493 +0100
@@ -1,7 +1,7 @@
 from dataclasses import dataclass, field
 from datetime import date
 
-from src.sales.core.events import InvoiceIssued
+from src.sales.core.events import InvoiceIssued, InvoicePaid
 
 
 class InvoiceNotPayable(Exception):
@@ -29,6 +29,7 @@
         if self.status != "issued":
             raise InvoiceNotPayable(f"invoice {self.id} is {self.status}")
         self.status, self.paid_on = "paid", on
+        self.events.append(InvoicePaid(self.id, self.order_id, on, self.version + 1))
 
     def cancel(self) -> None:
         if self.status != "issued":
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/core/ports.py ../repo/src/sales/core/ports.py
--- ../base/src/sales/core/ports.py	2026-11-07 17:08:07.027316158 +0100
+++ ../repo/src/sales/core/ports.py	2026-11-07 17:16:31.048248493 +0100
@@ -22,7 +22,12 @@
     def save(self, invoice: Invoice) -> None: ...
 
 
+class Outbox(Protocol):
+    def add(self, event: object) -> None: ...
+
+
 class SalesUnitOfWork(Protocol):
+    outbox: Outbox
     orders: OrderRepository
     invoices: InvoiceRepository
 
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/tests/test_sales.py ../repo/tests/test_sales.py
--- ../base/tests/test_sales.py	2026-11-07 17:08:07.035316077 +0100
+++ ../repo/tests/test_sales.py	2026-11-07 17:16:31.054248433 +0100
@@ -26,3 +26,43 @@
         self.invoice()
         main.cancel_invoice("i1")
         self.assertEqual(self.rows("SELECT status FROM invoices"), [("cancelled",)])
+
+
+class InvoicePaidOutboxTest(DbTest):
+    def outbox(self):
+        return self.rows("SELECT event_type, payload FROM sales_outbox WHERE event_type = 'InvoicePaid'")
+
+    def test_paying_writes_one_outbox_row_in_the_same_transaction(self):
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        self.assertEqual(self.outbox(), [("InvoicePaid", {"invoice_id": "i1", "order_id": "o1", "paid_on": "2026-11-02", "version": 2})])
+
+    def test_failed_payment_writes_no_outbox_row(self):
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        with self.assertRaises(InvoiceNotPayable):
+            main.pay_invoice("i1", date(2026, 11, 3))
+        self.assertEqual(len(self.outbox()), 1)
+
+    def test_nothing_is_published_before_the_relay_runs(self):
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        self.assertEqual(self.rows("SELECT count(*) FROM bus_messages"), [(0,)])
+
+    def test_relay_publishes_the_contract_once(self):
+        from src.contracts import invoice_paid
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        main.relay_outbox()
+        main.relay_outbox()
+        messages = self.rows("SELECT topic, body FROM bus_messages")
+        self.assertEqual(len(messages), 1)
+        topic, body = messages[0]
+        self.assertEqual(topic, invoice_paid.TOPIC)
+        self.assertEqual(set(body), set(invoice_paid.FIELDS))
+        self.assertEqual((body["invoice_id"], body["order_id"], body["paid_on"], body["version"]), ("i1", "o1", "2026-11-02", 2))
+
+    def test_unpublishable_rows_stay_pending_and_other_events_are_not_published(self):
+        self.invoice()
+        main.relay_outbox()
+        self.assertEqual(self.rows("SELECT count(*) FROM bus_messages"), [(0,)])

### S2.2 [aip] Then the payload holds only the fields shipping's need names; any carried state is declared.
diff base -> repo:
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/docs/event-list.md ../repo/docs/event-list.md
--- ../base/docs/event-list.md	2026-11-07 17:08:07.021316218 +0100
+++ ../repo/docs/event-list.md	2026-11-07 17:16:31.047248503 +0100
@@ -6,6 +6,7 @@
 
 - OrderPlaced: a customer placed an order (order id, customer id, total).
 - InvoiceIssued: an invoice was issued for an order (invoice id, order id, amount).
+- InvoicePaid: an invoice was paid (invoice id, order id, paid date, invoice version).
 
 ## shipping
 
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/schema.sql ../repo/schema.sql
--- ../base/schema.sql	2026-11-07 17:08:07.021316218 +0100
+++ ../repo/schema.sql	2026-11-07 17:16:31.048248493 +0100
@@ -25,6 +25,15 @@
     version integer NOT NULL DEFAULT 1
 );
 
+-- Sales outbox: events written in the same transaction as the change; the relay publishes them after commit.
+CREATE TABLE sales_outbox (
+    id bigserial PRIMARY KEY,
+    event_type text NOT NULL,
+    payload jsonb NOT NULL,
+    created_at timestamptz NOT NULL DEFAULT now(),
+    published_at timestamptz
+);
+
 -- Shipping context
 CREATE TABLE fulfilments (
     id text PRIMARY KEY,
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/contracts/invoice_paid.py ../repo/src/contracts/invoice_paid.py
--- ../base/src/contracts/invoice_paid.py	1970-01-01 01:00:00.000000000 +0100
+++ ../repo/src/contracts/invoice_paid.py	2026-11-07 17:16:31.053248443 +0100
@@ -0,0 +1,11 @@
+"""Integration event sales.invoice-paid, version 1. Producer: Sales. Additive changes only; a breaking change is v2.
+
+Carries ids and the facts of the payment only (no invoice state). `event_id` is unique per event and stable
+across redelivery; `version` is the invoice version, so a consumer can ignore an older event than one it has seen.
+"""
+TOPIC = "sales.invoice-paid.v1"
+FIELDS = ("event_id", "invoice_id", "order_id", "paid_on", "version")
+
+
+def payload(event_id: int, invoice_id: str, order_id: str, paid_on: str, version: int) -> dict:
+    return {"event_id": event_id, "invoice_id": invoice_id, "order_id": order_id, "paid_on": paid_on, "version": version}
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/main.py ../repo/src/main.py
--- ../base/src/main.py	2026-11-07 17:08:07.034316087 +0100
+++ ../repo/src/main.py	2026-11-07 17:16:31.048248493 +0100
@@ -4,6 +4,7 @@
 from src.sales.core.commands.issue_invoice import issue_invoice as _issue_invoice
 from src.sales.core.commands.pay_invoice import pay_invoice as _pay_invoice
 from src.sales.core.commands.place_order import place_order as _place_order
+from src.sales.adapters import relay
 from src.shipping.adapters.pg import PgShippingUnitOfWork
 from src.shipping.core import commands as shipping
 
@@ -24,6 +25,11 @@
     return _cancel_invoice(PgSalesUnitOfWork(), invoice_id)
 
 
+def relay_outbox():
+    """Publish pending Sales outbox rows to the bus (run repeatedly; at least once)."""
+    return relay.publish_pending()
+
+
 def request_fulfilment(fulfilment_id, order_id, on):
     return shipping.request_fulfilment(PgShippingUnitOfWork(), fulfilment_id, order_id, on)
 
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/adapters/pg.py ../repo/src/sales/adapters/pg.py
--- ../base/src/sales/adapters/pg.py	2026-11-07 17:08:07.031316118 +0100
+++ ../repo/src/sales/adapters/pg.py	2026-11-07 17:16:31.048248493 +0100
@@ -1,3 +1,7 @@
+from datetime import date
+
+from psycopg.types.json import Jsonb
+
 from src.db import connect
 from src.sales.core.invoices import Invoice
 from src.sales.core.orders import Order, OrderLine
@@ -50,6 +54,16 @@
         invoice.version = row[0]
 
 
+class PgOutbox:
+    def __init__(self, conn):
+        self.conn = conn
+
+    def add(self, event):
+        payload = {k: v.isoformat() if isinstance(v, date) else v for k, v in vars(event).items()}
+        self.conn.execute("INSERT INTO sales_outbox (event_type, payload) VALUES (%s, %s)",
+                          (type(event).__name__, Jsonb(payload)))
+
+
 class PgSalesUnitOfWork:
     """One transaction per use case: commits when the block succeeds, rolls back when it raises."""
 
@@ -59,6 +73,7 @@
         self.tx.__enter__()
         self.orders = PgOrderRepository(self.conn)
         self.invoices = PgInvoiceRepository(self.conn)
+        self.outbox = PgOutbox(self.conn)
         return self
 
     def __exit__(self, *exc):
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/adapters/relay.py ../repo/src/sales/adapters/relay.py
--- ../base/src/sales/adapters/relay.py	1970-01-01 01:00:00.000000000 +0100
+++ ../repo/src/sales/adapters/relay.py	2026-11-07 17:16:31.053248443 +0100
@@ -0,0 +1,29 @@
+"""Outbox relay: publishes committed Sales outbox rows to the bus, mapping internal events to contracts.
+
+At least once: a row is marked published only after the publish succeeded, so a crash in between republishes it.
+A failing publish leaves the row pending; the next run retries it (and stops the batch to keep order).
+"""
+from src.contracts import invoice_paid
+from src.db import connect
+from src.infra import bus
+
+
+def _map(row_id, event_type, p):
+    """Internal event -> integration event; None for events with no consumer (not published)."""
+    if event_type == "InvoicePaid":
+        return invoice_paid.TOPIC, invoice_paid.payload(row_id, p["invoice_id"], p["order_id"], p["paid_on"], p["version"])
+    return None
+
+
+def publish_pending(limit: int = 100) -> int:
+    published = 0
+    with connect() as conn, conn.transaction():
+        rows = conn.execute("SELECT id, event_type, payload FROM sales_outbox WHERE published_at IS NULL"
+                            " ORDER BY id LIMIT %s FOR UPDATE SKIP LOCKED", (limit,)).fetchall()
+        for row_id, event_type, payload in rows:
+            message = _map(row_id, event_type, payload)
+            if message:
+                bus.publish(*message)
+            conn.execute("UPDATE sales_outbox SET published_at = now() WHERE id = %s", (row_id,))
+            published += 1
+    return published
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/core/commands/pay_invoice.py ../repo/src/sales/core/commands/pay_invoice.py
--- ../base/src/sales/core/commands/pay_invoice.py	2026-11-07 17:08:07.029316138 +0100
+++ ../repo/src/sales/core/commands/pay_invoice.py	2026-11-07 17:16:31.048248493 +0100
@@ -6,4 +6,6 @@
         invoice = uow.invoices.get(invoice_id)
         invoice.pay(paid_on)
         uow.invoices.save(invoice)
+        for event in invoice.events:
+            uow.outbox.add(event)
     return invoice.version
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/core/events.py ../repo/src/sales/core/events.py
--- ../base/src/sales/core/events.py	2026-11-07 17:08:07.025316178 +0100
+++ ../repo/src/sales/core/events.py	2026-11-07 17:16:31.048248493 +0100
@@ -1,5 +1,6 @@
 """Sales domain events (see docs/event-list.md). Aggregates record them in `events`."""
 from dataclasses import dataclass
+from datetime import date
 
 
 @dataclass(frozen=True)
@@ -14,3 +15,11 @@
     invoice_id: str
     order_id: str
     amount_cents: int
+
+
+@dataclass(frozen=True)
+class InvoicePaid:
+    invoice_id: str
+    order_id: str
+    paid_on: date
+    version: int  # the invoice version this payment produced
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/core/invoices.py ../repo/src/sales/core/invoices.py
--- ../base/src/sales/core/invoices.py	2026-11-07 17:08:07.027316158 +0100
+++ ../repo/src/sales/core/invoices.py	2026-11-07 17:16:31.048248493 +0100
@@ -1,7 +1,7 @@
 from dataclasses import dataclass, field
 from datetime import date
 
-from src.sales.core.events import InvoiceIssued
+from src.sales.core.events import InvoiceIssued, InvoicePaid
 
 
 class InvoiceNotPayable(Exception):
@@ -29,6 +29,7 @@
         if self.status != "issued":
             raise InvoiceNotPayable(f"invoice {self.id} is {self.status}")
         self.status, self.paid_on = "paid", on
+        self.events.append(InvoicePaid(self.id, self.order_id, on, self.version + 1))
 
     def cancel(self) -> None:
         if self.status != "issued":
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/src/sales/core/ports.py ../repo/src/sales/core/ports.py
--- ../base/src/sales/core/ports.py	2026-11-07 17:08:07.027316158 +0100
+++ ../repo/src/sales/core/ports.py	2026-11-07 17:16:31.048248493 +0100
@@ -22,7 +22,12 @@
     def save(self, invoice: Invoice) -> None: ...
 
 
+class Outbox(Protocol):
+    def add(self, event: object) -> None: ...
+
+
 class SalesUnitOfWork(Protocol):
+    outbox: Outbox
     orders: OrderRepository
     invoices: InvoiceRepository
 
diff -ruN -x __pycache__ -x '*.pyc' -x RESULT.json -x database.url ../base/tests/test_sales.py ../repo/tests/test_sales.py
--- ../base/tests/test_sales.py	2026-11-07 17:08:07.035316077 +0100
+++ ../repo/tests/test_sales.py	2026-11-07 17:16:31.054248433 +0100
@@ -26,3 +26,43 @@
         self.invoice()
         main.cancel_invoice("i1")
         self.assertEqual(self.rows("SELECT status FROM invoices"), [("cancelled",)])
+
+
+class InvoicePaidOutboxTest(DbTest):
+    def outbox(self):
+        return self.rows("SELECT event_type, payload FROM sales_outbox WHERE event_type = 'InvoicePaid'")
+
+    def test_paying_writes_one_outbox_row_in_the_same_transaction(self):
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        self.assertEqual(self.outbox(), [("InvoicePaid", {"invoice_id": "i1", "order_id": "o1", "paid_on": "2026-11-02", "version": 2})])
+
+    def test_failed_payment_writes_no_outbox_row(self):
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        with self.assertRaises(InvoiceNotPayable):
+            main.pay_invoice("i1", date(2026, 11, 3))
+        self.assertEqual(len(self.outbox()), 1)
+
+    def test_nothing_is_published_before_the_relay_runs(self):
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        self.assertEqual(self.rows("SELECT count(*) FROM bus_messages"), [(0,)])
+
+    def test_relay_publishes_the_contract_once(self):
+        from src.contracts import invoice_paid
+        self.invoice()
+        main.pay_invoice("i1", date(2026, 11, 2))
+        main.relay_outbox()
+        main.relay_outbox()
+        messages = self.rows("SELECT topic, body FROM bus_messages")
+        self.assertEqual(len(messages), 1)
+        topic, body = messages[0]
+        self.assertEqual(topic, invoice_paid.TOPIC)
+        self.assertEqual(set(body), set(invoice_paid.FIELDS))
+        self.assertEqual((body["invoice_id"], body["order_id"], body["paid_on"], body["version"]), ("i1", "o1", "2026-11-02", 2))
+
+    def test_unpublishable_rows_stay_pending_and_other_events_are_not_published(self):
+        self.invoice()
+        main.relay_outbox()
+        self.assertEqual(self.rows("SELECT count(*) FROM bus_messages"), [(0,)])

### S4.2 [aip] Given an in-process handler doing a same-transaction update, When P4 completes, Then it is an explicit call in the use case.
diff base -> repo:


