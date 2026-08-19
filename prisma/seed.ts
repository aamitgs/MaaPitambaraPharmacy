import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";
import { BRAND, BRAND_ADDRESS } from "../src/lib/brand";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Brand identity is re-applied on every run (so a rebrand in
  // `src/lib/brand.ts` propagates), while operational settings — discount
  // cap, manager PIN, expiry windows — are only set on first create so a
  // re-seed never clobbers what the owner configured in the UI.
  const tenant = await prisma.tenant.upsert({
    where: { id: "demo-tenant" },
    update: {
      pharmacyName: BRAND.name,
      invoiceFooterText: BRAND.invoiceFooterText,
      invoiceTermsText: BRAND.invoiceTermsText,
    },
    create: {
      id: "demo-tenant",
      pharmacyName: BRAND.name,
      tenantType: "retail",
      invoiceFooterText: BRAND.invoiceFooterText,
      invoiceTermsText: BRAND.invoiceTermsText,
      staffDiscountCapPercent: 10,
      managerPinHash: await bcrypt.hash("1234", 10),
      nearExpiryWindowDays: 90,
    },
  });

  // Real registration data, so it is re-applied on every seed the same way
  // the name and address are. The registered pharmacist is still blank —
  // that is a person's name and council number, not a business licence, and
  // is set under Branches -> edit.
  const branchIdentity = {
    name: "Shaheed Nagar",
    licensedAddress: BRAND_ADDRESS,
    phone: BRAND.contact.mobile,
    landline: BRAND.contact.landline,
    gstin: BRAND.registration.gstin,
    pan: BRAND.registration.pan,
    drugLicenseRetailNo: BRAND.registration.drugLicenseRetailNo,
    drugLicenseWholesaleNo: BRAND.registration.drugLicenseWholesaleNo,
    fssaiNo: BRAND.registration.fssaiNo,
  };

  const branch = await prisma.branch.upsert({
    where: { id: "demo-branch" },
    update: branchIdentity,
    create: {
      id: "demo-branch",
      tenantId: tenant.id,
      ...branchIdentity,
    },
  });

  const users = [
    {
      id: "demo-owner",
      name: "Amit Sharma",
      email: BRAND.contact.email,
      role: "owner" as const,
      // The owner account carries the pharmacy's registered email, so its
      // password should not be a value committed to this repo. Set
      // SEED_OWNER_PASSWORD before seeding a real deployment.
      password: process.env.SEED_OWNER_PASSWORD || "Owner@12345",
    },
    {
      id: "demo-pharmacist",
      name: "Staff Pharmacist",
      email: "pharmacist@maapitambara.local",
      role: "pharmacist" as const,
      password: "Pharmacist@12345",
    },
    {
      id: "demo-counter",
      name: "Counter Staff",
      email: "counter@maapitambara.local",
      role: "counter_staff" as const,
      password: "Counter@12345",
    },
  ];

  for (const u of users) {
    // Keyed by id, not tenantId+email: a rebrand changes the addresses, and
    // an email-keyed upsert would try to create a second row on the same
    // primary key instead of renaming the existing account.
    await prisma.user.upsert({
      where: { id: u.id },
      update: { name: u.name, email: u.email, role: u.role },
      create: {
        id: u.id,
        tenantId: tenant.id,
        name: u.name,
        email: u.email,
        role: u.role,
        passwordHash: await bcrypt.hash(u.password, 10),
      },
    });
  }

  const item = await prisma.item.upsert({
    where: { id: "demo-item-para" },
    update: {},
    create: {
      id: "demo-item-para",
      tenantId: tenant.id,
      name: "Paracetamol 500mg",
      genericName: "Paracetamol",
      manufacturer: "Cipla",
      composition: "Paracetamol 500mg",
      scheduleClass: "none",
      hsnCode: "3004",
      taxRate: 12,
      unit: "strip",
      packSize: "10 tablets",
      reorderLevel: 20,
    },
  });

  await prisma.batch.upsert({
    where: { id: "demo-batch-para-1" },
    update: {},
    create: {
      id: "demo-batch-para-1",
      itemId: item.id,
      branchId: branch.id,
      batchNo: "PCM24A",
      mfgDate: new Date("2024-06-01"),
      expiryDate: new Date("2027-06-30"),
      mrp: 30,
      purchaseRate: 18,
      saleRate: 28,
      currentQty: 500,
      rackLocation: "A1-03",
    },
  });

  const cough = await prisma.item.upsert({
    where: { id: "demo-item-cough" },
    update: {},
    create: {
      id: "demo-item-cough",
      tenantId: tenant.id,
      name: "Corex Cough Syrup",
      genericName: "Codeine + CPM",
      manufacturer: "Pfizer",
      composition: "Codeine Phosphate + Chlorpheniramine Maleate",
      scheduleClass: "H",
      hsnCode: "3004",
      taxRate: 12,
      unit: "bottle",
      packSize: "100ml",
      reorderLevel: 10,
    },
  });

  await prisma.batch.upsert({
    where: { id: "demo-batch-cough-1" },
    update: {},
    create: {
      id: "demo-batch-cough-1",
      itemId: cough.id,
      branchId: branch.id,
      batchNo: "CRX24B",
      mfgDate: new Date("2024-01-01"),
      expiryDate: new Date("2026-09-15"),
      mrp: 95,
      purchaseRate: 60,
      saleRate: 90,
      currentQty: 40,
      rackLocation: "B2-01",
    },
  });

  // The referring gastroenterologist most of this pharmacy's prescriptions
  // come from — a real record, not sample data, so it's kept in step on
  // re-seed the same way the tenant/branch identity is. Receipts print
  // `name` verbatim, hence the title stored in the value.
  const doctorIdentity = {
    name: "Dr. Deepak Kumar Sharma",
    registrationNo: "MCI-57000",
    clinicName: "Mudgal Gastro Medics",
    phone: "9828912257",
  };

  await prisma.doctor.upsert({
    where: { id: "demo-doctor-1" },
    update: doctorIdentity,
    create: {
      id: "demo-doctor-1",
      tenantId: tenant.id,
      ...doctorIdentity,
    },
  });

  console.log(`Seeded tenant: ${tenant.pharmacyName} — branch: ${branch.name}`);
  console.log(`GSTIN ${branch.gstin} · ${branch.licensedAddress}`);
  console.log("");
  console.log(`Owner login: ${users[0].email} / ${users[0].password}`);
  console.log(`Pharmacist:  ${users[1].email} / ${users[1].password}`);
  console.log(`Counter:     ${users[2].email} / ${users[2].password}`);
  console.log("Manager PIN for discount overrides: 1234");
  console.log("");
  console.log("Before billing for real, in the app:");
  console.log("  1. change every password above and the manager PIN (Settings -> Security)");
  console.log("  2. fill in the registered pharmacist's name + council no. (Branches -> edit)");
  console.log("  3. delete the sample items and batches this seed created");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
