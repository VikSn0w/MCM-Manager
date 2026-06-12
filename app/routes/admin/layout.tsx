import { Link, Outlet, useLoaderData, useLocation, Form } from "react-router";
import type { Route } from "./+types/layout";
import { requireAdmin } from "../../utils/auth.server";
import { prisma } from "../../utils/db.server";
import { getLocale } from "../../utils/locale.server";
import { translations, type Locale } from "../../utils/translations";
import { 
  Flame, 
  Grid, 
  Receipt, 
  Flag, 
  DollarSign, 
  Calendar, 
  ChevronRight, 
  ArrowLeft,
  Settings,
  Bell,
  Activity,
  LogOut,
  BookOpen
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  // Enforce admin privileges
  const adminUser = await requireAdmin(request);
  const locale = await getLocale(request);

  // Quick header stats
  const bikesCount = await prisma.bike.count({});
  const activeBookingsCount = await prisma.booking.count({ where: { status: "CONFIRMED" } });
  const dayConfigsCount = await prisma.dayConfig.count({});

  const companyConfig = await prisma.companyConfig.findUnique({
    where: { id: "single-config" }
  }) || {
    companyName: "Leasio Paddock Rentals",
    logoUrl: "/images/ohvale_gp_one_1780331510373.png",
    circuitName: "Autodromo di Franciacorta"
  };

  return { adminUser, bikesCount, activeBookingsCount, dayConfigsCount, companyConfig, locale };
}

