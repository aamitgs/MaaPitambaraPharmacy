"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

/**
 * Credentials that are still whatever the installer left behind.
 *
 * A seeded password or a 1234 manager PIN is not a bug in the code — it is
 * a bug in the deployment, and the only way it gets fixed is if something
 * says so. Until now nothing did: the app worked perfectly well with every
 * default in place.
 *
 * Nothing here reveals a credential. Each check is a bcrypt comparison
 * against a known-bad value, and the result is a boolean.
 */

/** Values shipped by prisma/seed.ts, plus the PINs people actually pick. */
const SEEDED_PASSWORDS = ["Owner@12345", "Pharmacist@12345", "Counter@12345"];
const WEAK_PINS = ["1234", "0000", "1111", "1212", "4321", "9999", "2580"];

export type SecurityFinding = {
  id: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  fix: string;
  fixHref: string;
};

export async function getSecurityPosture(): Promise<SecurityFinding[]> {
  const session = await requireRole(["owner"]);
  const tenantId = session.user.tenantId;

  const [tenant, users] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { managerPinHash: true },
    }),
    prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, email: true, role: true, passwordHash: true, totpEnabled: true },
    }),
  ]);

  const findings: SecurityFinding[] = [];

  if (!tenant.managerPinHash) {
    findings.push({
      id: "pin-unset",
      severity: "critical",
      title: "No manager PIN is set",
      detail:
        "Over-cap discounts, customer returns and bill cancellations all ask for this PIN. With none set, those approvals cannot be given at all.",
      fix: "Set a manager PIN",
      fixHref: "/staff",
    });
  } else {
    for (const weak of WEAK_PINS) {
      if (await bcrypt.compare(weak, tenant.managerPinHash)) {
        findings.push({
          id: "pin-weak",
          severity: "critical",
          title: "The manager PIN is a well-known default",
          detail:
            "This PIN approves discounts beyond the staff cap, customer refunds and same-day bill cancellations. Anyone who has seen a demo of this software can guess it.",
          fix: "Change the manager PIN",
          fixHref: "/staff",
        });
        break;
      }
    }
  }

  for (const user of users) {
    for (const seeded of SEEDED_PASSWORDS) {
      if (await bcrypt.compare(seeded, user.passwordHash)) {
        findings.push({
          id: `password-seeded-${user.id}`,
          severity: "critical",
          title: `${user.name} is still on the installation password`,
          detail: `${user.email} can be signed into by anyone who has read this software's setup notes.`,
          fix: user.id === session.user.id ? "Change your password" : "Reset their password",
          fixHref: user.id === session.user.id ? "/security" : "/staff",
        });
        break;
      }
    }
  }

  for (const user of users) {
    if (!user.totpEnabled && (user.role === "owner" || user.role === "pharmacist")) {
      findings.push({
        id: `mfa-missing-${user.id}`,
        severity: "warning",
        title: `${user.name} has no authenticator app set up`,
        detail:
          user.role === "owner"
            ? "The owner's authenticator is what guards staff, roles and counter limits — those changes are blocked entirely without it."
            : "A pharmacist can sign off prescription sales, so their account is worth protecting with a second factor.",
        fix: user.id === session.user.id ? "Set up two-factor" : "Ask them to set it up",
        fixHref: "/security",
      });
    }
  }

  const order = { critical: 0, warning: 1 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
