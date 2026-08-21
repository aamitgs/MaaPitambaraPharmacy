import { ShieldAlert } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBranding, BRAND_ACCENT } from "@/lib/branding";
import { BRAND } from "@/lib/brand";
import { BrandingManager } from "@/components/branding/branding-manager";

/**
 * White-label appearance. Owner-only at the view level as well as in the
 * action — this decides what every bill, the login screen and the browser
 * tab look like.
 */
export default async function BrandingPage() {
  const session = await auth();
  if (!session?.user) return null;

  if (session.user.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Owner only</p>
        <p className="text-sm">
          The pharmacy&apos;s logo, colours and bill text can only be changed by the owner.
        </p>
      </div>
    );
  }

  const [branding, tenant] = await Promise.all([
    getBranding(),
    prisma.tenant.findUniqueOrThrow({
      where: { id: session.user.tenantId },
      select: {
        logoIconUrl: true,
        logoHorizontalUrl: true,
        logoStackedUrl: true,
      },
    }),
  ]);

  return (
    <BrandingManager
      branding={branding}
      // The raw stored paths, not the resolved URLs: the form has to be able
      // to tell "no upload, showing the bundled default" from "uploaded".
      storedLogos={{
        icon: tenant.logoIconUrl,
        horizontal: tenant.logoHorizontalUrl,
        stacked: tenant.logoStackedUrl,
      }}
      defaults={{
        primary: BRAND.themeColor,
        accent: BRAND_ACCENT,
        surface: BRAND.backgroundColor,
      }}
    />
  );
}
