-- Patch POS3.0 — instantánea de identidad en la línea de venta.
--
-- Aditiva y anulable. NO se rellenan las filas existentes: `NULL` significa
-- "esta línea nació sin instantánea", y la capa de lectura cae al catálogo vivo
-- para ellas, que es lo que ya hacían. Rellenarlas con el nombre actual del
-- producto afirmaría un hecho histórico que nadie registró.
ALTER TABLE "pos_sale_items" ADD COLUMN "product_name" TEXT;
ALTER TABLE "pos_sale_items" ADD COLUMN "product_sku" TEXT;
