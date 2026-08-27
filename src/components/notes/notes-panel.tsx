"use client";

import { useState, useTransition } from "react";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createNote,
  deleteNote,
  toggleNoteDone,
  toggleNotePinned,
  type NoteItem,
} from "@/lib/actions/notes";
import { Check, NotebookPen, Pin, PinOff, Plus, Trash2, Undo2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NoteCategory, UserRole } from "@/generated/prisma/client";
import { CATEGORY_LABELS, CATEGORY_ORDER, noteAccent } from "@/lib/notes-meta";

/**
 * The counter notepad, as a slide-over. Notes are shared across the
 * pharmacy — a shift handover nobody else can read is not a handover.
 */
export function NotesPanel({ notes, role }: { notes: NoteItem[]; role: UserRole }) {
  const isOwner = role === "owner";
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pinned, setPinned] = useState(false);
  const [priority, setPriority] = useState(false);
  const [category, setCategory] = useState<NoteCategory>("general");
  const [filter, setFilter] = useState<NoteCategory | "all">("all");
  const [pending, startTransition] = useTransition();

  const visibleNotes = notes.filter((n) => filter === "all" || n.category === filter);
  const outstanding = notes.filter((n) => !n.doneAt);
  const overdue = outstanding.filter((n) => n.dueAt && isPast(new Date(n.dueAt)));

  function run(fn: () => Promise<void>, failure: string) {
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : failure);
      }
    });
  }

  function add() {
    if (!body.trim()) return;
    run(async () => {
      await createNote({
        body: body.trim(),
        category,
        pinned,
        priority,
        dueAt: dueAt || undefined,
      });
      setBody("");
      setDueAt("");
      setPinned(false);
      setPriority(false);
      setCategory("general");
      toast.success("Note added");
    }, "Could not add the note");
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <NotebookPen className="h-4 w-4 text-chart-5" /> Notes
          {outstanding.length > 0 && (
            <span
              className={cn(
                "ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                overdue.length > 0
                  ? "bg-destructive text-white"
                  : "bg-brand-gold text-brand-maroon"
              )}
            >
              {outstanding.length}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="gap-0 p-0">
        <SheetTitle className="border-b px-6 py-4 text-base font-semibold">
          Counter notes
        </SheetTitle>

        <div className="space-y-3 border-b bg-brand-cream/30 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="note-body" className="text-xs">
              New note
            </Label>
            <Textarea
              id="note-body"
              rows={3}
              value={body}
              placeholder="Handover, reminder, standing instruction…"
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as NoteCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note-due" className="text-xs">
                Remind at (optional)
              </Label>
              <Input
                id="note-due"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={pinned ? "default" : "outline"}
              size="sm"
              aria-pressed={pinned}
              onClick={() => setPinned((v) => !v)}
            >
              <Pin className="h-3.5 w-3.5" /> Pin
            </Button>
            {/* Priority is the owner's second colour, so only an owner can
                set it — the server ignores it from anyone else. */}
            {isOwner && (
              <Button
                type="button"
                variant={priority ? "default" : "outline"}
                size="sm"
                aria-pressed={priority}
                onClick={() => setPriority((v) => !v)}
              >
                Priority
              </Button>
            )}
            <Button
              type="button"
              className="ml-auto"
              onClick={add}
              disabled={pending || !body.trim()}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        {/* Category filter: a pad with thirty notes is unusable without one. */}
        <div className="flex gap-1.5 overflow-x-auto border-b px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["all", ...CATEGORY_ORDER] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors",
                filter === c
                  ? "border-brand-maroon bg-brand-maroon text-brand-cream"
                  : "hover:bg-accent"
              )}
            >
              {c === "all" ? "All" : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        <div className="divide-y">
          {notes.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No notes yet. Anything written here is visible to everyone on shift.
            </p>
          )}
          {visibleNotes.map((note) => {
            const isOverdue = !note.doneAt && note.dueAt && isPast(new Date(note.dueAt));
            // Colour is derived from stored context; the label beside it
            // means colour never carries the meaning on its own.
            const accent = noteAccent(note);
            return (
              <div
                key={note.id}
                className={cn("flex gap-3 border-l-4 p-4", note.doneAt && "opacity-60")}
                style={{ borderLeftColor: accent.hex }}
              >
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm whitespace-pre-wrap", note.doneAt && "line-through")}>
                    {note.body}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase"
                      style={{ backgroundColor: accent.hex }}
                    >
                      {accent.label}
                    </span>
                    <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium">
                      {CATEGORY_LABELS[note.category]}
                    </span>
                    {note.pinned && (
                      <span className="inline-flex items-center gap-1 font-medium text-brand-maroon">
                        <Pin className="h-3 w-3" /> Pinned
                      </span>
                    )}
                    {note.dueAt && (
                      <span className={cn(isOverdue && "font-medium text-destructive")}>
                        {isOverdue ? "Overdue " : "Due "}
                        {format(new Date(note.dueAt), "dd MMM, h:mm a")}
                      </span>
                    )}
                    <span>
                      {note.authorName} · {format(new Date(note.createdAt), "dd MMM")}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    aria-label={note.doneAt ? "Mark as not done" : "Mark as done"}
                    onClick={() => run(() => toggleNoteDone(note.id), "Could not update the note")}
                  >
                    {note.doneAt ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    aria-label={note.pinned ? "Unpin" : "Pin"}
                    onClick={() => run(() => toggleNotePinned(note.id), "Could not pin the note")}
                  >
                    {note.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </Button>
                  {note.canDelete && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      aria-label="Delete note"
                      onClick={() => run(() => deleteNote(note.id), "Could not delete the note")}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
