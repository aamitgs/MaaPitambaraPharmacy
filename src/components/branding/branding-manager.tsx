"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogoUpload } from "./logo-upload";
import { BrandPreview } from "./brand-preview";
import { contrastRatio, isHex, normalizeHex } from "@/lib/color";
import { updateBranding, resetBranding } from "@/lib/actions/branding";
import type { Branding } from "@/lib/branding";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";

type StoredLogos = { icon: string | null; horizontal: string | null; stacked: string | null };
type Defaults = { primary: string; accent: string; surface: string };

const PAPER_OPTIONS = [
  { value: "a5", label: "A5 — patient bill" },
  { value: "a4", label: "A4" },
  { value: "80mm", label: "80mm thermal" },
  { value: "58mm", label: "58mm thermal" },
];

/** Hex field with a native swatch picker beside it. */
function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={isHex(value) ? normalizeHex(value) : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * Live legibility read-out. The server refuses a failing combination
 * outright, so showing the ratio as it is typed is what stops the refusal
 * being a surprise at the end of a long form.
 */
function ContrastNote({
  fg,
  bg,
  floor,
  what,
  advisory,
}: {
  fg: string;
  bg: string;
  /** Null for an advisory row — a ratio worth seeing, but not gated. */
  floor: number | null;
  what: string;
  advisory?: string;
}) {
  const ratio = contrastRatio(fg, bg);
  if (ratio === null) return null;
  const ok = floor === null || ratio >= floor;
  return (
    <p className={cn("text-[11px]", ok ? "text-muted-foreground" : "text-destructive")}>
      {what}: {ratio.toFixed(1)}:1
      {floor === null
        ? ` — ${advisory}`
        : ok
          ? ` — clears the ${floor}:1 minimum.`
          : ` — below the ${floor}:1 minimum, this will be refused.`}
    </p>
  );
}

export function BrandingManager({
  branding,
  storedLogos,
  defaults,
}: {
  branding: Branding;
  storedLogos: StoredLogos;
  defaults: Defaults;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [pharmacyName, setPharmacyName] = useState(branding.name);
  const [shortName, setShortName] = useState(branding.shortName);
  const [tagline, setTagline] = useState(branding.tagline);
  const [description, setDescription] = useState(branding.description);

  const [primary, setPrimary] = useState(branding.colors.primary);
  const [accent, setAccent] = useState(branding.colors.accent);
  const [surface, setSurface] = useState(branding.colors.surface);

  const [headerText, setHeaderText] = useState(branding.invoice.headerText);
  const [footerText, setFooterText] = useState(branding.invoice.footerText);
  const [termsText, setTermsText] = useState(branding.invoice.termsText);
  const [paper, setPaper] = useState(branding.invoice.paperDefault);
  const [showLogo, setShowLogo] = useState(branding.invoice.showLogo);
  const [upiId, setUpiId] = useState(branding.contact.upiId);

  const [supportEmail, setSupportEmail] = useState(branding.contact.email);
  const [websiteUrl, setWebsiteUrl] = useState(branding.contact.website);
  const [hoursHeadline, setHoursHeadline] = useState(branding.hours.headline);
  const [hoursNote, setHoursNote] = useState(branding.hours.note);

  const [logos, setLogos] = useState<StoredLogos>(storedLogos);

  function save() {
    startTransition(async () => {
      try {
        await updateBranding({
          pharmacyName,
          brandShortName: shortName,
          brandTagline: tagline,
          brandDescription: description,
          primaryColor: primary,
          accentColor: accent,
          surfaceColor: surface,
          invoiceHeaderText: headerText,
          invoiceFooterText: footerText,
          invoiceTermsText: termsText,
          invoicePaperDefault: paper as "58mm" | "80mm" | "a5" | "a4",
          showLogoOnInvoice: showLogo,
          upiId,
          supportEmail,
          websiteUrl,
          hoursHeadline,
          hoursNote,
          logoIconUrl: logos.icon,
          logoHorizontalUrl: logos.horizontal,
          logoStackedUrl: logos.stacked,
        });
        toast.success("Branding saved — reloading to apply it");
        // A hard reload, not router.refresh(): the palette lives in a
        // <style> in the root layout and the metadata in <head>, neither of
        // which a soft refresh re-renders.
        window.location.reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save branding");
      }
    });
  }

  function reset() {
    startTransition(async () => {
      try {
        await resetBranding();
        toast.success("Back to the shipped branding");
        window.location.reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not reset");
      }
    });
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Branding</h1>
          <p className="text-sm text-muted-foreground">
            Everything the pharmacy looks like — logo, colours, and what prints on a bill. Only
            the owner can see or change this, and every change is written to the audit log.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={reset} disabled={pending}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save branding
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Tabs defaultValue="identity">
          <TabsList>
            <TabsTrigger value="identity">Identity</TabsTrigger>
            <TabsTrigger value="logos">Logos</TabsTrigger>
            <TabsTrigger value="colours">Colours</TabsTrigger>
            <TabsTrigger value="invoice">Invoice</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="max-w-2xl space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Pharmacy name</Label>
                <Input id="name" value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">
                  Shown on bills, the sidebar and the browser tab.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="short">Short name</Label>
                <Input id="short" value={shortName} onChange={(e) => setShortName(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">
                  For the home-screen icon label and tight layouts.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tagline">Tagline</Label>
              <Input id="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Used by the browser and by anything that links to the app.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="logos" className="space-y-4 pt-4">
            <p className="max-w-2xl text-xs text-muted-foreground">
              PNG with a transparent background works best. Each slot falls back to the bundled
              artwork until you upload your own, and the change reaches printed bills, the PDF
              and the login screen together.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <LogoUpload
                label="Icon"
                hint="Roundel alone — collapsed sidebar, thermal bills, browser tab."
                previewSrc={branding.logo.icon}
                isCustom={Boolean(logos.icon)}
                onUploaded={(path) => setLogos((l) => ({ ...l, icon: path }))}
                onCleared={() => setLogos((l) => ({ ...l, icon: null }))}
              />
              <LogoUpload
                label="Horizontal lockup"
                hint="Logo beside the name — sidebar header and A4/A5 bills."
                previewSrc={branding.logo.horizontal}
                isCustom={Boolean(logos.horizontal)}
                onUploaded={(path) => setLogos((l) => ({ ...l, horizontal: path }))}
                onCleared={() => setLogos((l) => ({ ...l, horizontal: null }))}
              />
              <LogoUpload
                label="Stacked lockup"
                hint="Logo above the name — the login screen."
                previewSrc={branding.logo.stacked}
                isCustom={Boolean(logos.stacked)}
                onUploaded={(path) => setLogos((l) => ({ ...l, stacked: path }))}
                onCleared={() => setLogos((l) => ({ ...l, stacked: null }))}
              />
            </div>
          </TabsContent>

          <TabsContent value="colours" className="max-w-2xl space-y-4 pt-4">
            <div className="grid gap-4 md:grid-cols-3">
              <ColorField
                id="primary"
                label="Primary"
                hint="Headings, totals, the active menu item."
                value={primary}
                onChange={setPrimary}
              />
              <ColorField
                id="accent"
                label="Accent"
                hint="Icons, badges, hairlines."
                value={accent}
                onChange={setAccent}
              />
              <ColorField
                id="surface"
                label="Background tint"
                hint="The warm ground behind panels."
                value={surface}
                onChange={setSurface}
              />
            </div>

            <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
              <ContrastNote fg={primary} bg={surface} floor={4.5} what="Primary on background" />
              <ContrastNote fg={accent} bg={primary} floor={3} what="Accent on primary" />
              <ContrastNote
                fg={accent}
                bg={surface}
                floor={null}
                what="Accent on background"
                advisory="only icons and hairlines are drawn here, so this one is not enforced."
              />
              <p className="pt-1 text-[11px] text-muted-foreground">
                A bill is read on paper under shop lighting, so the two enforced pairs are
                refused rather than warned about. Dark mode is derived from the same three
                colours.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPrimary(defaults.primary);
                setAccent(defaults.accent);
                setSurface(defaults.surface);
              }}
            >
              Use the shipped palette
            </Button>
          </TabsContent>

          <TabsContent value="invoice" className="max-w-2xl space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="paper">Default paper</Label>
                <Select value={paper} onValueChange={setPaper}>
                  <SelectTrigger id="paper">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAPER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Which size the print screen opens on. The others stay one click away.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="upi">UPI ID for the bill QR</Label>
                <Input id="upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@bank" />
                <p className="text-[11px] text-muted-foreground">
                  Where a scan-and-pay actually sends the money.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Print the logo on bills</div>
                <p className="text-[11px] text-muted-foreground">
                  Off prints the pharmacy name instead — useful on pre-printed letterhead.
                </p>
              </div>
              <Switch checked={showLogo} onCheckedChange={setShowLogo} />
            </div>

            <Separator />

            <p className="text-xs text-muted-foreground">
              Use <code>|</code> to split any of these onto separate lines.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="header">Header note</Label>
              <Textarea id="header" rows={2} value={headerText} onChange={(e) => setHeaderText(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Prints under the letterhead, above the invoice number.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="footer">Footer</Label>
              <Textarea id="footer" rows={2} value={footerText} onChange={(e) => setFooterText(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terms">Terms &amp; conditions</Label>
              <Textarea id="terms" rows={2} value={termsText} onChange={(e) => setTermsText(e.target.value)} />
            </div>

            <p className="text-[11px] text-muted-foreground">
              GSTIN, drug licences, FSSAI and the pharmacist&apos;s registration are per-branch —
              edit those under{" "}
              <Link href="/branches" className="underline underline-offset-2">
                Branches
              </Link>
              .
            </p>
          </TabsContent>

          <TabsContent value="contact" className="max-w-2xl space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Contact email</Label>
                <Input id="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="web">Website</Label>
                <Input id="web" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://" />
              </div>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="hours">Counter hours headline</Label>
              <Input id="hours" value={hoursHeadline} onChange={(e) => setHoursHeadline(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                The large figure on the Counter hours panel — &ldquo;24 × 7&rdquo;, or your own
                wording.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hours-note">Counter hours note</Label>
              <Textarea id="hours-note" rows={2} value={hoursNote} onChange={(e) => setHoursNote(e.target.value)} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              The counter&apos;s phone numbers and address are per-branch — edit those under{" "}
              <Link href="/branches" className="underline underline-offset-2">
                Branches
              </Link>
              .
            </p>
          </TabsContent>
        </Tabs>

        <BrandPreview
          pharmacyName={pharmacyName}
          logoHorizontal={branding.logo.horizontal}
          showLogo={showLogo}
          primary={primary}
          accent={accent}
          surface={surface}
          headerText={headerText}
          footerText={footerText}
          termsText={termsText}
        />
      </div>
    </div>
  );
}
