-- AlterTable
ALTER TABLE "customer_ledger_entries" ADD COLUMN     "dueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "creditTermDays" INTEGER;
