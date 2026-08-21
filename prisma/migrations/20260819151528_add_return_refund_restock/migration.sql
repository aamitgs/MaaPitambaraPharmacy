/*
  Warnings:

  - Added the required column `refundMethod` to the `sales_returns` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('cash', 'upi', 'card', 'credit_account');

-- AlterTable
ALTER TABLE "sales_return_items" ADD COLUMN     "restock" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "sales_returns" ADD COLUMN     "refundMethod" "RefundMethod" NOT NULL;
