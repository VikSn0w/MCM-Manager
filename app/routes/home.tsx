import { Link, useLoaderData, Form, useLocation } from "react-router";
import type { Route } from "./+types/home";
import { getUser } from "../utils/auth.server";
import { prisma } from "../utils/db.server";
import { getLocale } from "../utils/locale.server";
import { translations, type Locale } from "../utils/translations";
import { 
  Calendar, 
  Flag, 
  Gauge, 
  ShieldCheck, 
  Users, 
  Flame, 
  Clock, 
  CheckCircle2, 
  ChevronRight, 
  ArrowRight,
  TrendingUp,
  Cpu,
  MapPin
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  const todayStr = new Date().toISOString().split("T")[0];

  const [user, locale, bikeModels, companyConfig, upcomingChampionships] = await Promise.all([
    getUser(request),
    getLocale(request),
    prisma.bikeModel.findMany({
      orderBy: { displacement: "asc" },
    }),
    prisma.companyConfig.findUnique({
      where: { id: "single-config" }
    }).then(conf => conf || {
      companyName: "Leasio Paddock Rentals",
      logoUrl: "/images/ohvale_gp_one_1780331510373.png",
      circuitName: "Autodromo di Franciacorta",
      googleMapsUrl: ""
    }),
    prisma.championship.findMany({
      where: {
        isAvailable: true,
        fixedDate: {
          gte: todayStr
        }
      },
      orderBy: {
        fixedDate: "asc"
      }
    })
  ]);

  return { user, bikes: bikeModels, companyConfig, upcomingChampionships, locale };
}

export function meta({ data }: Route.MetaArgs) {
  const companyName = data?.companyConfig?.companyName || "Leasio Paddock Rentals";
  const circuitName = data?.companyConfig?.circuitName || "Autodromo di Franciacorta";
  return [
    { title: `${companyName} - Premium Ohvale GP Track Rentals` },
    { name: "description", content: `Rent Ohvale GP racing motorcycles for premium track days at ${circuitName}. Fully customizable tariffs, sessions, capacities, and on-track support.` },
  ];
}

const formatDate = (dateStr: string, locale: string) => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === "en" ? "en-US" : "it-IT", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (e) {
    return dateStr;
  }
};

