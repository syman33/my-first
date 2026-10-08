-- Back-office order search matches substrings of the order number, email and
-- name (ILIKE '%…%'). Measured at 200k orders: ~650 ms per search with
-- sequential scans; trigram GIN indexes let PostgreSQL combine index scans.
-- (pg_trgm is enabled by the init migration for product search.)

-- CreateIndex
CREATE INDEX "orders_order_number_trgm_idx" ON "orders" USING GIN ("order_number" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "orders_shipping_email_trgm_idx" ON "orders" USING GIN ("shipping_email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "orders_shipping_name_trgm_idx" ON "orders" USING GIN ("shipping_name" gin_trgm_ops);
