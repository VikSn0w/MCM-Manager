import { useState, useEffect } from "react";
import { Form, Link, redirect, useLoaderData, useNavigation, useActionData, useLocation } from "react-router";
import type { Route } from "./+types/book";
import { requireUserId, getUser } from "../utils/auth.server";
import { prisma } from "../utils/db.server";
import { getLocale } from "../utils/locale.server";
import { buildQrDataUri } from "../utils/qr.server";
import {
  buildTrackLocks,
  checkStandardBookingAgainstLocks,
  hoursForChampionshipBooking,
  isDateFullyLocked,
  lockedHoursOnDate,
  locksOnDate,
} from "../utils/track-lock";
import { sendBookingCreatedEmail } from "../utils/email.server";
import { translations, type Locale } from "../utils/translations";
import { getSessionsBasePrice, roundMoney } from "../utils/pricing";
import { 
  Calendar as CalendarIcon, 
  Users, 
  Clock, 
  ShieldCheck, 
  Flame, 
  ArrowRight, 
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Receipt,
  Sparkles,
  Flag
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  // 1. Force authentication
  const url = new URL(request.url);
  const targetChampionshipId = url.searchParams.get("championshipId") || null;
  const redirectTo = targetChampionshipId 
    ? `/login?redirectTo=${encodeURIComponent(`/book?championshipId=${targetChampionshipId}`)}`
    : "/login?redirectTo=/book";
  const userId = await requireUserId(request, redirectTo);

  // 2. Fetch configurations and data concurrently
  const [
    user,
    locale,
    tariffs,
    bikes,
    slots,
    dayConfigs,
    championships,
    companyConfig,
    existingBookings,
    preSelectedChampionship
  ] = await Promise.all([
    getUser(request),
    getLocale(request),
    prisma.tariff.findMany({}),
    prisma.bike.findMany({
      where: { 
        status: "AVAILABLE",
        model: {
          NOT: {
            usage: "ACADEMY"
          }
        }
      },
      include: { model: true },
      orderBy: { model: { displacement: "asc" } },
    }),
    prisma.timeSlot.findMany({
      orderBy: { time: "asc" },
    }),
    prisma.dayConfig.findMany({}),
    prisma.championship.findMany({
      where: { isAvailable: true },
      include: {
        groups: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            _count: {
              select: { entries: { where: { booking: { status: { in: ["CONFIRMED", "PENDING"] } } } } },
            },
          },
        },
      },
    }),
    prisma.companyConfig.findUnique({
      where: { id: "single-config" },
      // Only what the page renders: the rest of the row (including the bike
      // assignment policy) has no business in the client payload.
      select: { companyName: true, logoUrl: true, circuitName: true },
    }).then(conf => conf || {
      companyName: "MCM Racing School",
      logoUrl: "/images/ohvale_gp_one_1780331510373.png",
      circuitName: "Autodromo di Franciacorta",
    }),
    prisma.booking.findMany({
      where: { status: { in: ["CONFIRMED", "PENDING"] } },
      // This ships to every visitor of the booking page, so it carries only the
      // fields the availability helpers read — never other customers' identities,
      // prices, or booking ids.
      select: {
        date: true,
        status: true,
        hours: true,
        peopleCount: true,
        bikes: { select: { bikeId: true } },
      },
    }),
    targetChampionshipId 
      ? prisma.championship.findUnique({ where: { id: targetChampionshipId } })
      : Promise.resolve(null)
  ]);

  // Scheduled championships reserve the circuit; the form needs to know which
  // dates and slots are spoken for.
  const trackLocks = buildTrackLocks(championships);

  return { 
    userId, 
    user, 
    tariffs, 
    bikes, 
    slots, 
    dayConfigs, 
    existingBookings, 
    championships, 
    companyConfig, 
    preSelectedChampionship, 
    trackLocks,
    locale 
  };
}

// Upper bound on a single booking, guards against absurd tampered payloads.
const MAX_RIDERS_PER_BOOKING = 20;

// Flat per-rider apparel rental fee.
const APPAREL_PRICE = 10.0;


/**
 * Thrown inside the booking transaction to abort it with a user-facing message.
 */