export default function Home() {
  const { user, bikes, companyConfig, upcomingChampionships, locale } = useLoaderData<typeof loader>();
  
  // Show distinct models to prevent cluttering the homepage (max 4 models)
  const displayedBikes = bikes.slice(0, 4);

  const t = translations[locale as Locale];
  const location = useLocation();
  const currentPath = location.pathname + location.search;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-orange-500 selection:text-white">
      {/* Carbon fiber grid lines overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      {/* Sticky Header Navbar */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-3 hover:opacity-90 transition-opacity">
              {companyConfig.logoUrl ? (
                <img 
                  src={companyConfig.logoUrl} 
                  alt={companyConfig.companyName} 
                  className="h-10 w-auto object-contain rounded"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const fallback = document.getElementById("nav-logo-fallback");
                    if (fallback) fallback.classList.remove("hidden");
                  }}
                />
              ) : null}
              <img 
                id="nav-logo-fallback"
                src="/logosmall.png"
                alt="Leasio Logo"
                className={`${companyConfig.logoUrl ? "hidden" : ""} h-8 w-auto object-contain`}
              />
              <span className="text-xl font-black tracking-tighter uppercase text-white">
                {companyConfig.companyName}
              </span>
            </Link>

            {/* Navigation links */}
            <nav className="hidden md:flex space-x-8 text-sm font-bold uppercase tracking-wider text-slate-300">
              <Link to="/#fleet" className="hover:text-orange-500 transition-colors">{t.fleet}</Link>
              <Link to="/academy" className="hover:text-orange-500 transition-colors">
                {locale === "en" ? "Academy" : "Academy"}
              </Link>
              <Link to="/#calendar" className="hover:text-orange-500 transition-colors">
                {locale === "en" ? "Calendar" : "Calendario"}
              </Link>
              {user?.role === "ADMIN" && (
                <Link to="/admin" className="text-orange-400 hover:text-orange-500 transition-colors flex items-center space-x-1">
                  <span>{t.backoffice}</span>
                  <span className="bg-orange-500/20 text-orange-400 text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-orange-500/30 uppercase">{t.staff}</span>
                </Link>
              )}
            </nav>

            {/* Auth / Action Button */}
            <div className="flex items-center space-x-4">
              {user ? (
                <div className="flex items-center space-x-4">
                  <Link 
                    to="/dashboard" 
                    className="hidden sm:inline-block text-sm font-semibold text-slate-400 hover:text-white transition-colors"
                  >
                    Hi, <span className="text-slate-200 underline decoration-orange-500/30">{user.name.split(" ")[0]}</span>
                  </Link>
                  <Link 
                    to="/book" 
                    className="bg-orange-600 text-white font-bold uppercase tracking-wider text-xs px-5 py-3 rounded-lg hover:bg-orange-500 shadow-lg shadow-orange-600/20 transition-all active:scale-[0.98]"
                  >
                    {t.bookNow}
                  </Link>
                  <Form method="post" action="/logout" className="inline">
                    <button 
                      type="submit" 
                      className="text-xs font-bold uppercase text-slate-500 hover:text-red-400 transition-colors"
                    >
                      {t.logout}
                    </button>
                  </Form>
                </div>
              ) : (
                <div className="flex items-center space-x-4">
                  <Link 
                    to="/login" 
                    className="text-sm font-bold uppercase tracking-wider text-slate-300 hover:text-white transition-colors"
                  >
                    {t.signIn}
                  </Link>
                  <Link 
                    to="/book" 
                    className="bg-orange-600 text-white font-bold uppercase tracking-wider text-xs px-5 py-3 rounded-lg hover:bg-orange-500 shadow-lg shadow-orange-600/20 transition-all active:scale-[0.98]"
                  >
                    {t.rentNow}
                  </Link>
                </div>
              )}

              {/* Language Switcher */}
              <Form method="post" action="/locale" className="inline-flex">
                <input type="hidden" name="redirectTo" value={currentPath} />
                <button 
                  type="submit" 
                  name="locale" 
                  value={locale === "en" ? "it" : "en"}
                  className="text-xs font-extrabold uppercase text-slate-400 hover:text-orange-500 border border-slate-800 hover:border-orange-500/25 bg-slate-900/40 rounded-xl px-3 py-2 transition-all flex items-center space-x-1 outline-none"
                >
                  <span>{locale === "en" ? "🇮🇹 IT" : "🇬🇧 EN"}</span>
                </button>
              </Form>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 sm:pt-24 sm:pb-32 overflow-hidden">
        {/* Glow rings */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center">
            {/* Tagline */}
            <div className="inline-flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-full px-4.5 py-1.5 mb-6 text-xs uppercase tracking-wider text-orange-500 font-bold shadow-inner animate-fade-in animation-delay-100">
              <Flag className="h-4.5 w-4.5 animate-bounce text-orange-500" />
              <span>{t.heroTag}</span>
            </div>
 
            {/* Circuit Information */}
            <div className="mb-6 animate-fade-in animation-delay-200">
              <span className="inline-flex items-center space-x-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 bg-slate-900/60 border border-slate-850 px-3.5 py-1.5 rounded-full shadow-inner">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-ping mr-1" />
                <span>{locale === "en" ? "Live at" : "Disponibile presso"}: {companyConfig.circuitName}</span>
              </span>
            </div>
 
            {/* Title */}
            <h1 className="text-4xl sm:text-6xl md:text-8xl font-black uppercase tracking-tighter text-white leading-none animate-fade-in animation-delay-300">
              {t.heroTitle1} <br />
              <span className="bg-gradient-to-r from-orange-500 via-orange-600 to-orange-400 bg-clip-text text-transparent">
                {t.heroTitle2}
              </span>
            </h1>
 
            {/* Subtext */}
            <p className="mt-6 max-w-2xl mx-auto text-lg md:text-xl text-slate-400 font-light leading-relaxed animate-fade-in animation-delay-400">
              {t.heroSub}
            </p>
 
            {/* CTAs */}
            <div className="mt-10 flex flex-col sm:flex-row justify-center items-center gap-4 animate-fade-in animation-delay-500">
              <Link 
                to="/book" 
                className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white font-black uppercase tracking-wider px-8 py-4.5 rounded-xl hover:from-orange-500 hover:to-orange-400 shadow-xl shadow-orange-600/25 transition-all active:scale-[0.98]"
              >
                <span>{t.heroCTA1}</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a 
                href="#fleet" 
                className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-slate-900 border border-slate-800 text-slate-300 font-bold uppercase tracking-wider px-8 py-4.5 rounded-xl hover:bg-slate-850 hover:text-white transition-all"
              >
                <span>{t.heroCTA2}</span>
              </a>
            </div>

            {/* Badges Grid */}
            <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
              <div className="bg-slate-900/50 backdrop-blur border border-slate-850 p-5 rounded-2xl flex flex-col items-center animate-fade-in animation-delay-100 hover-glow-orange">
                <Calendar className="h-7 w-7 text-orange-500 mb-2" />
                <span className="font-extrabold text-white text-lg">{t.activeCalendar}</span>
                <span className="text-xs text-slate-500 uppercase tracking-widest mt-0.5">{t.flexibleDays}</span>
              </div>
              <div className="bg-slate-900/50 backdrop-blur border border-slate-850 p-5 rounded-2xl flex flex-col items-center animate-fade-in animation-delay-200 hover-glow-orange">
                <Clock className="h-7 w-7 text-orange-500 mb-2" />
                <span className="font-extrabold text-white text-lg">{t.dailySlots}</span>
                <span className="text-xs text-slate-500 uppercase tracking-widest mt-0.5">{t.dailySessions}</span>
              </div>
              <div className="bg-slate-900/50 backdrop-blur border border-slate-850 p-5 rounded-2xl flex flex-col items-center animate-fade-in animation-delay-300 hover-glow-orange">
                <Users className="h-7 w-7 text-orange-500 mb-2" />
                <span className="font-extrabold text-white text-lg">{t.tailoredGroups}</span>
                <span className="text-xs text-slate-500 uppercase tracking-widest mt-0.5">{t.dynamicCapacity}</span>
              </div>
              <div className="bg-slate-900/50 backdrop-blur border border-slate-850 p-5 rounded-2xl flex flex-col items-center animate-fade-in animation-delay-400 hover-glow-orange">
                <ShieldCheck className="h-7 w-7 text-orange-500 mb-2" />
                <span className="font-extrabold text-white text-lg">{t.fullInsurance}</span>
                <span className="text-xs text-slate-500 uppercase tracking-widest mt-0.5">{t.crashCoverage}</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Fleet Showcase */}
      <section id="fleet" className="py-24 bg-slate-900/30 border-t border-b border-slate-900 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-widest text-orange-500">{t.fleetHeader}</h2>
            <p className="mt-3 text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">
              {t.fleetTitle}
            </p>
            <p className="mt-4 text-slate-400 font-light">
              {t.fleetSub}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {displayedBikes.map((bike, idx) => {
              const isMaintenance = false;
              const statusText = locale === "en" ? "AVAILABLE" : "DISPONIBILE";
              const glowClass = bike.usage === "ACADEMY" ? "hover-glow-purple" : "hover-glow-orange";
              return (
                <div 
                  key={bike.id}
                  className={`bg-slate-900/60 backdrop-blur border rounded-3xl overflow-hidden shadow-xl transition-all relative hover:-translate-y-2 group animate-fade-in ${
                    isMaintenance ? "border-red-950/50" : `border-slate-800/80 ${glowClass}`
                  }`}
                  style={{ animationDelay: `${(idx + 1) * 100}ms` }}
                >
                  {/* Status Badge */}
                  <div className="absolute top-4 right-4 z-10">
                    <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border tracking-widest ${
                      isMaintenance 
                        ? "bg-red-950/60 text-red-400 border-red-500/20" 
                        : "bg-green-950/60 text-green-400 border-green-500/20"
                    }`}>
                      {statusText}
                    </span>
                  </div>

                  {/* Bike visual frame */}
                  <div 
                    className="h-56 flex flex-col justify-center items-center relative overflow-hidden group-hover:scale-105 transition-transform duration-500"
                    style={{ backgroundColor: bike.bgColor || '#1e293b' }}
                  >
                    {bike.imageUrl ? (
                      <img 
                        src={bike.imageUrl} 
                        alt={bike.name} 
                        className="h-full w-full object-contain p-4 select-none pointer-events-none filter drop-shadow-[0_10px_15px_rgba(0,0,0,0.4)]"
                      />
                    ) : (
                      <>
                        <div className="absolute inset-0 bg-orange-600/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <Flag className="h-16 w-16 text-slate-700 group-hover:text-orange-500 transition-colors animate-pulse" />
                      </>
                    )}
                    
                    {/* Bike specifications text on hover overlay */}
                    <div className="absolute bottom-4 left-4 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-orange-400 flex items-center space-x-1 z-10">
                      <Cpu className="h-3.5 w-3.5" />
                      <span>{bike.displacement}cc {locale === "en" ? "4-Stroke" : "4 Tempi"}</span>
                    </div>
                  </div>

                  {/* Content details */}
                  <div className="p-6">
                    <div className="flex flex-col">
                      <h3 className="text-xl font-extrabold text-white group-hover:text-orange-500 transition-colors leading-tight">{bike.name}</h3>
                    </div>
                    <div className="flex justify-between items-start mt-1.5">
                      <p className="text-xs text-slate-500 uppercase tracking-widest">
                        {locale === "en" ? "Model" : "Modello"}: {bike.model}
                      </p>
                      <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border font-mono tracking-wide ${
                        bike.usage === "ACADEMY" 
                          ? "bg-purple-950/40 text-purple-400 border-purple-500/20"
                          : bike.usage === "RENTAL"
                          ? "bg-blue-950/40 text-blue-400 border-blue-500/20"
                          : "bg-orange-950/40 text-orange-400 border-orange-500/20"
                      }`}>
                        {bike.usage === "ACADEMY" 
                          ? (locale === "en" ? "Academy Only" : "Solo Academy") 
                          : bike.usage === "RENTAL" 
                          ? (locale === "en" ? "Rental Only" : "Solo Noleggio") 
                          : (locale === "en" ? "Rental & Academy" : "Noleggio & Academy")}
                      </span>
                    </div>

                    {/* Performance specifications */}
                    {bike.hp && (
                      <div className="space-y-3 mt-4 pt-4 border-t border-slate-850/60 text-[11px] text-slate-400 font-mono">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="block text-[9px] text-slate-500 uppercase tracking-widest font-sans mb-0.5">Horsepower</span>
                            <span className="text-white font-bold">{bike.hp?.toFixed(1)} HP {bike.hpRpm ? `@ ${bike.hpRpm.toLocaleString()} RPM` : ""}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] text-slate-500 uppercase tracking-widest font-sans mb-0.5">Torque</span>
                            <span className="text-white font-bold">{bike.torque?.toFixed(1)} Nm {bike.torqueRpm ? `@ ${bike.torqueRpm.toLocaleString()} RPM` : ""}</span>
                          </div>
                        </div>
                        {bike.gearbox && (
                          <div className="border-t border-slate-900/40 pt-2 flex justify-between items-center text-[10px]">
                            <span className="text-slate-500 uppercase tracking-widest font-sans">Transmission</span>
                            <span className="text-white font-black uppercase tracking-wider bg-slate-950 px-2 py-0.5 rounded border border-slate-900">{bike.gearbox}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Stats metrics block */}
                    <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-850">
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase tracking-wider">{t.baseTariff}</span>
                        <span className="text-lg font-black text-white">x{bike.priceModifier.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase tracking-wider">{t.insuranceCost}</span>
                        <span className="text-lg font-black text-orange-500">€{bike.insurancePrice.toFixed(0)}</span>
                      </div>
                    </div>

                    {/* Insurance damage details */}
                    <div className="mt-4 bg-slate-950/80 border border-slate-850 p-3.5 rounded-xl flex items-start space-x-2.5 text-xs text-slate-400">
                      <ShieldCheck className="h-4.5 w-4.5 text-green-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="block font-semibold text-slate-300">{t.crashLimit}: €{bike.insuranceCoverage.toFixed(0)}</span>
                        {t.insuranceIncludedInfo}
                      </div>
                    </div>

                    {/* Rent action trigger */}
                    <div className="mt-6">
                      {isMaintenance ? (
                        <button 
                          disabled 
                          className="w-full bg-slate-950 text-slate-600 font-bold uppercase tracking-wider text-xs py-3.5 rounded-xl border border-slate-850 cursor-not-allowed"
                        >
                          {t.maintenanceStatus}
                        </button>
                      ) : bike.usage === "ACADEMY" ? (
                        <Link 
                          to="/academy" 
                          className="w-full inline-flex justify-center items-center space-x-1.5 bg-purple-900/20 hover:bg-purple-600 border border-purple-500/30 hover:border-purple-500 text-purple-300 hover:text-white font-bold uppercase tracking-wider text-xs py-3.5 rounded-xl transition-all"
                        >
                          <span>{locale === "en" ? "Academy Courses" : "Corsi Academy"}</span>
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      ) : (
                        <Link 
                          to="/book" 
                          className="w-full inline-flex justify-center items-center space-x-1.5 bg-slate-950 hover:bg-orange-600 border border-slate-800 hover:border-orange-500 text-slate-300 hover:text-white font-bold uppercase tracking-wider text-xs py-3.5 rounded-xl transition-all"
                        >
                          <span>{t.reserveBike}</span>
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* Championships Calendar Section */}
      <section id="calendar" className="py-24 bg-slate-950 border-b border-slate-900 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-widest text-orange-500">
              {locale === "en" ? "Championship Calendar" : "Calendario Campionati"}
            </h2>
            <p className="mt-3 text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">
              {locale === "en" ? "Upcoming Scheduled Grids" : "Prossime Griglie in Programma"}
            </p>
            <p className="mt-4 text-slate-400 font-light text-sm">
              {locale === "en" 
                ? `Join an official racing grid at ${companyConfig.circuitName}. Pick a format and lock in your spot. Date and schedules are fixed.`
                : `Partecipa a una griglia di partenza ufficiale presso l'${companyConfig.circuitName}. Scegli il formato e blocca il tuo posto. Data e orari sono fissati.`}
            </p>
          </div>

          {upcomingChampionships.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-850 rounded-3xl p-12 text-center max-w-2xl mx-auto">
              <Calendar className="h-12 w-12 text-slate-600 mx-auto mb-4 animate-pulse" />
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                {locale === "en" ? "No Scheduled Championships" : "Nessun Campionato Programmato"}
              </h3>
              <p className="text-slate-400 text-sm mt-2 font-light">
                {locale === "en"
                  ? "We don't have any scheduled events right now, but you can book a custom championship date with your crew anytime!"
                  : "Non ci sono eventi in programma al momento, ma puoi prenotare una data personalizzata per te e il tuo gruppo in qualsiasi momento!"}
              </p>
              <div className="mt-6">
                <Link
                  to="/book"
                  className="inline-flex items-center space-x-2 bg-orange-600 hover:bg-orange-500 text-white font-bold uppercase tracking-wider text-xs px-6 py-3.5 rounded-xl shadow-lg shadow-orange-600/20 transition-all"
                >
                  <span>{t.bookNow}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {upcomingChampionships.map((champ, idx) => {
                const prettyDate = formatDate(champ.fixedDate || "", locale);
                return (
                  <div 
                    key={champ.id}
                    className="bg-slate-900/40 backdrop-blur border border-slate-850 hover:border-orange-500/50 rounded-3xl p-6 flex flex-col justify-between shadow-xl transition-all hover:-translate-y-1 group animate-fade-in hover-glow-orange"
                    style={{ animationDelay: `${(idx + 1) * 100}ms` }}
                  >
                    <div>
                      {/* Date Badge */}
                      <div className="flex items-center space-x-2 bg-orange-950/40 border border-orange-500/20 text-orange-400 text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-xl w-fit tracking-wider mb-5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{prettyDate}</span>
                      </div>

                      {/* Championship Name */}
                      <h3 className="text-2xl font-black text-white group-hover:text-orange-500 transition-colors uppercase tracking-tight leading-tight">
                        {champ.name}
                      </h3>
                      
                      {/* Description */}
                      <p className="text-slate-400 text-xs mt-3 leading-relaxed font-light">
                        {champ.description}
                      </p>

                      {/* Info Metrics */}
                      <div className="grid grid-cols-2 gap-4 mt-6 pt-5 border-t border-slate-850/60">
                        <div>
                          <span className="block text-[10px] text-slate-500 uppercase tracking-widest">
                            {locale === "en" ? "GRID REQUIREMENT" : "REQUISITO GRIGLIA"}
                          </span>
                          <span className="text-sm font-extrabold text-white uppercase mt-0.5 block">
                            Min {champ.minRacers} {locale === "en" ? "Racers" : "Piloti"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500 uppercase tracking-widest">
                            {locale === "en" ? "TRACK TIME" : "TEMPO IN PISTA"}
                          </span>
                          <span className="text-sm font-extrabold text-orange-500 uppercase mt-0.5 block">
                            {champ.sessionsCount} {locale === "en" ? "Sessions" : "Sessioni"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 pt-5 border-t border-slate-850/60 flex items-center justify-between gap-4">
                      {/* Price Tag */}
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase tracking-widest">
                          {locale === "en" ? "ENTRY FEE" : "TESSERA INGRESSO"}
                        </span>
                        <span className="text-2xl font-black text-white">
                          €{champ.price.toFixed(0)}
                          <span className="text-xs text-slate-500 font-normal lowercase tracking-normal">
                            /{locale === "en" ? "racer" : "pilota"}
                          </span>
                        </span>
                      </div>

                      {/* CTA Action */}
                      <Link 
                        to={`/book?championshipId=${champ.id}`}
                        className="bg-orange-600 text-white hover:bg-orange-500 font-bold uppercase tracking-wider text-[11px] px-5 py-3.5 rounded-xl shadow-lg shadow-orange-600/10 transition-all flex items-center space-x-1"
                      >
                        <span>{locale === "en" ? "Register Grid" : "Registra Griglia"}</span>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Academy Teaser Section */}
      <section id="academy-teaser" className="py-24 border-t border-slate-900 bg-slate-950 relative overflow-hidden">
        {/* Neon glow grids */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-r from-orange-600/10 to-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="bg-gradient-to-br from-slate-900/90 to-slate-950 border border-slate-850 rounded-3xl p-8 sm:p-16 relative overflow-hidden shadow-2xl flex flex-col lg:flex-row justify-between items-center gap-12">
            
            {/* Corner telemetry graphics decorations */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-orange-500/5 to-transparent pointer-events-none rounded-bl-full" />
            <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="max-w-2xl space-y-6 text-center lg:text-left">
              <span className="inline-flex items-center space-x-2 bg-purple-950/60 border border-purple-500/25 text-purple-400 text-xs font-extrabold uppercase px-4 py-1.5 rounded-full tracking-wider shadow-inner">
                <Gauge className="h-4 w-4 text-purple-400" />
                <span>{locale === "en" ? "Racing Academy" : "Accademia di Guida"}</span>
              </span>
              <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white leading-tight">
                {locale === "en" ? "Master the Track" : "Perfeziona la Tua Guida"} <br />
                <span className="bg-gradient-to-r from-orange-500 via-orange-600 to-purple-500 bg-clip-text text-transparent">
                  {locale === "en" ? "With Pro FIM Coaches" : "Con Istruttori Federali"}
                </span>
              </h2>
              <p className="text-slate-400 text-base font-light leading-relaxed">
                {locale === "en" 
                  ? "Master corner entry speed, body positioning, and telemetry logging with professional FIM coaches. Train on our specialized academy motorcycles equipped with telemetry and slick tires."
                  : "Perfeziona la velocità di inserimento curva, la posizione in sella e l'analisi della telemetria con istruttori federali professionisti. Allenati sulle nostre moto dedicate con telemetria e gomme slick."}
              </p>

              {/* Bullet highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <div className="flex items-center space-x-2.5">
                  <CheckCircle2 className="h-4.5 w-4.5 text-orange-500 shrink-0" />
                  <span>{locale === "en" ? "Telemetry Analysis" : "Analisi Telemetria"}</span>
                </div>
                <div className="flex items-center space-x-2.5">
                  <CheckCircle2 className="h-4.5 w-4.5 text-orange-500 shrink-0" />
                  <span>{locale === "en" ? "1-on-1 Coaching" : "Coaching Dedicato"}</span>
                </div>
                <div className="flex items-center space-x-2.5">
                  <CheckCircle2 className="h-4.5 w-4.5 text-orange-500 shrink-0" />
                  <span>{locale === "en" ? "Homologated Track" : "Pista Omologata"}</span>
                </div>
              </div>
            </div>

            <div className="shrink-0 w-full lg:w-auto flex flex-col items-center gap-4">
              <Link
                to="/academy"
                className="w-full lg:w-auto inline-flex justify-center items-center space-x-2 bg-gradient-to-r from-orange-600 via-orange-500 to-purple-600 hover:from-orange-500 hover:to-purple-500 text-white font-black uppercase tracking-wider text-sm px-10 py-5 rounded-xl transition-all shadow-xl shadow-orange-500/10 hover:shadow-purple-500/10 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer animate-pulse-subtle"
              >
                <span>{locale === "en" ? "View Academy Courses" : "Vedi Corsi Academy"}</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                {locale === "en" ? "Courses start from €120" : "Corsi a partire da €120"}
              </span>
            </div>

          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="process" className="py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-xs font-bold uppercase tracking-widest text-orange-500">{t.fastBooking}</h2>
            <p className="mt-3 text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">
              {t.stepsTitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
            
            {/* Step 1 */}
            <div className="bg-slate-900/40 border border-slate-850 p-6 rounded-2xl relative animate-fade-in animation-delay-100 hover-glow-orange">
              <span className="absolute -top-6 left-6 text-5xl font-black text-orange-600/30 font-mono">01</span>
              <h3 className="text-lg font-bold text-white mt-4 uppercase">{t.step1Title}</h3>
              <p className="text-sm text-slate-400 mt-2 font-light">
                {t.step1Sub}
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-slate-900/40 border border-slate-850 p-6 rounded-2xl relative animate-fade-in animation-delay-200 hover-glow-orange">
              <span className="absolute -top-6 left-6 text-5xl font-black text-orange-600/30 font-mono">02</span>
              <h3 className="text-lg font-bold text-white mt-4 uppercase">{t.step2Title}</h3>
              <p className="text-sm text-slate-400 mt-2 font-light">
                {t.step2Sub}
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-slate-900/40 border border-slate-850 p-6 rounded-2xl relative animate-fade-in animation-delay-300 hover-glow-orange">
              <span className="absolute -top-6 left-6 text-5xl font-black text-orange-600/30 font-mono">03</span>
              <h3 className="text-lg font-bold text-white mt-4 uppercase">{t.step3Title}</h3>
              <p className="text-sm text-slate-400 mt-2 font-light">
                {t.step3Sub}
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-slate-900/40 border border-slate-850 p-6 rounded-2xl relative animate-fade-in animation-delay-400 hover-glow-orange">
              <span className="absolute -top-6 left-6 text-5xl font-black text-orange-600/30 font-mono">04</span>
              <h3 className="text-lg font-bold text-white mt-4 uppercase">{t.step4Title}</h3>
              <p className="text-sm text-slate-400 mt-2 font-light">
                {t.step4Sub}
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Call to action paddock card */}
      <section className="pb-32">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-orange-600 to-orange-800 rounded-3xl p-8 sm:p-16 relative overflow-hidden shadow-2xl shadow-orange-600/20 border border-orange-500/30 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-black/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-xl text-center md:text-left">
              <h2 className="text-3xl sm:text-5xl font-black uppercase text-white tracking-tight leading-none">
                {t.unleashRacer}
              </h2>
              <p className="mt-4 text-white/80 font-semibold text-sm uppercase tracking-wider">
                {t.unleashSub}
              </p>
            </div>

            <div className="relative z-10 shrink-0 w-full md:w-auto">
              <Link 
                to="/book" 
                className="w-full md:w-auto block text-center bg-black hover:bg-slate-950 text-white font-black uppercase tracking-wider text-sm px-10 py-5 rounded-xl transition-all shadow-xl active:scale-[0.98]"
              >
                {t.startReservation}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Racetrack Location / Maps embed */}
      {companyConfig.googleMapsUrl && (
        <section id="location" className="pb-32 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-slate-900/40 border border-slate-850 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden flex flex-col lg:flex-row justify-between items-stretch gap-8">
            {/* Left side: Coordinates / Address info */}
            <div className="flex flex-col justify-between space-y-8 lg:w-1/3">
              <div>
                <div className="inline-flex items-center space-x-1.5 bg-orange-950/40 border border-orange-500/20 text-orange-400 text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-xl tracking-wider mb-4">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{locale === "en" ? "Circuit Coordinates" : "Coordinate Circuito"}</span>
                </div>
                <h3 className="text-3xl font-black uppercase text-white tracking-tight leading-none">
                  {companyConfig.circuitName}
                </h3>
                <p className="text-xs text-slate-400 font-light mt-3 leading-relaxed">
                  {locale === "en"
                    ? "Welcome to our homologated racing paddock. Fully equipped pits, technical assistance, and on-track supporting crews await you."
                    : "Benvenuto nel nostro paddock omologato. Box attrezzati, assistenza tecnica e personale di supporto in pista ti aspettano."}
                </p>
              </div>

              <div className="pt-6 border-t border-slate-850 space-y-4">
                <div className="space-y-1">
                  <span className="block text-[9px] text-slate-500 uppercase tracking-widest font-mono">
                    {locale === "en" ? "LOCATION DETAILS" : "DETTAGLI LOCATION"}
                  </span>
                  <span className="text-sm font-bold text-white uppercase block">
                    {companyConfig.circuitName}
                  </span>
                </div>
                
                {/* Direction button */}
                <a
                  href={companyConfig.googleMapsUrl.includes("embed") 
                    ? `https://maps.google.com/?q=${encodeURIComponent(companyConfig.circuitName)}` 
                    : companyConfig.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 bg-slate-950 hover:bg-orange-600 border border-slate-850 hover:border-orange-500 text-slate-300 hover:text-white font-bold uppercase text-xs px-6 py-3.5 rounded-xl transition-all shadow-md active:scale-[0.98]"
                >
                  <span>{locale === "en" ? "Open in Google Maps" : "Apri in Google Maps"}</span>
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Right side: Maps map frame or card */}
            <div className="flex-1 min-h-[300px] lg:min-h-auto rounded-2xl overflow-hidden border border-slate-850 shadow-inner relative bg-slate-950/60">
              {companyConfig.googleMapsUrl.includes("embed") || companyConfig.googleMapsUrl.includes("google.com/maps/embed") ? (
                <iframe
                  title="Track Google Maps Embed"
                  src={companyConfig.googleMapsUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="w-full h-full grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all duration-500 min-h-[320px]"
                />
              ) : (
                <div className="w-full h-full flex flex-col justify-center items-center p-8 text-center min-h-[320px] bg-gradient-to-br from-slate-900/60 to-slate-950/60">
                  <MapPin className="h-12 w-12 text-slate-500 mb-4 animate-bounce" />
                  <h4 className="text-base font-bold text-white uppercase tracking-wider">
                    {locale === "en" ? "Circuit Navigation Route" : "Percorso di Navigazione"}
                  </h4>
                  <p className="text-slate-400 text-xs mt-2 max-w-sm font-light leading-relaxed">
                    {locale === "en"
                      ? "Custom coordinate navigation route available. Click below to start GPS directions directly to the pit lane."
                      : "Percorso navigazione coordinate disponibile. Clicca sotto per avviare le indicazioni GPS direttamente alla pit lane."}
                  </p>
                  <a
                    href={companyConfig.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex items-center space-x-2 bg-orange-600 hover:bg-orange-500 text-white font-bold uppercase text-xs px-6 py-3.5 rounded-xl shadow-lg shadow-orange-600/10 transition-all"
                  >
                    <span>{locale === "en" ? "Get Directions" : "Ottieni Indicazioni"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-12 text-center text-xs text-slate-500 uppercase tracking-widest font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center sm:items-start space-y-2">
            <div className="flex items-center space-x-2">
              <Flag className="h-4.5 w-4.5 text-orange-500" />
              <span className="font-bold text-slate-400">{t.copyright} - {companyConfig.companyName} ({companyConfig.circuitName})</span>
            </div>
            {/* Pikosoft / Leasio SaaS Platform info */}
            <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1 border-t border-slate-900/40 pt-2">
              <span>{locale === "en" ? "Software by" : "Software di"}</span>
              <a href="https://pikosoft.it" target="_blank" rel="noopener noreferrer" className="inline-flex items-center hover:opacity-80 transition-opacity">
                <img src="/logobig.png" alt="Pikosoft Logo" className="h-4.5 object-contain" />
              </a>
              <span className="text-slate-800">|</span>
              <span>{locale === "en" ? "Powered by" : "Powered by"}</span>
              <img src="/logoleasio.png" alt="Leasio Logo" className="h-4.5 object-contain" />
            </div>
          </div>
          <div className="flex space-x-6 text-slate-500">
            <a href="#" className="hover:text-white transition-colors">{t.rules}</a>
            <a href="#" className="hover:text-white transition-colors">{locale === "en" ? "Privacy" : "Privacy"}</a>
            {user?.role === "ADMIN" ? (
              <Link to="/admin" className="hover:text-white transition-colors">{t.backoffice}</Link>
            ) : (
              <a href="#" className="hover:text-white transition-colors">{t.backoffice}</a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
