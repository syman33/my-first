-- Hand-written database invariants that Prisma's schema language cannot express.
-- The database must protect critical business rules even if application code
-- has a bug. Prisma ignores CHECK constraints, sequences, triggers and partial
-- indexes when diffing, so these survive future `prisma migrate dev` runs.

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
ALTER TABLE products ADD CONSTRAINT products_prices_valid CHECK (
  price >= 0
  AND (compare_at_price IS NULL OR compare_at_price >= 0)
  AND (cost IS NULL OR cost >= 0)
  AND min_price >= 0
  AND max_price >= min_price
);
ALTER TABLE products ADD CONSTRAINT products_counters_valid CHECK (
  low_stock_threshold >= 0
  AND sales_count >= 0
  AND rating_average BETWEEN 0 AND 500
  AND rating_count >= 0
);
ALTER TABLE products ADD CONSTRAINT products_dimensions_positive CHECK (
  (length_mm IS NULL OR length_mm > 0)
  AND (width_mm IS NULL OR width_mm > 0)
  AND (height_mm IS NULL OR height_mm > 0)
  AND (weight_grams IS NULL OR weight_grams > 0)
);
ALTER TABLE products ADD CONSTRAINT products_published_has_date CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL);
ALTER TABLE products ADD CONSTRAINT products_slugs_nonempty CHECK (length(slug_ar) > 0 AND length(slug_en) > 0);

ALTER TABLE product_variants ADD CONSTRAINT product_variants_prices_valid CHECK (
  (price IS NULL OR price >= 0) AND (compare_at_price IS NULL OR compare_at_price >= 0)
);
ALTER TABLE product_variants ADD CONSTRAINT product_variants_color_hex CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9A-Fa-f]{6}$');
-- At most one default variant per product.
CREATE UNIQUE INDEX product_variants_one_default_per_product ON product_variants (product_id) WHERE is_default;

-- Storefront listing: newest published products.
CREATE INDEX products_published_recent_idx ON products (published_at DESC) WHERE status = 'PUBLISHED';

-- ---------------------------------------------------------------------------
-- Inventory: stock can never go negative and reservations never exceed stock.
-- ---------------------------------------------------------------------------
ALTER TABLE inventory ADD CONSTRAINT inventory_on_hand_nonneg CHECK (on_hand >= 0);
ALTER TABLE inventory ADD CONSTRAINT inventory_reserved_valid CHECK (reserved >= 0 AND reserved <= on_hand);
ALTER TABLE inventory ADD CONSTRAINT inventory_threshold_nonneg CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0);

-- Every ledger row must be arithmetically consistent with the stock it records.
ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_tx_consistent CHECK (
  new_on_hand = previous_on_hand + quantity_delta
  AND new_reserved = previous_reserved + reserved_delta
  AND new_on_hand >= 0
  AND new_reserved >= 0
  AND new_reserved <= new_on_hand
);
ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_tx_nonzero CHECK (quantity_delta <> 0 OR reserved_delta <> 0);

-- ---------------------------------------------------------------------------
-- Carts & wishlists: exactly one owner (a user or a guest token).
-- ---------------------------------------------------------------------------
ALTER TABLE carts ADD CONSTRAINT carts_single_owner CHECK ((user_id IS NULL) <> (guest_token_hash IS NULL));
ALTER TABLE wishlists ADD CONSTRAINT wishlists_single_owner CHECK ((user_id IS NULL) <> (guest_token_hash IS NULL));
ALTER TABLE cart_items ADD CONSTRAINT cart_items_quantity_range CHECK (quantity BETWEEN 1 AND 99);

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
ALTER TABLE coupons ADD CONSTRAINT coupons_value_valid CHECK (value > 0 AND (type <> 'PERCENTAGE' OR value <= 10000));
ALTER TABLE coupons ADD CONSTRAINT coupons_amounts_valid CHECK (
  (min_order_amount IS NULL OR min_order_amount >= 0)
  AND (max_discount_amount IS NULL OR max_discount_amount > 0)
);
ALTER TABLE coupons ADD CONSTRAINT coupons_usage_valid CHECK (
  used_count >= 0
  AND (usage_limit IS NULL OR (usage_limit > 0 AND used_count <= usage_limit))
  AND (usage_limit_per_user IS NULL OR usage_limit_per_user > 0)
);
ALTER TABLE coupons ADD CONSTRAINT coupons_window_valid CHECK (starts_at IS NULL OR expires_at IS NULL OR starts_at < expires_at);
ALTER TABLE coupons ADD CONSTRAINT coupons_code_format CHECK (code ~ '^[A-Za-z0-9_-]{3,40}$');
ALTER TABLE coupon_usages ADD CONSTRAINT coupon_usages_amount_nonneg CHECK (discount_amount >= 0);

