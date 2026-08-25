-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- Seed defaults
INSERT INTO "SystemSetting" ("key", "value") VALUES ('maintenance_mode', 'false');
INSERT INTO "SystemSetting" ("key", "value") VALUES ('maintenance_message', 'The Smart Academy Portal is currently undergoing scheduled maintenance. Please check back soon.');