export default function AdminLayout() {
  const { adminUser, bikesCount, activeBookingsCount, dayConfigsCount, companyConfig, locale } = useLoaderData<typeof loader>();
  const t = translations[locale as Locale];

  const location = useLocation();
  const currentPath = location.pathname;
  const currentPathWithSearch = location.pathname + location.search;

  const menuItems = [
    { name: locale === "en" ? "Overview" : "Panoramica", path: "/admin", icon: Grid },
    { name: locale === "en" ? "Reservations" : "Prenotazioni", path: "/admin/bookings", icon: Receipt },
    { name: locale === "en" ? "Ohvale Fleet" : "Flotta Ohvale", path: "/admin/bikes", icon: Flag },
    { name: locale === "en" ? "Championships" : "Campionati", path: "/admin/championships", icon: Flag },
    { name: locale === "en" ? "Academy Lessons" : "Lezioni Academy", path: "/admin/lessons", icon: BookOpen },
    { name: locale === "en" ? "Tariff Scheduler" : "Tariffe Settimanali", path: "/admin/tariffs", icon: DollarSign },
    { name: locale === "en" ? "Calendar Capacity" : "Calendario Pista", path: "/admin/calendar", icon: Calendar },
    { name: locale === "en" ? "Company Settings" : "Opzioni Paddock", path: "/admin/settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col md:flex-row">
      {/* Carbon line decorations */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-10 pointer-events-none" />

      {/* Sidebar Navigation */}
      <aside className="w-full md:w-72 bg-slate-900/60 backdrop-blur-xl border-b md:border-b-0 md:border-r border-slate-850 flex flex-col justify-between shrink-0 relative z-30">
        <div>
          {/* Sidebar Logo */}
          <div className="p-6 border-b border-slate-850 flex flex-col items-start gap-3">
            <Link to="/" className="flex items-center space-x-2.5 max-w-full">
              {companyConfig.logoUrl ? (
                <div className="h-8 bg-slate-950 border border-slate-850 rounded-lg p-1.5 flex items-center justify-center shrink-0">
                  <img src={companyConfig.logoUrl} alt="Logo" className="h-full object-contain max-w-20" />
                </div>
              ) : (
                <img src="/logosmall.png" alt="Leasio Logo" className="h-8 w-auto object-contain shrink-0" />
              )}
              <span className="text-sm font-black uppercase text-white tracking-tight truncate max-w-[150px] leading-tight">
                {companyConfig.companyName}
              </span>
            </Link>
            <div className="w-full flex justify-between items-center text-[10px]">
              <span className="text-slate-500 font-mono font-bold truncate max-w-[130px]" title={companyConfig.circuitName}>
                📍 {companyConfig.circuitName}
              </span>
              <span className="bg-orange-500/20 text-orange-400 text-[8px] font-extrabold px-1.5 py-0.5 rounded border border-orange-500/20 uppercase tracking-widest shrink-0">
                {t.staff}
              </span>
            </div>
          </div>

          {/* Links list */}
          <nav className="p-4 space-y-1.5 mt-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    isActive
                      ? "bg-orange-600 text-white shadow-lg shadow-orange-600/15"
                      : "text-slate-400 hover:text-white hover:bg-slate-850"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="h-4.5 w-4.5" />
                    <span>{item.name}</span>
                  </div>
                  <ChevronRight className={`h-4 w-4 transition-transform ${isActive ? "opacity-100" : "opacity-0"}`} />
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-850 space-y-4">
          
          {/* Quick exit link */}
          <Link
            to="/"
            className="w-full flex items-center justify-center space-x-2 bg-slate-950 hover:bg-slate-850 border border-slate-850 text-slate-400 hover:text-white font-bold uppercase text-[10px] tracking-wider py-3 rounded-xl transition-all"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t.exitBackoffice}</span>
          </Link>

          {/* User profile row */}
          <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-850">
            <div className="flex items-center space-x-2.5">
              <div className="h-8.5 w-8.5 rounded-lg bg-orange-600/10 border border-orange-500/25 flex items-center justify-center text-xs font-bold text-orange-500 uppercase">
                {adminUser.name.charAt(0)}
              </div>
              <div className="truncate w-32">
                <span className="block text-[11px] font-black text-white truncate uppercase tracking-wider">{adminUser.name}</span>
                <span className="block text-[9px] text-slate-500 truncate font-mono">{adminUser.email}</span>
              </div>
            </div>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="text-slate-500 hover:text-red-400 p-1.5 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer"
                title={t.logout}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </Form>
          </div>

          {/* SaaS Branding */}
          <div className="flex justify-center pt-2.5 border-t border-slate-850/60">
            <a href="https://pikosoft.it" target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
              <img src="/logobig.png" alt="Leasio by Pikosoft" className="h-7 object-contain opacity-55 hover:opacity-85 transition-opacity" />
            </a>
          </div>

        </div>
      </aside>

      {/* Main Administrative Area */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        
        {/* Top bar header */}
        <header className="bg-slate-900/40 backdrop-blur-xl border-b border-slate-850 px-8 py-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
              {locale === "en" ? "Paddock Management System" : "Sistema Gestione Paddock"}
            </span>
            <h2 className="text-lg font-black uppercase tracking-tight text-white mt-0.5">{t.controlCenter}</h2>
          </div>

          {/* Quick Metrics Header Row */}
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400 font-bold uppercase tracking-wider font-mono">
            
            {/* Language Switcher in Admin top bar */}
            <Form method="post" action="/locale" className="inline-flex border-r border-slate-800 pr-6">
              <input type="hidden" name="redirectTo" value={currentPathWithSearch} />
              <button 
                type="submit" 
                name="locale" 
                value={locale === "en" ? "it" : "en"}
                className="text-[10px] font-extrabold uppercase text-slate-400 hover:text-orange-500 border border-slate-800 hover:border-orange-500/25 bg-slate-950 rounded-lg px-2.5 py-1.5 transition-all flex items-center space-x-1 outline-none cursor-pointer"
              >
                <span>{locale === "en" ? "🇮🇹 IT" : "🇬🇧 EN"}</span>
              </button>
            </Form>

            <div className="flex items-center space-x-2 border-r border-slate-800 pr-6">
              <Activity className="h-4.5 w-4.5 text-orange-500 shrink-0" />
              <div>
                <span className="block text-[9px] text-slate-500 uppercase">
                  {locale === "en" ? "Fleet Size" : "Dim. Flotta"}
                </span>
                <span className="text-sm font-black text-white mt-0.5">{bikesCount} Ohvales</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 border-r border-slate-800 pr-6">
              <Receipt className="h-4.5 w-4.5 text-green-500 shrink-0" />
              <div>
                <span className="block text-[9px] text-slate-500 uppercase">
                  {locale === "en" ? "Confirmed" : "Confermati"}
                </span>
                <span className="text-sm font-black text-white mt-0.5">{activeBookingsCount} Bookings</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Calendar className="h-4.5 w-4.5 text-blue-400 shrink-0" />
              <div>
                <span className="block text-[9px] text-slate-500 uppercase">
                  {locale === "en" ? "Overrides" : "Eccezioni"}
                </span>
                <span className="text-sm font-black text-white mt-0.5">{dayConfigsCount} Dates</span>
              </div>
            </div>

          </div>
        </header>

        {/* Content body container */}
        <main key={location.pathname} className="flex-1 overflow-y-auto p-8 animate-fade-in">
          <Outlet context={{ locale }} />
        </main>

      </div>
    </div>
  );
}
