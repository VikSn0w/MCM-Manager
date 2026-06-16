import { Form, Link, useLoaderData, useNavigation, redirect, useLocation } from "react-router";
import type { Route } from "./+types/dashboard";
import { requireUserId, getUser } from "../utils/auth.server";
import { prisma } from "../utils/db.server";
import { getLocale } from "../utils/locale.server";
import { sendBookingCancelledEmail } from "../utils/email.server";
import { translations, type Locale } from "../utils/translations";
import { 
  Calendar, 
  Flag, 
  ShieldCheck, 
  Clock, 
  Users, 
  AlertTriangle, 
  Flame, 
  LogOut, 
  TrendingUp, 
  Grid,
  CheckCircle,
  Receipt,
  XCircle,
  ShieldAlert,
  ArrowRight
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request, "/login?redirectTo=/dashboard");

  const [user, locale, bookings] = await Promise.all([
    getUser(request),
    getLocale(request),
    prisma.booking.findMany({
      where: {
        OR: [
          { userId },
          {
            bikes: {
              some: {
                pilotUserId: userId
              }
            }
          }
        ]
      },
      include: {
        bikes: {
          include: {
            bike: {
              include: {
                model: true
              }
            },
            pilotUser: {
              select: { name: true, email: true }
            }
          },
        },
      },
      orderBy: { date: "desc" },
    })
  ]);

  if (!user) {
    throw redirect("/login");
  }

  return { user, bookings, locale };
}

export async function action({ request }: Route.ActionArgs) {
  await requireUserId(request);
  const formData = await request.formData();
  const bookingId = formData.get("bookingId")?.toString();
  const intent = formData.get("intent")?.toString();

  if (!bookingId) return { error: "Missing booking ID." };

  if (intent === "cancel") {
    // Check if the booking actually exists and belongs to the user
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      return { error: "Booking not found." };
    }

    // Cancel booking
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" },
    });

    const url = new URL(request.url);
    const requestHost = `${url.protocol}//${url.host}`;
    await sendBookingCancelledEmail(bookingId, requestHost);

    return { success: "Booking successfully cancelled." };
  }

  return null;
}

