-- Patch Attribution-1 — cerrar las islas gasto / leads / ventas.
--
-- **Aditiva y sin relleno retroactivo.** Dos columnas anulables sobre dos tablas
-- existentes. Ninguna fila se toca, ninguna columna cambia de tipo, ningun
-- enumerado se amplia, ninguna tabla nace.
--
-- Las ventas anteriores a este parche se quedan en NULL: no tuvieron atribucion
-- y no se les inventa una. Es la misma convencion que `warehouse_id`,
-- `operator_id` y `shift_id` siguieron en INT4 y D3.

-- ---------------------------------------------------------------------------
-- 1. De que lead salio una venta del mostrador.
-- ---------------------------------------------------------------------------
--
-- Clave foranea al lead y NO una copia de su `origin_channel`. Duplicar el texto
-- aqui habria congelado el canal en el instante del cobro: corregir despues el
-- canal del lead dejaria la venta describiendo un origen que ya nadie sostiene.
-- El canal se lee siempre a traves de esta relacion.
--
-- NULL es la respuesta correcta en tres casos distintos y ninguno es un hueco:
-- venta sin cliente (mostrador), cliente sin leads, y ventas anteriores a este
-- parche.
ALTER TABLE "pos_sales" ADD COLUMN "attributed_lead_id" TEXT;

-- El informe de atribucion filtra las ventas por su lead; sin indice seria un
-- recorrido completo de `pos_sales` por cada canal y periodo.
CREATE INDEX "pos_sales_attributed_lead_id_idx" ON "pos_sales"("attributed_lead_id");

-- SET NULL, no RESTRICT: borrar un lead no puede borrar la venta que se le
-- atribuyo, y tampoco puede impedir el borrado. La venta es el hecho economico
-- y sobrevive a la desaparicion de su origen de marketing; queda sin atribuir,
-- que es exactamente lo que ha pasado.
ALTER TABLE "pos_sales"
  ADD CONSTRAINT "pos_sales_attributed_lead_id_fkey"
  FOREIGN KEY ("attributed_lead_id") REFERENCES "leads"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. De que cuenta publicitaria real sale el gasto de una campana.
-- ---------------------------------------------------------------------------
--
-- Clave foranea de verdad, al reves que `meta_ad_metric_snapshots`. Aquella
-- tabla evita la clave foranea a proposito porque es un historico que debe
-- sobrevivir a la baja de su cuenta. Esto no es historico: es un enlace vivo que
-- Marketing elige y cambia, y no hay ningun requisito de "la campana sobrevive
-- intacta al borrado de la cuenta" que proteger.
--
-- Apunta al cuid del registro (`meta_ad_accounts.id`), no al `act_...`. Es lo
-- contrario de lo que hace `meta_ad_metric_snapshots.ad_account_id`, y por la
-- misma razon invertida: alli se guarda el texto para sobrevivir al borrado,
-- aqui se guarda la clave para que el borrado se propague.
--
-- NO es el `campaign_id` de Meta. Meta-1 ya establecio que el identificador de
-- campana del webhook de Lead Ads no se puede casar con una fila de
-- `marketing_campaigns` de forma fiable. Este enlace es a nivel de CUENTA, que
-- si es un dato estable que una persona elige a mano.
ALTER TABLE "marketing_campaigns" ADD COLUMN "meta_ad_account_id" TEXT;

CREATE INDEX "marketing_campaigns_meta_ad_account_id_idx" ON "marketing_campaigns"("meta_ad_account_id");

-- SET NULL: desconectar una cuenta deja la campana sin gasto asociado, no borra
-- la campana.
ALTER TABLE "marketing_campaigns"
  ADD CONSTRAINT "marketing_campaigns_meta_ad_account_id_fkey"
  FOREIGN KEY ("meta_ad_account_id") REFERENCES "meta_ad_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
