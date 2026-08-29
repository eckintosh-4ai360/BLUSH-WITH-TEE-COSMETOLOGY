-- The ten individual (single-skill) courses the school sells alongside the
-- three full programmes.
--
-- These have been in the foundation seed since the admissions work, but that
-- seed only fills an empty "courses" table: a database populated before they
-- were written never received them, and never would. Matched on "code" and
-- guarded by ON CONFLICT so this is a no-op wherever they already exist.
--
-- Prices and durations are the school's published list. Durations are stored
-- in teaching weeks, which is what the timetable counts in: one month is four
-- weeks, two months is eight.
INSERT INTO "courses" (
  "code", "slug", "title", "category", "summary", "description",
  "durationWeeks", "tuition", "productFee", "schedule", "certification",
  "requirements", "isFeatured"
)
VALUES
  ('IND-MAKEUP-PERS', 'personal-makeup', 'Personal Makeup', 'Individual Courses',
   'Learn day, evening, and flawless personal glam techniques for yourself.',
   'Master personal skincare prep, foundation matching, brow sculpting, eyeshadow blending, and everyday beauty application.',
   1, 1000.00, NULL, 'Monday - Saturday (8am - 5pm)', 'Personal Makeup Certificate',
   'No prior experience required.', false),

  ('IND-MAKEUP-BEG', 'professional-makeup-beginner', 'Professional Makeup (Beginner)', 'Individual Courses',
   'Comprehensive 2-month foundations for aspiring professional makeup artists.',
   'Covers skin science, color theory, bridal glam, editorial looks, client consultation, contouring, and camera-ready finishing.',
   8, 2500.00, 2500.00, 'Monday - Saturday (8am - 5pm)', 'Professional Makeup Certificate',
   'Open to beginners. Training products to be purchased at school store.', true),

  ('IND-MAKEUP-UPG', 'professional-makeup-upgrade', 'Professional Makeup (Upgrade)', 'Individual Courses',
   'Advanced masterclass upgrade for practicing makeup artists.',
   'Sharpen precision blending, high-definition bridal techniques, cut-crease trends, and luxury client finishes.',
   1, 1500.00, NULL, 'Monday - Saturday (8am - 5pm)', 'Master Makeup Artistry Certificate',
   'Basic makeup background required.', false),

  ('IND-WIG-STYLE', 'wigmaking-and-styling', 'Wigmaking & Styling', 'Individual Courses',
   'Machine and hand wig construction, ventilation, bleaching knots, and custom styling.',
   'Learn cap sizing, machine track stitching, lace customization, plucking, knot bleaching, and salon heat styling.',
   4, 2000.00, 1800.00, 'Monday - Saturday (8am - 5pm)', 'Wigmaking & Styling Certificate',
   'Open to motivated beginners.', false),

  ('IND-INST-STYLE', 'installation-and-styling-only', 'Installation & Styling Only', 'Individual Courses',
   'Seamless lace front, closure, and frontal installs with precision melts.',
   'Master skin tone lace blending, glueless and adhesive applications, baby hair crafting, and longevity maintenance.',
   2, 1500.00, NULL, 'Monday - Saturday (8am - 5pm)', 'Lace Installation Certificate',
   'Open to beginners.', false),

  ('IND-INST-HAIRLINE', 'installation-styling-customised-hairline', 'Installation & Styling, Customised Hairline', 'Individual Courses',
   'Advanced hairline customization, natural density plucking, and invisible melts.',
   'Specialized training in creating ultra-realistic hairlines, ear-tab tailoring, adhesive chemistry, and modern finishes.',
   2, 2000.00, NULL, 'Monday - Saturday (8am - 5pm)', 'Advanced Hairline & Lace Certificate',
   'Basic wig experience recommended.', false),

  ('IND-BRIDAL-HAIR', 'bridal-hairstyling', 'Bridal Hairstyling', 'Individual Courses',
   'High-end bridal updos, romantic waves, veil placement, and hair accessory design.',
   'Create classic and modern bridal updos, textured ponytails, accessory placement, and long-lasting hold techniques for wedding parties.',
   2, 2000.00, 1000.00, 'Monday - Saturday (8am - 5pm)', 'Bridal Hair Artistry Certificate',
   'Open to all students.', false),

  ('IND-NAILS', 'nails-technology-design', 'Nails (Manicure, Pedicure & Extensions)', 'Individual Courses',
   'Full nail technology: acrylic, builder gel, Russian manicures, nail art, and luxury pedicures.',
   'Hands-on nail anatomy, hygienic cuticle prep, tips, forms, acrylic sculpting, gel polish application, and spa pedicure routines.',
   8, 2000.00, 2000.00, 'Monday - Saturday (8am - 5pm)', 'Nail Technology Certificate',
   'Open to beginners.', false),

  ('IND-LASH-EXT', 'lash-extension', 'Lash Extension', 'Individual Courses',
   'Classic, hybrid, and volume eyelash extensions with safe adhesive isolation.',
   'Learn eye mapping, lash health, isolation techniques, weight calculation, fills, and gentle removal procedures.',
   2, 2000.00, 2000.00, 'Monday - Saturday (8am - 5pm)', 'Eyelash Extension Certificate',
   'Steady hand and good vision.', false),

  ('IND-OMBRE-BROWS', 'ombre-powder-brows', 'Ombre Brows', 'Individual Courses',
   'Semi-permanent makeup brow shading, mapping, color theory, and sterilization.',
   'Master facial symmetry mapping, skin undertones, needle configurations, machine shading, ombre gradients, and aftercare.',
   4, 2000.00, 2500.00, 'Monday - Saturday (8am - 5pm)', 'Ombre Brow Artistry Certificate',
   'Open to motivated beauty practitioners.', true)
ON CONFLICT DO NOTHING;