-- ---------------------------------------------------------------------------
-- Orders: amounts are non-negative and the total always adds up.
-- ---------------------------------------------------------------------------
ALTER TABLE orders ADD CONSTRAINT orders_amounts_nonneg CHECK (
  subtotal >= 0 AND discount_total >= 0 AND shipping_total >= 0 AND cod_fee >= 0 AND tax_total >= 0 AND total >= 0
);
ALTER TABLE orders ADD CONSTRAINT orders_discount_le_subtotal CHECK (discount_total <= subtotal);
ALTER TABLE orders ADD CONSTRAINT orders_total_consistent CHECK (
  total = subtotal - discount_total + shipping_total + cod_fee
          + CASE WHEN prices_include_tax THEN 0 ELSE tax_total END
);
ALTER TABLE orders ADD CONSTRAINT orders_tax_rate_valid CHECK (tax_rate_bps BETWEEN 0 AND 10000);
ALTER TABLE orders ADD CONSTRAINT orders_currency_sar CHECK (currency = 'SAR');
ALTER TABLE orders ADD CONSTRAINT orders_version_nonneg CHECK (version >= 0);
ALTER TABLE orders ADD CONSTRAINT orders_locale_valid CHECK (locale IN ('ar', 'en'));

-- Reservation-expiry job scans only pending orders that still hold a reservation.
CREATE INDEX orders_expiring_reservations_idx ON orders (reservation_expires_at)
  WHERE inventory_status = 'RESERVED' AND status = 'PENDING' AND reservation_expires_at IS NOT NULL;
-- Admin "needs attention" queue.
CREATE INDEX orders_attention_idx ON orders (created_at) WHERE attention_reason IS NOT NULL;

ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);
ALTER TABLE order_items ADD CONSTRAINT order_items_amounts_valid CHECK (
  unit_price >= 0
  AND line_subtotal = unit_price * quantity
  AND discount_amount >= 0
  AND discount_amount <= line_subtotal
  AND tax_amount >= 0
  AND line_total >= 0
);
ALTER TABLE order_items ADD CONSTRAINT order_items_returned_valid CHECK (returned_quantity >= 0 AND returned_quantity <= quantity);

-- ---------------------------------------------------------------------------
-- Payments, refunds, shipments, returns, reviews
-- ---------------------------------------------------------------------------
ALTER TABLE payments ADD CONSTRAINT payments_amount_valid CHECK (amount > 0 AND refunded_amount >= 0 AND refunded_amount <= amount);
ALTER TABLE payments ADD CONSTRAINT payments_currency_sar CHECK (currency = 'SAR');
ALTER TABLE refunds ADD CONSTRAINT refunds_amount_positive CHECK (amount > 0);
ALTER TABLE shipments ADD CONSTRAINT shipments_cost_nonneg CHECK (cost IS NULL OR cost >= 0);
ALTER TABLE return_items ADD CONSTRAINT return_items_quantity_valid CHECK (
  quantity > 0 AND restocked_quantity >= 0 AND restocked_quantity <= quantity
);
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5);

-- ---------------------------------------------------------------------------
-- Users, addresses, content
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD CONSTRAINT users_locale_valid CHECK (locale IN ('ar', 'en'));
ALTER TABLE users ADD CONSTRAINT users_email_shape CHECK (position('@' IN email) > 1);
-- At most one default address per user.
CREATE UNIQUE INDEX addresses_one_default_per_user ON addresses (user_id) WHERE is_default;
ALTER TABLE banners ADD CONSTRAINT banners_window_valid CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at);
ALTER TABLE outbox_events ADD CONSTRAINT outbox_attempts_valid CHECK (attempts >= 0 AND max_attempts > 0);
ALTER TABLE rate_limit_buckets ADD CONSTRAINT rate_limit_count_positive CHECK (count > 0);

-- ---------------------------------------------------------------------------
-- Human-friendly document numbers (VLR-2026-000001, RMA-2026-000001).
-- Sequences are non-transactional: numbers may have gaps after a rollback,
-- but are never reused and never collide, without serialising checkouts.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE order_number_seq AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;
CREATE SEQUENCE return_number_seq AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;

-- ---------------------------------------------------------------------------
-- The audit trail is append-only.
-- ---------------------------------------------------------------------------
CREATE FUNCTION audit_logs_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% rejected)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
