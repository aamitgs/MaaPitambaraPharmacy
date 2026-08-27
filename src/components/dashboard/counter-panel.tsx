"use client";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CounterClock } from "./counter-clock";
import { BRAND } from "@/lib/brand";
import { CalendarDays, Clock, Moon, Phone, Smartphone, Sun } from "lucide-react";

/**
 * Slide-over showing the live clock, that the counter is open around the
 * clock, and how to reach it. There is no open/closed calculation because
 * there is nothing to calculate — the shop never closes.
 *
 * The headline and note are owner-editable at /branding and arrive as
 * props: this is a client component, so it cannot resolve branding itself.
 * `daysLabel` stays a constant — it describes the 24×7 arrangement, and a
 * shop that adopts real opening windows needs a schedule here, not a
 * different sentence.
 */
export function CounterPanel({
  hours,
}: {
  hours: { headline: string; note: string };
}) {
  const { daysLabel } = BRAND.hours;
  const { headline, note } = hours;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Clock className="h-4 w-4 text-chart-3" /> Counter hours
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-0 p-0">
        <SheetTitle className="sr-only">Counter hours and contact</SheetTitle>

        {/* Gold hairline echoes the dashboard header and the bill. */}
        <div className="border-b-2 border-brand-gold/40 bg-brand-cream/40 px-6 pt-6 pb-5">
          <CounterClock
            location={`${BRAND.contact.addressLine1.split(",").pop()?.trim()}, ${BRAND.contact.city}`}
          />
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-xl bg-brand-maroon px-5 py-5 text-brand-cream shadow-sm">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-brand-cream/70 uppercase">
              Counter availability
            </div>
            <div className="mt-1 text-5xl font-semibold tracking-tight text-brand-gold">
              {headline}
            </div>
            <div className="mt-3 border-t border-brand-gold/40 pt-3 text-sm text-brand-cream/90">
              {note}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span>{daysLabel}</span>
          </div>

          {/* Two halves of the day, stated rather than computed — the point
              is that neither one closes. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border p-4">
              <Sun className="h-4 w-4 text-brand-gold" />
              <div className="mt-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Daytime
              </div>
              <div className="font-semibold">Dispensing &amp; billing</div>
            </div>
            <div className="rounded-xl border p-4">
              <Moon className="h-4 w-4 text-brand-maroon" />
              <div className="mt-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Overnight
              </div>
              <div className="font-semibold">Emergency counter</div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
            <span className="text-muted-foreground">Counter status</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-success">
              <span className="h-2 w-2 rounded-full bg-success" />
              Open now
            </span>
          </div>

          <div className="rounded-xl border bg-brand-cream/30 p-4">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Reach the counter
            </div>
            <div className="mt-3 grid gap-2">
              <Button asChild variant="outline" className="justify-start">
                <a href={`tel:${BRAND.contact.landline.replace(/[^0-9+]/g, "")}`}>
                  <Phone className="h-4 w-4" /> {BRAND.contact.landline}
                </a>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <a href={`tel:${BRAND.contact.mobile.replace(/[^0-9+]/g, "")}`}>
                  <Smartphone className="h-4 w-4" /> {BRAND.contact.mobile}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
