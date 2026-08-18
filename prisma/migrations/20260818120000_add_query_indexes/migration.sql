-- CreateIndex
CREATE INDEX "Booking_date_status_idx" ON "Booking"("date", "status");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE INDEX "BookingBike_bikeId_idx" ON "BookingBike"("bikeId");

-- CreateIndex
CREATE INDEX "BookingBike_pilotUserId_idx" ON "BookingBike"("pilotUserId");

