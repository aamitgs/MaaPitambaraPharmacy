"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { shiftForDate } from "@/lib/notes-meta";
import type { NoteCategory, NoteShift } from "@/generated/prisma/client";

/**
 * The counter notepad. Notes are tenant-wide: the point of a pad by the till
 * is that whoever is on shift next reads it. Anyone signed in can add one;
 * only the author or an owner can delete one, so a staff note can't be
 * quietly removed by a colleague.
 */
export type NoteItem = {
  id: string;
  body: string;
  shift: NoteShift | null;
  category: NoteCategory;
  priority: boolean;
  pinned: boolean;
  dueAt: string | null;
  doneAt: string | null;
  createdAt: string;
  authorName: string;
  canDelete: boolean;
};

export async function listNotes(): Promise<NoteItem[]> {
  const session = await requireSession();
  const notes = await prisma.note.findMany({
    where: { tenantId: session.user.tenantId },
    // Pinned first, then anything with a deadline, then newest.
    orderBy: [{ pinned: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { author: { select: { name: true } } },
  });

  return notes.map((n) => ({
    id: n.id,
    body: n.body,
    shift: n.shift,
    category: n.category,
    priority: n.priority,
    pinned: n.pinned,
    dueAt: n.dueAt?.toISOString() ?? null,
    doneAt: n.doneAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    authorName: n.author.name,
    canDelete: n.authorUserId === session.user.id || session.user.role === "owner",
  }));
}

const createSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(2000),
  category: z
    .enum([
      "to_order",
      "to_call",
      "handover",
      "stock",
      "payment",
      "instruction",
      "question",
      "general",
    ])
    .default("general"),
  pinned: z.boolean().optional(),
  /** Owner-only; ignored for anyone else. */
  priority: z.boolean().optional(),
  /** ISO date-time from a datetime-local input, or empty for a plain note. */
  dueAt: z.string().trim().optional(),
});

export async function createNote(input: z.infer<typeof createSchema>) {
  const session = await requireSession();
  const parsed = createSchema.parse(input);

  const isOwner = session.user.role === "owner";

  await prisma.note.create({
    data: {
      tenantId: session.user.tenantId,
      authorUserId: session.user.id,
      body: parsed.body,
      category: parsed.category,
      // Derived, never submitted: colour means "which shift", and a client
      // that could choose it could lie about it. Owners sit outside the
      // shift rota, so their notes carry no shift.
      shift: isOwner ? null : shiftForDate(new Date()),
      priority: isOwner ? (parsed.priority ?? false) : false,
      pinned: parsed.pinned ?? false,
      dueAt: parsed.dueAt ? new Date(parsed.dueAt) : null,
    },
  });
  revalidatePath("/dashboard");
}

async function ownedNote(id: string) {
  const session = await requireSession();
  const note = await prisma.note.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!note) throw new Error("Note not found");
  return { session, note };
}

export async function toggleNoteDone(id: string) {
  const { note } = await ownedNote(id);
  await prisma.note.update({
    where: { id },
    data: { doneAt: note.doneAt ? null : new Date() },
  });
  revalidatePath("/dashboard");
}

export async function toggleNotePinned(id: string) {
  const { note } = await ownedNote(id);
  await prisma.note.update({ where: { id }, data: { pinned: !note.pinned } });
  revalidatePath("/dashboard");
}

export async function deleteNote(id: string) {
  const { session, note } = await ownedNote(id);
  if (note.authorUserId !== session.user.id && session.user.role !== "owner") {
    throw new Error("Only the author or an owner can delete this note");
  }
  await prisma.note.delete({ where: { id } });
  revalidatePath("/dashboard");
}