class BookingError extends Error {}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();

  const dateStr = formData.get("date")?.toString(); // YYYY-MM-DD
  const ridersCount = parseInt(formData.get("ridersCount")?.toString() || "0", 10);
  const bookingType = formData.get("bookingType")?.toString() || "STANDARD";
  const championshipType = formData.get("championshipType")?.toString() || null;
  const bikeSelectionMode = formData.get("bikeSelectionMode")?.toString() || "MIXED";

  const sessionsCountRaw = formData.get("sessionsCount")?.toString();
  let sessionsCount = parseInt(sessionsCountRaw || "0", 10);

  if (bookingType !== "STANDARD" && bookingType !== "CHAMPIONSHIP") {
    return { error: "Invalid booking type." };
  }

  if (bikeSelectionMode !== "MIXED" && bikeSelectionMode !== "FIXED") {
    return { error: "Invalid bike selection mode." };
  }

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { error: "Invalid or missing booking date." };
  }

  if (!Number.isInteger(ridersCount) || ridersCount <= 0 || ridersCount > MAX_RIDERS_PER_BOOKING) {
    return { error: `Rider count must be between 1 and ${MAX_RIDERS_PER_BOOKING}.` };
  }

  let targetChampionship = null;
  if (bookingType === "CHAMPIONSHIP") {
    if (!championshipType) {
      return { error: "No championship format selected." };
    }
    targetChampionship = await prisma.championship.findFirst({
      where: { name: championshipType, isAvailable: true },
      include: { groups: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    });
    if (!targetChampionship) {
      return { error: `Whoops! The selected championship package "${championshipType}" is not active or does not exist.` };
    }
    sessionsCount = targetChampionship.sessionsCount;

    if (ridersCount < targetChampionship.minRacers) {
      return { error: `Championship bookings require a minimum grid of ${targetChampionship.minRacers} racers.` };
    }
  }

  const selectedHoursStr = formData.get("selectedHours")?.toString() || ""; // comma separated
  const bikesJson = formData.get("bikesAssignment")?.toString() || "[]"; // array of {modelId, insuranceSelected, apparelSelected}

  if (!Number.isInteger(sessionsCount) || sessionsCount <= 0 || !selectedHoursStr) {
    return { error: "Missing essential paddock booking details." };
  }

  let selectedHours = selectedHoursStr.split(",").map(h => h.trim()).filter(Boolean);

  // Which championships reserve the circuit on this date.
  const lockRows = await prisma.championship.findMany({
    where: { fixedDate: dateStr, isAvailable: true },
    select: { id: true, name: true, fixedDate: true, isAvailable: true, lockMode: true, lockedHours: true },
  });
  const trackLocks = buildTrackLocks(lockRows);

  if (bookingType === "CHAMPIONSHIP") {
    // A scheduled championship may only be booked on its own date.
    if (targetChampionship?.fixedDate && targetChampionship.fixedDate !== dateStr) {
      return { error: `"${targetChampionship.name}" runs on ${targetChampionship.fixedDate}, not ${dateStr}.` };
    }

    // The event dictates its own hours, so ignore whatever the form submitted.
    const ownLock = trackLocks.find(l => l.championshipId === targetChampionship?.id);
    if (ownLock) {
      const allSlots = await prisma.timeSlot.findMany({ orderBy: { time: "asc" }, select: { time: true } });
      selectedHours = hoursForChampionshipBooking(ownLock, allSlots.map(sl => sl.time));
    }
  } else {
    const conflict = checkStandardBookingAgainstLocks(trackLocks, dateStr, selectedHours);
    if (conflict.blocked) {
      return {
        error:
          conflict.reason === "FULL_DAY"
            ? `The circuit is reserved for "${conflict.championshipName}" on ${dateStr}. Pick another date.`
            : `"${conflict.championshipName}" has the track at ${conflict.hours.join(", ")} on ${dateStr}. Pick different session times.`,
      };
    }
  }

  if (selectedHours.length === 0) {
    return { error: "Select at least one session slot." };
  }

  if (new Set(selectedHours).size !== selectedHours.length) {
    return { error: "The same session slot was selected more than once." };
  }

  // Only slots that actually exist may be booked
  const knownSlots = await prisma.timeSlot.findMany({ select: { time: true } });
  const knownSlotTimes = new Set(knownSlots.map(s => s.time));
  const unknownSlot = selectedHours.find(h => !knownSlotTimes.has(h));
  if (unknownSlot) {
    return { error: `"${unknownSlot}" is not a valid session slot.` };
  }

  let rawAssignments: unknown;
  try {
    rawAssignments = JSON.parse(bikesJson);
  } catch {
    return { error: "Malformed bike assignment payload." };
  }

  if (!Array.isArray(rawAssignments)) {
    return { error: "Malformed bike assignment payload." };
  }

  const bikeModelAssignments: Array<{
    modelId: string;
    insuranceSelected: boolean;
    apparelSelected: boolean;
    pilotName?: string;
    pilotEmail?: string;
    championshipGroupId?: string;
  }> = [];

  // Championship riders race in a skill group, and every rider must land in one.
  const championshipGroups = targetChampionship?.groups ?? [];
  if (bookingType === "CHAMPIONSHIP" && championshipGroups.length === 0) {
    return { error: "This championship has no skill groups yet. Please contact the paddock." };
  }
  const groupsById = new Map(championshipGroups.map((g) => [g.id, g]));

  for (const entry of rawAssignments) {
    if (typeof entry !== "object" || entry === null) {
      return { error: "Malformed bike assignment payload." };
    }
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.modelId !== "string" || !candidate.modelId) {
      return { error: "Every rider must be assigned an available Ohvale GP model." };
    }
    let championshipGroupId: string | undefined;
    if (bookingType === "CHAMPIONSHIP") {
      if (typeof candidate.championshipGroupId !== "string" || !groupsById.has(candidate.championshipGroupId)) {
        return { error: "Every racer must pick a skill group for this championship." };
      }
      championshipGroupId = candidate.championshipGroupId;
    }

    bikeModelAssignments.push({
      championshipGroupId,
      modelId: candidate.modelId,
      insuranceSelected: candidate.insuranceSelected === true,
      apparelSelected: candidate.apparelSelected === true,
      pilotName: typeof candidate.pilotName === "string" ? candidate.pilotName.trim().slice(0, 120) : undefined,
      pilotEmail: typeof candidate.pilotEmail === "string" ? candidate.pilotEmail.trim().toLowerCase() : undefined,
    });
  }

  if (bikeModelAssignments.length !== ridersCount) {
    return { error: "Every rider must be assigned an available Ohvale GP model." };
  }

  // Everything below reads and writes availability, so it runs in a single
  // serializable transaction: two riders racing for the last slot or the last
  // bike must not both pass validation.
  let booking;
  try {
    booking = await prisma.$transaction(async (tx) => {
      // 1. Fetch Day Config / Overrides for custom limits and closures
      const dayConfig = await tx.dayConfig.findUnique({
        where: { date: dateStr },
      });

      if (dayConfig && !dayConfig.isAvailable) {
        throw new BookingError(`Sorry! The track is fully closed on ${dateStr} for: ${dayConfig.notes || "Private events"}.`);
      }

      const slotCapacity = dayConfig ? dayConfig.maxCapacityPerSlot : 5; // standard max capacity

      // 2. Capacity checks for each selected time slot on that date
      const bookingsOnDate = await tx.booking.findMany({
        where: { date: dateStr, status: { in: ["CONFIRMED", "PENDING"] } },
      });

      for (const hour of selectedHours) {
        let bookedCount = 0;
        for (const existing of bookingsOnDate) {
          const bookingHours = existing.hours.split(",").map(h => h.trim());
          if (bookingHours.includes(hour)) {
            bookedCount += existing.peopleCount;
          }
        }

        if (bookedCount + ridersCount > slotCapacity) {
          throw new BookingError(
            `Capacity overflow for ${hour} slot. Remaining spots: ${slotCapacity - bookedCount}. Selected group size: ${ridersCount}.`
          );
        }
      }

      // 3. Dynamic allocation of specific available bikes based on requested models on that date
      const bookedBikesOnDate = await tx.bookingBike.findMany({
        where: {
          booking: {
            date: dateStr,
            status: { in: ["CONFIRMED", "PENDING"] },
          },
        },
        select: { bikeId: true, championshipGroupId: true },
      });

      // A championship group is its own heat, so the fleet frees up again in
      // every group. Ordinary track bookings hold a bike for the whole day and
      // therefore block it everywhere.
      const bikesHeldAllDay = new Set(
        bookedBikesOnDate.filter(bb => bb.championshipGroupId === null).map(bb => bb.bikeId)
      );
      const bikesHeldByGroup = new Map<string, Set<string>>();
      bookedBikesOnDate.forEach((bb) => {
        if (!bb.championshipGroupId) return;
        const set = bikesHeldByGroup.get(bb.championshipGroupId) ?? new Set<string>();
        set.add(bb.bikeId);
        bikesHeldByGroup.set(bb.championshipGroupId, set);
      });

      /** Bikes unavailable to a given rider, given which heat they race in. */
      const bikesUnavailableFor = (groupId?: string) => {
        if (!groupId) {
          // Standard booking: anything already committed that day is taken.
          return new Set(bookedBikesOnDate.map(bb => bb.bikeId));
        }
        return new Set([...bikesHeldAllDay, ...(bikesHeldByGroup.get(groupId) ?? [])]);
      };

      // Fetch all available active fleet bikes
      const availableBikesSystem = await tx.bike.findMany({
        where: {
          status: "AVAILABLE",
          model: {
            NOT: {
              usage: "ACADEMY"
            }
          }
        },
        include: { model: true },
      });

      // Heats have a fixed grid size; count what is already committed and add
      // the riders this request wants to put in each group.
      if (bookingType === "CHAMPIONSHIP") {
        const wantedPerGroup = new Map<string, number>();
        bikeModelAssignments.forEach((a) => {
          if (!a.championshipGroupId) return;
          wantedPerGroup.set(a.championshipGroupId, (wantedPerGroup.get(a.championshipGroupId) ?? 0) + 1);
        });

        for (const [groupId, wanted] of wantedPerGroup) {
          const group = groupsById.get(groupId)!;
          const taken = await tx.bookingBike.count({
            where: {
              championshipGroupId: groupId,
              booking: { status: { in: ["CONFIRMED", "PENDING"] } },
            },
          });
          if (taken + wanted > group.capacity) {
            const left = Math.max(0, group.capacity - taken);
            throw new BookingError(
              `The "${group.name}" group has ${left} place(s) left but ${wanted} racer(s) were entered for it.`
            );
          }
        }
      }

      // Perform dynamic matching
      const bikeAssignments: Array<{
        bikeId: string;
        insuranceSelected: boolean;
        apparelSelected: boolean;
        pilotName?: string;
        pilotEmail?: string;
        championshipGroupId?: string;
      }> = [];

      // Allocations already made by this request, keyed by heat so the same bike
      // can legitimately serve one rider per group.
      const allocatedInRequest = new Map<string, Set<string>>();
      const claimKey = (groupId?: string) => groupId ?? "__all_day__";

      for (const assignment of bikeModelAssignments) {
        const key = claimKey(assignment.championshipGroupId);
        const claimed = allocatedInRequest.get(key) ?? new Set<string>();
        const unavailable = bikesUnavailableFor(assignment.championshipGroupId);

        const candidateBike = availableBikesSystem.find(
          b => b.modelId === assignment.modelId && !unavailable.has(b.id) && !claimed.has(b.id)
        );
        if (!candidateBike) {
          const modelDetails = await tx.bikeModel.findUnique({ where: { id: assignment.modelId } });
          throw new BookingError(`Sorry! There are no more available Ohvale GP bikes of model "${modelDetails?.name || "selected"}" for this date.`);
        }
        claimed.add(candidateBike.id);
        allocatedInRequest.set(key, claimed);
        bikeAssignments.push({
          bikeId: candidateBike.id,
          championshipGroupId: assignment.championshipGroupId,
          insuranceSelected: assignment.insuranceSelected,
          apparelSelected: assignment.apparelSelected,
          pilotName: assignment.pilotName,
          pilotEmail: assignment.pilotEmail,
        });
      }

      // Validation for Fixed Model Grid mode constraints
      if (bikeSelectionMode === "FIXED") {
        // Availability differs per heat, so judge the fixed-grid rule against
        // the bikes free for the heat these riders actually race in.
        const fixedGroupId = bikeModelAssignments[0]?.championshipGroupId;
        const unavailableForFixed = bikesUnavailableFor(fixedGroupId);
        const modelCounts: Record<string, number> = {};
        availableBikesSystem
          .filter(b => !unavailableForFixed.has(b.id))
          .forEach(b => {
            modelCounts[b.model.model] = (modelCounts[b.model.model] || 0) + 1;
          });
        const hasEnoughForFixed = Object.values(modelCounts).some(count => count >= ridersCount);
        if (!hasEnoughForFixed) {
          throw new BookingError(`Sorry! There are not enough unreserved Ohvale bikes of a single model to support a Fixed Grid booking of ${ridersCount} riders on this date.`);
        }

        const selectedBikes = bikeAssignments.map((assign) =>
          availableBikesSystem.find(b => b.id === assign.bikeId)
        );
        const models = selectedBikes.map(b => b?.model.model).filter(Boolean);
        if (new Set(models).size > 1) {
          throw new BookingError("Fixed grid mode requires all riders to compete on the exact same bike model.");
        }
      }

      // 4. Server-side price calculation to guarantee zero tamper hacks
      const parsedDate = new Date(dateStr);
      const dayOfWeek = parsedDate.getDay(); // 0 = Sun, 1 = Mon ...
      const tariff = await tx.tariff.findUnique({
        where: { dayOfWeek },
      });

      if (!tariff) {
        throw new BookingError("Pricing tariff rules for this day of the week are missing.");
      }

      if (bookingType === "STANDARD" && (sessionsCount < tariff.minSessions || sessionsCount > tariff.maxSessions)) {
        throw new BookingError(`Session count must be between ${tariff.minSessions} and ${tariff.maxSessions} for this day.`);
      }

      const customModifier = dayConfig?.customPriceModifier || 1.0;
      let finalPrice = 0;

      if (bookingType === "CHAMPIONSHIP") {
        if (!targetChampionship) {
          throw new BookingError("No championship package found.");
        }
        finalPrice += targetChampionship.price * ridersCount;
      } else {
        // STANDARD mode: calculate base session packs + paddock entry
        const baseSessionsPricePerRider = getSessionsBasePrice(
          sessionsCount,
          tariff.basePricePerSession,
          tariff.discountThreshold,
          tariff.discountThresholdPrice,
          tariff.pricePerSessionAfterThreshold
        ) * customModifier;
        const basePersonPrice = tariff.basePricePerPerson * customModifier;
        finalPrice += (basePersonPrice + baseSessionsPricePerRider) * ridersCount;
      }

      // Add individual bike modifiers, insurance, and apparel
      for (const assignment of bikeAssignments) {
        const bike = availableBikesSystem.find(b => b.id === assignment.bikeId);
        if (!bike || bike.status !== "AVAILABLE") {
          throw new BookingError("One of the selected bikes is not available.");
        }

        if (bookingType === "STANDARD") {
          // Bike pricing modifier (adds to base sessions)
          const baseSessionsPricePerRider = getSessionsBasePrice(
            sessionsCount,
            tariff.basePricePerSession,
            tariff.discountThreshold,
            tariff.discountThresholdPrice,
            tariff.pricePerSessionAfterThreshold
          ) * customModifier;
          const modifierAddedPrice = baseSessionsPricePerRider * (bike.model.priceModifier - 1.0);
          finalPrice += modifierAddedPrice;
        }

        // Insurance addition
        if (assignment.insuranceSelected) {
          finalPrice += bike.model.insurancePrice;
        }

        // Apparel addition
        if (assignment.apparelSelected) {
          finalPrice += APPAREL_PRICE;
        }
      }

      // 5. Create Booking and assigned bikes.
      // Bikes are always allocated now so availability stays exact; under MANUAL
      // the allocation is provisional and the back office reviews it.
      const companyConfig = await tx.companyConfig.findUnique({
        where: { id: "single-config" },
        select: { bikeAssignmentMode: true },
      });
      const bikeAssignmentMode =
        companyConfig?.bikeAssignmentMode === "MANUAL" ? "MANUAL" : "AUTO";

      const createdBooking = await tx.booking.create({
        data: {
          userId,
          date: dateStr,
          sessionsCount,
          peopleCount: ridersCount,
          hours: selectedHours.join(", "),
          totalPrice: roundMoney(finalPrice),
          status: "PENDING",
          bookingType,
          championshipType: bookingType === "CHAMPIONSHIP" ? championshipType : null,
          bikeSelectionMode,
          bikeAssignmentMode,
        },
      });

      const ownerUser = await tx.user.findUnique({ where: { id: userId } });

      // Grid numbers continue from whoever is already entered in each heat, so
      // positions stay unique and stable on the assignment sheet.
      const nextGridPosition = new Map<string, number>();
      for (const groupId of new Set(bikeAssignments.map(a => a.championshipGroupId).filter(Boolean))) {
        const taken = await tx.bookingBike.count({
          where: {
            championshipGroupId: groupId as string,
            booking: { status: { in: ["CONFIRMED", "PENDING"] } },
          },
        });
        nextGridPosition.set(groupId as string, taken + 1);
      }

      for (let i = 0; i < bikeAssignments.length; i++) {
        const assignment = bikeAssignments[i];
        let pName = assignment.pilotName || `Rider ${i + 1}`;
        let pilotUserId: string | null = null;

        if (i === 0) {
          pName = ownerUser?.name || pName;
          pilotUserId = userId;
        } else if (assignment.pilotEmail) {
          // Only an exact email match links a real account to a booking; matching
          // on display name would hand a stranger read access to this booking.
          const matchedUser = await tx.user.findUnique({
            where: { email: assignment.pilotEmail },
          });
          if (matchedUser) {
            pilotUserId = matchedUser.id;
          }
        }

        let gridPosition: number | null = null;
        if (assignment.championshipGroupId) {
          gridPosition = nextGridPosition.get(assignment.championshipGroupId) ?? 1;
          nextGridPosition.set(assignment.championshipGroupId, gridPosition + 1);
        }

        await tx.bookingBike.create({
          data: {
            bookingId: createdBooking.id,
            bikeId: assignment.bikeId,
            insuranceSelected: assignment.insuranceSelected,
            apparelSelected: assignment.apparelSelected,
            pilotName: pName,
            pilotUserId: pilotUserId,
            championshipGroupId: assignment.championshipGroupId ?? null,
            declaredLevel: assignment.championshipGroupId
              ? groupsById.get(assignment.championshipGroupId)?.name ?? null
              : null,
            gridPosition,
          },
        });
      }

      return createdBooking;
    }, { isolationLevel: "Serializable" });
  } catch (err) {
    if (err instanceof BookingError) {
      return { error: err.message };
    }
    // Prisma raises P2034 when a serializable transaction loses a write race.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2034") {
      return { error: "Someone just booked those spots. Please review availability and try again." };
    }
    throw err;
  }

  const url = new URL(request.url);
  const requestHost = `${url.protocol}//${url.host}`;
  try {
    await sendBookingCreatedEmail(booking.id, requestHost);
  } catch (err) {
    // The booking is already committed; a mail failure must not fail the request.
    console.error("[BOOKING] Confirmation email failed to send:", err);
  }

  const orderUrl = new URL(`/order/${booking.id}`, request.url).toString();
  const qrCodeSrc = await buildQrDataUri(orderUrl);

  return { success: true, bookingId: booking.id, totalPrice: booking.totalPrice, orderUrl, qrCodeSrc };
}

