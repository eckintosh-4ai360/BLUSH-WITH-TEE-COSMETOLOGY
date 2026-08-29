-- The fees as quoted on the application form the applicant signed.
--
-- Left null on existing rows on purpose: those were filed before the quote was
-- recorded, so the form falls back to the programme's current price rather than
-- inventing a figure nobody agreed to.
ALTER TABLE "applications" ADD COLUMN "tuition" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "productFee" numeric(10, 2);--> statement-breakpoint

-- The syllabus of the three main programmes, as the school advertises it.
--
-- "courseModules" has existed since 0001 but nothing ever wrote to it, so the
-- outline lived as prose inside "description" and could not be edited item by
-- item. These rows give an existing database the same starting point a fresh
-- one now gets from the foundation seed. A database created after this point
-- has no courses yet when this runs, so the join simply matches nothing.
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
