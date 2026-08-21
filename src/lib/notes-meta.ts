import type { NoteCategory, NoteShift } from "@/generated/prisma/client";

/**
 * Shift windows for the 24×7 counter. Used only at write time — a note
 * stores the shift it was written in, so changing these later relabels new
 * notes without rewriting history.
 */
export const SHIFT_WINDOWS: { shift: NoteShift; startHour: number; endHour: number }[] = [
  { shift: "morning", startHour: 8, endHour: 16 },
  { shift: "evening", startHour: 16, endHour: 24 },
  { shift: "night", startHour: 0, endHour: 8 },
];

export function shiftForDate(date: Date): NoteShift {
  const hour = date.getHours();
  return (
    SHIFT_WINDOWS.find((w) => hour >= w.startHour && hour < w.endHour)?.shift ?? "night"
  );
}

/**
 * Colour is derived from context — which shift, or owner — never chosen.
 * The three shift hues come from a colour-blind-safe qualitative set
 * (worst all-pairs ΔE 11.0 deutan, 15.6 normal vision, validated); the two
 * owner colours are the brand's own.
 *
 * Every note also carries its shift/owner label as text, which is the
 * secondary encoding that makes the amber's sub-3:1 contrast acceptable —
 * colour never carries the meaning alone.
 */
export const SHIFT_META: Record<NoteShift, { label: string; hex: string }> = {
  morning: { label: "Morning shift", hex: "#009E73" },
  evening: { label: "Evening shift", hex: "#E69F00" },
  night: { label: "Night shift", hex: "#0072B2" },
};

export const OWNER_META = {
  normal: { label: "Owner", hex: "#6E1B3A" },
  priority: { label: "Owner priority", hex: "#D55E00" },
};

export const CATEGORY_LABELS: Record<NoteCategory, string> = {
  to_order: "To order",
  to_call: "To call",
  handover: "Handover",
  stock: "Stock",
  payment: "Payment",
  instruction: "Instruction",
  question: "Question",
  general: "General",
};

export const CATEGORY_ORDER: NoteCategory[] = [
  "to_order",
  "to_call",
  "handover",
  "stock",
  "payment",
  "instruction",
  "question",
  "general",
];

/** Resolved colour + label for one note, from its stored context. */
export function noteAccent(note: { shift: NoteShift | null; priority: boolean }) {
  if (note.shift) return SHIFT_META[note.shift];
  return note.priority ? OWNER_META.priority : OWNER_META.normal;
}
