import { useState, useEffect } from "react";
import { Form, useLoaderData, useNavigation, useActionData } from "react-router";
import type { Route } from "./+types/calendar";
import bcrypt from "bcryptjs";
import { requireAdmin } from "../../utils/auth.server";
import { prisma } from "../../utils/db.server";
import { getLocale } from "../../utils/locale.server";
import { sendBookingCreatedEmail, sendBookingConfirmedEmail, sendBookingCancelledEmail } from "../../utils/email.server";
import { translations, type Locale } from "../../utils/translations";
import { 
  Calendar as CalendarIcon, 
  Save, 
  Trash2, 
  AlertTriangle, 
  Users, 
  ShieldAlert, 
  Info,
  CalendarCheck,
  CalendarDays,
  Plus,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Clock,
  ShieldCheck,
  Flag,
  CheckCircle2,
  FileText,
  Euro
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const locale = await getLocale(request);
  const [dayConfigs, bookings, bikes, bikeModels, users, timeSlots, tariffs] = await Promise.all([
    prisma.dayConfig.findMany({
      orderBy: { date: "asc" },
    }),
    prisma.booking.findMany({
      where: { status: { in: ["CONFIRMED", "PENDING"] } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        bikes: {
          include: {
            bike: {
              include: { model: true }
            }
          }
        }
      },
      orderBy: { date: "asc" }
    }),
    prisma.bike.findMany({
      where: { status: "AVAILABLE" },
      include: { model: true }
    }),
    prisma.bikeModel.findMany({
      where: {
        NOT: { usage: "ACADEMY" }
      },
      orderBy: { displacement: "asc" }
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true }
    }),
    prisma.timeSlot.findMany({
      orderBy: { time: "asc" }
    }),
    prisma.tariff.findMany()
  ]);

  return { dayConfigs, bookings, bikes, bikeModels, users, timeSlots, tariffs, locale };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();
  const dateStr = formData.get("date")?.toString();

  if (!dateStr) {
    return { error: "Date parameter is required." };
  }

  // 1. Existing Override Deletion
  if (intent === "delete") {
    await prisma.dayConfig.delete({
      where: { date: dateStr },
    });
    return { success: "Custom date override successfully deleted." };
  }

  // 2. Existing Override Upsert
  if (intent === "upsert") {
    const isAvailable = formData.get("isAvailable") === "true";
    const maxCapacityPerSlot = parseInt(formData.get("maxCapacityPerSlot")?.toString() || "5", 10);
    const customPriceModifierStr = formData.get("customPriceModifier")?.toString();
    const customPriceModifier = customPriceModifierStr ? parseFloat(customPriceModifierStr) : null;
    const notes = formData.get("notes")?.toString() || null;

    if (maxCapacityPerSlot <= 0) {
      return { error: "Capacity per session must be greater than zero." };
    }

    await prisma.dayConfig.upsert({
      where: { date: dateStr },
      create: {
        date: dateStr,
        isAvailable,
        maxCapacityPerSlot,
        customPriceModifier,
        notes,
      },
      update: {
        isAvailable,
        maxCapacityPerSlot,
        customPriceModifier,
        notes,
      },
    });

    return { success: "Custom daily capacity & pricing overrides saved." };
  }

  // 3. New Manual Appointment (create_booking)
  if (intent === "create_booking") {
    const email = formData.get("email")?.toString();
    const name = formData.get("name")?.toString();
    const ridersCount = parseInt(formData.get("ridersCount")?.toString() || "0", 10);
    const sessionsCount = parseInt(formData.get("sessionsCount")?.toString() || "0", 10);
    const selectedHoursStr = formData.get("selectedHours")?.toString() || ""; // comma separated
    const bikesJson = formData.get("bikesAssignment")?.toString() || "[]"; // array of {modelId, insuranceSelected, apparelSelected, pilotName, pilotEmail}
    const customCostStr = formData.get("customCost")?.toString();
    const customCost = customCostStr && customCostStr.trim() !== "" ? parseFloat(customCostStr) : null;

    if (!email || !name || !dateStr || ridersCount <= 0 || sessionsCount <= 0 || !selectedHoursStr || !bikesJson) {
      return { error: "Missing essential appointment details." };
    }

    const selectedHours = selectedHoursStr.split(",").map(h => h.trim()).filter(Boolean);
    const bikeModelAssignments = JSON.parse(bikesJson) as Array<{
      modelId: string;
      insuranceSelected: boolean;
      apparelSelected: boolean;
      pilotName?: string;
      pilotEmail?: string;
    }>;

    if (bikeModelAssignments.length !== ridersCount) {
      return { error: "Every rider must be assigned an available Ohvale GP model." };
    }

    // A. Find or create the user account
    let user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() }
    });

    if (!user) {
      const defaultPassword = "mcmGuest" + Math.random().toString(36).slice(-6) + "!";
      const passwordHash = await bcrypt.hash(defaultPassword, 10);
      user = await prisma.user.create({
        data: {
          email: email.trim().toLowerCase(),
          name: name.trim(),
          password: passwordHash,
          role: "CUSTOMER"
        }
      });
    }

    // B. Check capacity constraints per hour
    const dayConfig = await prisma.dayConfig.findUnique({
      where: { date: dateStr! }
    });
    const slotCapacity = dayConfig ? dayConfig.maxCapacityPerSlot : 5;

    const bookingsOnDate = await prisma.booking.findMany({
      where: { date: dateStr!, status: { in: ["CONFIRMED", "PENDING"] } }
    });

    for (const hour of selectedHours) {
      let bookedCount = 0;
      for (const booking of bookingsOnDate) {
        const bookingHours = booking.hours.split(",").map(h => h.trim());
        if (bookingHours.includes(hour)) {
          bookedCount += booking.peopleCount;
        }
      }

      if (bookedCount + ridersCount > slotCapacity) {
        return {
          error: `Capacity overflow for ${hour} slot. Remaining spots: ${slotCapacity - bookedCount}. Requested: ${ridersCount}.`
        };
      }
    }

    // C. Dynamic bike allocation matching requested models
    const bookedBikesOnDate = await prisma.bookingBike.findMany({
      where: {
        booking: {
          date: dateStr!,
          status: { in: ["CONFIRMED", "PENDING"] }
        }
      },
      select: { bikeId: true }
    });
    const bookedBikeIds = bookedBikesOnDate.map(bb => bb.bikeId);

    const availableBikes = await prisma.bike.findMany({
      where: {
        status: "AVAILABLE",
        model: {
          NOT: { usage: "ACADEMY" }
        }
      },
      include: { model: true }
    });
    const unbookedBikes = availableBikes.filter(b => !bookedBikeIds.includes(b.id));

    const finalBikeAssignments: Array<{
      bikeId: string;
      insuranceSelected: boolean;
      apparelSelected: boolean;
      pilotName?: string;
      pilotEmail?: string;
    }> = [];

    const allocatedBikeIdsInRequest = new Set<string>();

    for (const assignment of bikeModelAssignments) {
      const candidateBike = unbookedBikes.find(
        b => b.modelId === assignment.modelId && !allocatedBikeIdsInRequest.has(b.id)
      );
      if (!candidateBike) {
        const modelDetails = await prisma.bikeModel.findUnique({ where: { id: assignment.modelId } });
        return { error: `Sorry! No more available Ohvale GP of model "${modelDetails?.name || "selected"}" on this date.` };
      }
      allocatedBikeIdsInRequest.add(candidateBike.id);
      finalBikeAssignments.push({
        bikeId: candidateBike.id,
        insuranceSelected: assignment.insuranceSelected,
        apparelSelected: assignment.apparelSelected,
        pilotName: assignment.pilotName || name,
        pilotEmail: assignment.pilotEmail || email
      });
    }

    // D. Price Calculation (Tariff + Modifiers) or Custom Cost Override
    let finalPrice = 0;
    if (customCost !== null && !isNaN(customCost)) {
      finalPrice = customCost;
    } else {
      const parsedDate = new Date(dateStr);
      const dayOfWeek = parsedDate.getDay();
      const tariff = await prisma.tariff.findUnique({
        where: { dayOfWeek }
      });

      if (!tariff) {
        return { error: "Pricing tariff rules for this day of the week are missing." };
      }

      const getSessionsBasePrice = (
        sessions: number,
        basePricePerSession: number,
        discountThreshold: number,
        discountThresholdPrice: number,
        pricePerSessionAfterThreshold: number
      ) => {
        if (sessions < discountThreshold) {
          return sessions * basePricePerSession;
        }
        return discountThresholdPrice + (sessions - discountThreshold) * pricePerSessionAfterThreshold;
      };

      const customModifier = dayConfig?.customPriceModifier || 1.0;

      const baseSessionsPricePerRider = getSessionsBasePrice(
        sessionsCount,
        tariff.basePricePerSession,
        tariff.discountThreshold,
        tariff.discountThresholdPrice,
        tariff.pricePerSessionAfterThreshold
      ) * customModifier;
      const basePersonPrice = tariff.basePricePerPerson * customModifier;
      finalPrice += (basePersonPrice + baseSessionsPricePerRider) * ridersCount;

      for (const assignment of finalBikeAssignments) {
        const bike = availableBikes.find(b => b.id === assignment.bikeId);
        if (bike) {
          const bikeFee = baseSessionsPricePerRider * (bike.model.priceModifier - 1.0);
          finalPrice += bikeFee;
          if (assignment.insuranceSelected) {
            finalPrice += bike.model.insurancePrice;
          }
        }
        if (assignment.apparelSelected) {
          finalPrice += 10.0;
        }
      }
    }

    // E. Save transaction
    const booking = await prisma.$transaction(async (tx) => {
      const createdBooking = await tx.booking.create({
        data: {
          userId: user.id,
          date: dateStr,
          sessionsCount,
          peopleCount: ridersCount,
          hours: selectedHours.join(", "),
          totalPrice: finalPrice,
          status: "CONFIRMED",
          bookingType: "STANDARD",
          bikeSelectionMode: "MIXED"
        }
      });

      for (let i = 0; i < finalBikeAssignments.length; i++) {
        const assignment = finalBikeAssignments[i];
        let pilotUserId: string | null = null;
        const pEmail = assignment.pilotEmail;
        const pName = assignment.pilotName || `Rider ${i + 1}`;

        if (i === 0) {
          pilotUserId = user.id;
        } else if (pEmail) {
          const matchedUser = await tx.user.findUnique({
            where: { email: pEmail.trim().toLowerCase() }
          });
          if (matchedUser) {
            pilotUserId = matchedUser.id;
          }
        }

        await tx.bookingBike.create({
          data: {
            bookingId: createdBooking.id,
            bikeId: assignment.bikeId,
            insuranceSelected: assignment.insuranceSelected,
            apparelSelected: assignment.apparelSelected,
            pilotName: pName,
            pilotUserId: pilotUserId
          }
        });
      }

      return createdBooking;
    });

    const url = new URL(request.url);
    const requestHost = `${url.protocol}//${url.host}`;
    await sendBookingCreatedEmail(booking.id, requestHost);
    await sendBookingConfirmedEmail(booking.id, requestHost);

    return { success: "manual_booking_created", bookingId: booking.id };
  }

  if (intent === "confirm_booking") {
    const bookingId = formData.get("bookingId")?.toString();
    if (!bookingId) return { error: "Missing booking ID." };
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CONFIRMED" }
    });
    const url = new URL(request.url);
    const requestHost = `${url.protocol}//${url.host}`;
    await sendBookingConfirmedEmail(bookingId, requestHost);
    return { success: "booking_confirmed" };
  }

  if (intent === "cancel_booking") {
    const bookingId = formData.get("bookingId")?.toString();
    if (!bookingId) return { error: "Missing booking ID." };
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" }
    });
    const url = new URL(request.url);
    const requestHost = `${url.protocol}//${url.host}`;
    await sendBookingCancelledEmail(bookingId, requestHost);
    return { success: "booking_cancelled" };
  }

  return null;
}

