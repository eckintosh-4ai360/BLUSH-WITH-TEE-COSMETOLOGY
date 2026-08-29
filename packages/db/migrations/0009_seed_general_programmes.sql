-- The three full programmes, and two categories to sort the prospectus by.
--
-- 0008 did this for the ten individual courses; the same gap applies to these.
-- "initializeFoundationData" only fills an empty "courses" table, so a database
-- that already held a single row never received any of the real catalogue.
--
-- The category is renamed from "Full Cosmetology" to "General" so the
-- prospectus splits cleanly in two: General for the full programmes, Individual
-- Courses for the single-skill ones.
UPDATE "courses" SET "category" = 'General' WHERE "category" = 'Full Cosmetology';--> statement-breakpoint

INSERT INTO "courses" (
  "code", "slug", "title", "category", "summary", "description",
  "durationWeeks", "tuition", "schedule", "certification",
  "requirements", "toiletries", "isFeatured"
)
VALUES
  ('COSM-BASIC', 'basic-cosmetology-course', 'Basic Cosmetology Course', 'General',
   'Makeup, Wigmaking and styling (machine), Installation, Frontal pony.',
   'Develop practical confidence in fundamental beauty artistry: professional makeup, machine-assisted wigmaking, wig styling, installations, and frontal pony styling.',
   12, 5000.00, 'Monday - Saturday (8am - 5pm)', 'Basic Cosmetology Certificate',
   'Open to motivated beginners. Bring required toiletries on day one.',
   'One big size Omo, One big size Dettol, One big size paper roll, 2 big wet wipes, 1 full pack of blade',
   true),

  ('COSM-MINI', 'mini-full-cosmetology-course', 'Mini Full Cosmetology Course', 'General',
   'Professional Makeup, Wigmaking and styling, Wig Installations, Frontal pony, Bridal hairstyling, Nails, Pedicure.',
   'Intensive 6-month cosmetology program covering advanced makeup, salon wigmaking, lace installations, bridal hair design, nail sculpting, and professional pedicures.',
   24, 8500.00, 'Monday - Saturday (8am - 5pm)', 'Mini Full Cosmetology Diploma',
   'Open to motivated beginners and aspiring beauty salon specialists.',
   'One big size Omo, One big size Dettol, One big size paper roll, 2 big wet wipes, 1 full pack of blade',
   true),

  ('COSM-ULTIMATE', 'ultimate-full-cosmetology-course', 'Ultimate Full Cosmetology Course', 'General',
   'Professional Makeup, Wigmaking & styling, Wig Installations, Frontal Pony, Bridal hairstyling, Nails, Pedicure, Lash extensions, Cluster lashes, Ombre brows.',
   'Our definitive one-year master cosmetology training covering all specialized disciplines: high-glam makeup, full wig artistry, bridal styling, nail enhancements, lash extensions, cluster lashes, and ombre brows.',
   48, 13000.00, 'Monday - Saturday (8am - 5pm)', 'Ultimate Cosmetology Master Diploma',
   'Open to passionate individuals seeking full professional mastery.',
   'One big size Omo, One big size Dettol, One big size paper roll, 2 big wet wipes, 1 full pack of blade',
   true)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- The syllabus for those three. 0007 carried the same list but ran before the
-- programmes existed, so its join matched nothing and wrote no rows.
INSERT INTO "courseModules" ("courseId", "code", "title", "sequence")
SELECT c."id", m."code", m."title", m."sequence"
FROM "courses" c
JOIN (
  VALUES
    ('COSM-BASIC', 'M01', 'Makeup', 1),
    ('COSM-BASIC', 'M02', 'Wigmaking and styling (machine)', 2),
    ('COSM-BASIC', 'M03', 'Installation', 3),
    ('COSM-BASIC', 'M04', 'Frontal pony', 4),

    ('COSM-MINI', 'M01', 'Professional Makeup', 1),
    ('COSM-MINI', 'M02', 'Wigmaking and styling', 2),
    ('COSM-MINI', 'M03', 'Wig Installations', 3),
    ('COSM-MINI', 'M04', 'Frontal pony', 4),
    ('COSM-MINI', 'M05', 'Bridal hairstyling', 5),
    ('COSM-MINI', 'M06', 'Nails', 6),
    ('COSM-MINI', 'M07', 'Pedicure', 7),

    ('COSM-ULTIMATE', 'M01', 'Professional Makeup', 1),
    ('COSM-ULTIMATE', 'M02', 'Wigmaking and styling', 2),
    ('COSM-ULTIMATE', 'M03', 'Wig Installations', 3),
    ('COSM-ULTIMATE', 'M04', 'Frontal Pony', 4),
    ('COSM-ULTIMATE', 'M05', 'Bridal hairstyling', 5),
    ('COSM-ULTIMATE', 'M06', 'Nails', 6),
    ('COSM-ULTIMATE', 'M07', 'Pedicure', 7),
    ('COSM-ULTIMATE', 'M08', 'Lash extensions', 8),
    ('COSM-ULTIMATE', 'M09', 'Cluster lashes', 9),
    ('COSM-ULTIMATE', 'M10', 'Ombre brows', 10)
) AS m ("courseCode", "code", "title", "sequence")
  ON m."courseCode" = c."code"
WHERE NOT EXISTS (
  SELECT 1 FROM "courseModules" existing
  WHERE existing."courseId" = c."id" AND existing."code" = m."code"
);
