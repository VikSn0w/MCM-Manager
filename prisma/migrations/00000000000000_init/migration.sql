-- CreateTable
CREATE TABLE "Bike" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "raceNumber" INTEGER,
    "alias" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BikeModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "builder" TEXT NOT NULL DEFAULT 'Ohvale',
    "model" TEXT NOT NULL,
    "displacement" INTEGER NOT NULL,
    "priceModifier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "insurancePrice" DOUBLE PRECISION NOT NULL DEFAULT 25.0,
    "insuranceCoverage" DOUBLE PRECISION NOT NULL DEFAULT 250.0,
    "imageUrl" TEXT,
    "bgColor" TEXT,
    "info" TEXT,
    "hp" DOUBLE PRECISION,
    "hpRpm" INTEGER,
    "torque" DOUBLE PRECISION,
    "torqueRpm" INTEGER,
    "usage" TEXT NOT NULL DEFAULT 'BOTH',
    "gearbox" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BikeModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sessionsCount" INTEGER NOT NULL,
    "peopleCount" INTEGER NOT NULL,
    "hours" TEXT NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "bookingType" TEXT NOT NULL DEFAULT 'STANDARD',
    "championshipType" TEXT,
    "bikeSelectionMode" TEXT NOT NULL DEFAULT 'MIXED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bikeAssignmentMode" TEXT NOT NULL DEFAULT 'AUTO',
    "bikesReviewedAt" TIMESTAMP(3),

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingBike" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bikeId" TEXT NOT NULL,
    "insuranceSelected" BOOLEAN NOT NULL DEFAULT false,
    "apparelSelected" BOOLEAN NOT NULL DEFAULT false,
    "pilotName" TEXT,
    "pilotUserId" TEXT,
    "championshipGroupId" TEXT,
    "declaredLevel" TEXT,
    "gridPosition" INTEGER,

    CONSTRAINT "BookingBike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Championship" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "minRacers" INTEGER NOT NULL DEFAULT 5,
    "sessionsCount" INTEGER NOT NULL DEFAULT 3,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "fixedDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lockMode" TEXT NOT NULL DEFAULT 'FULL_DAY',
    "lockedHours" TEXT,

    CONSTRAINT "Championship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChampionshipGroup" (
    "id" TEXT NOT NULL,
    "championshipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 7,
    "timeSlot" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChampionshipGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyConfig" (
    "id" TEXT NOT NULL DEFAULT 'single-config',
    "companyName" TEXT NOT NULL DEFAULT 'LeasioGP Paddock',
    "logoUrl" TEXT NOT NULL DEFAULT '/images/logo.png',
    "circuitName" TEXT NOT NULL DEFAULT 'Adria International Raceway',
    "googleMapsUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bikeAssignmentMode" TEXT NOT NULL DEFAULT 'AUTO',

    CONSTRAINT "CompanyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayConfig" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "customPriceModifier" DOUBLE PRECISION,
    "maxCapacityPerSlot" INTEGER NOT NULL DEFAULT 5,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleIt" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionIt" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "durationIt" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "timeIt" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "bikeModelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tariff" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "basePricePerSession" DOUBLE PRECISION NOT NULL,
    "basePricePerPerson" DOUBLE PRECISION NOT NULL,
    "minSessions" INTEGER NOT NULL DEFAULT 1,
    "maxSessions" INTEGER NOT NULL DEFAULT 6,
    "discountThreshold" INTEGER NOT NULL DEFAULT 3,
    "discountThresholdPrice" DOUBLE PRECISION NOT NULL DEFAULT 60.0,
    "pricePerSessionAfterThreshold" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlot" (
    "id" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "maxParticipants" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingBike_bookingId_bikeId_championshipGroupId_key" ON "BookingBike"("bookingId" ASC, "bikeId" ASC, "championshipGroupId" ASC);

-- CreateIndex
CREATE INDEX "BookingBike_championshipGroupId_idx" ON "BookingBike"("championshipGroupId" ASC);

-- CreateIndex
CREATE INDEX "ChampionshipGroup_championshipId_idx" ON "ChampionshipGroup"("championshipId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ChampionshipGroup_championshipId_name_key" ON "ChampionshipGroup"("championshipId" ASC, "name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DayConfig_date_key" ON "DayConfig"("date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash" ASC);

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Tariff_dayOfWeek_key" ON "Tariff"("dayOfWeek" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email" ASC);

-- AddForeignKey
ALTER TABLE "Bike" ADD CONSTRAINT "Bike_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "BikeModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingBike" ADD CONSTRAINT "BookingBike_bikeId_fkey" FOREIGN KEY ("bikeId") REFERENCES "Bike"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingBike" ADD CONSTRAINT "BookingBike_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingBike" ADD CONSTRAINT "BookingBike_championshipGroupId_fkey" FOREIGN KEY ("championshipGroupId") REFERENCES "ChampionshipGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingBike" ADD CONSTRAINT "BookingBike_pilotUserId_fkey" FOREIGN KEY ("pilotUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChampionshipGroup" ADD CONSTRAINT "ChampionshipGroup_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "Championship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_bikeModelId_fkey" FOREIGN KEY ("bikeModelId") REFERENCES "BikeModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

