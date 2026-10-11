import { Link, useLoaderData, Form, useLocation } from "react-router";
import type { Route } from "./+types/academy";
import { getUser } from "../utils/auth.server";
import { prisma } from "../utils/db.server";
import { getLocale } from "../utils/locale.server";
import { translations, type Locale } from "../utils/translations";
import { 
  Clock, 
  Calendar as CalendarIcon, 
  DollarSign, 
  Cpu, 
  CheckCircle2, 
  ArrowRight, 
  Gauge, 
  Flag, 
  Award,
  Zap,
  TrendingUp,
  MapPin
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  const [user, locale, companyConfig, lessons] = await Promise.all([
    getUser(request),
    getLocale(request),
    prisma.companyConfig.findUnique({
      where: { id: "single-config" }
    }).then(conf => conf || {
      companyName: "MCM Racing School",
      logoUrl: "/images/ohvale_gp_one_1780331510373.png",
      circuitName: "Autodromo di Franciacorta",
      googleMapsUrl: ""
    }),
    prisma.lesson.findMany({
      where: { isAvailable: true },
      include: { bikeModel: true },
      orderBy: { cost: "asc" }
    })
  ]);

  return { user, companyConfig, lessons, locale };
}

export function meta({ data }: Route.MetaArgs) {
  const companyName = data?.companyConfig?.companyName || "MCM Racing School";
  const circuitName = data?.companyConfig?.circuitName || "Autodromo di Franciacorta";
  if (data?.locale === "en") {
    return [
      { title: `Racing Academy - ${companyName}` },
      { name: "description", content: `Learn to ride like a pro at ${circuitName}. Professional FIM coaching courses, telemetry analysis, lines correction, and race-ready Ohvale GP training bikes.` },
    ];
  }
  return [
    { title: `Racing Academy - ${companyName}` },
    { name: "description", content: `Impara a guidare come un professionista a ${circuitName}. Corsi di coaching FIM, analisi della telemetria, correzione delle traiettorie e moto Ohvale GP pronte per la pista.` },
  ];
}

