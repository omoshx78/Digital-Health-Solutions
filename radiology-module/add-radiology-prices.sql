-- Optional: adds starter Radiology exams to the price list (safe to run twice).
-- Prices are placeholders - change them on the Pricing page afterwards.
INSERT INTO "ChargeCatalogItem" (id, category, name, price, active, "updatedAt")
SELECT gen_random_uuid()::text, 'Radiology', v.name, v.price, true, now()
FROM (VALUES
  ('Chest X-Ray', 1500), ('Limb / Extremity X-Ray', 1500), ('Spine X-Ray', 2000),
  ('Abdominal Ultrasound', 2000), ('Pelvic Ultrasound', 2000), ('Obstetric Ultrasound', 2000),
  ('CT Head', 6000), ('CT Chest', 8000), ('CT Abdomen / Pelvis', 9000)
) AS v(name, price)
WHERE NOT EXISTS (SELECT 1 FROM "ChargeCatalogItem" c WHERE c.category = 'Radiology' AND c.name = v.name);
