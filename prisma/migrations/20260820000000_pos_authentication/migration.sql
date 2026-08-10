-- POS2.4: dedicated branch-scoped POS credentials. The linked internal user
-- keeps existing audit foreign keys valid; it does not authenticate POS.
CREATE TABLE "pos_operators" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "can_manage_purchases" BOOLEAN NOT NULL DEFAULT false,
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_operators_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_operators_username_key" ON "pos_operators"("username");
CREATE UNIQUE INDEX "pos_operators_user_id_key" ON "pos_operators"("user_id");
CREATE INDEX "pos_operators_branch_id_is_active_idx" ON "pos_operators"("branch_id", "is_active");

ALTER TABLE "pos_operators"
  ADD CONSTRAINT "pos_operators_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_operators"
  ADD CONSTRAINT "pos_operators_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
