import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
  // 1. Sequence for human-readable Medical Record Numbers.
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS mrn_seq START 1001;`);

  // 2. First admin account. Set ADMIN_EMAIL / ADMIN_PASSWORD (and optionally
  // ADMIN_NAME) in the environment before running the seed. If no password is
  // given, a random one is generated and printed once — never a known default.
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@clinicore.local").trim();
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const generated = !process.env.ADMIN_PASSWORD;
    const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString("base64url");
    await prisma.user.create({
      data: {
        name: process.env.ADMIN_NAME || "System Administrator",
        email: adminEmail,
        passwordHash: await bcrypt.hash(password, 12),
        role: "ADMIN",
      },
    });
    console.log(`Created admin user: ${adminEmail}`);
    if (generated) console.log(`Generated password (shown once, change it after first login): ${password}`);
  } else {
    console.log(`Admin ${adminEmail} already exists — left unchanged.`);
  }

  // 3. Starter inventory (KES pricing)
  const inventory = [
    { name: "Paracetamol 500mg", category: "Medicine", unit: "tablet", quantity: 480, reorderLevel: 100, unitPrice: 5 },
    { name: "Amoxicillin 500mg", category: "Medicine", unit: "capsule", quantity: 220, reorderLevel: 80, unitPrice: 15 },
    { name: "Artemether/Lumefantrine", category: "Medicine", unit: "pack", quantity: 60, reorderLevel: 40, unitPrice: 150 },
    { name: "ORS Sachets", category: "Medicine", unit: "sachet", quantity: 150, reorderLevel: 50, unitPrice: 20 },
    { name: "Ibuprofen 400mg", category: "Medicine", unit: "tablet", quantity: 90, reorderLevel: 100, unitPrice: 8 },
    { name: "Metformin 500mg", category: "Medicine", unit: "tablet", quantity: 300, reorderLevel: 100, unitPrice: 8 },
    { name: "Diazepam 5mg", category: "Medicine", unit: "tablet", quantity: 40, reorderLevel: 30, unitPrice: 15 },
    { name: "Ceftriaxone Injection 1g", category: "Medicine", unit: "vial", quantity: 25, reorderLevel: 20, unitPrice: 120 },
    { name: "Surgical Gloves (box)", category: "Consumable", unit: "box", quantity: 35, reorderLevel: 15, unitPrice: 300 },
    { name: "IV Cannula", category: "Consumable", unit: "piece", quantity: 200, reorderLevel: 60, unitPrice: 40 },
    { name: "Syringes 5ml", category: "Consumable", unit: "piece", quantity: 300, reorderLevel: 100, unitPrice: 5 },
    { name: "Gauze Roll", category: "Consumable", unit: "roll", quantity: 12, reorderLevel: 20, unitPrice: 50 },
  ];
  for (const item of inventory) {
    const existing = await prisma.inventoryItem.findFirst({ where: { name: item.name } });
    if (!existing) await prisma.inventoryItem.create({ data: item });
  }

  // 4. Equipment / theatres with itemized default fees (KES)
  const equipment = [
    {
      name: "Theatre 1",
      type: "Theatre",
      feeItems: [
        { label: "Theatre/facility fee", defaultAmount: 5000 },
        { label: "Surgeon's fee", defaultAmount: 8000 },
        { label: "Anaesthesia fee", defaultAmount: 4000 },
        { label: "Consumables & supplies", defaultAmount: 2000 },
      ],
    },
    {
      name: "Theatre 2",
      type: "Theatre",
      feeItems: [
        { label: "Theatre/facility fee", defaultAmount: 5000 },
        { label: "Surgeon's fee", defaultAmount: 8000 },
        { label: "Anaesthesia fee", defaultAmount: 4000 },
        { label: "Consumables & supplies", defaultAmount: 2000 },
      ],
    },
    { name: "X-Ray Machine", type: "Radiology", feeItems: [{ label: "X-Ray imaging fee", defaultAmount: 1500 }] },
    { name: "Ultrasound Scanner", type: "Radiology", feeItems: [{ label: "Ultrasound scan fee", defaultAmount: 2000 }] },
    { name: "CT Scanner", type: "Radiology", feeItems: [{ label: "CT scan fee", defaultAmount: 6000 }] },
    { name: "ECG Machine", type: "Diagnostic", feeItems: [{ label: "ECG fee", defaultAmount: 1200 }] },
  ];
  for (const eq of equipment) {
    const existing = await prisma.equipment.findFirst({ where: { name: eq.name } });
    if (!existing) {
      await prisma.equipment.create({
        data: { name: eq.name, type: eq.type, feeItems: { create: eq.feeItems } },
      });
    }
  }

  // 5. A couple of wards with beds, since inpatient care is in scope.
  const wards = [
    { name: "General Ward", type: "General", bedCount: 10, dailyRate: 1500 },
    { name: "Maternity Ward", type: "Maternity", bedCount: 6, dailyRate: 2500 },
  ];
  for (const w of wards) {
    const existing = await prisma.ward.findFirst({ where: { name: w.name } });
    if (!existing) {
      const ward = await prisma.ward.create({ data: { name: w.name, type: w.type, dailyRate: w.dailyRate } });
      for (let i = 1; i <= w.bedCount; i++) {
        await prisma.bed.create({ data: { wardId: ward.id, bedNumber: String(i).padStart(2, "0") } });
      }
    }
  }

  // 6. Pricing catalog — consultation fees (system-required, referenced by
  // code) and lab tests (freely editable/addable via the Pricing page).
  const systemCharges: { code: string; category: string; name: string; price: number }[] = [
    { code: "CONSULTATION_ROUTINE", category: "Consultation", name: "Routine consultation", price: 500 },
    { code: "CONSULTATION_EMERGENCY", category: "Consultation", name: "Emergency doctor call", price: 1500 },
  ];
  for (const c of systemCharges) {
    const existing = await prisma.chargeCatalogItem.findUnique({ where: { code: c.code } });
    if (!existing) await prisma.chargeCatalogItem.create({ data: c });
  }

  const labTests = [
    { name: "Full Blood Count", price: 800 },
    { name: "Malaria Parasite Test", price: 300 },
    { name: "Widal Test (Typhoid)", price: 400 },
    { name: "Urinalysis", price: 300 },
    { name: "Blood Glucose", price: 250 },
    { name: "HIV Rapid Test", price: 200 },
    { name: "X-Ray Imaging", price: 1500 },
    { name: "Ultrasound Scan", price: 2000 },
    { name: "Hepatitis B Screen", price: 500 },
    { name: "Pregnancy Test", price: 250 },
  ];
  for (const t of labTests) {
    const existing = await prisma.chargeCatalogItem.findFirst({ where: { category: "Laboratory", name: t.name } });
    if (!existing) await prisma.chargeCatalogItem.create({ data: { category: "Laboratory", name: t.name, price: t.price } });
  }

  // Radiology exams for patients referred from other clinics. These prices
  // are starting points only — set the real ones on the Pricing page.
  const radiologyExams = [
    { name: "Chest X-Ray", price: 1500 },
    { name: "Limb / Extremity X-Ray", price: 1500 },
    { name: "Spine X-Ray", price: 2000 },
    { name: "Abdominal Ultrasound", price: 2000 },
    { name: "Pelvic Ultrasound", price: 2000 },
    { name: "Obstetric Ultrasound", price: 2000 },
    { name: "CT Head", price: 6000 },
    { name: "CT Chest", price: 8000 },
    { name: "CT Abdomen / Pelvis", price: 9000 },
  ];
  for (const t of radiologyExams) {
    const existing = await prisma.chargeCatalogItem.findFirst({ where: { category: "Radiology", name: t.name } });
    if (!existing) await prisma.chargeCatalogItem.create({ data: { category: "Radiology", name: t.name, price: t.price } });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