export default function AdminCalendar() {
  const { dayConfigs, bookings, bikes, bikeModels, users, timeSlots, tariffs, locale } = useLoaderData<typeof loader>();
  const actionData = useActionData() as { error?: string; success?: string; bookingId?: string } | undefined;
  const t = translations[locale as Locale];

  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [activeTab, setActiveTab] = useState<"appointments" | "overrides">("appointments");

  // Daily capacity overrides form state
  const [selectedDate, setSelectedDate] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [maxCapacityPerSlot, setMaxCapacityPerSlot] = useState(5);
  const [customPriceModifier, setCustomPriceModifier] = useState("");
  const [notes, setNotes] = useState("");

  // Month-grid calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Manual Appointment creation form state
  const [showApptForm, setShowApptForm] = useState(false);
  const [newApptEmail, setNewApptEmail] = useState("");
  const [newApptName, setNewApptName] = useState("");
  const [newApptSessions, setNewApptSessions] = useState(2);
  const [newApptRiders, setNewApptRiders] = useState(1);
  const [newApptHours, setNewApptHours] = useState<string[]>([]);
  const [newApptBikes, setNewApptBikes] = useState<Array<{
    modelId: string;
    insuranceSelected: boolean;
    apparelSelected: boolean;
    pilotName: string;
    pilotEmail: string;
  }>>([]);
  const [customCost, setCustomCost] = useState("");

  const getEstimatedPrice = () => {
    if (!selectedDate) return 0;
    const dayConf = dayConfigs.find(dc => dc.date === selectedDate);
    const customModifier = dayConf?.customPriceModifier || 1.0;
    const parsedDate = new Date(selectedDate);
    const dayOfWeek = parsedDate.getDay();
    const tariff = tariffs.find(t => t.dayOfWeek === dayOfWeek);
    if (!tariff) return 0;

    const getSessionsBasePrice = (
      sessions: number,
      basePricePerSession: number,
      discountThreshold: number,
      discountThresholdPrice: number,
      pricePerSessionAfterThreshold: number
    ) => {
      if (sessions < discountThreshold) {
        return sessions * basePricePerSession;
      }
      return discountThresholdPrice + (sessions - discountThreshold) * pricePerSessionAfterThreshold;
    };

    let estPrice = 0;
    const baseSessionsPricePerRider = getSessionsBasePrice(
      newApptSessions,
      tariff.basePricePerSession,
      tariff.discountThreshold,
      tariff.discountThresholdPrice,
      tariff.pricePerSessionAfterThreshold
    ) * customModifier;
    const basePersonPrice = tariff.basePricePerPerson * customModifier;
    estPrice += (basePersonPrice + baseSessionsPricePerRider) * newApptRiders;

    newApptBikes.forEach(assign => {
      const model = bikeModels.find(bm => bm.id === assign.modelId);
      if (model) {
        const bikeFee = baseSessionsPricePerRider * (model.priceModifier - 1.0);
        estPrice += bikeFee;
        if (assign.insuranceSelected) {
          estPrice += model.insurancePrice;
        }
      }
      if (assign.apparelSelected) {
        estPrice += 10.0;
      }
    });

    return estPrice;
  };

  // Auto-fill client name if existing email matches
  useEffect(() => {
    const matched = users.find(u => u.email.toLowerCase() === newApptEmail.trim().toLowerCase());
    if (matched) {
      setNewApptName(matched.name);
    }
  }, [newApptEmail, users]);

  // Sync manual appointments bike selection array size with riders count
  useEffect(() => {
    setNewApptBikes(prev => {
      const next = [...prev];
      if (next.length < newApptRiders) {
        for (let i = next.length; i < newApptRiders; i++) {
          next.push({
            modelId: bikeModels[0]?.id || "",
            insuranceSelected: false,
            apparelSelected: false,
            pilotName: "",
            pilotEmail: ""
          });
        }
      } else if (next.length > newApptRiders) {
        next.splice(newApptRiders);
      }
      return next;
    });
  }, [newApptRiders, bikeModels]);

  // Reset appointment form on success
  useEffect(() => {
    if (actionData?.success === "manual_booking_created") {
      setShowApptForm(false);
      setNewApptEmail("");
      setNewApptName("");
      setNewApptSessions(2);
      setNewApptRiders(1);
      setNewApptHours([]);
      setNewApptBikes([]);
      setCustomCost("");
      alert(locale === "en" ? "Appointment successfully booked!" : "Appuntamento registrato con successo!");
    }
  }, [actionData, locale]);

  // Calendar rendering helpers
  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0).getDate();
  const startDayOfWeek = startOfMonth.getDay(); 
  const startIndex = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Mon=0, Sun=6

  const days = [];
  for (let i = 0; i < startIndex; i++) {
    days.push(null);
  }
  for (let i = 1; i <= endOfMonth; i++) {
    days.push(new Date(year, month, i));
  }

  const weekdays = locale === "en" 
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] 
    : ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  const monthNames = locale === "en"
    ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    : ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

  const selectedDayBookings = selectedDate 
    ? bookings.filter(b => b.date === selectedDate) 
    : [];

  const handleEditOverride = (config: typeof dayConfigs[0]) => {
    setSelectedDate(config.date);
    setIsAvailable(config.isAvailable);
    setMaxCapacityPerSlot(config.maxCapacityPerSlot);
    setCustomPriceModifier(config.customPriceModifier?.toString() || "");
    setNotes(config.notes || "");
    setActiveTab("overrides");
  };

  const getSlotCapacityLeft = (hour: string, forDate: string) => {
    const dayConf = dayConfigs.find(dc => dc.date === forDate);
    const maxCap = dayConf ? dayConf.maxCapacityPerSlot : 5;
    
    let booked = 0;
    bookings
      .filter(b => b.date === forDate)
      .forEach(b => {
        const hours = b.hours.split(",").map(h => h.trim());
        if (hours.includes(hour)) {
          booked += b.peopleCount;
        }
      });
    return Math.max(0, maxCap - booked);
  };

  const getAvailableBikesCountForModelOnDate = (modelName: string, forDate: string) => {
    // Check which specific bikes of this model are booked on this date
    let bookedCount = 0;
    bookings
      .filter(b => b.date === forDate)
      .forEach(b => {
        b.bikes.forEach(bb => {
          if (bb.bike.model.model === modelName) {
            bookedCount++;
          }
        });
      });

    const totalModelBikes = bikes.filter(b => b.model.model === modelName).length;
    return Math.max(0, totalModelBikes - bookedCount);
  };

  const getDayConfigClass = (dateStr: string) => {
    const config = dayConfigs.find(dc => dc.date === dateStr);
    if (config && !config.isAvailable) return "border-red-950 bg-red-950/5 hover:bg-red-950/10";
    if (config && config.customPriceModifier) return "border-orange-900 bg-orange-950/5 hover:bg-orange-950/10";
    return "border-slate-850 hover:border-slate-800";
  };

  return (
    <div className="space-y-10">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-orange-500 font-mono">
            {locale === "en" ? "Operations Hub" : "Operazioni e Calendario"}
          </span>
          <h1 className="text-3xl font-black uppercase text-white tracking-tight mt-1">
            {locale === "en" ? "Calendar & Capacity" : "Calendario e Turni Pista"}
          </h1>
        </div>

        {/* Tab switch buttons */}
        <div className="flex space-x-2 bg-slate-900/80 p-1 border border-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab("appointments")}
            className={`flex items-center space-x-1.5 px-4.5 py-2.5 rounded-lg text-xs font-extrabold uppercase transition-all cursor-pointer ${
              activeTab === "appointments"
                ? "bg-orange-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            <span>{locale === "en" ? "Internal Scheduler" : "Agenda Appuntamenti"}</span>
          </button>
          <button
            onClick={() => setActiveTab("overrides")}
            className={`flex items-center space-x-1.5 px-4.5 py-2.5 rounded-lg text-xs font-extrabold uppercase transition-all cursor-pointer ${
              activeTab === "overrides"
                ? "bg-orange-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <CalendarCheck className="h-4 w-4" />
            <span>{locale === "en" ? "Capacity Controls" : "Regole Capacità"}</span>
          </button>
        </div>
      </div>

      {/* Action status notification */}
      {actionData?.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 flex items-start space-x-3 text-xs text-red-400 animate-shake">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <span className="block font-bold uppercase">{locale === "en" ? "Error processing request" : "Errore nella richiesta"}</span>
            <p className="mt-1 leading-normal font-light">{actionData.error}</p>
          </div>
        </div>
      )}

      {/* TAB 1: Appointments / Month Grid Scheduler */}
      {activeTab === "appointments" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left: Monthly Calendar grid */}
          <div className="lg:col-span-2 bg-slate-900/60 border border-slate-850 p-6 sm:p-8 rounded-3xl shadow-xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-850 pb-4">
              <div>
                <h3 className="text-base font-extrabold uppercase text-white flex items-center space-x-2">
                  <CalendarIcon className="h-4.5 w-4.5 text-orange-500" />
                  <span>{monthNames[month]} {year}</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  {locale === "en" ? "Click any day to view bookings and manage scheduler" : "Seleziona un giorno per vedere i dettagli e inserire appuntamenti"}
                </p>
              </div>

              <div className="flex space-x-1.5">
                <button
                  onClick={handlePrevMonth}
                  className="h-8 w-8 flex items-center justify-center bg-slate-950 border border-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="h-8 w-8 flex items-center justify-center bg-slate-950 border border-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-2">
              {weekdays.map(d => (
                <div key={d} className="text-center text-[10px] font-extrabold uppercase text-slate-500 py-1.5 tracking-wider font-mono">
                  {d}
                </div>
              ))}
              {days.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className="bg-slate-950/20 rounded-xl h-22 border border-transparent" />;
                }
                const dateStr = day.toISOString().split("T")[0];
                const isSelected = selectedDate === dateStr;
                const isToday = new Date().toISOString().split("T")[0] === dateStr;
                const dayBookings = bookings.filter(b => b.date === dateStr);
                const dayConfig = dayConfigs.find(dc => dc.date === dateStr);
                const isClosed = dayConfig && !dayConfig.isAvailable;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => {
                      setSelectedDate(dateStr);
                      setShowApptForm(false);
                    }}
                    className={`h-22 bg-slate-950/80 hover:bg-slate-900 border p-2 rounded-xl text-left flex flex-col justify-between transition-all cursor-pointer ${
                      isSelected 
                        ? "border-orange-500 ring-1 ring-orange-500/20 bg-slate-900/60" 
                        : getDayConfigClass(dateStr)
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className={`text-[10px] font-mono font-bold ${
                        isToday 
                          ? "bg-orange-600 text-white h-4.5 w-4.5 rounded flex items-center justify-center" 
                          : isClosed
                            ? "text-red-500"
                            : "text-slate-400"
                      }`}>
                        {day.getDate()}
                      </span>
                      {isClosed && (
                        <span className="text-[7px] font-black uppercase text-red-500 tracking-wider">
                          ✕
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-1 w-full overflow-hidden">
                      {dayBookings.length > 0 && (
                        (() => {
                          const hasPending = dayBookings.some(b => b.status === "PENDING");
                          return (
                            <div className={`border text-[8px] font-black uppercase px-1 py-0.5 rounded text-center truncate tracking-wide ${
                              hasPending
                                ? "bg-amber-600/10 border-amber-500/20 text-amber-400"
                                : "bg-orange-600/10 border-orange-500/20 text-orange-400"
                            }`}>
                              {dayBookings.length} {locale === "en" ? (hasPending ? "Pending" : "Bookings") : (hasPending ? "In attesa" : "Riserve")}
                            </div>
                          );
                        })()
                      )}
                      {dayConfig?.notes && !dayBookings.length && (
                        <div className="text-[7.5px] text-slate-500 italic truncate text-center" title={dayConfig.notes}>
                          {dayConfig.notes}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Selected Date Detail List / Form Scheduler */}
          <div className="space-y-6">
            
            {selectedDate ? (
              <div className="bg-slate-900/60 border border-slate-850 p-6 sm:p-8 rounded-3xl shadow-xl space-y-6">
                
                {/* Header info */}
                <div className="flex justify-between items-start border-b border-slate-850 pb-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-widest font-mono">{selectedDate}</span>
                    <h3 className="text-base font-extrabold uppercase text-white mt-0.5">
                      {locale === "en" ? "Day Planner" : "Programma Giorno"}
                    </h3>
                  </div>

                  {!showApptForm && (
                    <button
                      onClick={() => setShowApptForm(true)}
                      className="flex items-center space-x-1 bg-orange-600 text-white text-[10px] font-black uppercase px-3 py-2 rounded-lg hover:bg-orange-500 transition-all cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{locale === "en" ? "Appointment" : "Appuntamento"}</span>
                    </button>
                  )}
                </div>

                {/* Form to book manually */}
                {showApptForm ? (
                  <Form method="post" className="space-y-5">
                    <input type="hidden" name="intent" value="create_booking" />
                    <input type="hidden" name="date" value={selectedDate} />

                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-orange-400 uppercase tracking-wide">{locale === "en" ? "New Appointment Form" : "Nuovo Appuntamento"}</span>
                      <button
                        type="button"
                        onClick={() => setShowApptForm(false)}
                        className="text-[10px] font-extrabold uppercase text-slate-500 hover:text-white transition-colors cursor-pointer"
                      >
                        {locale === "en" ? "Cancel" : "Annulla"}
                      </button>
                    </div>

                    {/* Email Selection with datalist suggestions */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                        {locale === "en" ? "Client Email" : "Email Cliente"}
                      </label>
                      <input
                        type="email"
                        name="email"
                        required
                        list="users-datalist"
                        value={newApptEmail}
                        onChange={(e) => setNewApptEmail(e.target.value)}
                        placeholder="customer@email.com"
                        className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-2.5 px-3.5 outline-none text-xs"
                      />
                      <datalist id="users-datalist">
                        {users.map(u => (
                          <option key={u.id} value={u.email}>{u.name}</option>
                        ))}
                      </datalist>
                    </div>

                    {/* Client Name */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                        {locale === "en" ? "Client Name" : "Nome Cliente"}
                      </label>
                      <input
                        type="text"
                        name="name"
                        required
                        value={newApptName}
                        onChange={(e) => setNewApptName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-2.5 px-3.5 outline-none text-xs"
                      />
                    </div>

                    {/* Crew & Sessions counts row */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                          {locale === "en" ? "Riders" : "Piloti"}
                        </label>
                        <select
                          value={newApptRiders}
                          name="ridersCount"
                          onChange={(e) => setNewApptRiders(parseInt(e.target.value, 10))}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 text-white rounded-xl py-2.5 px-3 outline-none text-xs font-bold"
                        >
                          {[1, 2, 3, 4, 5].map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                          {locale === "en" ? "Sessions" : "Turni"}
                        </label>
                        <select
                          value={newApptSessions}
                          name="sessionsCount"
                          onChange={(e) => setNewApptSessions(parseInt(e.target.value, 10))}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 text-white rounded-xl py-2.5 px-3 outline-none text-xs font-bold"
                        >
                          {[1, 2, 3, 4, 5, 6].map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Hour Slots selection */}
                    <div className="space-y-2">
                      <label className="block text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                        {locale === "en" ? "Time Slots" : "Turni Orari"}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {timeSlots.map((slot) => {
                          const isSelected = newApptHours.includes(slot.time);
                          const capacityLeft = getSlotCapacityLeft(slot.time, selectedDate);
                          const isFull = capacityLeft <= 0 && !isSelected;

                          return (
                            <button
                              key={slot.id}
                              type="button"
                              disabled={isFull}
                              onClick={() => {
                                if (isSelected) {
                                  setNewApptHours(newApptHours.filter(h => h !== slot.time));
                                } else {
                                  setNewApptHours([...newApptHours, slot.time]);
                                }
                              }}
                              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer flex flex-col items-center ${
                                isSelected 
                                  ? "bg-orange-600 border-transparent text-white"
                                  : isFull
                                    ? "bg-slate-950/40 border-slate-900 text-slate-600 opacity-40 cursor-not-allowed select-none"
                                    : "bg-slate-950 border-slate-850 text-slate-400 hover:text-white"
                              }`}
                            >
                              <span>{slot.time}</span>
                              <span className="text-[7.5px] font-normal uppercase tracking-wider block mt-0.5 opacity-60">
                                {isFull ? "FULL" : `${capacityLeft} Spot`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <input type="hidden" name="selectedHours" value={newApptHours.join(",")} />
                    </div>

                    {/* Rider details & Bike model assignments loops */}
                    <div className="space-y-4 pt-4 border-t border-slate-850">
                      <span className="block text-[10px] uppercase text-slate-500 font-extrabold tracking-wider">{locale === "en" ? "Rider Customization" : "Configurazione Piloti"}</span>
                      {newApptBikes.map((bikeAssign, idx) => {
                        return (
                          <div key={idx} className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 space-y-4 text-xs">
                            <span className="block font-black text-orange-500 uppercase tracking-wide text-[10px]">
                              {locale === "en" ? `Rider #${idx + 1}` : `Pilota #${idx + 1}`}
                            </span>

                            {/* Pilot Name input */}
                            <div className="space-y-1">
                              <label className="block text-[9px] uppercase text-slate-500 font-bold">{locale === "en" ? "Name" : "Nome"}</label>
                              <input
                                type="text"
                                placeholder={idx === 0 ? newApptName : `Rider #${idx + 1}`}
                                value={bikeAssign.pilotName}
                                onChange={(e) => {
                                  const updated = [...newApptBikes];
                                  updated[idx].pilotName = e.target.value;
                                  setNewApptBikes(updated);
                                }}
                                className="w-full bg-slate-900 border border-slate-850 text-white rounded-lg py-2 px-3 outline-none text-xs"
                              />
                            </div>

                            {/* Bike model selector */}
                            <div className="space-y-1">
                              <label className="block text-[9px] uppercase text-slate-500 font-bold">{locale === "en" ? "Ohvale Model" : "Modello Ohvale"}</label>
                              <select
                                value={bikeAssign.modelId}
                                onChange={(e) => {
                                  const updated = [...newApptBikes];
                                  updated[idx].modelId = e.target.value;
                                  setNewApptBikes(updated);
                                }}
                                className="w-full bg-slate-900 border border-slate-850 text-white rounded-lg py-2 px-2.5 outline-none text-xs font-bold"
                              >
                                {bikeModels.map(model => {
                                  const availCount = getAvailableBikesCountForModelOnDate(model.model, selectedDate);
                                  return (
                                    <option key={model.id} value={model.id}>
                                      {model.name} (Mod: x{model.priceModifier.toFixed(1)}, Avail: {availCount})
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            {/* Addons checks */}
                            <div className="flex space-x-4 pt-1.5 text-[10px]">
                              <label className="flex items-center space-x-2 text-slate-400 hover:text-white cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={bikeAssign.insuranceSelected}
                                  onChange={() => {
                                    const updated = [...newApptBikes];
                                    updated[idx].insuranceSelected = !updated[idx].insuranceSelected;
                                    setNewApptBikes(updated);
                                  }}
                                  className="rounded text-orange-500 focus:ring-0 focus:ring-offset-0 bg-slate-900 border-slate-850 h-3.5 w-3.5"
                                />
                                <span>{locale === "en" ? "Crash Insurance" : "Kasko Danni"}</span>
                              </label>

                              <label className="flex items-center space-x-2 text-slate-400 hover:text-white cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={bikeAssign.apparelSelected}
                                  onChange={() => {
                                    const updated = [...newApptBikes];
                                    updated[idx].apparelSelected = !updated[idx].apparelSelected;
                                    setNewApptBikes(updated);
                                  }}
                                  className="rounded text-orange-500 focus:ring-0 focus:ring-offset-0 bg-slate-900 border-slate-850 h-3.5 w-3.5"
                                />
                                <span>{locale === "en" ? "Apparel Rental" : "Abbigliamento"}</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                      <input type="hidden" name="bikesAssignment" value={JSON.stringify(newApptBikes)} />
                    </div>

                    {/* Price Estimation and Custom Cost */}
                    <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 space-y-4">
                      <div className="flex justify-between items-center text-xs border-b border-slate-900 pb-2">
                        <span className="font-bold text-slate-400 uppercase tracking-wide">
                          {locale === "en" ? "Pricing Summary" : "Riepilogo Prezzi"}
                        </span>
                        <span className="text-slate-500 font-mono text-[9px] flex items-center space-x-1">
                          <Euro className="h-3 w-3" />
                          <span>EUR (€)</span>
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-baseline py-1">
                        <span className="text-xs text-slate-400">
                          {locale === "en" ? "Calculated Standard Price:" : "Prezzo Standard Calcolato:"}
                        </span>
                        <span className="text-sm font-mono font-bold text-slate-400">
                          €{getEstimatedPrice().toFixed(2)}
                        </span>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-slate-900">
                        <label className="block text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                          {locale === "en" ? "Custom Cost Override (Optional)" : "Costo Personalizzato Override (Opzionale)"}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            name="customCost"
                            step="0.01"
                            min="0"
                            placeholder={locale === "en" ? `Use standard price (€${getEstimatedPrice().toFixed(2)})` : `Usa prezzo standard (€${getEstimatedPrice().toFixed(2)})`}
                            value={customCost}
                            onChange={(e) => setCustomCost(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-2.5 px-3.5 outline-none text-xs font-mono"
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal">
                          {locale === "en" 
                            ? "Leave empty to bill the customer the estimated standard price."
                            : "Lascia vuoto per addebitare al cliente il prezzo standard stimato."
                          }
                        </p>
                      </div>
                    </div>

                    {/* Submit appointment action */}
                    <button
                      type="submit"
                      disabled={isSubmitting || newApptHours.length === 0 || !newApptEmail || !newApptName}
                      className="w-full flex items-center justify-center space-x-1.5 bg-orange-600 text-white font-extrabold uppercase text-xs py-3.5 rounded-xl hover:bg-orange-500 shadow-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Save className="h-4 w-4" />
                      <span>{locale === "en" ? "Create Reservation" : "Conferma Appuntamento"}</span>
                    </button>
                  </Form>
                ) : (
                  /* Standard Bookings view for this day */
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                        {locale === "en" ? `Bookings (${selectedDayBookings.length})` : `Prenotazioni (${selectedDayBookings.length})`}
                      </span>
                    </div>

                    {selectedDayBookings.length === 0 ? (
                      <div className="p-10 text-center space-y-3 border border-dashed border-slate-800 rounded-2xl bg-slate-950/30">
                        <FileText className="h-8 w-8 text-slate-700 mx-auto" />
                        <h4 className="text-xs font-bold text-slate-400 uppercase">
                          {locale === "en" ? "No Reservations" : "Nessuna Prenotazione"}
                        </h4>
                        <p className="text-[10px] text-slate-600 leading-normal">
                          {locale === "en" ? "No bookings confirmed for this date yet. Create one manually or wait for clients." : "Ancora nessun cliente prenotato in questa data."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3.5 max-h-[400px] overflow-y-auto pr-1">
                        {selectedDayBookings.map((booking) => (
                          <div key={booking.id} className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3 text-xs leading-normal">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="block font-black text-white uppercase truncate max-w-40">{booking.user.name}</span>
                                <span className="block text-[9px] text-slate-500 truncate max-w-40 font-mono mt-0.5">{booking.user.email}</span>
                                {booking.status === "PENDING" && (
                                  <span className="inline-block bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded mt-1">
                                    {locale === "en" ? "Pending" : "In attesa"}
                                  </span>
                                )}
                              </div>
                              <span className="bg-slate-900 border border-slate-850 px-2 py-0.5 text-[9px] text-white font-mono rounded select-none shrink-0 font-extrabold uppercase">
                                €{booking.totalPrice.toFixed(0)}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono border-t border-slate-900 pt-2.5 text-slate-400">
                              <span className="flex items-center space-x-1.5">
                                <Users className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                <span>{booking.peopleCount} {booking.peopleCount === 1 ? "Pilota" : "Piloti"}</span>
                              </span>
                              <span className="flex items-center space-x-1.5">
                                <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                <span className="truncate" title={booking.hours}>{booking.hours}</span>
                              </span>
                            </div>

                            {/* Bikes allocated info list */}
                            <div className="space-y-1.5 pt-2 border-t border-slate-900">
                              {booking.bikes.map((bb, index) => (
                                <div key={bb.id} className="bg-slate-900/60 p-2 rounded border border-slate-900 flex justify-between items-center text-[10px] text-slate-300">
                                  <span>{index + 1}. {bb.pilotName}: {bb.bike.model.name}</span>
                                  {bb.insuranceSelected && (
                                    <span className="bg-green-500/10 text-green-400 text-[8px] font-bold uppercase px-1 rounded">Ass.</span>
                                  )}
                                </div>
                              ))}
                            </div>

                            {booking.status === "PENDING" && (
                              <div className="flex space-x-2 pt-2.5 border-t border-slate-900 mt-2.5">
                                <Form method="post" className="inline w-full">
                                  <input type="hidden" name="bookingId" value={booking.id} />
                                  <input type="hidden" name="date" value={selectedDate} />
                                  <input type="hidden" name="intent" value="confirm_booking" />
                                  <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full text-center text-[8.5px] font-black uppercase py-1.5 bg-green-950/20 hover:bg-green-600 border border-green-500/20 hover:border-transparent text-green-400 hover:text-white rounded transition-all cursor-pointer"
                                  >
                                    {locale === "en" ? "Confirm" : "Conferma"}
                                  </button>
                                </Form>
                                <Form method="post" className="inline w-full">
                                  <input type="hidden" name="bookingId" value={booking.id} />
                                  <input type="hidden" name="date" value={selectedDate} />
                                  <input type="hidden" name="intent" value="cancel_booking" />
                                  <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full text-center text-[8.5px] font-black uppercase py-1.5 bg-red-950/20 hover:bg-red-600 border border-red-500/20 hover:border-transparent text-red-400 hover:text-white rounded transition-all cursor-pointer"
                                    onClick={(e) => {
                                      if (!confirm(locale === "en" ? "Are you sure you want to cancel this booking?" : "Sei sicuro di voler annullare questa prenotazione?")) {
                                        e.preventDefault();
                                      }
                                    }}
                                  >
                                    {locale === "en" ? "Cancel" : "Annulla"}
                                  </button>
                                </Form>
                              </div>
                            )}

                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            ) : (
              <div className="bg-slate-950/60 border border-slate-850 p-10 rounded-3xl text-center space-y-4 shadow-xl">
                <CalendarIcon className="h-10 w-10 text-slate-700 mx-auto animate-pulse" />
                <h4 className="text-xs font-bold text-slate-400 uppercase">
                  {locale === "en" ? "Select Date to Start" : "Seleziona una Data"}
                </h4>
                <p className="text-[11px] text-slate-600 max-w-xs mx-auto leading-relaxed">
                  {locale === "en" 
                    ? "Click on any grid cell day on the left calendar to review detailed schedules or create custom manual appointments."
                    : "Fai clic su un giorno del calendario a sinistra per visualizzare le prenotazioni o aggiungere manualmente appuntamenti."
                  }
                </p>
              </div>
            )}
            
          </div>
        </div>
      )}

      {/* TAB 2: Capacity Overrides (Existing View) */}
      {activeTab === "overrides" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
          
          {/* Overrides Form panel */}
          <div className="bg-slate-900/60 border border-slate-850 p-6 sm:p-8 rounded-3xl shadow-xl space-y-6">
            <div className="border-b border-slate-850 pb-4">
              <h3 className="text-base font-extrabold uppercase text-white">
                {locale === "en" ? "Create / Edit Override" : "Nuova Eccezione Giornaliera"}
              </h3>
              <p className="text-[11px] text-slate-500">
                {locale === "en" ? "Configure parameters for specific dates" : "Configura parametri per date precise"}
              </p>
            </div>

            <Form method="post" className="space-y-5">
              <input type="hidden" name="intent" value="upsert" />

              {/* Target Date */}
              <div>
                <label className="block text-xs uppercase text-slate-500 font-bold tracking-wider mb-2">
                  {locale === "en" ? "Target Date" : "Data Selezionata"}
                </label>
                <input
                  type="date"
                  required
                  name="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-mono"
                />
              </div>

              {/* Paddock Available toggle */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 flex items-center justify-between">
                <div>
                  <span className="block text-xs font-bold text-slate-200 uppercase">
                    {locale === "en" ? "Paddock Operations" : "Stato Paddock"}
                  </span>
                  <span className="text-[10px] text-slate-500 leading-normal block mt-0.5">
                    {locale === "en" ? "Toggle off to fully block all bookings on this date." : "Disattiva per chiudere del tutto la pista e impedire riserve."}
                  </span>
                </div>
                
                <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsAvailable(true)}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                      isAvailable 
                        ? "bg-green-600 text-white" 
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {locale === "en" ? "Open" : "Attivo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAvailable(false)}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                      !isAvailable 
                        ? "bg-red-600 text-white" 
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {locale === "en" ? "Block" : "Chiuso"}
                  </button>
                  <input type="hidden" name="isAvailable" value={isAvailable ? "true" : "false"} />
                </div>
              </div>

              {/* Only display capacity and modifier input if paddock is available */}
              {isAvailable && (
                <>
                  {/* Max capacity per slot */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs uppercase text-slate-500 font-bold tracking-wider">
                        {locale === "en" ? "Slot Participant Capacity" : "Capacità Turno Piloti"}
                      </label>
                      <span className="text-[9px] text-slate-500 uppercase font-mono">
                        {locale === "en" ? "Standard limit is 5" : "Limite standard è 5"}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 bg-slate-950 border border-slate-850 rounded-xl p-1 w-fit">
                      <button
                        type="button"
                        onClick={() => setMaxCapacityPerSlot(Math.max(1, maxCapacityPerSlot - 1))}
                        className="h-9 w-9 flex items-center justify-center text-sm font-bold text-slate-400 hover:text-white transition-colors hover:bg-slate-900 rounded-lg cursor-pointer"
                      >
                        -
                      </button>
                      <span className="text-xs font-extrabold text-white w-6 text-center font-mono">{maxCapacityPerSlot}</span>
                      <button
                        type="button"
                        onClick={() => setMaxCapacityPerSlot(Math.min(10, maxCapacityPerSlot + 1))}
                        className="h-9 w-9 flex items-center justify-center text-sm font-bold text-slate-400 hover:text-white transition-colors hover:bg-slate-900 rounded-lg cursor-pointer"
                      >
                        +
                      </button>
                      <input type="hidden" name="maxCapacityPerSlot" value={maxCapacityPerSlot} />
                    </div>
                  </div>

                  {/* Custom price modifier */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs uppercase text-slate-500 font-bold tracking-wider">
                        {locale === "en" ? "Price Modifier Override" : "Moltiplicatore Prezzo Override"}
                      </label>
                      <span className="text-[9px] text-slate-500 uppercase font-mono">
                        {locale === "en" ? "Optional e.g. 1.25" : "Opzionale es. 1.25"}
                      </span>
                    </div>
                    <input
                      type="number"
                      step="0.05"
                      name="customPriceModifier"
                      value={customPriceModifier}
                      onChange={(e) => setCustomPriceModifier(e.target.value)}
                      placeholder={locale === "en" ? "Standard rate applies" : "Applica prezzo standard"}
                      className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-mono placeholder-slate-700"
                    />
                  </div>
                </>
              )}

              {/* Notes / Event Description */}
              <div>
                <label className="block text-xs uppercase text-slate-500 font-bold tracking-wider mb-2">
                  {locale === "en" ? "Paddock Notes / Event Label" : "Note Paddock / Descrizione Evento"}
                </label>
                <textarea
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Mugello Private Coaching Class, Track closed for corporate maintenance, Holiday rates premium..."
                  className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs leading-relaxed placeholder-slate-700"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate("");
                    setIsAvailable(true);
                    setMaxCapacityPerSlot(5);
                    setCustomPriceModifier("");
                    setNotes("");
                  }}
                  className="text-xs font-bold uppercase text-slate-400 hover:text-white px-4 py-3 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedDate}
                  className="flex items-center space-x-1.5 bg-orange-600 text-white font-extrabold uppercase text-xs px-6 py-3.5 rounded-xl hover:bg-orange-500 shadow-xl transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  <span>{locale === "en" ? "Save Override" : "Salva Regola"}</span>
                </button>
              </div>

            </Form>
          </div>

          {/* Existing Overrides table/grid panel */}
          <div className="lg:col-span-2 bg-slate-900/60 border border-slate-850 p-6 sm:p-8 rounded-3xl shadow-xl space-y-6">
            <div className="border-b border-slate-850 pb-4">
              <h3 className="text-base font-extrabold uppercase text-white flex items-center space-x-2">
                <CalendarDays className="h-5 w-5 text-orange-500" />
                <span>{locale === "en" ? "Active Overrides Inventory" : "Inventario Eccezioni Attive"}</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                {locale === "en" ? "List of all active calendar pricing and capacity overrides" : "Lista di tutte le regole di capacità o prezzo programmate"}
              </p>
            </div>

            {dayConfigs.length === 0 ? (
              <div className="p-16 text-center space-y-4 border border-dashed border-slate-800 rounded-2xl bg-slate-950/40">
                <CalendarCheck className="h-10 w-10 text-slate-700 mx-auto animate-pulse" />
                <h4 className="text-xs font-bold text-slate-400 uppercase">
                  {locale === "en" ? "No Overrides Programmed" : "Nessuna Eccezione Programmata"}
                </h4>
                <p className="text-[11px] text-slate-600 max-w-xs mx-auto">
                  {locale === "en" 
                    ? "Standard operating slots and baseline weekly tariffs are active across all calendar dates."
                    : "Le sessioni orarie e le tariffe base settimanali si applicano regolarmente a tutte le date in calendario."
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {dayConfigs.map((config) => (
                  <div 
                    key={config.id}
                    className={`bg-slate-950 p-5 rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all ${
                      !config.isAvailable 
                        ? "border-red-950/40 bg-red-950/[0.01]" 
                        : "border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    
                    {/* Left: Info details */}
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-extrabold text-sm text-white">{config.date}</span>
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border tracking-wider ${
                          !config.isAvailable
                            ? "bg-red-950/60 text-red-400 border-red-500/10"
                            : "bg-green-950/60 text-green-400 border-green-500/10"
                        }`}>
                          {config.isAvailable ? (locale === "en" ? "Open Operations" : "Paddock Attivo") : (locale === "en" ? "Closed Operations" : "Paddock Chiuso")}
                        </span>
                      </div>

                      {config.isAvailable && (
                        <div className="flex items-center space-x-4 text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">
                          <span className="flex items-center space-x-1">
                            <Users className="h-3.5 w-3.5" />
                            <span>{locale === "en" ? "Capacity" : "Capacità"}: {config.maxCapacityPerSlot} / Slot</span>
                          </span>
                          {config.customPriceModifier && (
                            <span>{locale === "en" ? "Modifier" : "Moltiplicatore"}: x{config.customPriceModifier.toFixed(2)}</span>
                          )}
                        </div>
                      )}

                      {config.notes && (
                        <p className="text-[11px] text-orange-400 font-semibold italic">
                          * {config.notes}
                        </p>
                      )}
                    </div>

                    {/* Right: edit & delete actions */}
                    <div className="flex items-center space-x-4 shrink-0 w-full sm:w-auto justify-end">
                      <button
                        onClick={() => handleEditOverride(config)}
                        className="text-[10px] font-extrabold uppercase text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {locale === "en" ? "Edit" : "Modifica"}
                      </button>

                      <Form method="post" className="inline">
                        <input type="hidden" name="date" value={config.date} />
                        <input type="hidden" name="intent" value="delete" />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="text-[10px] font-extrabold uppercase text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                          onClick={(e) => {
                            if (!confirm(locale === "en" ? "Are you sure you want to delete this custom override? Baseline rules will be restored for this date." : "Sei sicuro di voler rimuovere questa eccezione? Si ripristineranno le regole base per questa data.")) {
                              e.preventDefault();
                            }
                          }}
                        >
                          {locale === "en" ? "Delete" : "Rimuovi"}
                        </button>
                      </Form>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
