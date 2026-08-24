-- Patch POS5.0 — idempotencia del cobro del mostrador.
--
-- Aditiva y anulable. NO se rellenan las ventas existentes: nacieron sin intento
-- identificado y `NULL` no compite en un índice único de PostgreSQL, así que las
-- ventas anteriores conviven sin bloquear la restricción.
ALTER TABLE "pos_sales" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "pos_sales_idempotency_key_key" ON "pos_sales"("idempotency_key");
