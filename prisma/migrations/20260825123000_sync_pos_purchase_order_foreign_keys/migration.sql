-- Fix purchase-order audit foreign keys.
-- These constraints must be changed only after pos_purchase_orders exists.

ALTER TABLE "pos_purchase_orders"
    DROP CONSTRAINT "pos_purchase_orders_approved_by_id_fkey";

ALTER TABLE "pos_purchase_orders"
    DROP CONSTRAINT "pos_purchase_orders_cancelled_by_id_fkey";

ALTER TABLE "pos_purchase_orders"
    ADD CONSTRAINT "pos_purchase_orders_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id")
    REFERENCES "users"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE "pos_purchase_orders"
    ADD CONSTRAINT "pos_purchase_orders_cancelled_by_id_fkey"
    FOREIGN KEY ("cancelled_by_id")
    REFERENCES "users"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
