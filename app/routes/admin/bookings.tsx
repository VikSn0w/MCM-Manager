import { useState } from "react";
import { Form, Link, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/bookings";
import { requireAdmin } from "../../utils/auth.server";
import { prisma } from "../../utils/db.server";
import { getLocale } from "../../utils/locale.server";
import { translations, type Locale } from "../../utils/translations";
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
  AlertTriangle
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const locale = await getLocale(request);

  const bookings = await prisma.booking.findMany({
    include: {
      user: {
        select: { name: true, email: true }
      },
      bikes: {
        include: {
          bike: {
            include: {
              model: true
            }
          }
        }
      }
    },
    orderBy: { date: "desc" },
  });

  return { bookings, locale };
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
    return { success: "Reservation successfully cancelled." };
  }

  return null;
}

export default function AdminBookings() {
  const { bookings, locale } = useLoaderData<typeof loader>();
  const t = translations[locale as Locale];

  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

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
          {["ALL", "CONFIRMED", "CANCELLED"].map((status) => {
            const statusLabel = status === "ALL" && locale === "it" ? "TUTTE" : status === "CONFIRMED" && locale === "it" ? "CONFERMATE" : status === "CANCELLED" && locale === "it" ? "ANNULLATE" : status;
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
                  const isFutureDate = new Date(booking.date) >= new Date();

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
                              ? `${booking.sessionsCount} Sessions (GP)`
                              : `${booking.sessionsCount} Session(s)`}
                          </span>
                          <span className="block text-[10px] text-slate-500 uppercase">{booking.peopleCount} Rider(s)</span>
                        </div>
                      </td>

                      {/* Hours */}
                      <td className="px-6 py-4 font-mono text-orange-400 font-bold">{booking.hours}</td>

                      {/* Assigned bikes with insurance indicator */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 max-w-xs">
                          {booking.bikes.map((bb, idx) => (
                            <div key={idx} className="bg-slate-950 text-slate-300 border border-slate-900 text-[10px] px-2 py-1.5 rounded font-medium flex justify-between items-center gap-2">
                              <span className="truncate flex items-center space-x-1">
                                <Flag className="h-3 w-3 text-orange-500 shrink-0" />
                                <span className="truncate">{bb.bike.model.name}</span>
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
                          ))}
                        </div>
                      </td>

                      {/* Price */}
                      <td className="px-6 py-4 font-extrabold text-white">€{booking.totalPrice.toFixed(2)}</td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border tracking-wider ${
                          isCancelled
                            ? "bg-red-950/60 text-red-400 border-red-500/10"
                            : "bg-green-950/60 text-green-400 border-green-500/10"
                        }`}>
                          {booking.status === "CONFIRMED" && locale === "it" ? "CONFERMATO" : booking.status === "CANCELLED" && locale === "it" ? "ANNULLATO" : booking.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <Link
                          to={`/order/${booking.id}`}
                          className="text-[9px] font-extrabold uppercase px-3 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-lg transition-all inline-block mr-2 text-center"
                        >
                          {locale === "en" ? "Manage" : "Gestisci"}
                        </Link>
                        {isConfirmed && isFutureDate && (
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
                              {locale === "en" ? "Cancel Booking" : "Annulla Prenotazione"}
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
