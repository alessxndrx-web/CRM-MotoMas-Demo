-- Patch Meta-1 — webhook de Meta y captacion de Lead Ads.
--
-- **Aditiva y sin relleno retroactivo.** Dos tablas nuevas y una columna anulable
-- en `leads`. Ninguna fila existente se toca y ningun lead anterior se reescribe.
--
-- `leads.meta_leadgen_id` nace anulable y unica siguiendo la misma convencion que
-- `pos_sales.idempotency_key` (POS5.0): los leads que ya existen nacieron fuera de
-- Meta, y `NULL` no compite en un indice unico de PostgreSQL, asi que conviven sin
-- bloquear la restriccion.
ALTER TABLE "leads" ADD COLUMN "meta_leadgen_id" TEXT;
CREATE UNIQUE INDEX "leads_meta_leadgen_id_key" ON "leads"("meta_leadgen_id");

-- Que pagina de Facebook atiende que sucursal. El webhook trae `page_id` y nada
-- mas; sin esta tabla no hay forma de saber la sucursal, y adivinarla dejaria
-- leads en la sucursal equivocada sin manera soportada de moverlos.
--
-- `page_id` es unico: una pagina responde a una sola sucursal.
CREATE TABLE "meta_page_branches" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "label" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_page_branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meta_page_branches_page_id_key" ON "meta_page_branches"("page_id");
CREATE INDEX "meta_page_branches_branch_id_idx" ON "meta_page_branches"("branch_id");

-- El anden de los leads cuya pagina todavia no esta mapeada. Existe para que la
-- respuesta correcta a "no se de que sucursal es" sea conservarlo, no perderlo ni
-- inventarle una sucursal.
--
-- `fetched_fields` guarda el `field_data` crudo del Graph API porque es el unico
-- sitio donde viven las respuestas del formulario: el payload del webhook no las
-- incluye y el nodo del lead caduca del lado de Meta.
CREATE TABLE "meta_unmapped_leads" (
    "id" TEXT NOT NULL,
    "leadgen_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "fetched_fields" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_lead_id" TEXT,
    "resolved_by_id" TEXT,

    CONSTRAINT "meta_unmapped_leads_pkey" PRIMARY KEY ("id")
);

-- Unico por `leadgen_id`: Meta reenvia la entrega ante cualquier respuesta que no
-- sea 200, y un reenvio no debe dejar dos filas en el anden igual que no debe
-- dejar dos leads.
CREATE UNIQUE INDEX "meta_unmapped_leads_leadgen_id_key" ON "meta_unmapped_leads"("leadgen_id");
CREATE INDEX "meta_unmapped_leads_resolved_at_idx" ON "meta_unmapped_leads"("resolved_at");
CREATE INDEX "meta_unmapped_leads_page_id_idx" ON "meta_unmapped_leads"("page_id");

ALTER TABLE "meta_page_branches" ADD CONSTRAINT "meta_page_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_unmapped_leads" ADD CONSTRAINT "meta_unmapped_leads_resolved_lead_id_fkey" FOREIGN KEY ("resolved_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
