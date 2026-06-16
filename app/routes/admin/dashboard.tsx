import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/dashboard";
import { requireAdmin } from "../../utils/auth.server";
import { prisma } from "../../utils/db.server";
import { getLocale } from "../../utils/locale.server";
import { translations, type Locale } from "../../utils/translations";
import { 
  TrendingUp, 
  DollarSign, 
  Receipt, 
  Flag, 
  Activity,
  AlertTriangle,
  Calendar,
  Users,
  Clock,
  ArrowRight
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const locale = await getLocale(request);

  // 1. Core aggregates
  const bookings = await prisma.booking.findMany({
    where: { status: "CONFIRMED" },
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
    orderBy: { createdAt: "desc" },
  });

  const bikes = await prisma.bike.findMany({});
  const customersCount = await prisma.user.count({ where: { role: "CUSTOMER" } });

  // 2. Revenue calculation
  const totalRevenue = bookings.reduce((sum, b) => sum + b.totalPrice, 0);

  // 3. Bike status aggregates
  const availableBikes = bikes.filter(b => b.status === "AVAILABLE").length;
  const maintenanceBikes = bikes.filter(b => b.status === "MAINTENANCE").length;
  const retiredBikes = bikes.filter(b => b.status === "RETIRED").length;

  // 4. Booking rates per weekday (for custom SVG chart)
  const weekdayBookingsCount = Array(7).fill(0);
  const weekdayRevenue = Array(7).fill(0);

  bookings.forEach((b) => {
    const parsedDate = new Date(b.date);
    const day = parsedDate.getDay(); // 0 = Sun, 1 = Mon ...
    weekdayBookingsCount[day]++;
    weekdayRevenue[day] += b.totalPrice;
  });

  // Latest 5 bookings
  const latestBookings = bookings.slice(0, 5);

  const pendingBookingsCount = await prisma.booking.count({
    where: { status: "PENDING" }
  });

  return {
    totalRevenue,
    bookingsCount: bookings.length,
    pendingBookingsCount,
    bikesCount: bikes.length,
    customersCount,
    availableBikes,
    maintenanceBikes,
    retiredBikes,
    weekdayBookingsCount,
    weekdayRevenue,
    latestBookings,
    locale
  };
}