export default function Book() {
  const { 
    userId, 
    user, 
    tariffs, 
    bikes, 
    slots, 
    dayConfigs, 
    existingBookings, 
    championships, 
    companyConfig, 
    preSelectedChampionship, 
    trackLocks,
    locale 
  } = useLoaderData<typeof loader>();
  const t = translations[locale as Locale];

  const actionData = useActionData() as { error?: string; success?: boolean; bookingId?: string; totalPrice?: number; orderUrl?: string; qrCodeSrc?: string } | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const location = useLocation();
  const currentPath = location.pathname + location.search;

  // Wizard state machine
  const [step, setStep] = useState(1);

  // Form selections
  const [bookingType, setBookingType] = useState<"STANDARD" | "CHAMPIONSHIP">(
    preSelectedChampionship ? "CHAMPIONSHIP" : "STANDARD"
  );
  const [championshipType, setChampionshipType] = useState<string>(
    preSelectedChampionship ? preSelectedChampionship.name : (championships[0]?.name || "GP Sprint")
  );
  const [bikeSelectionMode, setBikeSelectionMode] = useState<"MIXED" | "FIXED">("MIXED");
  const uniqueModels = Array.from(new Set(bikes.map(b => b.model.model)));
  const uniqueBikeModels = Array.from(new Map(bikes.map(b => [b.model.id, b.model])).values());
  const [selectedFixedModel, setSelectedFixedModel] = useState<string>(uniqueModels[0] || "");
  const [date, setDate] = useState(
    preSelectedChampionship?.fixedDate || ""
  );
  const [ridersCount, setRidersCount] = useState(
    preSelectedChampionship ? preSelectedChampionship.minRacers : 1
  );
  const [sessionsCount, setSessionsCount] = useState(2);
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [bikesAssignment, setBikesAssignment] = useState<Array<{ modelId: string; insuranceSelected: boolean; apparelSelected: boolean }>>([]);
  // Championship skill group per rider, keyed by rider index.
  const [riderGroups, setRiderGroups] = useState<string[]>([]);

  // Pilot details state matching ridersCount size
  const [pilots, setPilots] = useState<Array<{ name: string; email: string }>>([
    { name: user?.name || "", email: user?.email || "" }
  ]);

  // Synchronize pilots array size with ridersCount
  useEffect(() => {
    setPilots((prev) => {
      const next = [...prev];
      if (next.length < ridersCount) {
        for (let i = next.length; i < ridersCount; i++) {
          next.push({ name: "", email: "" });
        }
      } else if (next.length > ridersCount) {
        next.splice(ridersCount);
      }
      // Ensure first pilot is always locked to booking owner
      if (next[0]) {
        next[0].name = user?.name || "";
        next[0].email = user?.email || "";
      }
      return next;
    });
  }, [ridersCount, user]);

  // Calculate pricing breakdown in real-time
  const getTariffForDate = () => {
    if (!date) return null;
    const parsed = new Date(date);
    const dayOfWeek = parsed.getDay();
    const tariff = tariffs.find(t => t.dayOfWeek === dayOfWeek);
    const dayConfig = dayConfigs.find(dc => dc.date === date);

    if (!tariff) return null;

    let baseSession = tariff.basePricePerSession;
    let basePerson = tariff.basePricePerPerson;

    if (dayConfig?.customPriceModifier) {
      baseSession *= dayConfig.customPriceModifier;
      basePerson *= dayConfig.customPriceModifier;
    }

    return {
      basePricePerSession: baseSession,
      basePricePerPerson: basePerson,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      dayConfig,
      tariff
    };
  };

  const currentPriceDetails = getTariffForDate();

  const activeTariff = currentPriceDetails?.tariff || tariffs.find(t => t.dayOfWeek === 1) || tariffs[0];

  const sessionPackExplanation = locale === "en"
    ? `Book custom track time. Includes pack rates: 1 Session (${activeTariff.basePricePerSession.toFixed(0)}€), ${activeTariff.discountThreshold} Sessions (${activeTariff.discountThresholdPrice.toFixed(0)}€). Modifiers apply.`
    : `Prenota turni singoli o a pacchetto: 1 Sessione (${activeTariff.basePricePerSession.toFixed(0)}€), ${activeTariff.discountThreshold} Sessioni (${activeTariff.discountThresholdPrice.toFixed(0)}€). Si applicano i modificatori.`;

  const sessionsRatesList = locale === "en"
    ? `1 Session: ${activeTariff.basePricePerSession.toFixed(0)}€ | ${activeTariff.discountThreshold - 1} Sessions: ${((activeTariff.discountThreshold - 1) * activeTariff.basePricePerSession).toFixed(0)}€ | ${activeTariff.discountThreshold} Sessions: ${activeTariff.discountThresholdPrice.toFixed(0)}€ | ${activeTariff.pricePerSessionAfterThreshold.toFixed(0)}€ per session after the ${activeTariff.discountThreshold}rd!`
    : `1 Turno: ${activeTariff.basePricePerSession.toFixed(0)}€ | ${activeTariff.discountThreshold - 1} Turni: ${((activeTariff.discountThreshold - 1) * activeTariff.basePricePerSession).toFixed(0)}€ | ${activeTariff.discountThreshold} Turni: ${activeTariff.discountThresholdPrice.toFixed(0)}€ | ${activeTariff.pricePerSessionAfterThreshold.toFixed(0)}€ per turno dal ${activeTariff.discountThreshold + 1}° in poi!`;

  const calculateTotalPrice = () => {
    if (!currentPriceDetails) return 0;
    
    let total = 0;
    const basePerson = currentPriceDetails.basePricePerPerson;

    if (bookingType === "CHAMPIONSHIP") {
      const activeChamp = championships.find(c => c.name === championshipType);
      const basePricePerRider = activeChamp ? activeChamp.price : 65.0;
      total += basePricePerRider * ridersCount;
    } else {
      // STANDARD mode: calculate base session packs + paddock entry
      let baseSessionPack = getSessionsBasePrice(
        sessionsCount,
        currentPriceDetails.tariff.basePricePerSession,
        currentPriceDetails.tariff.discountThreshold,
        currentPriceDetails.tariff.discountThresholdPrice,
        currentPriceDetails.tariff.pricePerSessionAfterThreshold
      );
      if (currentPriceDetails.dayConfig?.customPriceModifier) {
        baseSessionPack *= currentPriceDetails.dayConfig.customPriceModifier;
      }
      total += (basePerson + baseSessionPack) * ridersCount;
    }

    // Bike modifiers, insurance & apparel rentals
    bikesAssignment.forEach((assignment) => {
      const model = uniqueBikeModels.find(m => m.id === assignment.modelId);
      if (model) {
        if (bookingType === "STANDARD") {
          let baseSessionPack = getSessionsBasePrice(
            sessionsCount,
            currentPriceDetails.tariff.basePricePerSession,
            currentPriceDetails.tariff.discountThreshold,
            currentPriceDetails.tariff.discountThresholdPrice,
            currentPriceDetails.tariff.pricePerSessionAfterThreshold
          );
          if (currentPriceDetails.dayConfig?.customPriceModifier) {
            baseSessionPack *= currentPriceDetails.dayConfig.customPriceModifier;
          }
          const modifierFee = baseSessionPack * (model.priceModifier - 1.0);
          total += modifierFee;
        }

        // Insurance fee
        if (assignment.insuranceSelected) {
          total += model.insurancePrice;
        }
      }

      // Apparel fee
      if (assignment.apparelSelected) {
        total += 10.0;
      }
    });

    return total;
  };

  const totalPrice = calculateTotalPrice();

  // Helper: check capacity left for a slot on the selected date
  // A scheduled championship reserves the circuit; ordinary bookings must see
  // that before they get as far as submitting.
  const isChampionshipBooking = bookingType === "CHAMPIONSHIP";
  const dayLocks = date ? locksOnDate(trackLocks, date) : [];
  const dayFullyLocked = !isChampionshipBooking && date ? isDateFullyLocked(trackLocks, date) : false;
  const reservedHours = !isChampionshipBooking && date ? lockedHoursOnDate(trackLocks, date) : new Set<string>();

  const getCapacityLeft = (hour: string) => {
    if (!date) return 5;
    const dayConfig = dayConfigs.find(dc => dc.date === date);
    const maxCap = dayConfig ? dayConfig.maxCapacityPerSlot : 5;

    let booked = 0;
    existingBookings
      .filter(b => b.date === date && (b.status === "CONFIRMED" || b.status === "PENDING"))
      .forEach((b) => {
        const hours = b.hours.split(",").map(h => h.trim());
        if (hours.includes(hour)) {
          booked += b.peopleCount;
        }
      });

    return Math.max(0, maxCap - booked);
  };

  // Helper: check if a bike is already booked on the selected date
  const isBikeBookedOnDate = (bikeId: string) => {
    if (!date) return false;
    let booked = false;
    existingBookings
      // PENDING bookings hold their bikes too — the server counts them, so the
      // picker must, or a rider can choose a unit the action will reject.
      .filter(b => b.date === date && (b.status === "CONFIRMED" || b.status === "PENDING"))
      .forEach((b) => {
        b.bikes.forEach((bb) => {
          if (bb.bikeId === bikeId) booked = true;
        });
      });
    return booked;
  };

  const getAvailableBikesCountForModel = (modelName: string) => {
    return bikes
      .filter(b => b.model.model === modelName)
      .filter(b => !isBikeBookedOnDate(b.id))
      .length;
  };

  const getAvailableBikesCountOverall = () => {
    return bikes.filter(b => !isBikeBookedOnDate(b.id)).length;
  };

  const totalAvailableBikes = date 
    ? (bikeSelectionMode === "FIXED" ? getAvailableBikesCountForModel(selectedFixedModel) : getAvailableBikesCountOverall())
    : bikes.length;

  const isEnoughBikes = ridersCount <= totalAvailableBikes;

  // Actions
  const activeChampionship = championships.find(c => c.name === championshipType);
  const activeGroups = bookingType === "CHAMPIONSHIP" ? (activeChampionship?.groups ?? []) : [];

  /** Places left in a group, accounting for riders this form has already put there. */
  const groupPlacesLeft = (groupId: string, exceptRiderIndex?: number) => {
    const group = activeGroups.find(g => g.id === groupId);
    if (!group) return 0;
    const claimedHere = riderGroups.filter(
      (gid, idx) => gid === groupId && idx !== exceptRiderIndex
    ).length;
    return Math.max(0, group.capacity - group._count.entries - claimedHere);
  };

  const handleAssignGroup = (riderIndex: number, groupId: string) => {
    const next = [...riderGroups];
    next[riderIndex] = groupId;
    setRiderGroups(next);
  };

  const allRidersHaveGroup =
    bookingType !== "CHAMPIONSHIP" ||
    (riderGroups.length >= ridersCount && riderGroups.slice(0, ridersCount).every(Boolean));

  const handleToggleHour = (hour: string) => {
    if (selectedHours.includes(hour)) {
      setSelectedHours(selectedHours.filter(h => h !== hour));
    } else {
      setSelectedHours([...selectedHours, hour]);
    }
  };

  const handleAssignModel = (riderIndex: number, modelId: string) => {
    const newAssignments = [...bikesAssignment];
    newAssignments[riderIndex] = {
      modelId,
      insuranceSelected: newAssignments[riderIndex]?.insuranceSelected || false,
      apparelSelected: newAssignments[riderIndex]?.apparelSelected || false,
    };
    setBikesAssignment(newAssignments);
  };

  const handleToggleInsurance = (riderIndex: number) => {
    const newAssignments = [...bikesAssignment];
    if (newAssignments[riderIndex]) {
      newAssignments[riderIndex].insuranceSelected = !newAssignments[riderIndex].insuranceSelected;
      setBikesAssignment(newAssignments);
    }
  };

  const handleToggleApparel = (riderIndex: number) => {
    const newAssignments = [...bikesAssignment];
    if (newAssignments[riderIndex]) {
      newAssignments[riderIndex].apparelSelected = !newAssignments[riderIndex].apparelSelected;
      setBikesAssignment(newAssignments);
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!date) return;
      const t = getTariffForDate();
      if (t?.dayConfig && !t.dayConfig.isAvailable) return;
      if (!isEnoughBikes) return;

      // Validate that all pilot names are filled out
      const hasMissingNames = pilots.some((p) => !p.name.trim());
      if (hasMissingNames) {
        alert(
          locale === "en"
            ? "Please enter the names of all pilots before continuing."
            : "Per favore inserisci il nome di tutti i piloti prima di continuare."
        );
        return;
      }

      setStep(2);
      
      // Initialize bike assignments with empty or fallback values matching riders count
      const initial = Array.from({ length: ridersCount }).map((_, i) => {
        const defaultModelId = bikeSelectionMode === "FIXED"
          ? (uniqueBikeModels.find(m => m.model === selectedFixedModel)?.id || "")
          : "";
        const existing = bikesAssignment[i];
        return {
          modelId: existing?.modelId || defaultModelId,
          insuranceSelected: existing?.insuranceSelected || false,
          apparelSelected: existing?.apparelSelected || false,
        };
      });
      setBikesAssignment(initial);
      setRiderGroups((prev) => {
        const next = [...prev];
        next.length = ridersCount;
        return Array.from({ length: ridersCount }, (_, i) => next[i] || "");
      });
    } else if (step === 2) {
      if (selectedHours.length === 0) return;
      const incomplete = bikesAssignment.some(ba => !ba.modelId);
      if (incomplete) return;
      if (!allRidersHaveGroup) return;
      setStep(3);
    }
  };

  // If action success, display gorgeous paddock confirmation pass
  if (actionData?.success) {
    const qrCodeSrc = actionData.qrCodeSrc || "";
    const orderUrl = actionData.orderUrl || `/order/${actionData.bookingId}`;

    return (
      <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-green-950/20 via-slate-950 to-slate-950 pointer-events-none" />
        
        <div className="max-w-xl mx-auto w-full relative z-10">
          <div className="bg-slate-900 border border-green-500/30 rounded-3xl overflow-hidden shadow-2xl shadow-green-500/5">
            {/* Header paddock badge */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 flex flex-col items-center text-center">
              <CheckCircle className="h-14 w-14 text-white mb-2 animate-bounce" />
              <h2 className="text-2xl font-black uppercase tracking-tight text-white">{t.bookingConfirmed}</h2>
              <p className="text-xs text-white/80 font-bold uppercase tracking-widest mt-1">{t.officialPaddockBadge}</p>
            </div>

            <div className="p-8 space-y-6">
              
              {/* Receipt pass details */}
              <div className="border-2 border-dashed border-slate-800 rounded-2xl p-6 relative bg-slate-950/40">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-800 text-[10px] uppercase font-bold text-slate-400 px-3 py-1 rounded-full">
                  {t.paddockReceipt}
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex justify-between border-b border-slate-900 pb-2.5">
                    <span className="text-xs uppercase text-slate-500 font-bold">{t.bookingId}</span>
                    <span className="text-sm font-extrabold text-white font-mono uppercase">{actionData.bookingId}</span>
                  </div>

                  <div className="flex justify-between border-b border-slate-900 pb-2.5">
                    <span className="text-xs uppercase text-slate-500 font-bold">{t.trackDate}</span>
                    <span className="text-sm font-extrabold text-white">{date}</span>
                  </div>

                  <div className="flex justify-between border-b border-slate-900 pb-2.5">
                    <span className="text-xs uppercase text-slate-500 font-bold">{locale === "en" ? "Format" : "Formato"}</span>
                    <span className="text-sm font-extrabold text-white">
                      {bookingType === "CHAMPIONSHIP"
                        ? `Championship (${championshipType})`
                        : "Standard Session Packs"}
                    </span>
                  </div>

                  <div className="flex justify-between border-b border-slate-900 pb-2.5">
                    <span className="text-xs uppercase text-slate-500 font-bold">{t.ridersAndSessions}</span>
                    <span className="text-sm font-extrabold text-white">
                      {bookingType === "CHAMPIONSHIP"
                        ? `${ridersCount} Racer(s)`
                        : `${ridersCount} Racer(s) / ${sessionsCount} Session(s) each`}
                    </span>
                  </div>

                  <div className="flex justify-between border-b border-slate-900 pb-2.5">
                    <span className="text-xs uppercase text-slate-500 font-bold">{t.allocatedSlots}</span>
                    <span className="text-sm font-extrabold text-orange-400 font-mono">{selectedHours.join(", ")}</span>
                  </div>

                  {/* Allocated bikes list */}
                  <div className="pt-2">
                    <span className="block text-xs uppercase text-slate-500 font-bold mb-2">{t.bikesSelected}</span>
                    <div className="space-y-2">
                      {bikesAssignment.map((assign, index) => {
                        const model = uniqueBikeModels.find(m => m.id === assign.modelId);
                        return (
                          <div key={index} className="flex justify-between items-center text-xs bg-slate-950 p-2.5 rounded-lg border border-slate-900">
                            <span className="font-semibold text-slate-300 flex items-center flex-wrap gap-1.5">
                               <span>{pilots[index]?.name || `Rider #${index + 1}`}: {model?.name}</span>
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {assign.insuranceSelected ? (
                                <span className="text-[10px] bg-green-500/10 border border-green-500/20 text-green-400 font-bold uppercase px-2 py-0.5 rounded">
                                  {t.insuranceAdded}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-500 uppercase">{t.noCover}</span>
                              )}
                              {assign.apparelSelected && (
                                <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold uppercase px-2 py-0.5 rounded">
                                  {locale === "en" ? "Apparel" : "Abbigliamento"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>

               {/* Total Paid block */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-850 flex justify-between items-center">
                <div>
                  <span className="block text-xs uppercase text-slate-500 font-bold">{t.grandTotalPaid}</span>
                  <span className="text-[10px] text-slate-400 uppercase">{t.vatInclusive}</span>
                </div>
                <span className="text-3xl font-black text-green-400">€{actionData.totalPrice?.toFixed(2)}</span>
              </div>

              {/* QR Code and Pass Navigation Details */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-850 flex flex-col items-center text-center space-y-3">
                <span className="block text-[10px] text-slate-500 uppercase tracking-widest font-black font-mono">
                  {locale === "en" ? "Scan to view dynamic Paddock Pass" : "Scansiona per il Pass Paddock dinamico"}
                </span>
                <div className="bg-white p-2.5 rounded-xl inline-block shadow-lg">
                  <img
                    src={qrCodeSrc}
                    alt="Order QR Code"
                    className="h-32 w-32 object-contain"
                  />
                </div>
                <span className="text-[9px] text-slate-400 font-mono tracking-normal leading-relaxed break-all select-all">
                  {orderUrl}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-2">
                <Link
                  to={`/order/${actionData.bookingId}`}
                  className="w-full text-center bg-orange-600 hover:bg-orange-500 text-white font-extrabold uppercase text-xs py-4 rounded-xl shadow-lg shadow-orange-600/10 transition-all active:scale-[0.98] cursor-pointer"
                >
                  {locale === "en" ? "View Dynamic Paddock Pass & Print PDF" : "Vedi Pass Paddock & Stampa PDF"}
                </Link>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/dashboard"
                    className="flex-1 text-center bg-slate-900 hover:bg-slate-850 border border-slate-850 text-slate-300 font-bold uppercase text-xs py-3 rounded-xl transition-all cursor-pointer"
                  >
                    {t.buttonRacerDashboard}
                  </Link>
                  <Link
                    to="/"
                    className="flex-1 text-center bg-slate-950 hover:bg-slate-900 border border-slate-885 text-slate-400 font-bold uppercase text-xs py-3 rounded-xl transition-all cursor-pointer"
                  >
                    {t.buttonBackHome}
                  </Link>
                </div>
              </div>

            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans relative overflow-hidden pb-20">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-950/10 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />

      {/* Header mini-navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 flex justify-between items-center relative z-10">
        <Link to="/" className="flex items-center space-x-2.5">
          {companyConfig.logoUrl ? (
            <div className="h-8 bg-slate-900 border border-slate-800 rounded-lg p-1 flex items-center justify-center">
              <img src={companyConfig.logoUrl} alt="Logo" className="h-full object-contain max-w-24" />
            </div>
          ) : (
            <img src="/logosmall.png" alt={companyConfig.companyName} className="h-6 w-auto object-contain shrink-0" />
          )}
          <span className="text-xl font-black uppercase text-white tracking-tight leading-none">
            {companyConfig.companyName}
          </span>
        </Link>

        <div className="flex items-center space-x-4">
          <span className="text-xs uppercase text-slate-500 font-bold tracking-widest font-mono hidden sm:inline">
            Rider: <strong className="text-white">{user?.name}</strong>
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 relative z-10">
        
        {/* Wizard progress steps */}
        <div className="mb-10 grid grid-cols-3 text-center text-[10px] sm:text-xs uppercase tracking-widest font-bold font-mono">
          <div className={`pb-3 border-b-2 transition-all ${step >= 1 ? "border-orange-500 text-orange-500" : "border-slate-900 text-slate-600"}`}>
            01. {locale === "en" ? "Date & Riders" : "Data e Piloti"}
          </div>
          <div className={`pb-3 border-b-2 transition-all ${step >= 2 ? "border-orange-500 text-orange-500" : "border-slate-900 text-slate-600"}`}>
            02. {locale === "en" ? "Hours & Bikes" : "Orari e Moto"}
          </div>
          <div className={`pb-3 border-b-2 transition-all ${step >= 3 ? "border-orange-500 text-orange-500" : "border-slate-900 text-slate-600"}`}>
            03. {locale === "en" ? "Receipt" : "Ricevuta"}
          </div>
        </div>

        {actionData?.error && (
          <div className="mb-8 bg-red-950/40 border border-red-500/30 rounded-2xl p-5 flex items-start space-x-3 text-red-200">
            <AlertTriangle className="h-5.5 w-5.5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm">{actionData.error}</p>
          </div>
        )}

        {/* STEP 1: Date, sessions count, riders count */}
        {step === 1 && (() => {
          const activeChamp = championships.find(c => c.name === championshipType);
          const minRiders = bookingType === "CHAMPIONSHIP"
            ? (activeChamp ? activeChamp.minRacers : 5)
            : 1;
          const maxRiders = bookingType === "CHAMPIONSHIP" ? 10 : 5;

          return (
            <div className="bg-slate-900/60 backdrop-blur border border-slate-800/80 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 animate-fade-in">
              <div className="border-b border-slate-850 pb-5">
                <h2 className="text-2xl font-extrabold uppercase text-white">{t.step1Header}</h2>
                <p className="text-xs text-slate-400 mt-1">{t.step1Desc}</p>
              </div>

              {/* Booking Format Selector */}
              <div className="space-y-3">
                <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider">
                  {locale === "en" ? "Select Booking Format" : "Seleziona Formato Prenotazione"}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setBookingType("STANDARD");
                    }}
                    className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
                      bookingType === "STANDARD"
                        ? "bg-orange-600/15 border-orange-500 text-white"
                        : "bg-slate-950/60 hover:bg-slate-900 border-slate-850 text-slate-400"
                    }`}
                  >
                    <span className="block font-black text-xs uppercase tracking-wider text-orange-500">
                      {locale === "en" ? "Standard Session Packs" : "Turni Standard & Pacchetti"}
                    </span>
                    <span className="block font-black text-sm text-white mt-1">
                      {locale === "en" ? "Custom Racetrack Sessions" : "Turni Personalizzati in Pista"}
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-2 font-medium leading-normal">
                      {sessionPackExplanation}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBookingType("CHAMPIONSHIP");
                      if (ridersCount < 5) {
                        setRidersCount(5);
                      }
                    }}
                    className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
                      bookingType === "CHAMPIONSHIP"
                        ? "bg-orange-600/15 border-orange-500 text-white"
                        : "bg-slate-950/60 hover:bg-slate-900 border-slate-850 text-slate-400"
                    }`}
                  >
                    <span className="block font-black text-xs uppercase tracking-wider text-orange-500">
                      {locale === "en" ? "Championship Grid" : "Griglia Campionato"}
                    </span>
                    <span className="block font-black text-sm text-white mt-1">
                      {locale === "en" ? "Fixed Price Racing Packages" : "Gare a Tariffa Fissa per Gruppi"}
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-2 font-medium leading-normal">
                      {locale === "en"
                        ? "GP formats (GP Sprint for 65€, GP PLUS for 85€). Bypasses bike modifiers. Minimum 5 racers required."
                        : "Formati GP (GP Sprint a 65€, GP PLUS a 85€). Esclude modificatori. Minimo 5 piloti richiesti."}
                    </span>
                  </button>
                </div>
              </div>

              {/* Grid Selection Rules */}
              <div className="space-y-3 pt-6 border-t border-slate-850">
                <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider">
                  {locale === "en" ? "Grid Selection Rules" : "Regole Griglia di Partenza"}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setBikeSelectionMode("MIXED")}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      bikeSelectionMode === "MIXED"
                        ? "bg-slate-950 border-orange-500/60 text-white"
                        : "bg-slate-950/40 hover:bg-slate-950/80 border-slate-900 text-slate-500"
                    }`}
                  >
                    <span className="block font-bold text-xs uppercase">
                      {locale === "en" ? "Mixed Model Grid" : "Griglia Mista"}
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-1">
                      {locale === "en" ? "Mix & match any available Ohvale model." : "Qualsiasi modello Ohvale disponibile è ammesso."}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBikeSelectionMode("FIXED")}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      bikeSelectionMode === "FIXED"
                        ? "bg-slate-950 border-orange-500/60 text-white"
                        : "bg-slate-950/40 hover:bg-slate-950/80 border-slate-900 text-slate-500"
                    }`}
                  >
                    <span className="block font-bold text-xs uppercase">
                      {locale === "en" ? "Fixed Model Grid" : "Monomarca / Griglia Fissa"}
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-1">
                      {locale === "en" ? "Enforce identical bike models for all racers." : "Tutti i piloti devono guidare lo stesso modello per equità."}
                    </span>
                  </button>
                </div>

                {bikeSelectionMode === "FIXED" && (
                  <div className="mt-4 p-5 rounded-2xl bg-slate-950/70 border border-slate-850 space-y-3">
                    <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider">
                      {locale === "en" ? "Select Monomarca Bike Model" : "Seleziona Modello Monomarca"}
                    </label>
                    <div className="flex flex-wrap gap-2.5">
                      {uniqueModels.map((modelName) => {
                        const isChosen = selectedFixedModel === modelName;
                        return (
                          <button
                            key={modelName}
                            type="button"
                            onClick={() => {
                              setSelectedFixedModel(modelName);
                              // Reset any existing bike assignments to avoid model conflicts
                              setBikesAssignment(bikesAssignment.map(ba => ({ ...ba, bikeId: "" })));
                            }}
                            className={`px-4 py-3 rounded-xl text-xs font-black uppercase transition-all cursor-pointer border ${
                              isChosen
                                ? "bg-orange-600 border-transparent text-white shadow-lg shadow-orange-600/15"
                                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                            }`}
                          >
                            {modelName}
                          </button>
                        );
                      })}
                    </div>
                    <span className="block text-[10px] text-slate-500 leading-normal">
                      {locale === "en"
                        ? `Only Ohvale bikes of model ${selectedFixedModel} will be available for assignment in Step 2.`
                        : `Solo le moto Ohvale modello ${selectedFixedModel} saranno disponibili nel Passaggio 2.`}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-slate-850">
                
                {/* Date Input & Overrides notes */}
                <div className="space-y-4">
                  <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider">{t.selectDateLabel}</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <CalendarIcon className="h-5 w-5 text-slate-600" />
                    </div>
                    {(() => {
                      const activeChamp = championships.find(c => c.name === championshipType);
                      const isDateLocked = bookingType === "CHAMPIONSHIP" && activeChamp?.fixedDate !== null && activeChamp?.fixedDate !== undefined;
                      return (
                        <>
                          <input
                            type="date"
                            required
                            disabled={isDateLocked}
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            min={new Date().toISOString().split("T")[0]}
                            className={`w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3.5 pl-11 pr-4 shadow-inner transition-all outline-none font-medium text-sm ${
                              isDateLocked ? "opacity-50 cursor-not-allowed border-orange-500/20" : ""
                            }`}
                          />
                          {isDateLocked && (
                            <span className="block text-[10px] text-orange-400 font-bold uppercase mt-1">
                              * {locale === "en" ? "Date locked to Scheduled Event date" : "Data bloccata alla data dell'evento programmato"}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Day configurations warning and overrides display */}
                  {date && currentPriceDetails && (
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2.5 text-xs">
                      {currentPriceDetails.dayConfig && !currentPriceDetails.dayConfig.isAvailable ? (
                        <div className="flex items-center space-x-2 text-red-400">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="font-bold">{locale === "en" ? "Closed: " : "Chiuso: "}{currentPriceDetails.dayConfig.notes}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-center text-slate-400">
                            <span>{t.dayTypeLabel}:</span>
                            <span className={`font-bold uppercase tracking-wider ${currentPriceDetails.isWeekend ? "text-orange-500" : "text-green-500"}`}>
                              {currentPriceDetails.isWeekend ? t.weekendPremium : t.weekdayStandard}
                            </span>
                          </div>
                          {currentPriceDetails.dayConfig?.maxCapacityPerSlot !== undefined && (
                            <div className="flex justify-between items-center text-slate-400">
                              <span>{t.trackCapacityLabel}:</span>
                              <span className="font-bold text-white">{currentPriceDetails.dayConfig.maxCapacityPerSlot} spots</span>
                            </div>
                          )}
                          {currentPriceDetails.dayConfig?.notes && (
                            <p className="text-[11px] text-orange-400 font-semibold italic border-t border-slate-900 pt-2">
                              * {currentPriceDetails.dayConfig.notes}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Riders count and Session quantity selection */}
                <div className="space-y-6">
                  
                  {/* Crew count input */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider">{t.crewSizeLabel}</label>
                      <span className="text-[10px] text-slate-500 uppercase font-mono">
                        {bookingType === "CHAMPIONSHIP"
                          ? (locale === "en" ? "Min. 5 / Max 10 racers" : "Min. 5 / Max 10 piloti")
                          : t.maxReservationHint}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 bg-slate-950/80 border border-slate-800 rounded-xl p-1 w-fit">
                      <button
                        type="button"
                        onClick={() => setRidersCount(Math.max(minRiders, ridersCount - 1))}
                        className="h-10 w-10 flex items-center justify-center text-lg font-bold text-slate-400 hover:text-white transition-colors hover:bg-slate-900 rounded-lg cursor-pointer"
                      >
                        -
                      </button>
                      <span className="text-base font-extrabold text-white w-8 text-center">{ridersCount}</span>
                      <button
                        type="button"
                        onClick={() => setRidersCount(Math.min(maxRiders, ridersCount + 1))}
                        className="h-10 w-10 flex items-center justify-center text-lg font-bold text-slate-400 hover:text-white transition-colors hover:bg-slate-900 rounded-lg cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                    {bookingType === "CHAMPIONSHIP" && ridersCount === 5 && (
                      <span className="block text-[10px] text-orange-500 font-bold uppercase mt-1.5 font-mono">
                        {locale === "en" ? "* Minimum grid requirement satisfied (5 racers)" : "* Requisito minimo griglia soddisfatto (5 piloti)"}
                      </span>
                    )}
                  </div>

                  {/* Booking Format Sub-Selectors */}
                  {bookingType === "CHAMPIONSHIP" ? (
                    /* Championship Format Selector */
                    <div>
                      <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider mb-2">
                        {locale === "en" ? "Championship Format" : "Formato Campionato"}
                      </label>
                      <div className="space-y-3">
                        {championships.map((champ) => {
                          const isChosen = championshipType === champ.name;
                          return (
                            <button
                              key={champ.id}
                              type="button"
                              onClick={() => {
                                setChampionshipType(champ.name);
                                if (ridersCount < champ.minRacers) {
                                  setRidersCount(champ.minRacers);
                                }
                                if (champ.fixedDate) {
                                  setDate(champ.fixedDate);
                                }
                              }}
                              className={`w-full p-4 rounded-xl border text-left transition-all cursor-pointer ${
                                isChosen
                                  ? "bg-slate-950 border-orange-500 text-white"
                                  : "bg-slate-950/40 hover:bg-slate-950/80 border-slate-900 text-slate-400"
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-extrabold text-xs uppercase">{champ.name}</span>
                                <span className="font-mono font-black text-xs text-orange-500">€{champ.price.toFixed(0)} {locale === "en" ? "/ racer" : "/ pilota"}</span>
                              </div>
                              <span className="block text-[10px] text-slate-500 mt-1 leading-normal">
                                {champ.description}
                              </span>
                              {champ.fixedDate && (
                                <span className="block text-[9px] text-orange-400 font-bold uppercase mt-1 font-mono">
                                  {locale === "en" ? `📅 Fixed Event Date: ${champ.fixedDate}` : `📅 Data Evento Fissa: ${champ.fixedDate}`}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* Track session count */
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider">{t.sessionsPerRider}</label>
                        <span className="text-[10px] text-slate-500 uppercase font-mono">{t.sessionsLimitHint}</span>
                      </div>
                      <div className="flex items-center space-x-4 bg-slate-950/80 border border-slate-800 rounded-xl p-1 w-fit mb-3">
                        <button
                          type="button"
                          onClick={() => setSessionsCount(Math.max(1, sessionsCount - 1))}
                          className="h-10 w-10 flex items-center justify-center text-lg font-bold text-slate-400 hover:text-white transition-colors hover:bg-slate-900 rounded-lg cursor-pointer"
                        >
                          -
                        </button>
                        <span className="text-base font-extrabold text-white w-8 text-center">{sessionsCount}</span>
                        <button
                          type="button"
                          onClick={() => setSessionsCount(Math.min(6, sessionsCount + 1))}
                          className="h-10 w-10 flex items-center justify-center text-lg font-bold text-slate-400 hover:text-white transition-colors hover:bg-slate-900 rounded-lg cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                      <div className="bg-slate-950/50 border border-slate-900 rounded-xl p-3.5 text-[10px] text-slate-500 leading-relaxed">
                        <span className="block font-bold text-orange-500 uppercase mb-1 font-mono">
                          {locale === "en" ? "💡 Sessions Pack Rates:" : "💡 Tariffe Pacchetti Turni:"}
                        </span>
                        <span>
                          {sessionsRatesList}
                        </span>
                      </div>
                    </div>
                  )}

                </div>

              </div>

              {/* Pilot Details Form Section */}
              <div className="space-y-4 border-t border-slate-900 pt-6 mt-8">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    {locale === "en" ? "Crew Registration Details" : "Dettagli Registrazione Equipaggio"}
                  </h3>
                  <p className="text-[10px] text-slate-500 uppercase mt-0.5 font-mono">
                    {locale === "en" ? "First pilot is the booking creator. Other pilots can be custom entered." : "Il primo pilota è l'intestatario dell'ordine. Gli altri possono essere inseriti custom."}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pilots.map((pilot, idx) => {
                    const isCreator = idx === 0;
                    return (
                      <div key={idx} className="bg-slate-900/40 p-5 rounded-2xl border border-slate-850 space-y-3.5 relative overflow-hidden">
                        {isCreator && (
                          <div className="absolute top-0 right-0 bg-orange-600/10 border-l border-b border-orange-500/20 text-orange-500 text-[8px] font-black uppercase px-2.5 py-1 rounded-bl">
                            {locale === "en" ? "Order Owner" : "Intestatario"}
                          </div>
                        )}
                        <div className="flex items-center space-x-2">
                          <div className="bg-slate-950 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-mono font-black text-orange-500 border border-slate-800">
                            {idx + 1}
                          </div>
                          <span className="text-xs font-black text-white uppercase">
                            {locale === "en" ? `Pilot #${idx + 1}` : `Pilota #${idx + 1}`}
                          </span>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[9px] uppercase text-slate-500 font-bold tracking-wider mb-1">
                              {locale === "en" ? "Full Name" : "Nome Completo"}
                            </label>
                            <input
                              type="text"
                              required
                              disabled={isCreator}
                              value={pilot.name}
                              onChange={(e) => {
                                const updated = [...pilots];
                                updated[idx].name = e.target.value;
                                setPilots(updated);
                              }}
                              placeholder={locale === "en" ? "Racer Name" : "Nome Pilota"}
                              className={`w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all ${
                                isCreator ? "opacity-60 cursor-not-allowed bg-slate-900/60" : ""
                              }`}
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] uppercase text-slate-500 font-bold tracking-wider mb-1">
                              {locale === "en" ? "Email Address (Optional)" : "Indirizzo Email (Opzionale)"}
                            </label>
                            <input
                              type="email"
                              disabled={isCreator}
                              value={pilot.email}
                              onChange={(e) => {
                                const updated = [...pilots];
                                updated[idx].email = e.target.value;
                                setPilots(updated);
                              }}
                              placeholder={locale === "en" ? "racer@example.com (links to account)" : "racer@example.com (collega account)"}
                              className={`w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all ${
                                isCreator ? "opacity-60 cursor-not-allowed bg-slate-900/60" : ""
                              }`}
                            />
                            {!isCreator && (
                              <span className="block text-[8px] text-slate-500 font-medium leading-normal mt-1">
                                {locale === "en" 
                                  ? "💡 If they are a registered user, this order will appear in their dashboard."
                                  : "💡 Se l'utente è registrato, questo ordine apparirà nella sua area personale."}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {date && !isEnoughBikes && (
                <div className="mt-6 bg-red-950/40 border border-red-500/30 rounded-2xl p-4 flex items-start space-x-3 text-red-200">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="block font-bold text-sm uppercase">
                      {locale === "en" ? "Not Enough Bikes Available" : "Moto Insufficienti Disponibili"}
                    </span>
                    <p className="text-xs text-red-300 mt-1 leading-relaxed">
                      {bikeSelectionMode === "FIXED"
                        ? (locale === "en"
                          ? `There are only ${totalAvailableBikes} available bikes of model "${selectedFixedModel}" on this date. You have requested slots for ${ridersCount} riders.`
                          : `Ci sono solo ${totalAvailableBikes} moto disponibili per il modello "${selectedFixedModel}" in questa data. Hai richiesto posti per ${ridersCount} piloti.`)
                        : (locale === "en"
                          ? `There are only ${totalAvailableBikes} total available bikes on this date. You have requested slots for ${ridersCount} riders.`
                          : `Ci sono solo ${totalAvailableBikes} moto disponibili in totale in questa data. Hai richiesto posti per ${ridersCount} piloti.`)}
                    </p>
                  </div>
                </div>
              )}

              {/* Next buttons */}
              <div className="pt-8 border-t border-slate-850 flex justify-end">
                <button
                  type="button"
                  onClick={handleNextStep}
                  disabled={!date || (currentPriceDetails?.dayConfig && !currentPriceDetails.dayConfig.isAvailable) || !isEnoughBikes}
                  className="flex items-center space-x-2 bg-orange-600 text-white font-extrabold uppercase tracking-wider text-xs px-8 py-4.5 rounded-xl hover:bg-orange-500 shadow-xl shadow-orange-600/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98] cursor-pointer"
                >
                  <span>{t.buttonNextStep2}</span>
                  <ArrowRight className="h-4.5 w-4.5" />
                </button>
              </div>

            </div>
          );
        })()}

        {/* STEP 2: Time Slots and Bikes Assignment */}
        {step === 2 && (
          <div className="bg-slate-900/60 backdrop-blur border border-slate-800/80 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 animate-fade-in">
            <div className="border-b border-slate-850 pb-5">
              <h2 className="text-2xl font-extrabold uppercase text-white">{t.step2Header}</h2>
              <p className="text-xs text-slate-400 mt-1">{t.step2Desc}</p>
            </div>

            {bikeSelectionMode === "FIXED" && (
              <div className="bg-orange-600/10 border border-orange-500/20 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="bg-orange-600/25 p-2 rounded-xl text-orange-500">
                    <Flag className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="block text-xs font-black uppercase text-white">
                      {locale === "en" ? "Fixed Model Grid Rules Active" : "Regole Griglia Monomarca Attive"}
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      {locale === "en" 
                        ? `All riders are restricted to compete on the selected model: ${selectedFixedModel}`
                        : `Tutti i piloti sono tenuti a gareggiare sul modello selezionato: ${selectedFixedModel}`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Time Slot Hours Selection */}
            <div className="space-y-4">
              <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider">{t.selectSlotsLabel}</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {slots.map((slot) => {
                  const capacityLeft = getCapacityLeft(slot.time);
                  const isChecked = selectedHours.includes(slot.time);
                  const isReserved = reservedHours.has(slot.time) || dayFullyLocked;
                  const isFull = capacityLeft <= 0 || isReserved;

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={isFull && !isChecked}
                      onClick={() => handleToggleHour(slot.time)}
                      className={`p-4 rounded-xl border text-left transition-all relative cursor-pointer ${
                        isChecked
                          ? "bg-orange-600/15 border-orange-500 text-white"
                          : isFull
                            ? "bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed"
                            : "bg-slate-950 hover:bg-slate-900 border-slate-850 text-slate-300"
                      }`}
                    >
                      <span className="block font-mono font-extrabold text-base">{slot.time}</span>
                      <span className="block text-[10px] text-slate-500 uppercase mt-0.5">
                        {isReserved ? (locale === "en" ? "Reserved — race day" : "Riservato — gara") : slot.label}
                      </span>
                      
                      {/* Spots Badge */}
                      <span className={`absolute bottom-2.5 right-3 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                        isFull 
                          ? "bg-red-950/60 text-red-400 border border-red-500/10" 
                          : "bg-slate-900 text-slate-400 border border-slate-800"
                      }`}>
                        {isFull ? t.fullBadge : `${capacityLeft} ${t.spotsLeft}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ohvale Assignment list per rider */}
            <div className="space-y-6 pt-4 border-t border-slate-850">
              <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider mb-2">{t.assignFleetLabel}</label>
              
              {(() => {
                return (
                  <div className="space-y-6">
                    {Array.from({ length: ridersCount }).map((_, index) => {
                      const assignment = bikesAssignment[index] || { modelId: "", insuranceSelected: false, apparelSelected: false };

                      return (
                        <div key={index} className="bg-slate-950 p-6 rounded-2xl border border-slate-850 space-y-4">
                          <div className="flex items-center space-x-2.5">
                            <div className="bg-slate-900 h-7 w-7 rounded-full flex items-center justify-center text-xs font-black text-orange-500 border border-slate-800">
                              {index + 1}
                            </div>
                            <h4 className="text-sm font-extrabold uppercase text-white">
                              {pilots[index]?.name || `${t.riderConfigLabel} #${index + 1}`}
                            </h4>
                          </div>

                          {/* Skill group: decides which heat this rider races in */}
                          {bookingType === "CHAMPIONSHIP" && activeGroups.length > 0 && (
                            <div className="space-y-2">
                              <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                                {locale === "en" ? "Experience Level / Group" : "Livello di Esperienza / Gruppo"}
                              </label>
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                {activeGroups.map((group) => {
                                  const chosen = riderGroups[index] === group.id;
                                  const left = groupPlacesLeft(group.id, index);
                                  const full = left <= 0 && !chosen;
                                  return (
                                    <button
                                      key={group.id}
                                      type="button"
                                      disabled={full}
                                      onClick={() => handleAssignGroup(index, group.id)}
                                      className={`p-2.5 rounded-xl border text-left transition-all ${
                                        chosen
                                          ? "bg-orange-600/10 border-orange-500 text-white cursor-default"
                                          : full
                                            ? "bg-slate-950/45 border-slate-900 text-slate-500 opacity-50 cursor-not-allowed"
                                            : "bg-slate-900 hover:bg-slate-850 border-slate-850 text-slate-300 cursor-pointer"
                                      }`}
                                    >
                                      <span className="block font-bold text-[10px] uppercase truncate">{group.name}</span>
                                      {group.description && (
                                        <span className="block text-[9px] text-slate-500 truncate mt-0.5">{group.description}</span>
                                      )}
                                      <span className="block text-[9px] text-slate-500 font-mono mt-1">
                                        {group.timeSlot ? `${group.timeSlot} · ` : ""}
                                        {full
                                          ? (locale === "en" ? "Full" : "Pieno")
                                          : (locale === "en" ? `${left} left` : `${left} posti`)}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Bike Selector grid replaced by Model Selector grid */}
                          {bikeSelectionMode === "FIXED" ? (
                            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900 flex items-center space-x-3 text-xs uppercase text-white font-black">
                              <span>{selectedFixedModel}</span>
                              <span className="text-[9px] text-slate-500 font-medium">({locale === "en" ? "Fixed Monomarca Grid" : "Griglia Monomarca Fissa"})</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {uniqueBikeModels.map((model) => {
                                const isSelected = assignment.modelId === model.id;
                                
                                // Check how many of this model are already allocated to other riders in this form
                                const othersAllocated = bikesAssignment.filter((ba, idx) => idx !== index && ba.modelId === model.id).length;
                                
                                // Total available count of this model on this date
                                const availableCount = getAvailableBikesCountForModel(model.model);
                                const remainingCount = Math.max(0, availableCount - othersAllocated);
                                const isDisabled = remainingCount <= 0 && !isSelected;
                                
                                return (
                                  <button
                                    key={model.id}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => handleAssignModel(index, model.id)}
                                    className={`p-4 rounded-xl border text-left transition-all ${
                                      isSelected
                                        ? "bg-orange-600/10 border-orange-500 text-white cursor-default"
                                        : isDisabled
                                          ? "bg-slate-950/45 border-slate-900 text-slate-500 opacity-50 cursor-not-allowed select-none"
                                          : "bg-slate-900 hover:bg-slate-850 border-slate-850 text-slate-300 cursor-pointer"
                                    }`}
                                  >
                                    <div className="flex items-center space-x-3">
                                      {model.imageUrl ? (
                                        <div 
                                          className="h-10 w-14 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border border-slate-800/80 bg-slate-950 relative"
                                          style={{ backgroundColor: model.bgColor || '#1e293b' }}
                                        >
                                          <img 
                                            src={model.imageUrl} 
                                            alt={model.name} 
                                            className="h-full w-full object-contain p-1"
                                          />
                                        </div>
                                      ) : (
                                        <div className="h-10 w-14 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 relative">
                                          <Flag className="h-4.5 w-4.5 text-slate-600" />
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <span className="block font-bold text-xs uppercase truncate">{model.name}</span>
                                        <span className="block text-[9px] text-slate-500 font-medium uppercase mt-0.5">
                                          {locale === "en" ? `Available: ${remainingCount}` : `Disponibili: ${remainingCount}`}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="mt-2.5 flex justify-between items-center text-[10px] border-t border-slate-950 pt-2.5 text-slate-400">
                                      <span>{locale === "en" ? "Modifier: " : "Modificatore: "}<strong className="text-white">x{model.priceModifier.toFixed(1)}</strong></span>
                                      <span>Ins: <strong className="text-orange-500">€{model.insurancePrice.toFixed(0)}</strong></span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Optional Add-ons toggle section */}
                          {assignment.modelId && (() => {
                            const model = uniqueBikeModels.find(m => m.id === assignment.modelId);
                            if (!model) return null;

                            return (
                              <div className="space-y-4">
                                {/* Insurance toggle */}
                                <div className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all ${
                                  assignment.insuranceSelected 
                                    ? "bg-green-950/20 border-green-500/20" 
                                    : "bg-slate-900 border-slate-850"
                                }`}>
                                  <div className="space-y-0.5">
                                    <span className="block text-xs font-bold text-slate-200 uppercase flex items-center space-x-1">
                                      <ShieldCheck className="h-4 w-4 text-green-500" />
                                      <span>{pilots[index]?.name || `${t.riderConfigLabel} #${index + 1}`} - {t.crashProtectionLabel}</span>
                                    </span>
                                    <span className="block text-[10px] text-slate-400 leading-normal">
                                      {locale === "en" 
                                        ? `Premium crash cover is €${model.insurancePrice.toFixed(0)} and guarantees protection up to €${model.insuranceCoverage.toFixed(0)} of bike damage in track crashes!`
                                        : `La copertura premium costa €${model.insurancePrice.toFixed(0)} e garantisce protezione fino a €${model.insuranceCoverage.toFixed(0)} sui danni alla moto!`
                                      }
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleInsurance(index)}
                                    className={`text-[10px] font-extrabold uppercase px-4 py-2.5 rounded-lg border transition-all shrink-0 w-full sm:w-auto text-center cursor-pointer ${
                                      assignment.insuranceSelected
                                        ? "bg-green-600 border-transparent text-white shadow-lg shadow-green-600/10"
                                        : "bg-slate-950 hover:bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                                    }`}
                                  >
                                    {assignment.insuranceSelected ? t.buttonInsuranceEnabled : t.buttonAddInsurance}
                                  </button>
                                </div>

                                {/* Apparel Renting addon */}
                                <div className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all ${
                                  assignment.apparelSelected
                                    ? "bg-green-950/20 border-green-500/20"
                                    : "bg-slate-900 border-slate-850"
                                }`}>
                                  <div className="space-y-0.5">
                                    <span className="block text-xs font-bold text-slate-200 uppercase flex items-center space-x-1">
                                      <Users className="h-4.5 w-4.5 text-green-500" />
                                      <span>{locale === "en" ? `${pilots[index]?.name || `Rider #${index + 1}`} Technical Apparel Renting` : `Noleggio Abbigliamento Tecnico ${pilots[index]?.name || `Pilota #${index + 1}`}`}</span>
                                    </span>
                                    <span className="block text-[10px] text-slate-400 leading-normal">
                                      {locale === "en"
                                        ? "Rent professional race suit, helmet, boots, and gloves for track safety."
                                        : "Noleggia tuta professionale in pelle, casco, stivali e guanti per sicurezza in pista."}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleApparel(index)}
                                    className={`text-[10px] font-extrabold uppercase px-4 py-2.5 rounded-lg border transition-all shrink-0 w-full sm:w-auto text-center cursor-pointer ${
                                      assignment.apparelSelected
                                        ? "bg-green-600 border-transparent text-white shadow-lg shadow-green-600/10"
                                        : "bg-slate-950 hover:bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                                    }`}
                                  >
                                    {assignment.apparelSelected 
                                      ? (locale === "en" ? "Apparel Added" : "Abbigliamento Aggiunto") 
                                      : (locale === "en" ? "Add Apparel (+10€)" : "Aggiungi Abbigliamento (+10€)")}
                                  </button>
                                </div>
                              </div>
                            );
                          })()}

                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Back & Next Actions */}
            <div className="pt-8 border-t border-slate-850 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white uppercase font-bold transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-4.5 w-4.5" />
                <span>{t.buttonBackStep1}</span>
              </button>

              <button
                type="button"
                onClick={handleNextStep}
                disabled={selectedHours.length === 0 || bikesAssignment.some(ba => !ba.modelId) || !allRidersHaveGroup}
                className="flex items-center space-x-2 bg-orange-600 text-white font-extrabold uppercase tracking-wider text-xs px-8 py-4.5 rounded-xl hover:bg-orange-500 shadow-xl shadow-orange-600/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98] cursor-pointer"
              >
                <span>{t.buttonNextStep3}</span>
                <ArrowRight className="h-4.5 w-4.5" />
              </button>
            </div>

          </div>
        )}

        {/* STEP 3: Booking Checkout Summary & Confirmation submission */}
        {step === 3 && currentPriceDetails && (
          <div className="bg-slate-900/60 backdrop-blur border border-slate-800/80 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 animate-fade-in">
            <div className="border-b border-slate-850 pb-5">
              <h2 className="text-2xl font-extrabold uppercase text-white">{t.step3Header}</h2>
              <p className="text-xs text-slate-400 mt-1">{t.step3Desc}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* Left review specs */}
              <div className="md:col-span-2 space-y-6">
                
                {/* Details card */}
                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-850 space-y-4">
                  <h3 className="text-xs uppercase text-slate-400 font-bold tracking-wider mb-2">{t.reservationParams}</h3>
                  
                  <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs">
                    <div>
                      <span className="block text-slate-500 uppercase tracking-widest text-[9px]">{t.paddockDate}</span>
                      <span className="text-sm font-extrabold text-white mt-0.5 block">{date}</span>
                    </div>
                    <div>
                      <span className="block text-slate-500 uppercase tracking-widest text-[9px]">{t.riderCount}</span>
                      <span className="text-sm font-extrabold text-white mt-0.5 block">{ridersCount} Racer(s)</span>
                    </div>
                    <div>
                      <span className="block text-slate-500 uppercase tracking-widest text-[9px]">{locale === "en" ? "Format" : "Formato"}</span>
                      <span className="text-sm font-extrabold text-white mt-0.5 block">
                        {bookingType === "CHAMPIONSHIP"
                          ? `Championship (${championshipType})`
                          : "Standard Session Packs"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-500 uppercase tracking-widest text-[9px]">{locale === "en" ? "Grid Mode" : "Regola Griglia"}</span>
                      <span className="text-sm font-extrabold text-white mt-0.5 block">
                        {bikeSelectionMode === "FIXED" ? (locale === "en" ? "Fixed Model Grid" : "Monomarca") : (locale === "en" ? "Mixed Model Grid" : "Griglia Mista")}
                      </span>
                    </div>
                    <div className="col-span-2 border-t border-slate-900 pt-3">
                      <span className="block text-slate-500 uppercase tracking-widest text-[9px]">{t.operatingHours}</span>
                      <span className="text-sm font-extrabold text-orange-400 mt-0.5 block font-mono">{selectedHours.join(", ")}</span>
                    </div>
                    {bookingType === "STANDARD" && (
                      <div className="col-span-2 border-t border-slate-900 pt-3">
                        <span className="block text-slate-500 uppercase tracking-widest text-[9px]">{t.trackSessions}</span>
                        <span className="text-sm font-extrabold text-white mt-0.5 block">{sessionsCount} Session(s)</span>
                      </div>
                    )}
                  </div>

                </div>

                {/* Bike allocations list */}
                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-850 space-y-3">
                  <h3 className="text-xs uppercase text-slate-400 font-bold tracking-wider mb-2">{t.allocatedFleet}</h3>
                  
                  {bikesAssignment.map((assign, index) => {
                    const model = uniqueBikeModels.find(m => m.id === assign.modelId);
                    return (
                      <div key={index} className="flex justify-between items-center text-xs p-3.5 bg-slate-900 border border-slate-850 rounded-xl">
                        <div>
                          <span className="block font-bold text-slate-200 uppercase flex items-center flex-wrap gap-1.5">
                            <span>Rider #{index + 1}: {model?.name}</span>
                          </span>
                          {bookingType === "STANDARD" && (
                            <span className="block text-[10px] text-slate-500 mt-0.5 uppercase">Modifier: x{model?.priceModifier.toFixed(1)}</span>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5 items-end">
                          {assign.insuranceSelected ? (
                            <span className="text-[9px] bg-green-500/10 border border-green-500/20 text-green-400 font-extrabold uppercase px-2.5 py-0.5 rounded-full">
                              {t.coverEnabled}
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-500 uppercase font-mono">{t.noCover}</span>
                          )}
                          {assign.apparelSelected ? (
                            <span className="text-[9px] bg-blue-500/10 border border-blue-500/20 text-blue-400 font-extrabold uppercase px-2.5 py-0.5 rounded-full">
                              {locale === "en" ? "Apparel" : "Abbigliamento"}
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-500 uppercase font-mono">{locale === "en" ? "No Apparel" : "No Abbigliamento"}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* Right pricing breakdown receipt panel */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-850 flex flex-col justify-between">
                <div className="space-y-4">
                  <h3 className="text-xs uppercase text-slate-400 font-bold tracking-wider flex items-center space-x-1.5 mb-4">
                    <Receipt className="h-4 w-4 text-orange-500" />
                    <span>{t.costBreakdown}</span>
                  </h3>

                  <div className="space-y-3 text-xs border-b border-slate-900 pb-4">
                    {bookingType === "CHAMPIONSHIP" ? (
                      /* Flat Championship rate */
                      <div className="flex justify-between">
                        <span className="text-slate-400">
                          {championshipType} Grid:
                        </span>
                        <span className="font-semibold text-white">
                          €{((championships.find(c => c.name === championshipType)?.price || 65.0) * ridersCount).toFixed(0)}
                        </span>
                      </div>
                    ) : (
                      <>
                        {/* Flat entrance fee */}
                        <div className="flex justify-between">
                          <span className="text-slate-400">{t.paddockEntry}:</span>
                          <span className="font-semibold text-white">
                            €{(currentPriceDetails.basePricePerPerson * ridersCount).toFixed(0)}
                          </span>
                        </div>

                        {/* Base sessions fee */}
                        <div className="flex justify-between">
                          <span className="text-slate-400">{locale === "en" ? "Sessions Pack Cost" : "Costo Pacchetto Turni"}:</span>
                          <span className="font-semibold text-white">
                            €{(getSessionsBasePrice(
                              sessionsCount,
                              currentPriceDetails.tariff.basePricePerSession,
                              currentPriceDetails.tariff.discountThreshold,
                              currentPriceDetails.tariff.discountThresholdPrice,
                              currentPriceDetails.tariff.pricePerSessionAfterThreshold
                            ) * (currentPriceDetails.dayConfig?.customPriceModifier || 1.0) * ridersCount).toFixed(0)}
                          </span>
                        </div>

                        {/* Bike modifiers additions */}
                        {bikesAssignment.some(ba => (uniqueBikeModels.find(m => m.id === ba.modelId)?.priceModifier || 1.0) > 1.0) && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">{t.highEndModifiers}:</span>
                            <span className="font-semibold text-orange-400">
                              +€{bikesAssignment.reduce((acc, assign) => {
                                const model = uniqueBikeModels.find(m => m.id === assign.modelId);
                                if (model) {
                                  let baseSessionPriceForCount = getSessionsBasePrice(
                                    sessionsCount,
                                    currentPriceDetails.tariff.basePricePerSession,
                                    currentPriceDetails.tariff.discountThreshold,
                                    currentPriceDetails.tariff.discountThresholdPrice,
                                    currentPriceDetails.tariff.pricePerSessionAfterThreshold
                                  );
                                  if (currentPriceDetails.dayConfig?.customPriceModifier) {
                                    baseSessionPriceForCount *= currentPriceDetails.dayConfig.customPriceModifier;
                                  }
                                  const modelFee = baseSessionPriceForCount * (model.priceModifier - 1.0);
                                  return acc + modelFee;
                                }
                                return acc;
                              }, 0).toFixed(0)}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Insurance additions */}
                    {bikesAssignment.some(ba => ba.insuranceSelected) && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">{t.crashProtectionCost}:</span>
                        <span className="font-semibold text-green-400">
                          +€{bikesAssignment.reduce((acc, assign) => {
                            if (assign.insuranceSelected) {
                              const model = uniqueBikeModels.find(m => m.id === assign.modelId);
                              return acc + (model?.insurancePrice || 0);
                            }
                            return acc;
                          }, 0).toFixed(0)}
                        </span>
                      </div>
                    )}

                    {/* Technical Apparel additions */}
                    {bikesAssignment.some(ba => ba.apparelSelected) && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">{locale === "en" ? "Apparel Rental" : "Noleggio Abbigliamento"}:</span>
                        <span className="font-semibold text-blue-400">
                          +€{(bikesAssignment.filter(ba => ba.apparelSelected).length * 10.0).toFixed(0)}
                        </span>
                      </div>
                    )}

                  </div>

                  <div className="pt-2 flex justify-between items-baseline">
                    <span className="text-xs uppercase text-slate-400 font-bold">{t.grandTotal}:</span>
                    <span className="text-2xl font-black text-white">€{totalPrice.toFixed(2)}</span>
                  </div>
                  <span className="block text-[10px] text-slate-500 uppercase font-mono mt-0.5 leading-normal">* {t.vatInfo}</span>
                </div>

                {/* Confirm Form */}
                <Form method="post" className="mt-8">
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="ridersCount" value={ridersCount} />
                  <input type="hidden" name="bookingType" value={bookingType} />
                  <input type="hidden" name="championshipType" value={championshipType || ""} />
                  <input type="hidden" name="bikeSelectionMode" value={bikeSelectionMode} />
                  <input type="hidden" name="sessionsCount" value={sessionsCount} />
                  <input type="hidden" name="selectedHours" value={selectedHours.join(",")} />
                  <input
                    type="hidden"
                    name="bikesAssignment"
                    value={JSON.stringify(
                      bikesAssignment.map((ba, idx) => ({
                        modelId: ba.modelId,
                        championshipGroupId: bookingType === "CHAMPIONSHIP" ? (riderGroups[idx] || "") : undefined,
                        insuranceSelected: ba.insuranceSelected,
                        apparelSelected: ba.apparelSelected,
                        pilotName: pilots[idx]?.name || "",
                        pilotEmail: pilots[idx]?.email || "",
                      }))
                    )}
                  />

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-xl shadow-xl shadow-orange-600/10 text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        <span>{t.buttonSubmittingBooking}</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5">
                        <Sparkles className="h-4.5 w-4.5 text-white animate-pulse" />
                        <span>{t.buttonConfirmBooking}</span>
                      </div>
                    )}
                  </button>
                </Form>

              </div>

            </div>

            {/* Back Action */}
            <div className="pt-8 border-t border-slate-850 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={isSubmitting}
                className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white uppercase font-bold transition-colors disabled:opacity-30 cursor-pointer"
              >
                <ArrowLeft className="h-4.5 w-4.5" />
                <span>{t.buttonBackStep2}</span>
              </button>
            </div>

          </div>
        )}

      </div>

      {/* Platform Branding Footer */}
      <div className="max-w-7xl mx-auto text-center py-8 border-t border-slate-900/60 mt-12 text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono space-y-1">
        <div className="flex justify-center items-center space-x-2">
          <span>{locale === "en" ? "Software by" : "Software di"}</span>
          <a href="https://pikosoft.it" target="_blank" rel="noopener noreferrer" className="inline-flex items-center hover:opacity-80 transition-opacity">
            <img src="/logobig.png" alt="Pikosoft Logo" className="h-4 object-contain" />
          </a>
          <span className="text-slate-800">|</span>
          <span>{locale === "en" ? "Powered by" : "Powered by"}</span>
          <img src="/logoleasio.png" alt="Leasio Logo" className="h-4 object-contain" />
        </div>
      </div>

    </div>
  );
}
