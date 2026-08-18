import { useState } from "react";
import { Form, Link, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/bookings";
import { requireAdmin } from "../../utils/auth.server";
import { prisma } from "../../utils/db.server";
import { getLocale } from "../../utils/locale.server";
import { sendBookingConfirmedEmail, sendBookingCancelledEmail } from "../../utils/email.server";
import { translations, type Locale } from "../../utils/translations";
import { isTodayOrFuture } from "../../utils/dates";
import { bikeDisplayName } from "../../utils/bike";
import { 
  Receipt, 
  Search, 
  Calendar, 
  Clock, 
  Users, 
  Flag, 
  ShieldCheck, 
  XCircle, 
  CheckCircle,
  AlertTriangle,
  Bike as BikeIcon,
  Wrench
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const locale = await getLocale(request);

  // All three are independent, so one round trip rather than two.
  const [bookings, fleet, config] = await Promise.all([
    prisma.booking.findMany({
      // Only the columns the table and the reassign control read.
      select: {
        id: true,
        date: true,
        hours: true,
        status: true,
        totalPrice: true,
        peopleCount: true,
        sessionsCount: true,
        bookingType: true,
        championshipType: true,
        bikeAssignmentMode: true,
        bikeSelectionMode: true,
        bikesReviewedAt: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        bikes: {
          select: {
            id: true,
            bikeId: true,
            insuranceSelected: true,
            apparelSelected: true,
            pilotName: true,
            bike: {
              select: {
                id: true,
                alias: true,
                raceNumber: true,
                modelId: true,
                model: { select: { name: true, model: true } },
              },
            },
          },
        },
      },
      orderBy: { date: "desc" },
    }),
    prisma.bike.findMany({
      where: { status: "AVAILABLE" },
      select: {
        id: true,
        alias: true,
        raceNumber: true,
        modelId: true,
        model: { select: { id: true, name: true, model: true } },
      },
      orderBy: [{ raceNumber: "asc" }, { alias: "asc" }],
    }),
    prisma.companyConfig.findUnique({
      where: { id: "single-config" },
      select: { bikeAssignmentMode: true },
    }),
  ]);

  const bikeAssignmentMode = config?.bikeAssignmentMode === "MANUAL" ? "MANUAL" : "AUTO";

  return { bookings, locale, fleet, bikeAssignmentMode };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const bookingId = formData.get("bookingId")?.toString();
  const intent = formData.get("intent")?.toString();

  if (!bookingId) {
    return { error: "Missing reservation ID." };
  }

  if (intent === "cancel") {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" },
    });
    const url = new URL(request.url);
    const requestHost = `${url.protocol}//${url.host}`;
    await sendBookingCancelledEmail(bookingId, requestHost);
    return { success: "Reservation successfully cancelled." };
  }

  if (intent === "reassignBike") {
    const bookingBikeId = formData.get("bookingBikeId")?.toString();
    const newBikeId = formData.get("newBikeId")?.toString();

    if (!bookingBikeId || !newBikeId) {
      return { error: "Missing bike reassignment details." };
    }

    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.bookingBike.findUnique({
          where: { id: bookingBikeId },
          include: { booking: true, bike: true },
        });

        if (!current) throw new Error("That rider slot no longer exists.");
        if (current.bookingId !== bookingId) throw new Error("That rider slot belongs to a different booking.");
        if (current.bikeId === newBikeId) return; // nothing to do

        const replacement = await tx.bike.findUnique({ where: { id: newBikeId } });
        if (!replacement) throw new Error("That bike is not in the fleet.");
        if (replacement.status !== "AVAILABLE") throw new Error("That bike is not available for rental.");

        // Same model only: price was computed from the model's modifier and
        // insurance rate, so swapping across models would invalidate the total.
        if (replacement.modelId !== current.bike.modelId) {
          throw new Error("Pick a bike of the same model, or the booking price would no longer match.");
        }

        // The replacement must be free on this booking's date.
        const clash = await tx.bookingBike.findFirst({
          where: {
            bikeId: newBikeId,
            id: { not: bookingBikeId },
            booking: {
              date: current.booking.date,
              status: { in: ["CONFIRMED", "PENDING"] },
            },
          },
        });
        if (clash) throw new Error("That bike is already assigned on this date.");

        await tx.bookingBike.update({
          where: { id: bookingBikeId },
          data: { bikeId: newBikeId },
        });
        await tx.booking.update({
          where: { id: bookingId },
          data: { bikesReviewedAt: new Date() },
        });
      }, { isolationLevel: "Serializable" });
    } catch (err: any) {
      if (typeof err === "object" && err !== null && err.code === "P2034") {
        return { error: "Someone changed this booking at the same time. Reload and try again." };
      }
      return { error: err?.message || "Could not reassign that bike." };
    }

    return { success: "Bike reassigned." };
  }

  if (intent === "markReviewed") {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { bikesReviewedAt: new Date() },
    });
    return { success: "Bike allocation confirmed." };
  }

  if (intent === "confirm") {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CONFIRMED" },
    });
    const url = new URL(request.url);
    const requestHost = `${url.protocol}//${url.host}`;
    await sendBookingConfirmedEmail(bookingId, requestHost);
    return { success: "Reservation successfully confirmed." };
  }

  return null;
}

