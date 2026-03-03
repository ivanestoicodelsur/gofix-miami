-- CreateEnum
CREATE TYPE "RepairRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "RepairRequest" (
    "id" SERIAL NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "deviceBrand" TEXT,
    "deviceModel" TEXT,
    "serviceType" TEXT,
    "description" TEXT NOT NULL,
    "status" "RepairRequestStatus" NOT NULL DEFAULT 'PENDING',
    "price" DOUBLE PRECISION,
    "technicianId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepairRequest_customerEmail_idx" ON "RepairRequest"("customerEmail");

-- CreateIndex
CREATE INDEX "RepairRequest_status_idx" ON "RepairRequest"("status");

-- CreateIndex
CREATE INDEX "RepairRequest_technicianId_idx" ON "RepairRequest"("technicianId");

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
