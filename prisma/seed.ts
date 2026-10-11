import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * This script DELETES every row in every table before reseeding. That is fine
 * for a scratch database and catastrophic anywhere else, and `npm run seed` is
 * one keystroke away from the command you actually meant to type.
 *
 * So it refuses to run unless you say so explicitly:
 *
 *   SEED_CONFIRM=wipe npm run seed
 *
 * and it refuses outright when NODE_ENV is production, regardless of the flag.
 */
function assertSafeToWipe() {
  const url = process.env.DATABASE_URL || "";
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "(unparseable DATABASE_URL)";
    }
  })();

  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);

  console.log("");
  console.log("  This will DELETE ALL DATA in:");
  console.log("    host:", host);
  console.log("    users, bookings, bikes, tariffs, championships, lessons, config");
  console.log("");

  if (process.env.NODE_ENV === "production") {
    console.error("  Refusing: NODE_ENV is production.");
    process.exit(1);
  }

  if (process.env.SEED_CONFIRM !== "wipe") {
    console.error("  Refusing: set SEED_CONFIRM=wipe to confirm you want this.");
    if (!isLocal) {
      console.error("  Note: this DATABASE_URL is not localhost — check it is really a scratch database.");
    }
    console.error("");
    console.error("    SEED_CONFIRM=wipe npm run seed");
    console.error("");
    process.exit(1);
  }

  if (!isLocal) {
    console.warn("  WARNING: wiping a remote database (" + host + ").");
  }
}

