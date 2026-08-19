"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Photo/PDF capture for a document attached to a record — a prescription at
 * the till, a distributor's invoice at goods-in. `capture="environment"`
 * means a phone or tablet opens the rear camera directly, which is how these
 * are captured in practice; a desktop shows the normal file picker.
 */
export function AttachmentUpload({
  label,
  endpoint,
  path,
  onPathChange,
  buttonLabel = "Attach photo",
  previewAlt = "Attachment preview",
}: {
  label: string;
  /** POST target that accepts `file` and returns `{ path }`. */
  endpoint: string;
  path: string | null;
  onPathChange: (path: string | null) => void;
  buttonLabel?: string;
  previewAlt?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      onPathChange(body.path);
      setPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload the file");
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    onPathChange(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        {path ? (
          <div className="flex items-center gap-2">
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={previewAlt} className="h-8 w-8 rounded object-cover" />
            )}
            <span className="text-xs text-muted-foreground">Attached</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleRemove}
              aria-label={`Remove ${label.toLowerCase()}`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            {buttonLabel}
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