export default function Dashboard() {
  const { user, bookings, locale } = useLoaderData<typeof loader>();
  const t = translations[locale as Locale];

  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const location = useLocation();
  const currentPath = location.pathname + location.search;

  // Calculate statistics
  const activeBookings = bookings.filter(b => b.status === "CONFIRMED");
  const totalSessions = activeBookings.reduce((sum, b) => sum + b.sessionsCount * b.peopleCount, 0);
  const totalSpent = activeBookings.reduce((sum, b) => sum + b.totalPrice, 0);
  const insuredCount = activeBookings.reduce((sum, b) => {
    const insuredBikes = b.bikes.filter(bb => bb.insuranceSelected).length;
    return sum + insuredBikes;
  }, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans relative overflow-hidden pb-20">
      {/* Background styling */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-950/10 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />

      {/* Header bar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link to="/" className="flex items-center space-x-2.5">
              <div className="bg-orange-600 p-1.5 rounded-lg">
                <Flame className="h-4.5 w-4.5 text-white" />
              </div>
              <span className="text-xl font-black uppercase text-white tracking-tight">
                LEASIO<span className="text-orange-500 font-light">GP</span>
              </span>
            </Link>

            <div className="flex items-center space-x-4">
              {user.role === "ADMIN" && (
                <Link
                  to="/admin"
                  className="bg-orange-600/10 border border-orange-500/20 text-orange-400 font-bold uppercase text-[10px] tracking-wider px-3.5 py-2 rounded-lg hover:bg-orange-500/10 transition-colors"
                >
                  {t.backoffice}
                </Link>
              )}

              <Form method="post" action="/logout">
                <button
                  type="submit"
                  className="bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-lg p-2 transition-colors flex items-center space-x-1.5 text-xs font-bold uppercase cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">{t.logout}</span>
                </button>
              </Form>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 relative z-10">
        
        {/* Welcome row */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500">{t.racerHub}</span>
            <h1 className="text-3xl sm:text-4xl font-black uppercase text-white tracking-tight mt-1">
              {locale === "en" ? "Hi, " : "Ciao, "}{user.name}!
            </h1>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-mono">{t.profileTier}: {user.role}</p>
          </div>

          <Link
            to="/book"
            className="flex items-center space-x-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white font-extrabold uppercase tracking-wider text-xs px-6 py-4 rounded-xl hover:from-orange-500 hover:to-orange-400 shadow-xl shadow-orange-600/20 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span>{t.rentNow}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          
          <div className="bg-slate-900/60 backdrop-blur border border-slate-850 p-6 rounded-2xl">
            <span className="block text-slate-500 uppercase tracking-wider text-[10px] font-bold">{t.activeReservations}</span>
            <span className="text-3xl font-black text-white mt-2 block">{activeBookings.length}</span>
            <span className="text-[10px] text-slate-400 block mt-1 uppercase">{t.upcomingDays}</span>
          </div>

          <div className="bg-slate-900/60 backdrop-blur border border-slate-850 p-6 rounded-2xl">
            <span className="block text-slate-500 uppercase tracking-wider text-[10px] font-bold">{t.totalSessionsCount}</span>
            <span className="text-3xl font-black text-white mt-2 block">{totalSessions}</span>
            <span className="text-[10px] text-slate-400 block mt-1 uppercase">{t.segmentsLogged}</span>
          </div>

          <div className="bg-slate-900/60 backdrop-blur border border-slate-850 p-6 rounded-2xl">
            <span className="block text-slate-500 uppercase tracking-wider text-[10px] font-bold">{t.crashCoverProtection}</span>
            <span className="text-3xl font-black text-green-400 mt-2 block">{insuredCount}</span>
            <span className="text-[10px] text-slate-400 block mt-1 uppercase">{t.insuredOhvales}</span>
          </div>

          <div className="bg-slate-900/60 backdrop-blur border border-slate-850 p-6 rounded-2xl">
            <span className="block text-slate-500 uppercase tracking-wider text-[10px] font-bold">{t.grandInvestment}</span>
            <span className="text-3xl font-black text-orange-500 mt-2 block">€{totalSpent.toFixed(0)}</span>
            <span className="text-[10px] text-slate-400 block mt-1 uppercase">{t.paddockSpend}</span>
          </div>

        </div>

        {/* Bookings Lists */}
        <div className="space-y-6">
          <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center space-x-2">
            <Receipt className="h-5 w-5 text-orange-500" />
            <span>{t.paddockHistory}</span>
          </h2>

          {bookings.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-850 rounded-3xl p-16 text-center space-y-4">
              <Flag className="h-14 w-14 text-slate-700 mx-auto animate-pulse" />
              <h3 className="text-lg font-bold text-slate-300 uppercase">{t.noReservations}</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">{t.noReservationsSub}</p>
              <Link
                to="/book"
                className="inline-block bg-slate-900 hover:bg-slate-850 border border-slate-800 text-orange-500 font-bold uppercase text-xs px-6 py-3.5 rounded-xl transition-colors cursor-pointer"
              >
                {t.buttonBookFirst}
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {bookings.map((booking) => {
                const isCancelled = booking.status === "CANCELLED";
                const isConfirmed = booking.status === "CONFIRMED";
                const isFutureDate = new Date(booking.date) >= new Date();

                return (
                  <div 
                    key={booking.id} 
                    className={`bg-slate-900/60 backdrop-blur border rounded-3xl overflow-hidden shadow-xl relative transition-all ${
                      isCancelled 
                        ? "border-red-950/30 opacity-60" 
                        : "border-slate-800/80 hover:border-slate-700/80"
                    }`}
                  >
                    
                    {/* Header bar of ticket */}
                    <div className={`p-5 flex justify-between items-center ${
                      isCancelled 
                        ? "bg-red-950/20" 
                        : "bg-slate-950/50"
                    }`}>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4.5 w-4.5 text-slate-400" />
                        <span className="font-extrabold text-sm text-white font-mono">{booking.date}</span>
                      </div>

                      {/* Status and sharing badges */}
                      <div className="flex items-center space-x-2">
                        {booking.userId !== user.id && (
                          <span className="text-[9px] bg-blue-950/60 text-blue-400 border border-blue-500/20 font-black uppercase px-2 py-0.5 rounded tracking-wide">
                            {locale === "en" ? "Shared Pass" : "Pass Condiviso"}
                          </span>
                        )}
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border tracking-widest ${
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
                      </div>
                    </div>

                    {/* Receipt parameters */}
                    <div className="p-6 space-y-4">
                      
                      {/* Grid params */}
                      <div className="grid grid-cols-2 gap-y-3.5 text-xs border-b border-slate-850/80 pb-4">
                        <div>
                          <span className="block text-slate-500 uppercase tracking-widest text-[9px]">{t.paddockId}</span>
                          <span className="font-mono font-extrabold text-white mt-0.5 block uppercase">{booking.id}</span>
                        </div>
                        <div>
                          <span className="block text-slate-500 uppercase tracking-widest text-[9px]">{t.grandTotal}</span>
                          <span className="font-extrabold text-white mt-0.5 block">€{booking.totalPrice.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="block text-slate-500 uppercase tracking-widest text-[9px]">{t.riderCrew}</span>
                          <span className="font-extrabold text-white mt-0.5 block">{booking.peopleCount} racer(s)</span>
                        </div>
                        <div>
                          <span className="block text-slate-500 uppercase tracking-widest text-[9px]">{locale === "en" ? "Format & Grid" : "Formato e Griglia"}</span>
                          <span className="font-extrabold text-white mt-0.5 block">
                            {booking.bookingType === "CHAMPIONSHIP"
                              ? `${booking.championshipType}`
                              : "Standard Packs"}
                            {" ("}
                            {booking.bikeSelectionMode === "FIXED" ? (locale === "en" ? "Fixed" : "Monomarca") : (locale === "en" ? "Mixed" : "Misto")}
                            {")"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-slate-500 uppercase tracking-widest text-[9px]">{t.trackSessions}</span>
                          <span className="font-extrabold text-white mt-0.5 block">
                            {locale === "en" 
                              ? `${booking.sessionsCount} Session(s)` 
                              : `${booking.sessionsCount} Turni`}
                          </span>
                        </div>
                        <div>
                          <span className="block text-slate-500 uppercase tracking-widest text-[9px]">{t.operatingHours}</span>
                          <span className="font-extrabold text-orange-400 mt-0.5 block font-mono">{booking.hours}</span>
                        </div>
                      </div>

                      {/* Assigned bikes with crash protection info */}
                      <div className="space-y-2">
                        <span className="block text-[9px] text-slate-500 uppercase tracking-widest font-bold">{t.allocatedFleetLabel}</span>
                        <div className="space-y-1.5">
                          {booking.bikes.map((bb, index) => (
                            <div key={index} className="flex justify-between items-center text-xs bg-slate-950 p-2.5 rounded-lg border border-slate-900">
                              <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                                <Flag className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                <span>{bb.bike.model.name}</span>
                              </span>
                              <div className="flex items-center gap-1.5">
                                {bb.insuranceSelected ? (
                                  <span className="text-[9px] bg-green-500/10 border border-green-500/20 text-green-400 font-bold uppercase px-2 py-0.5 rounded flex items-center space-x-1 shrink-0">
                                    <ShieldCheck className="h-3 w-3" />
                                    <span>{t.coverEnabled} (€{bb.bike.model.insuranceCoverage})</span>
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-slate-600 uppercase font-mono shrink-0">{t.noCover}</span>
                                )}
                                {bb.apparelSelected && (
                                  <span className="text-[9px] bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold uppercase px-2 py-0.5 rounded flex items-center space-x-1 shrink-0">
                                    <span>{locale === "en" ? "Apparel" : "Abbigliamento"}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Booking card actions */}
                      <div className="pt-4 border-t border-slate-850 flex justify-between items-center gap-4">
                        <Link
                          to={`/order/${booking.id}`}
                          className="text-[10px] font-extrabold uppercase px-4 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-750 text-slate-350 hover:text-white rounded-lg transition-all text-center cursor-pointer"
                        >
                          {locale === "en" ? "View Pass / PDF" : "Vedi Pass / PDF"}
                        </Link>

                        {(isConfirmed || booking.status === "PENDING") && isFutureDate && booking.userId === user.id && (
                          <Form method="post">
                            <input type="hidden" name="bookingId" value={booking.id} />
                            <input type="hidden" name="intent" value="cancel" />
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="text-[10px] font-extrabold uppercase px-4 py-2 bg-red-950/20 hover:bg-red-600 border border-red-500/20 hover:border-transparent text-red-400 hover:text-white rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                              onClick={(e) => {
                                if (!confirm(t.cancellationConfirm)) {
                                  e.preventDefault();
                                }
                              }}
                            >
                              {t.buttonCancelReservation}
                            </button>
                          </Form>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>

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
