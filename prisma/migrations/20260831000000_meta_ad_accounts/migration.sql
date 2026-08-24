-- Patch Meta-3 — registro de cuentas publicitarias de Meta.
--
-- **Aditiva.** Una tabla nueva y nada mas. Ninguna tabla existente cambia de
-- forma, ninguna fila se toca, ningun enumerado se amplia.
--
-- Es un registro de conexion, no un espejo: dice que cuentas sigue MotoMas. Los
-- metadatos (`account_name`, `currency`, `account_status`) son una CACHE del
-- momento de conectar o de la ultima resincronizacion manual. Nada en este
-- parche los refresca solo, y por eso `last_synced_at` nace anulable: una cuenta
-- recien conectada todavia no se ha resincronizado nunca.
CREATE TABLE "meta_ad_accounts" (
    "id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "label" TEXT,
    "account_name" TEXT,
    "currency" TEXT,
    "account_status" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "meta_ad_accounts_pkey" PRIMARY KEY ("id")
);

-- Una cuenta se conecta una sola vez. El indice es lo que convierte "conectar la
-- misma cuenta dos veces" en un rechazo del motor y no en una comprobacion de
-- aplicacion que dos peticiones simultaneas podrian saltarse las dos.
CREATE UNIQUE INDEX "meta_ad_accounts_ad_account_id_key" ON "meta_ad_accounts"("ad_account_id");