export default function AdminDashboard() {
  const {
    totalRevenue,
    bookingsCount,
    bikesCount,
    customersCount,
    availableBikes,
    maintenanceBikes,
    retiredBikes,
    weekdayBookingsCount,
    weekdayRevenue,
    latestBookings,
    pendingBookingsCount,
    locale
  } = useLoaderData<typeof loader>();

  const t = translations[locale as Locale];
  const weekdaysShort = locale === "en" 
    ? ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
    : ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];

  // Custom SVG Bar Chart calculation (Weekday bookings count)
  const maxRevenue = Math.max(...weekdayRevenue, 1);

  return (
    <div className="space-y-10">
      
      {/* Dynamic dashboard greeting */}
      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-orange-500 font-mono">
          {locale === "en" ? "Overview Dashboard" : "Panoramica Generale"}
        </span>
        <h1 className="text-3xl font-black uppercase text-white tracking-tight mt-1">
          {locale === "en" ? "Paddock Overview" : "Stato del Paddock"}
        </h1>
      </div>

      {/* Action alert banner for pending bookings */}
      {pendingBookingsCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 flex items-start space-x-3 text-xs text-amber-400">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1 sm:flex sm:justify-between sm:items-center gap-4">
            <div>
              <span className="block font-bold uppercase">
                {locale === "en" ? "Action Required" : "Azione Richiesta"}
              </span>
              <p className="mt-1 leading-normal font-light">
                {locale === "en"
                  ? `There are ${pendingBookingsCount} bookings awaiting confirmation.`
                  : `Ci sono ${pendingBookingsCount} prenotazioni in attesa di conferma.`}
              </p>
            </div>
            <Link
              to="/admin/bookings?status=PENDING"
              className="mt-3 sm:mt-0 inline-flex items-center space-x-1.5 bg-amber-600 text-white font-extrabold uppercase px-4 py-2.5 rounded-xl hover:bg-amber-500 shadow-xl transition-all text-[10px] shrink-0"
            >
              <span>{locale === "en" ? "Review Bookings" : "Esamina Ora"}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Main Aggregates Widgets Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Revenue */}
        <div className="bg-slate-900/60 border border-slate-850 p-6 rounded-2xl flex items-center justify-between shadow-xl">
          <div className="space-y-1.5">
            <span className="block text-slate-500 uppercase tracking-wider text-[10px] font-bold">
              {locale === "en" ? "Paddock Revenue" : "Fatturato Paddock"}
            </span>
            <span className="block text-3xl font-black text-white">€{totalRevenue.toFixed(0)}</span>
            <span className="block text-[10px] text-slate-400 uppercase font-mono">VAT Inclusive</span>
          </div>
          <div className="h-12 w-12 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-center text-green-400">
            <DollarSign className="h-6 w-6" />
          </div>
        </div>

        {/* Bookings Count */}
        <div className="bg-slate-900/60 border border-slate-850 p-6 rounded-2xl flex items-center justify-between shadow-xl">
          <div className="space-y-1.5">
            <span className="block text-slate-500 uppercase tracking-wider text-[10px] font-bold">
              {locale === "en" ? "Confirmed Sessions" : "Sessioni Confermate"}
            </span>
            <span className="block text-3xl font-black text-white">{bookingsCount}</span>
            <span className="block text-[10px] text-slate-400 uppercase font-mono">
              {locale === "en" ? "Active bookings" : "Prenotazioni attive"}
            </span>
          </div>
          <div className="h-12 w-12 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center text-orange-400">
            <Receipt className="h-6 w-6" />
          </div>
        </div>

        {/* Fleet size */}
        <div className="bg-slate-900/60 border border-slate-850 p-6 rounded-2xl flex items-center justify-between shadow-xl">
          <div className="space-y-1.5">
            <span className="block text-slate-500 uppercase tracking-wider text-[10px] font-bold">
              {locale === "en" ? "Ohvale Fleet size" : "Dimensione Flotta"}
            </span>
            <span className="block text-3xl font-black text-white">{bikesCount}</span>
            <span className="block text-[10px] text-slate-400 uppercase font-mono">
              <span className="text-green-400">{availableBikes} OK</span> / <span className="text-red-400">{maintenanceBikes} {locale === "en" ? "repair" : "in riparazione"}</span>
            </span>
          </div>
          <div className="h-12 w-12 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
            <Flag className="h-6 w-6" />
          </div>
        </div>

        {/* Active customers */}
        <div className="bg-slate-900/60 border border-slate-850 p-6 rounded-2xl flex items-center justify-between shadow-xl">
          <div className="space-y-1.5">
            <span className="block text-slate-500 uppercase tracking-wider text-[10px] font-bold">
              {locale === "en" ? "Active Racers" : "Piloti Attivi"}
            </span>
            <span className="block text-3xl font-black text-white">{customersCount}</span>
            <span className="block text-[10px] text-slate-400 uppercase font-mono">
              {locale === "en" ? "Registered riders" : "Piloti registrati"}
            </span>
          </div>
          <div className="h-12 w-12 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center text-purple-400">
            <Users className="h-6 w-6" />
          </div>
        </div>

      </div>

      {/* Analytics SVG Chart & Fleet status side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* SVG Revenue analytics chart */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-850 p-6 rounded-3xl shadow-xl space-y-6">
          <div className="flex justify-between items-center border-b border-slate-850 pb-4">
            <div className="space-y-0.5">
              <h3 className="text-base font-extrabold uppercase text-white">
                {locale === "en" ? "Revenue Stream per Weekday" : "Fatturato Turni per Giorno"}
              </h3>
              <p className="text-[11px] text-slate-500">
                {locale === "en" ? "Aesthetic SVG aggregate tracking of bookings & revenue distributions" : "Statistiche grafiche SVG dei fatturati paddock"}
              </p>
            </div>
            <span className="flex items-center space-x-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-1 font-bold uppercase tracking-wider">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>{locale === "en" ? "Real-Time" : "Tempo Reale"}</span>
            </span>
          </div>

          {/* SVG canvas */}
          <div className="w-full h-64 bg-slate-950/60 rounded-2xl border border-slate-900 relative overflow-hidden flex items-end p-6">
            
            {/* SVG drawing bars */}
            <svg className="w-full h-full" viewBox="0 0 600 200" preserveAspectRatio="none">
              
              {/* Horizontal grid lines */}
              <line x1="0" y1="50" x2="600" y2="50" stroke="#1e293b" strokeWidth="1" strokeDasharray="4,4" />
              <line x1="0" y1="100" x2="600" y2="100" stroke="#1e293b" strokeWidth="1" strokeDasharray="4,4" />
              <line x1="0" y1="150" x2="600" y2="150" stroke="#1e293b" strokeWidth="1" strokeDasharray="4,4" />

              {weekdayRevenue.map((val, i) => {
                const barWidth = 36;
                const gap = 84;
                const startX = 26 + i * gap;
                const barHeight = Math.max((val / maxRevenue) * 140, 10);
                const startY = 170 - barHeight;

                return (
                  <g key={i}>
                    {/* Glowing bar */}
                    <rect
                      x={startX}
                      y={startY}
                      width={barWidth}
                      height={barHeight}
                      rx="6"
                      fill="url(#orangeGradient)"
                      className="transition-all duration-500 hover:opacity-80"
                    />

                    {/* Numeric Revenue label */}
                    <text
                      x={startX + barWidth / 2}
                      y={startY - 10}
                      fill="#e2e8f0"
                      fontSize="9"
                      fontWeight="black"
                      textAnchor="middle"
                    >
                      €{val.toFixed(0)}
                    </text>

                    {/* Weekday text label */}
                    <text
                      x={startX + barWidth / 2}
                      y="192"
                      fill="#64748b"
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {weekdaysShort[i]}
                    </text>
                  </g>
                );
              })}

              <defs>
                <linearGradient id="orangeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ea580c" />
                  <stop offset="100%" stopColor="#c2410c" stopOpacity="0.4" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Fleet status card */}
        <div className="bg-slate-900/60 border border-slate-850 p-6 rounded-3xl shadow-xl flex flex-col justify-between">
          <div className="space-y-6">
            <div className="border-b border-slate-850 pb-4">
              <h3 className="text-base font-extrabold uppercase text-white">
                {locale === "en" ? "Fleet Status Monitor" : "Stato della Flotta"}
              </h3>
              <p className="text-[11px] text-slate-500">
                {locale === "en" ? "Real-time status indicators of Paddock vehicles" : "Monitoraggio e diagnostica flotta moto"}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center p-3.5 bg-slate-950/80 border border-slate-900 rounded-xl">
                <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-ping" />
                  <span>{locale === "en" ? "Ready / Available" : "Pronta / Disponibile"}</span>
                </div>
                <span className="text-sm font-black text-white">{availableBikes} {locale === "en" ? "bikes" : "moto"}</span>
              </div>

              <div className="flex justify-between items-center p-3.5 bg-slate-950/80 border border-slate-900 rounded-xl">
                <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span>{locale === "en" ? "Maintenance Queue" : "In Manutenzione"}</span>
                </div>
                <span className="text-sm font-black text-orange-400">{maintenanceBikes} {locale === "en" ? "bikes" : "moto"}</span>
              </div>

              <div className="flex justify-between items-center p-3.5 bg-slate-950/80 border border-slate-900 rounded-xl">
                <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-slate-700" />
                  <span>{locale === "en" ? "Retired from Paddock" : "Ritirata / Deposta"}</span>
                </div>
                <span className="text-sm font-black text-slate-500">{retiredBikes} {locale === "en" ? "bikes" : "moto"}</span>
              </div>
            </div>
          </div>

          <Link
            to="/admin/bikes"
            className="w-full flex items-center justify-center space-x-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-850 text-slate-400 hover:text-white font-bold uppercase text-[10px] tracking-wider py-3.5 rounded-xl transition-all mt-6 cursor-pointer"
          >
            <span>{locale === "en" ? "Manage Ohvale Fleet" : "Gestisci Flotta Ohvale"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

      </div>

      {/* Latest Bookings Table */}
      <div className="bg-slate-900/60 border border-slate-850 rounded-3xl shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-850 flex justify-between items-center">
          <div>
            <h3 className="text-base font-extrabold uppercase text-white">
              {locale === "en" ? "Latest Paddock Bookings" : "Ultime Prenotazioni"}
            </h3>
            <p className="text-[11px] text-slate-500">
              {locale === "en" ? "Most recent customer reservations" : "Le riserve più recenti effettuate dai piloti"}
            </p>
          </div>
          <Link
            to="/admin/bookings"
            className="text-[10px] font-extrabold uppercase tracking-wider text-orange-500 hover:underline cursor-pointer"
          >
            {locale === "en" ? "View All Reservations" : "Mostra Tutte"}
          </Link>
        </div>

        {latestBookings.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 uppercase tracking-widest font-mono">
            {locale === "en" ? "No reservations registered yet!" : "Nessuna prenotazione registrata!"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-400">
              <thead className="bg-slate-950 text-slate-500 uppercase font-bold tracking-widest border-b border-slate-900">
                <tr>
                  <th className="px-6 py-4">{locale === "en" ? "Racer / Customer" : "Pilota / Cliente"}</th>
                  <th className="px-6 py-4">{locale === "en" ? "Date" : "Data"}</th>
                  <th className="px-6 py-4">{locale === "en" ? "Hours" : "Orari"}</th>
                  <th className="px-6 py-4">{locale === "en" ? "Allocated Fleet" : "Ohvale GP Assegnate"}</th>
                  <th className="px-6 py-4">{locale === "en" ? "Grand Total" : "Totale Corrisposto"}</th>
                  <th className="px-6 py-4">{locale === "en" ? "Status" : "Stato"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/60">
                {latestBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-850/20 transition-colors">
                    <td className="px-6 py-4">
                      <span className="block font-bold text-white uppercase">{b.user.name}</span>
                      <span className="block text-[10px] text-slate-500 font-mono mt-0.5">{b.user.email}</span>
                    </td>
                    <td className="px-6 py-4 font-mono font-extrabold text-white">{b.date}</td>
                    <td className="px-6 py-4 font-mono text-orange-400">{b.hours}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {b.bikes.map((bb, index) => (
                          <span 
                            key={index}
                            className="bg-slate-950 text-slate-300 border border-slate-800 text-[10px] px-2 py-0.5 rounded font-medium flex items-center space-x-1"
                          >
                            <span>{bb.bike.model.name}</span>
                            {bb.insuranceSelected && (
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500" title="Insured" />
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-extrabold text-white">€{b.totalPrice.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider ${
                        b.status === "PENDING"
                          ? "bg-amber-950/60 text-amber-400 border-amber-500/10"
                          : b.status === "CANCELLED"
                            ? "bg-red-950/60 text-red-400 border-red-500/10"
                            : "bg-green-950/60 text-green-400 border-green-500/10"
                      }`}>
                        {b.status === "CONFIRMED" && locale === "it" 
                          ? "CONFERMATO" 
                          : b.status === "CANCELLED" && locale === "it" 
                            ? "ANNULLATO" 
                            : b.status === "PENDING" && locale === "it"
                              ? "IN ATTESA"
                              : b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
