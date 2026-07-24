-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "reversal_of_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversal_of_id_key" ON "journal_entries"("reversal_of_id");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