async function main() {
  assertSafeToWipe();

  console.log("Seeding database...");

  // 1. Clear database
  await prisma.bookingBike.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.bike.deleteMany({});
  await prisma.bikeModel.deleteMany({});
  await prisma.tariff.deleteMany({});
  await prisma.timeSlot.deleteMany({});
  await prisma.dayConfig.deleteMany({});
  await prisma.championship.deleteMany({});
  await prisma.companyConfig.deleteMany({});
  await prisma.lesson.deleteMany({});

  // 2. Create Users
  const adminPassword = await bcrypt.hash("admin123", 10);
  const customerPassword = await bcrypt.hash("racer123", 10);

  const admin = await prisma.user.create({
    data: {
      email: "vittoriopiconeusa@gmail.com",
      password: adminPassword,
      name: "Luigi Montella",
      role: "ADMIN",
    },
  });

  const customer1 = await prisma.user.create({
    data: {
      email: "vittoriopicone30@gmail.com",
      password: customerPassword,
      name: "Vittorio Picone",
      role: "CUSTOMER",
    },
  });

  const customer2 = await prisma.user.create({
    data: {
      email: "racer2@leasio.com",
      password: customerPassword,
      name: "Emanuele Nappi",
      role: "CUSTOMER",
    },
  });

  console.log(`Created admin user: ${admin.email}`);
  console.log(`Created customer user: ${customer1.email}`);
  console.log(`Created customer user: ${customer2.email}`);

  // 3. Create Bike Models
  const model110 = await prisma.bikeModel.create({
    data: {
      name: "Ohvale GP-0 110A",
      model: "GP-0 110A",
      builder: "Ohvale",
      displacement: 110,
      priceModifier: 1.0,
      insurancePrice: 20.0,
      insuranceCoverage: 200.0,
      imageUrl: "/images/ohvale-gp0-110-automatica.jpg",
      bgColor: "#FFFFFF",
      info: "La moto ideale per giovani e principianti. Trasmissione completamente automatica a una marcia.",
      hp: 10.0,
      hpRpm: 6000,
      torque: 6.7,
      torqueRpm: 6500,
      usage: "BOTH",
      gearbox: "Automatico",
    }
  });

  const model160 = await prisma.bikeModel.create({
    data: {
      name: "Ohvale GP-0 160 4S Evo",
      model: "GP-0 160 4S Evo",
      builder: "Ohvale",
      displacement: 160,
      priceModifier: 1.1,
      insurancePrice: 25.0,
      insuranceCoverage: 250.0,
      imageUrl: "/images/160_lat_bianco-1024x702.jpg",
      bgColor: "#FFFFFF",
      info: "Moto di fascia media con cambio manuale a 4 marce. Ottimo equilibrio tra agilità e potenza.",
      hp: 15.0,
      hpRpm: 9500,
      torque: 12.0,
      torqueRpm: 8000,
      usage: "BOTH",
      gearbox: "4 marce",
    }
  });

  const model190 = await prisma.bikeModel.create({
    data: {
      name: "Ohvale GP-2 190",
      model: "GP-2 190",
      builder: "Ohvale",
      displacement: 190,
      priceModifier: 1.3,
      insurancePrice: 35.0,
      insuranceCoverage: 350.0,
      imageUrl: "/images/GP2_190-RACE_26_RED-scaled.png",
      bgColor: "#FFFFFF",
      info: "Mini-motard da corsa di fascia alta. Motore di grossa cilindrata, telaio premium, sospensioni regolabili.",
      hp: 24.0,
      hpRpm: 9500,
      torque: 17.0,
      torqueRpm: 8000,
      usage: "RENTAL",
      gearbox: "4 marce",
    }
  });

  const model0190 = await prisma.bikeModel.create({
    data: {
      name: "Ohvale GP-0 190",
      model: "GP-0 190",
      builder: "Ohvale",
      displacement: 190,
      priceModifier: 1.25,
      insurancePrice: 30.0,
      insuranceCoverage: 300.0,
      imageUrl: "/images/GP2_190-RACE_26_RED-scaled.png",
      bgColor: "#FFFFFF",
      info: "Telaio storico con motore 190cc ad alte prestazioni. Un piccolo razzo.",
      hp: 24.0,
      hpRpm: 9500,
      torque: 18.0,
      torqueRpm: 8000,
      usage: "ACADEMY",
      gearbox: "4 marce",
    }
  });

  console.log("Seeded bike models.");

  // 4. Create Physical Bike Instances
  const physicalBikes = [
    { modelId: model110.id, status: "AVAILABLE", raceNumber: 27, alias: "Stoner" },
    { modelId: model110.id, status: "AVAILABLE", raceNumber: 73, alias: "A. Marquez" },
    { modelId: model110.id, status: "AVAILABLE", raceNumber: 20, alias: "Quartararo" },
    { modelId: model110.id, status: "AVAILABLE", raceNumber: 43, alias: "Miller" },
    { modelId: model110.id, status: "AVAILABLE", raceNumber: 55, alias: "Montella" },

    { modelId: model160.id, status: "AVAILABLE", raceNumber: 63, alias: "Bagnaia" },
    { modelId: model160.id, status: "MAINTENANCE", raceNumber: 93, alias: "M. Marquez" },

    { modelId: model190.id, status: "AVAILABLE", raceNumber: 72, alias: "Bezzecchi" },
    { modelId: model190.id, status: "AVAILABLE", raceNumber: 65, alias: "Capirex" },

    { modelId: model0190.id, status: "RETIRED", raceNumber: 46, alias: "Rossi" },
  ];

  for (const b of physicalBikes) {
    const bike = await prisma.bike.create({
      data: b,
      include: { model: true },
    });
    console.log(`Created physical bike: ${bike.model.name} #${bike.raceNumber} - "${bike.alias}" (${bike.status})`);
  }

  // 4. Create Weekly Tariffs (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const tariffs = [
    { dayOfWeek: 0, basePricePerSession: 50.0, basePricePerPerson: 35.0, discountThreshold: 3, discountThresholdPrice: 60.0, pricePerSessionAfterThreshold: 20.0 }, // Sunday
    { dayOfWeek: 1, basePricePerSession: 40.0, basePricePerPerson: 25.0, discountThreshold: 3, discountThresholdPrice: 60.0, pricePerSessionAfterThreshold: 20.0 }, // Monday
    { dayOfWeek: 2, basePricePerSession: 40.0, basePricePerPerson: 25.0, discountThreshold: 3, discountThresholdPrice: 60.0, pricePerSessionAfterThreshold: 20.0 }, // Tuesday
    { dayOfWeek: 3, basePricePerSession: 40.0, basePricePerPerson: 25.0, discountThreshold: 3, discountThresholdPrice: 60.0, pricePerSessionAfterThreshold: 20.0 }, // Wednesday
    { dayOfWeek: 4, basePricePerSession: 40.0, basePricePerPerson: 25.0, discountThreshold: 3, discountThresholdPrice: 60.0, pricePerSessionAfterThreshold: 20.0 }, // Thursday
    { dayOfWeek: 5, basePricePerSession: 45.0, basePricePerPerson: 30.0, discountThreshold: 3, discountThresholdPrice: 60.0, pricePerSessionAfterThreshold: 20.0 }, // Friday
    { dayOfWeek: 6, basePricePerSession: 50.0, basePricePerPerson: 35.0, discountThreshold: 3, discountThresholdPrice: 60.0, pricePerSessionAfterThreshold: 20.0 }, // Saturday
  ];

  for (const t of tariffs) {
    await prisma.tariff.create({ data: t });
  }
  console.log("Seeded weekly tariffs");

  // 5. Create Time Slots
  const slots = [
    { time: "09:00", label: "Turno mattina 1", maxParticipants: 5 },
    { time: "11:00", label: "Turno mattina 2", maxParticipants: 5 },
    { time: "14:00", label: "Turno pomeriggio 1", maxParticipants: 5 },
    { time: "16:00", label: "Turno pomeriggio 2", maxParticipants: 5 },
  ];

  for (const s of slots) {
    await prisma.timeSlot.create({ data: s });
  }
  console.log("Seeded standard time slots");

  // 6. Create custom Day Override example (e.g., corporate private day or modified capacity day)
  const today = new Date();
  const formatOverrideDate = (d: Date) => d.toISOString().split("T")[0];

  // Block a date next week
  const blockedDate = new Date();
  blockedDate.setDate(blockedDate.getDate() + 5);
  await prisma.dayConfig.create({
    data: {
      date: formatOverrideDate(blockedDate),
      isAvailable: false,
      notes: "Pista noleggiata per test privati Moto3 al Mugello",
    },
  });

  // Reduced capacity date
  const reducedCapacityDate = new Date();
  reducedCapacityDate.setDate(reducedCapacityDate.getDate() + 7);
  await prisma.dayConfig.create({
    data: {
      date: formatOverrideDate(reducedCapacityDate),
      isAvailable: true,
      maxCapacityPerSlot: 2,
      notes: "Corso di coaching: max 2 piloti per turno",
    },
  });

  console.log("Seeded sample day overrides (one blocked day, one reduced capacity day)");

  // 7. Seed default Championships
  await prisma.championship.create({
    data: {
      name: "GP Sprint",
      description: "10 minuti di giri liberi, 10 minuti di qualifica e una gara di 8 giri (minimo 5 piloti).",
      price: 65.0,
      minRacers: 5,
      sessionsCount: 3,
      isAvailable: true,
    },
  });

  await prisma.championship.create({
    data: {
      name: "GP PLUS",
      description: "10 minuti di giri liberi, 10 minuti di qualifica, Gara 1 di 8 giri e Gara 2 di 8 giri (minimo 5 piloti).",
      price: 85.0,
      minRacers: 5,
      sessionsCount: 4,
      isAvailable: true,
    },
  });

  const scheduledDate = new Date();
  scheduledDate.setDate(scheduledDate.getDate() + 10);
  await prisma.championship.create({
    data: {
      name: "GP Summer Cup",
      description: "10 minuti di giri liberi, 10 minuti di qualifica e una gara principale di 15 giri.",
      price: 95.0,
      minRacers: 5,
      sessionsCount: 4,
      isAvailable: true,
      fixedDate: formatOverrideDate(scheduledDate),
    },
  });

  console.log("Seeded default championships: GP Sprint, GP PLUS, GP Summer Cup");

  // 8. Seed default Company Configuration settings
  await prisma.companyConfig.create({
    data: {
      id: "single-config",
      companyName: "MCM Racing School",
      logoUrl: "/images/logo.webp",
      circuitName: "Circuito Del Volturno",
      googleMapsUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3747.167395831302!2d14.371992999999998!3d41.156520799999996!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x133a5749ecd2c6f9%3A0xdc9df6a14fe99e9!2sCircuito%20Internazionale%20Del%20Volturno!5e1!3m2!1sen!2sit!4v1780604209406!5m2!1sen!2sit",
    },
  });

  console.log("Seeded default company configuration settings");

  // 9. Seed default Lessons & Classes
  await prisma.lesson.create({
    data: {
      title: "Basic Track Technique",
      titleIt: "Tecnica Base in Pista",
      description: "Perfect for beginners. Master body positioning, basic track safety, throttle modulation, and cornering fundamentals.",
      descriptionIt: "Perfetto per principianti. Impara la posizione in sella, la sicurezza in pista, la gestione dell'acceleratore e le traiettorie di base.",
      duration: "2 Hours",
      durationIt: "2 Ore",
      time: "09:00 - 11:00 or 14:00 - 16:00",
      timeIt: "09:00 - 11:00 o 14:00 - 16:00",
      cost: 120.0,
      isAvailable: true,
      bikeModelId: model110.id,
    },
  });

  await prisma.lesson.create({
    data: {
      title: "Intermediate Telemetry & Lines",
      titleIt: "Traiettorie & Telemetria Intermedio",
      description: "Enhance your pace. Includes dynamic video analysis, corner speed optimization, and professional telemetry tips.",
      descriptionIt: "Migliora il tuo passo. Include analisi video dinamica, ottimizzazione della velocità di curva e telemetria base.",
      duration: "4 Hours",
      durationIt: "4 Ore",
      time: "09:00 - 13:00 or 14:00 - 18:00",
      timeIt: "09:00 - 13:00 o 14:00 - 18:00",
      cost: 220.0,
      isAvailable: true,
      bikeModelId: model160.id,
    },
  });

  await prisma.lesson.create({
    data: {
      title: "Pro 1-on-1 Masterclass",
      titleIt: "Masterclass Pro 1-a-1",
      description: "Exclusive individual coaching with an FIM champion. Complete telemetry logging, lines correction, and race setups.",
      descriptionIt: "Coaching individuale esclusivo con un pilota professionista. Telemetria completa, correzione traiettorie e setup da gara.",
      duration: "Full Day",
      durationIt: "Giornata Intera",
      time: "Flexible (09:00 - 17:00)",
      timeIt: "Flessibile (09:00 - 17:00)",
      cost: 450.0,
      isAvailable: true,
      bikeModelId: model0190.id,
    },
  });

  console.log("Seeded default racing lessons & classes");
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
