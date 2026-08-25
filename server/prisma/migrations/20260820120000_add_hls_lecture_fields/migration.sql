DO $$
BEGIN
  IF to_regclass('public."Lecture"') IS NOT NULL THEN
    ALTER TABLE "Lecture"
      ADD COLUMN IF NOT EXISTS "sourceType" TEXT,
      ADD COLUMN IF NOT EXISTS "hlsMasterUrl" TEXT,
      ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT,
      ADD COLUMN IF NOT EXISTS "processingStatus" TEXT,
      ADD COLUMN IF NOT EXISTS "processingProgress" INTEGER,
      ADD COLUMN IF NOT EXISTS "processingError" TEXT;
  END IF;
END $$;