export default function AdminBookings() {
  const { bookings, locale, fleet, bikeAssignmentMode } = useLoaderData<typeof loader>();
  const actionData = useActionData() as { error?: string; success?: string } | undefined;
  const t = translations[locale as Locale];

  const isManualMode = bikeAssignmentMode === "MANUAL";

  const pendingReviewCount = bookings.filter(
    (b) => b.status !== "CANCELLED" && b.bikeAssignmentMode === "MANUAL" && !b.bikesReviewedAt
  ).length;

  /**
   * Bikes that could take this rider's place: same model, free on the booking's
   * date, and not already used by another rider on this same booking. The
   * currently assigned bike is always included so the select can show it.
   */
  const getSwapCandidates = (
    bookingId: string,
    bookingDate: string,
    currentBikeId: string,
    currentModelId: string
  ) => {
    const occupied = new Set<string>();
    bookings.forEach((b) => {
      if (b.date !== bookingDate) return;
      if (b.status === "CANCELLED") return;
      b.bikes.forEach((bb) => {
        if (b.id === bookingId && bb.bikeId === currentBikeId) return;
        occupied.add(bb.bikeId);
      });
    });

    return fleet.filter(
      (bike) =>
        bike.modelId === currentModelId &&
        (bike.id === currentBikeId || !occupied.has(bike.id))
    );
  };

  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") || "ALL";
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);

  // Filtering
  const filteredBookings = bookings.filter((b) => {
    const matchesSearch = 
      b.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.date.includes(searchTerm);

    const matchesStatus = statusFilter === "ALL" || b.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8">
      
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-orange-500 font-mono">
            {locale === "en" ? "Reservations Manager" : "Gestione Prenotazioni"}
          </span>
          <h1 className="text-3xl font-black uppercase text-white tracking-tight mt-1">
            {locale === "en" ? "Track Reservations" : "Prenotazioni Pista"}
          </h1>
        </div>
      </div>

      {actionData?.error && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-4 flex items-start space-x-3 text-red-200 text-sm">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p>{actionData.error}</p>
        </div>
      )}

      {actionData?.success && (
        <div className="bg-green-950/40 border border-green-500/30 rounded-2xl p-4 flex items-start space-x-3 text-green-200 text-sm">
          <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
          <p>{actionData.success}</p>
        </div>
      )}

      {isManualMode && pendingReviewCount > 0 && (
        <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start space-x-3 text-amber-200 text-sm">
          <BikeIcon className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p>
            {locale === "en"
              ? `Manual bike assignment is on. ${pendingReviewCount} booking(s) still need their bikes reviewed.`
              : `Assegnazione moto manuale attiva. ${pendingReviewCount} prenotazione/i attendono la verifica delle moto.`}
          </p>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/60 border border-slate-850 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 shadow-xl">
        
        {/* Search */}
        <div className="relative w-full md:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4.5 w-4.5 text-slate-500" />
          </div>
          <input
            type="text"
            placeholder={locale === "en" ? "Search by racer, email, booking ID or date..." : "Cerca per pilota, email, ID riserva o data..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-2.5 pl-10 pr-4 shadow-inner placeholder-slate-600 transition-all text-xs outline-none"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto">
          {["ALL", "PENDING", "CONFIRMED", "CANCELLED"].map((status) => {
            const statusLabel = 
              status === "ALL" && locale === "it" ? "TUTTE" 
              : status === "PENDING" && locale === "it" ? "IN ATTESA"
              : status === "CONFIRMED" && locale === "it" ? "CONFERMATE" 
              : status === "CANCELLED" && locale === "it" ? "ANNULLATE" 
              : status;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider border transition-all cursor-pointer ${
                  statusFilter === status
                    ? "bg-orange-600 border-transparent text-white shadow-md shadow-orange-600/10"
                    : "bg-slate-950 border-slate-880 text-slate-400 hover:text-white"
                }`}
              >
                {statusLabel}
              </button>
            );
          })}
        </div>

      </div>

      {/* Datagrid bookings list */}
      <div className="bg-slate-900/60 border border-slate-850 rounded-3xl shadow-xl overflow-hidden">
        {filteredBookings.length === 0 ? (
          <div className="p-16 text-center space-y-4">
            <Receipt className="h-12 w-12 text-slate-700 mx-auto animate-pulse" />
            <h3 className="text-sm font-bold text-slate-400 uppercase">
              {locale === "en" ? "No Reservations Found" : "Nessuna Prenotazione Trovata"}
            </h3>
            <p className="text-xs text-slate-600 max-w-xs mx-auto">
              {locale === "en" ? "No reservations matching your parameters are registered in the paddock database." : "Nessuna prenotazione trovata nel database paddock."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-400">
              <thead className="bg-slate-950 text-slate-500 uppercase font-bold tracking-widest border-b border-slate-900">
                <tr>
                  <th className="px-6 py-4">{locale === "en" ? "Racer" : "Pilota"}</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">{locale === "en" ? "Sessions" : "Turni"}</th>
                  <th className="px-6 py-4">{locale === "en" ? "Operating Hours" : "Orari Sessione"}</th>
                  <th className="px-6 py-4">{locale === "en" ? "Allocated Ohvale GPs" : "Ohvale GP Assegnate"}</th>
                  <th className="px-6 py-4">{locale === "en" ? "Grand Total" : "Prezzo Totale"}</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/60">
                {filteredBookings.map((booking) => {
                  const isCancelled = booking.status === "CANCELLED";
                  const isConfirmed = booking.status === "CONFIRMED";
                  const isFutureDate = isTodayOrFuture(booking.date);

                  return (
                    <tr 
                      key={booking.id} 
                      className={`hover:bg-slate-850/20 transition-colors ${
                        isCancelled ? "opacity-65 bg-red-950/[0.02]" : ""
                      }`}
                    >
                      {/* Customer details */}
                      <td className="px-6 py-4">
                        <div className="space-y-0.5">
                          <span className="block font-black text-white uppercase">{booking.user.name}</span>
                          <span className="block text-[10px] text-slate-500 font-mono">{booking.user.email}</span>
                          <span className="block text-[8px] text-slate-600 font-mono uppercase tracking-widest">{booking.id}</span>
                          
                          {/* Booking format details badge */}
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                              booking.bookingType === "CHAMPIONSHIP"
                                ? "bg-purple-950/60 text-purple-400 border border-purple-500/10"
                                : "bg-blue-950/60 text-blue-400 border border-blue-500/10"
                            }`}>
                              {booking.bookingType === "CHAMPIONSHIP" 
                                ? `${booking.championshipType}`
                                : "Standard"}
                            </span>
                            <span className="text-[8px] font-black bg-slate-950 text-slate-400 border border-slate-900 uppercase px-1.5 py-0.5 rounded">
                              {booking.bikeSelectionMode === "FIXED" ? (locale === "en" ? "Fixed Grid" : "Monomarca") : (locale === "en" ? "Mixed Grid" : "Griglia Mista")}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-6 py-4 font-mono font-extrabold text-white">{booking.date}</td>

                      {/* Sessions count / riders */}
                      <td className="px-6 py-4">
                        <div className="space-y-0.5">
                          <span className="block font-bold text-white">
                            {booking.bookingType === "CHAMPIONSHIP"
                              ? `${booking.sessionsCount} Turni (GP)`
                              : `${booking.sessionsCount} Turni`}
                          </span>
                          <span className="block text-[10px] text-slate-500 uppercase">
                            {booking.peopleCount} {booking.peopleCount === 1 ? "Pilota" : "Piloti"}
                          </span>
                        </div>
                      </td>

                      {/* Hours */}
                      <td className="px-6 py-4 font-mono text-orange-400 font-bold">{booking.hours}</td>

                      {/* Assigned bikes with insurance indicator */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 max-w-xs">
                          {booking.bikes.map((bb, idx) => (
                            <div key={bb.id} className="bg-slate-950 text-slate-300 border border-slate-900 text-[10px] px-2 py-1.5 rounded font-medium space-y-1.5">
                             <div className="flex justify-between items-center gap-2">
                              <span className="truncate flex items-center space-x-1">
                                <Flag className="h-3 w-3 text-orange-500 shrink-0" />
                                <span className="truncate font-bold text-white">{bikeDisplayName(bb.bike)}</span>
                                <span className="truncate text-slate-500">{bb.bike.model.name}</span>
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {bb.insuranceSelected ? (
                                  <span className="text-[8px] bg-green-500/10 border border-green-500/20 text-green-400 font-bold uppercase px-1.5 py-0.5 rounded">
                                    {t.coverEnabled}
                                  </span>
                                ) : (
                                  <span className="text-[8px] text-slate-600 uppercase font-mono">{t.noCover}</span>
                                )}
                                {bb.apparelSelected && (
                                  <span className="text-[8px] bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold uppercase px-1.5 py-0.5 rounded">
                                    {locale === "en" ? "Apparel" : "Abbigliamento"}
                                  </span>
                                )}
                              </div>
                             </div>

                             {!isCancelled && (() => {
                               const candidates = getSwapCandidates(booking.id, booking.date, bb.bikeId, bb.bike.modelId);
                               if (candidates.length <= 1) return null;
                               return (
                                 <Form method="post" className="flex items-center gap-1">
                                   <input type="hidden" name="intent" value="reassignBike" />
                                   <input type="hidden" name="bookingId" value={booking.id} />
                                   <input type="hidden" name="bookingBikeId" value={bb.id} />
                                   <Wrench className="h-3 w-3 text-slate-600 shrink-0" />
                                   <select
                                     name="newBikeId"
                                     defaultValue={bb.bikeId}
                                     disabled={isSubmitting}
                                     onChange={(e) => e.currentTarget.form?.requestSubmit()}
                                     className="w-full bg-slate-900 border border-slate-800 text-[10px] text-slate-200 rounded px-1.5 py-1 outline-none focus:border-orange-500 cursor-pointer disabled:opacity-50"
                                     title={locale === "en" ? "Reassign this rider's bike" : "Riassegna la moto di questo pilota"}
                                   >
                                     {candidates.map((bike) => (
                                       <option key={bike.id} value={bike.id}>
                                         {bikeDisplayName(bike)}
                                       </option>
                                     ))}
                                   </select>
                                 </Form>
                               );
                             })()}
                            </div>
                          ))}

                          {isManualMode && !isCancelled && (
                            booking.bikesReviewedAt ? (
                              <span className="text-[9px] text-green-500 uppercase font-bold flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                {locale === "en" ? "Bikes reviewed" : "Moto verificate"}
                              </span>
                            ) : (
                              <Form method="post">
                                <input type="hidden" name="intent" value="markReviewed" />
                                <input type="hidden" name="bookingId" value={booking.id} />
                                <button
                                  type="submit"
                                  disabled={isSubmitting}
                                  className="w-full text-[9px] font-extrabold uppercase px-2 py-1.5 bg-amber-950/30 hover:bg-amber-600 border border-amber-500/30 hover:border-transparent text-amber-400 hover:text-white rounded transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
                                >
                                  <BikeIcon className="h-3 w-3" />
                                  {locale === "en" ? "Confirm bikes" : "Conferma moto"}
                                </button>
                              </Form>
                            )
                          )}
                        </div>
                      </td>

                      {/* Price */}
                      <td className="px-6 py-4 font-extrabold text-white">€{booking.totalPrice.toFixed(2)}</td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border tracking-wider ${
                          isCancelled
                            ? "bg-red-950/60 text-red-400 border-red-500/10"
                            : booking.status === "PENDING"
                              ? "bg-amber-950/60 text-amber-400 border-amber-500/10"
                              : "bg-green-950/60 text-green-400 border-green-500/10"
                        }`}>
                          {booking.status === "CONFIRMED" && locale === "it" 
                            ? "CONFERMATO" 
                            : booking.status === "CANCELLED" && locale === "it" 
                              ? "ANNULLATO" 
                              : booking.status === "PENDING" && locale === "it"
                                ? "IN ATTESA"
                                : booking.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right flex items-center justify-end space-x-2">
                        <Link
                          to={`/order/${booking.id}`}
                          className="text-[9px] font-extrabold uppercase px-3 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-lg transition-all text-center"
                        >
                          {locale === "en" ? "Manage" : "Gestisci"}
                        </Link>
                        {booking.status === "PENDING" && isFutureDate && (
                          <Form method="post" className="inline">
                            <input type="hidden" name="bookingId" value={booking.id} />
                            <input type="hidden" name="intent" value="confirm" />
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="text-[9px] font-extrabold uppercase px-3 py-1.5 bg-green-950/20 hover:bg-green-650 border border-green-500/20 hover:border-transparent text-green-400 hover:text-white rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                            >
                              {locale === "en" ? "Confirm" : "Conferma"}
                            </button>
                          </Form>
                        )}
                        {(isConfirmed || booking.status === "PENDING") && isFutureDate && (
                          <Form method="post" className="inline">
                            <input type="hidden" name="bookingId" value={booking.id} />
                            <input type="hidden" name="intent" value="cancel" />
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="text-[9px] font-extrabold uppercase px-3 py-1.5 bg-red-950/20 hover:bg-red-600 border border-red-500/20 hover:border-transparent text-red-400 hover:text-white rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                              onClick={(e) => {
                                if (!confirm(t.cancellationConfirm)) {
                                  e.preventDefault();
                                }
                              }}
                            >
                              {locale === "en" ? "Cancel" : "Annulla"}
                            </button>
                          </Form>
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
