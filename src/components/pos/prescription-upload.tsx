"use client";

import { AttachmentUpload } from "@/components/attachment-upload";

export function PrescriptionUpload({
  path,
  onPathChange,
}: {
  path: string | null;
  onPathChange: (path: string | null) => void;
}) {
  return (
    <AttachmentUpload
      label="Prescription photo (optional)"
      endpoint="/api/uploads/prescription"
      path={path}
      onPathChange={onPathChange}
      previewAlt="Prescription preview"
    />
  );
}