export default function Academy() {
  const { user, companyConfig, lessons, locale } = useLoaderData<typeof loader>();
  const t = translations[locale as Locale];
  const location = useLocation();
  const currentPath = location.pathname + location.search;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-orange-500 selection:text-white">
      {/* Carbon fiber grid lines overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      {/* Sticky Header Navbar - Print hidden */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-900 print:hidden">
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
                alt={companyConfig.companyName}
                className={`${companyConfig.logoUrl ? "hidden" : ""} h-8 w-auto object-contain`}
              />
              <span className="text-xl font-black tracking-tighter uppercase text-white">
                {companyConfig.companyName}
              </span>
            </Link>

            {/* Navigation links */}
            <nav className="hidden lg:flex space-x-8 text-sm font-bold uppercase tracking-wider text-slate-300">
              <Link to="/#fleet" className="hover:text-orange-500 transition-colors">{t.fleet}</Link>
              <Link to="/academy" className="text-orange-500 hover:text-orange-600 transition-colors">
                {locale === "en" ? "Academy" : "Academy"}
              </Link>
              <Link to="/#calendar" className="hover:text-orange-500 transition-colors">
                {locale === "en" ? "Calendar" : "Calendario"}
              </Link>
              {user?.role === "ADMIN" && (
                <Link to="/admin" className="text-orange-400 hover:text-orange-500 transition-colors flex items-center space-x-1">
                  <span>{t.backoffice}</span>
                  <span className="bg-orange-500/20 text-orange-400 text-xs font-extrabold px-1.5 py-0.5 rounded border border-orange-500/30 uppercase">{t.staff}</span>
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
                      className="text-xs font-bold uppercase text-slate-400 hover:text-red-400 transition-colors"
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
            </div>
          </div>
          <nav aria-label="Menu" className="lg:hidden flex gap-6 pb-3 text-sm font-semibold text-slate-300 overflow-x-auto">
            <Link to="/#fleet" className="py-2 hover:text-orange-500">{t.fleet}</Link>
            <Link to="/academy" className="py-2 text-orange-500">Academy</Link>
            <Link to="/#calendar" className="py-2 hover:text-orange-500">{locale === "en" ? "Calendar" : "Calendario"}</Link>
          </nav>
        </div>
      </header>

      {/* Hero Header Section */}
      <section className="relative pt-20 pb-16 sm:pt-28 sm:pb-24 overflow-hidden border-b border-slate-900">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-full px-4 py-1.5 mb-6 text-xs uppercase tracking-wider text-sky-400 font-bold shadow-inner">
            <Award className="h-4.5 w-4.5 text-sky-400" />
            <span>{locale === "en" ? "FIM Certificated Training Hub" : "Centro di formazione certificato FIM"}</span>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-8xl font-black uppercase tracking-tighter text-white leading-none">
            {locale === "en" ? "Racing Academy" : "Accademia Corse"} <br />
            <span className="text-orange-500">
              {locale === "en" ? "Sharpen Your Speed" : "Affila la Tua Velocità"}
            </span>
          </h1>

          <p className="mt-6 max-w-2xl mx-auto text-lg md:text-xl text-slate-400 font-light leading-relaxed">
            {locale === "en"
              ? `Our customized coaching programs at ${companyConfig.circuitName} are designed to transform you from trackday enthusiast into a precise, high-performance racer.`
              : `I nostri programmi di coaching su misura presso il ${companyConfig.circuitName} sono progettati per trasformarti da semplice appassionato in un pilota preciso e veloce.`}
          </p>
        </div>
      </section>

      {/* Academy Courses Grid */}
      <section className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-xs font-bold uppercase tracking-wider text-orange-500">
            {locale === "en" ? "Courses Catalog" : "Catalogo Corsi"}
          </h2>
          <p className="mt-3 text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">
            {locale === "en" ? "Choose Your Training Program" : "Scegli il Tuo Programma"}
          </p>
        </div>

        {lessons.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/40 border border-slate-850 rounded-3xl">
            <span className="text-slate-400 font-mono text-xs uppercase tracking-wider">
              {locale === "en" ? "No Active Academy Courses Available" : "Nessun Corso Academy Attivo al Momento"}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {lessons.map((lesson, idx) => {
              const titleText = locale === "en" ? lesson.title : lesson.titleIt;
              const descText = locale === "en" ? lesson.description : lesson.descriptionIt;
              const durationText = locale === "en" ? lesson.duration : lesson.durationIt;
              const timeText = locale === "en" ? lesson.time : lesson.timeIt;
              const bike = lesson.bikeModel;

              return (
                <div 
                  key={lesson.id}
                  className="bg-slate-900/40 border border-slate-850 rounded-3xl p-8 flex flex-col justify-between shadow-2xl transition-all hover:-translate-y-1 group animate-fade-in hover-glow-sky"
                  style={{ animationDelay: `${(idx + 1) * 100}ms` }}
                >
                  <div className="space-y-6">
                    {/* Course Header */}
                    <div>
                      <h3 className="text-2xl font-black uppercase text-white group-hover:text-orange-500 transition-colors tracking-tight font-mono">
                        {titleText}
                      </h3>
                      <p className="text-slate-400 text-xs font-light mt-3 leading-relaxed">
                        {descText}
                      </p>
                    </div>

                    {/* Class parameters */}
                    <div className="pt-5 border-t border-slate-850/60 space-y-3">
                      <div className="flex items-center text-slate-400 space-x-2.5">
                        <Clock className="h-4.5 w-4.5 text-orange-500 shrink-0" />
                        <span className="text-xs">
                          <strong className="text-slate-300 font-semibold">{locale === "en" ? "Duration: " : "Durata: "}</strong>
                          {durationText}
                        </span>
                      </div>
                      <div className="flex items-center text-slate-400 space-x-2.5">
                        <CalendarIcon className="h-4.5 w-4.5 text-orange-500 shrink-0" />
                        <span className="text-xs">
                          <strong className="text-slate-300 font-semibold">{locale === "en" ? "Timing: " : "Orario: "}</strong>
                          {timeText}
                        </span>
                      </div>
                    </div>

                    {/* Assigned Training Bike Specs */}
                    {bike ? (
                      <div className="pt-5 border-t border-slate-850/60 bg-slate-950/40 rounded-2xl p-4 border border-slate-900/50">
                        <div className="flex items-center justify-between gap-4 mb-3.5">
                          <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">{locale === "en" ? "Training Bike" : "Moto da addestramento"}</span>
                          <span className="text-xs font-extrabold text-orange-400 font-mono">{bike.name}</span>
                        </div>

                        {bike.imageUrl && (
                          <div className="h-32 w-full bg-slate-900/50 border border-slate-850 rounded-xl overflow-hidden mb-4 flex justify-center items-center">
                            <img 
                              src={bike.imageUrl} 
                              alt={bike.name} 
                              className="h-full w-auto object-contain p-2"
                            />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-xs font-mono text-slate-400">
                          <div>
                            <span className="block text-xs text-slate-400 uppercase tracking-wider font-sans">{locale === "en" ? "Displacement" : "Cilindrata"}</span>
                            <span className="text-white font-bold">{bike.displacement}cc</span>
                          </div>
                          <div>
                            <span className="block text-xs text-slate-400 uppercase tracking-wider font-sans">{locale === "en" ? "Gearbox" : "Cambio"}</span>
                            <span className="text-white font-bold">{bike.gearbox || "n.d."}</span>
                          </div>
                          <div>
                            <span className="block text-xs text-slate-400 uppercase tracking-wider font-sans">{locale === "en" ? "Power output" : "Potenza"}</span>
                            <span className="text-white font-bold">{bike.hp ? `${bike.hp.toFixed(1)} ${locale === "en" ? "HP" : "CV"}` : "n.d."}{bike.hpRpm ? ` @ ${bike.hpRpm.toLocaleString()}` : ""}</span>
                          </div>
                          <div>
                            <span className="block text-xs text-slate-400 uppercase tracking-wider font-sans">{locale === "en" ? "Max torque" : "Coppia massima"}</span>
                            <span className="text-white font-bold">{bike.torque ? `${bike.torque.toFixed(1)} Nm` : "n.d."}{bike.torqueRpm ? ` @ ${bike.torqueRpm.toLocaleString()}` : ""}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-5 border-t border-slate-850/60 bg-slate-950/40 rounded-2xl p-4 text-center text-xs text-slate-400 border border-slate-900/50">
                        {locale === "en" ? "Assigned bike model details pending." : "Modello moto assegnato in attesa di definizione."}
                      </div>
                    )}
                  </div>

                  {/* Pricing and Book trigger */}
                  <div className="mt-8 pt-5 border-t border-slate-850/60 flex items-center justify-between gap-4">
                    <div>
                      <span className="block text-xs text-slate-400 uppercase tracking-wider font-mono">
                        {locale === "en" ? "TUITION COST" : "COSTO CORSO"}
                      </span>
                      <span className="text-3xl font-black text-white font-mono">
                        €{lesson.cost.toFixed(0)}
                      </span>
                    </div>

                    <Link 
                      to="/book" 
                      className="bg-orange-600 text-white hover:bg-orange-500 font-extrabold uppercase tracking-wider text-xs px-6 py-4 rounded-xl shadow-xl shadow-orange-600/10 transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <span>{locale === "en" ? "Book Slot" : "Prenota Turno"}</span>
                      <ChevronRightIcon className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Academy Features / Professional value adds */}
      <section className="py-24 bg-slate-900/30 border-t border-b border-slate-900 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-xs font-bold uppercase tracking-wider text-sky-400">
              {locale === "en" ? "Why MCM Academy" : "Perché Scegliere l'Accademia"}
            </h2>
            <p className="mt-3 text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">
              {locale === "en" ? "Elite Training Value-Adds" : "Il Nostro Metodo Didattico"}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
             {/* Feature 1 */}
            <div className="bg-slate-900/40 border border-slate-850 p-8 rounded-3xl space-y-4 hover-glow-sky">
              <div className="h-12 w-12 bg-sky-950/60 border border-sky-500/20 text-sky-400 rounded-2xl flex justify-center items-center shadow-inner">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold uppercase text-white font-mono">{locale === "en" ? "Active Telemetry Logs" : "Telemetria Attiva"}</h3>
              <p className="text-xs text-slate-400 font-light leading-relaxed">
                {locale === "en"
                  ? "We log throttle, braking pressure, lean angle, and suspension compression. Compare your curves directly with reference laps."
                  : "Registriamo acceleratore, pressione frenante, angolo di piega e compressione sospensioni. Confronta le tue curve con i giri di riferimento."}
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-900/40 border border-slate-850 p-8 rounded-3xl space-y-4 hover-glow-sky">
              <div className="h-12 w-12 bg-sky-950/60 border border-sky-500/20 text-sky-400 rounded-2xl flex justify-center items-center shadow-inner">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold uppercase text-white font-mono">{locale === "en" ? "Video Line Corrections" : "Correzione Linee Video"}</h3>
              <p className="text-xs text-slate-400 font-light leading-relaxed">
                {locale === "en"
                  ? "Dedicated high-definition track cameras capture your body posture and apex clips. Our FIM coaches correct your errors on screen."
                  : "Telecamere di pista dedicate catturano la tua posizione in sella e i punti di corda. Istruttori federali correggono i tuoi errori a schermo."}
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-900/40 border border-slate-850 p-8 rounded-3xl space-y-4 hover-glow-sky">
              <div className="h-12 w-12 bg-sky-950/60 border border-sky-500/20 text-sky-400 rounded-2xl flex justify-center items-center shadow-inner">
                <Award className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold uppercase text-white font-mono">{locale === "en" ? "FIM License & Certificate" : "Certificato & Licenza FIM"}</h3>
              <p className="text-xs text-slate-400 font-light leading-relaxed">
                {locale === "en"
                  ? "Upon completion, receive a certified course diploma validating your theoretical and technical riding progress."
                  : "Al completamento riceverai un diploma certificato del corso che attesta i tuoi progressi di guida teorici e tecnici."}
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Call to Action Paddock Card */}
      <section className="py-24 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 print:hidden">
        <div className="bg-slate-900 rounded-3xl p-8 sm:p-16 relative overflow-hidden border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-8">

          <div className="relative z-10 max-w-xl text-center md:text-left">
            <h2 className="text-3xl sm:text-5xl font-black uppercase text-white tracking-tight leading-none">
              {locale === "en" ? "Take The Apex" : "Prendi il Punto di Corda"}
            </h2>
            <p className="mt-4 text-white/80 font-semibold text-sm uppercase tracking-wider">
              {locale === "en" ? "Custom individual and group slots available." : "Turni individuali e per gruppi personalizzati disponibili."}
            </p>
          </div>

          <div className="relative z-10 shrink-0 w-full md:w-auto">
            <Link 
              to="/book" 
              className="w-full md:w-auto block text-center bg-black hover:bg-slate-950 text-white font-black uppercase tracking-wider text-sm px-10 py-5 rounded-xl transition-all shadow-xl active:scale-[0.98] cursor-pointer"
            >
              {locale === "en" ? "Book Track Session" : "Prenota Sessione"}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer - Print hidden */}
      <footer className="bg-slate-950 border-t border-slate-900 py-12 text-center text-xs text-slate-400 uppercase tracking-wider font-mono print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center sm:items-start space-y-2">
            <div className="flex items-center space-x-2">
              <Flag className="h-4.5 w-4.5 text-orange-500" />
              <span className="font-bold text-slate-400">{t.copyright} - {companyConfig.companyName} ({companyConfig.circuitName})</span>
            </div>
            {/* Pikosoft attribution */}
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400 font-bold uppercase tracking-wider mt-1 border-t border-slate-900/40 pt-2">
              <span>{locale === "en" ? "Software by" : "Software di"}</span>
              <a href="https://pikosoft.it" target="_blank" rel="noopener noreferrer" className="inline-flex items-center hover:opacity-80 transition-opacity">
                <img src="/logobig.png" alt="Pikosoft Logo" className="h-4.5 object-contain" />
              </a>
              <span className="text-slate-800">|</span>
              <span>{locale === "en" ? "Powered by" : "Powered by"}</span>
              <img src="/logoleasio.png" alt={companyConfig.companyName} className="h-4.5 object-contain" />
            </div>
          </div>
          <div className="flex space-x-6 text-slate-400">
            <Link to="/#fleet" className="hover:text-white transition-colors">{t.fleet}</Link>
            <Link to="/#calendar" className="hover:text-white transition-colors">{locale === "en" ? "Calendar" : "Calendario"}</Link>
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

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
