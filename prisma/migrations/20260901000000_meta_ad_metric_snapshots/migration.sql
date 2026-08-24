-- Patch Meta-4 — fotos de metricas de cuentas publicitarias.
--
-- **Aditiva.** Una tabla nueva y nada mas. Ninguna tabla existente cambia de
-- forma, ninguna fila se toca, ningun enumerado se amplia.
--
-- ## Por que una foto y no una consulta en vivo
--
-- La Marketing API limita la frecuencia de peticiones con dureza. Un tablero que
-- consultara a Meta en cada carga alcanzaria ese limite, y dejaria de funcionar
-- justo cuando mas se mira. El tablero lee de esta tabla y NUNCA llama al Graph
-- API; refrescar es un boton explicito. La indireccion es el punto: no la
-- conviertas en una consulta en vivo.
--
-- ## Por que un historial y no una casilla de cache
--
-- Cada refresco ANADE una fila. El tablero se queda con la mas reciente por
-- (cuenta, periodo) y lo demas queda como registro de que dijo Meta y cuando.
CREATE TABLE "meta_ad_metric_snapshots" (
    "id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "date_preset" TEXT NOT NULL,
    "impressions" BIGINT NOT NULL,
    "clicks" BIGINT NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "ctr" DECIMAL(6,4) NOT NULL,
    "cpc" DECIMAL(12,4),
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_ad_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- La consulta que sostiene el tablero: "la foto mas reciente de esta cuenta para
-- este periodo". Las tres columnas en este orden porque se filtra por cuenta y
-- periodo, y se ordena por fecha descendente dentro de esa pareja.
CREATE INDEX "meta_ad_metric_snapshots_ad_account_id_date_preset_fetched__idx" ON "meta_ad_metric_snapshots"("ad_account_id", "date_preset", "fetched_at");

-- SIN clave foranea a `meta_ad_accounts` A PROPOSITO. `ad_account_id` guarda el
-- `act_...` y no el cuid del registro, para que desconectar una cuenta no pueda
-- borrar la prueba de lo que se gasto. Es la misma postura de `pos_sale_returns`
-- y `meta_unmapped_leads`: el historico sobrevive a la baja de su origen.
-- Que la cuenta exista hoy en el registro lo comprueba la aplicacion, que es
-- donde esa regla puede decir algo util en espanol en vez de un error del motor.
