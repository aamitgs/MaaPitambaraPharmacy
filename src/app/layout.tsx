import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { getBranding } from "@/lib/branding";
import { BrandStyle } from "@/components/brand-style";
import { ServiceWorker } from "@/components/service-worker";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const fontMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

// Resolved per request rather than at build: renaming the pharmacy in
// /branding has to change the browser tab too, and that string is baked
// into the HTML head.
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    // `template` brands every child segment that sets its own title;
    // `default` covers the segments that don't.
    title: {
      default: `${branding.name} — Billing`,
      template: `%s · ${branding.name}`,
    },
    description: branding.description,
    applicationName: branding.name,
    icons: { icon: branding.logo.icon },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const branding = await getBranding();
  return { themeColor: branding.colors.primary };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(fontSans.variable, fontMono.variable)} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <BrandStyle />
        <ServiceWorker />
        <Providers>{children}</Providers>
        {/* Vercel-only: the scripts these mount 404 on the self-hosted shop
            build, which is a real deployment target for this app. */}
        {process.env.VERCEL && (
          <>
            <SpeedInsights />
            <Analytics />
          </>
        )}
      </body>
    </html>
  );
}
