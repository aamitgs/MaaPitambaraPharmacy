"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addSaltAlias, removeSaltAlias } from "@/lib/actions/composition-health";

export function SaltAliases({
  aliases,
  canEdit,
}: {
  aliases: { id: string; alias: string; canonical: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [alias, setAlias] = useState("");
  const [canonical, setCanonical] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      try {
        await addSaltAlias(alias, canonical);
        toast.success(`"${alias.trim().toLowerCase()}" now matches "${canonical.trim().toLowerCase()}"`);
        setAlias("");
        setCanonical("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not add");
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Salt spellings</h2>
        <p className="max-w-prose text-xs text-muted-foreground">
          Manufacturers write the same ingredient several ways. The app knows a short list of
          them; add the ones your own suppliers use and substitutes will start matching across
          those spellings. Saying two salts are the same is a clinical judgement — nothing is
          added here automatically.
        </p>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="alias">Spelling on the label</Label>
            <Input
              id="alias"
              placeholder="cetirizine dihydrochloride"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="w-64"
            />
          </div>
          <ArrowRight className="mb-2.5 h-4 w-4 text-muted-foreground" />
          <div className="space-y-1.5">
            <Label htmlFor="canonical">Treat it as</Label>
            <Input
              id="canonical"
              placeholder="cetirizine"
              value={canonical}
              onChange={(e) => setCanonical(e.target.value)}
              className="w-64"
            />
          </div>
          <Button onClick={add} disabled={pending || !alias.trim() || !canonical.trim()}>
            <Plus /> Add
          </Button>
        </div>
      )}

      {aliases.length === 0 ? (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          No spellings added yet. The built-in list still applies.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {aliases.map((a) => (
            <div key={a.id} className="flex items-center gap-2 p-2 text-sm">
              <span className="font-medium">{a.alias}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{a.canonical}</span>
              {canEdit && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="ml-auto"
                  aria-label={`Remove ${a.alias}`}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await removeSaltAlias(a.id);
                        toast.success("Removed");
                        router.refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Could not remove");
                      }
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
