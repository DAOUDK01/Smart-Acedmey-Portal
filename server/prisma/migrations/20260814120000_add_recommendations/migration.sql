-- CreateTable
CREATE TABLE "StudentInteraction" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "interactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clickCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceTransition" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "nextResourceId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentInteraction_studentId_interactionDate_idx" ON "StudentInteraction"("studentId", "interactionDate");

-- CreateIndex
CREATE INDEX "StudentInteraction_lectureId_idx" ON "StudentInteraction"("lectureId");

-- CreateIndex
CREATE INDEX "StudentInteraction_interactionDate_idx" ON "StudentInteraction"("interactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceTransition_resourceId_nextResourceId_key" ON "ResourceTransition"("resourceId", "nextResourceId");

-- CreateIndex
CREATE INDEX "ResourceTransition_resourceId_count_idx" ON "ResourceTransition"("resourceId", "count");