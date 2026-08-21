-- CreateEnum
CREATE TYPE "NoteShift" AS ENUM ('morning', 'evening', 'night');

-- CreateEnum
CREATE TYPE "NoteCategory" AS ENUM ('to_order', 'to_call', 'handover', 'stock', 'payment', 'instruction', 'question', 'general');

-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "category" "NoteCategory" NOT NULL DEFAULT 'general',
ADD COLUMN     "priority" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shift" "NoteShift";
