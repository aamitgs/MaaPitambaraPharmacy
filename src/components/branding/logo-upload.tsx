"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One logo slot. Uploads immediately on pick so the preview is real rather
 * than a local object URL that would vanish on save — but the stored path
 * only reaches the tenant row when the form is saved, so an upload the
 * owner then abandons leaves an orphan file and nothing more.
 */
export function LogoUpload({
  label,
  hint,
  previewSrc,
  isCustom,
  onUploaded,
  onCleared,
  previewClassName,
  dark,
}: {
  label: string;
  hint: string;
  previewSrc: string;
  isCustom: boolean;
  onUploaded: (path: string) => void;
  onCleared: () => void;
  previewClassName?: string;
  dark?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  async function pick(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads/brand-logo", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setLocalPreview(URL.createObjectURL(file));
      onUploaded(json.path);
      toast.success(`${label} uploaded — save to apply it`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload that image");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>

      <div
        className={cn(
          "flex min-h-24 items-center justify-center rounded-md border border-dashed p-3",
          dark ? "bg-brand-maroon" : "bg-muted/30"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={localPreview ?? previewSrc}
          alt=""
          className={cn("max-h-20 w-auto object-contain", previewClassName)}
        />
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) pick(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {isCustom || localPreview ? "Replace" : "Upload"}
        </Button>
        {(isCustom || localPreview) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title="Back to the bundled logo"
            onClick={() => {
              setLocalPreview(null);
              onCleared();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
