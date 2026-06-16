import { useState, useEffect } from "react";
import { Link, useLoaderData, useNavigation, useActionData, Form, redirect } from "react-router";
import type { Route } from "./+types/order";
import { requireUserId, getUser } from "../utils/auth.server";
import { prisma } from "../utils/db.server";
import { getLocale } from "../utils/locale.server";
import { sendBookingConfirmedEmail, sendBookingCancelledEmail } from "../utils/email.server";
import { translations, type Locale } from "../utils/translations";
import { 
  Calendar, 
  Flag, 
  ShieldCheck, 
  Clock, 
  Users, 
  AlertTriangle, 
  Flame, 
  Printer, 
  CheckCircle,
  Receipt,
  XCircle,
  ArrowLeft,
  Crown,
  UserCheck
} from "lucide-react";

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

export async function loader({ params, request }: Route.LoaderArgs) {
  const userId = await requireUserId(request, `/login?redirectTo=/order/${params.id}`);

  // Stage 1: Fetch user, locale, booking, and company config concurrently
  const [user, locale, booking, companyConfig] = await Promise.all([
    getUser(request),
    getLocale(request),
    prisma.booking.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        bikes: {
          include: {
            bike: {
              include: {
                model: true
              }
            },
            pilotUser: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    }),
    prisma.companyConfig.findUnique({
      where: { id: "single-config" }
    }).then(conf => conf || {
      companyName: "Leasio Paddock Rentals",
      logoUrl: "/images/ohvale_gp_one_1780331510373.png",
      circuitName: "Autodromo di Franciacorta",
      googleMapsUrl: ""
    })
  ]);

  if (!user) {
    throw redirect("/login");
  }

  if (!booking) {
    throw new Response("Paddock Pass / Order Not Found", { status: 404 });
  }

  // Check authorization: Admin can view all. Creator and assigned pilots can view.
  const isCreator = booking.userId === user.id;
  const isPilot = booking.bikes.some(b => b.pilotUserId === user.id);
  const isAdmin = user.role === "ADMIN";

  if (!isAdmin && !isCreator && !isPilot) {
    throw new Response("Access Denied: You do not have permissions to view this paddock pass.", { status: 403 });
  }

  const parsedDate = new Date(booking.date);
  const dayOfWeek = parsedDate.getDay();

  // Stage 2: Fetch tariff, day config, and championship concurrently
  const [tariff, dayConfig, champ] = await Promise.all([
    prisma.tariff.findUnique({
      where: { dayOfWeek }
    }),
    prisma.dayConfig.findUnique({
      where: { date: booking.date }
    }),
    booking.bookingType === "CHAMPIONSHIP"
      ? prisma.championship.findFirst({
          where: { name: booking.championshipType || "" }
        })
      : Promise.resolve(null)
  ]);

  const customModifier = dayConfig?.customPriceModifier || 1.0;

  let basePricePerPerson = 0;
  let baseSessionsPrice = 0;
  if (booking.bookingType === "CHAMPIONSHIP") {
    basePricePerPerson = champ ? champ.price : (booking.totalPrice / booking.peopleCount);
  } else if (tariff) {
    const baseEntry = tariff.basePricePerPerson * customModifier;
    baseSessionsPrice = getSessionsBasePrice(
      booking.sessionsCount,
      tariff.basePricePerSession,
      tariff.discountThreshold,
      tariff.discountThresholdPrice,
      tariff.pricePerSessionAfterThreshold
    ) * customModifier;
    basePricePerPerson = baseEntry + baseSessionsPrice;
  } else {
    basePricePerPerson = booking.totalPrice / booking.peopleCount;
  }

  return { 
    user, 
    booking, 
    companyConfig, 
    locale, 
    isCreator, 
    isAdmin, 
    basePricePerPerson, 
    baseSessionsPrice,
    customModifier 
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const user = await getUser(request);
  
  if (!user) return redirect("/login");

  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: { bikes: true }
  });

  if (!booking) {
    return { error: "Order not found." };
  }

  const isCreator = booking.userId === userId;
  const isAdmin = user.role === "ADMIN";

  if (intent === "cancel") {
    // Only creator (for future dates) or Admin can cancel
    const isFutureDate = new Date(booking.date) >= new Date();
    if (!isAdmin && (!isCreator || !isFutureDate)) {
      return { error: "Not authorized to cancel this booking." };
    }

    await prisma.booking.update({
      where: { id: params.id },
      data: { status: "CANCELLED" }
    });

    const url = new URL(request.url);
    const requestHost = `${url.protocol}//${url.host}`;
    await sendBookingCancelledEmail(params.id!, requestHost);

    return { success: "Booking successfully cancelled." };
  }

  if (intent === "confirm" && isAdmin) {
    await prisma.booking.update({
      where: { id: params.id },
      data: { status: "CONFIRMED" }
    });

    const url = new URL(request.url);
    const requestHost = `${url.protocol}//${url.host}`;
    await sendBookingConfirmedEmail(params.id!, requestHost);

    return { success: "Booking successfully marked as confirmed." };
  }

  return null;
}

export default function OrderDetails() {
  const { 
    user, 
    booking, 
    companyConfig, 
    locale, 
    isCreator, 
    isAdmin, 
    basePricePerPerson, 
    baseSessionsPrice 
  } = useLoaderData<typeof loader>();
  const actionData = useActionData() as { error?: string; success?: string } | undefined;
  const t = translations[locale as Locale];
  
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [orderUrl, setOrderUrl] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrderUrl(`${window.location.origin}/order/${booking.id}`);
    }
  }, [booking.id]);

  const qrCodeSrc = orderUrl 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(orderUrl)}` 
    : "";

  const isCancelled = booking.status === "CANCELLED";
  const isConfirmed = booking.status === "CONFIRMED";
  const isFutureDate = new Date(booking.date) >= new Date();

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans relative overflow-hidden pb-20">
      
      {/* Dynamic Style injection for printing */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .print-layout {
            display: block !important;
            color: black !important;
            padding: 20px !important;
            width: 100% !important;
          }
          .print-pass-card {
            border: 2px solid #ddd !important;
            border-radius: 12px !important;
            padding: 20px !important;
            margin-bottom: 20px !important;
            background: white !important;
            color: black !important;
            page-break-inside: avoid;
          }
          .print-badge {
            border: 1px solid black !important;
            padding: 4px 8px !important;
            text-transform: uppercase !important;
            font-size: 10px !important;
            font-weight: bold !important;
          }
          a {
            text-decoration: none !important;
            color: black !important;
          }
        }
      `}} />

      {/* Background aesthetics */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-950/10 via-slate-950 to-slate-950 pointer-events-none no-print" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none no-print" />

      {/* -------------------- PRINT ONLY VIEW -------------------- */}
      <div className="hidden print-layout text-black">
        <div className="flex justify-between items-start border-b-2 border-slate-300 pb-6 mb-6">
          <div>
            {companyConfig.logoUrl ? (
              <img 
                src={companyConfig.logoUrl} 
                alt="Logo" 
                className="h-12 w-auto object-contain mb-3 rounded"
              />
            ) : null}
            <h1 className="text-2xl font-black uppercase tracking-tight">{companyConfig.companyName}</h1>
            <p className="text-sm font-bold text-slate-600">{companyConfig.circuitName}</p>
            <p className="text-xs text-slate-500 mt-1">Official Track Session Invoice & Paddock Pass</p>
          </div>
          <div className="text-right">
            <span className="print-badge font-mono">{booking.status}</span>
            <p className="text-xs font-mono font-bold mt-2">REF: {booking.id.toUpperCase()}</p>
            <p className="text-xs text-slate-500 mt-1">Date: {booking.date}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-xs">
          <div>
            <h3 className="font-extrabold uppercase mb-2 border-b border-slate-200 pb-1">Order Details</h3>
            <p><strong>Primary Buyer:</strong> {booking.user.name} ({booking.user.email})</p>
            <p><strong>Date of Event:</strong> {booking.date}</p>
            <p><strong>Track Format:</strong> {booking.bookingType === "CHAMPIONSHIP" ? `Championship (${booking.championshipType})` : "Standard Track Pack"}</p>
            <p><strong>Selected Hours:</strong> {booking.hours}</p>
            <p><strong>Rider Count:</strong> {booking.peopleCount} Racer(s)</p>
          </div>
          <div className="flex justify-end">
            <div className="text-center">
              {qrCodeSrc && (
                <img src={qrCodeSrc} alt="Verification QR Code" className="h-28 w-28 mx-auto" />
              )}
              <p className="text-[9px] text-slate-500 mt-1 font-mono">Scan to Verify in Backoffice</p>
            </div>
          </div>
        </div>

        <h3 className="text-sm font-extrabold uppercase mb-3 border-b border-slate-200 pb-1">Grid Allocations</h3>
        <div className="space-y-4 mb-8">
          {booking.bikes.map((bb, index) => {
            const modifierCost = booking.bookingType === "STANDARD"
              ? baseSessionsPrice * (bb.bike.model.priceModifier - 1.0)
              : 0;
            const insuranceCost = bb.insuranceSelected ? bb.bike.model.insurancePrice : 0;
            const apparelCost = bb.apparelSelected ? 10.0 : 0;
            const pilotTotal = basePricePerPerson + modifierCost + insuranceCost + apparelCost;

            return (
              <div key={index} className="border border-slate-350 p-4 rounded-xl flex justify-between items-start text-xs">
                <div>
                  <p className="font-bold text-sm">{bb.pilotName} {bb.pilotUser ? `(@${bb.pilotUser.name})` : ""}</p>
                  <p className="text-slate-650 mt-1">Ohvale GP: <strong>{bb.bike.model.name}</strong> (Displacement: {bb.bike.model.displacement}cc, Race Number: #{bb.bike.raceNumber || "N/A"})</p>
                  <div className="text-[10px] text-slate-500 font-mono mt-2 flex flex-wrap gap-2">
                    <span>Base: €{basePricePerPerson.toFixed(2)}</span>
                    {modifierCost > 0 && <span>| Upgrade: +€{modifierCost.toFixed(2)}</span>}
                    {insuranceCost > 0 && <span>| Ins: +€{insuranceCost.toFixed(2)}</span>}
                    {apparelCost > 0 && <span>| Apparel: +€{apparelCost.toFixed(2)}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block">Rider Total</span>
                  <span className="font-bold text-sm">€{pilotTotal.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-slate-300 pt-4 flex justify-between items-start">
          <p className="text-[10px] text-slate-500 max-w-sm">System generated via Leasio GP Paddock Hub. Thank you for your business.</p>
          <div className="text-right space-y-1">
            <div className="text-xs text-slate-650 font-bold">
              <span>Avg. Price Per Person:</span>
              <span className="ml-1 text-slate-800">€{(booking.totalPrice / booking.peopleCount).toFixed(2)}</span>
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase block">Grand Total Paid</span>
              <span className="text-lg font-black block">€{booking.totalPrice.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------- MAIN INTERACTIVE PAGE VIEW (no-print) -------------------- */}
      <div className="no-print">
        
        {/* Navigation header */}
        <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-20">
              <Link to={isAdmin ? "/admin/bookings" : "/dashboard"} className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors text-xs font-extrabold uppercase">
                <ArrowLeft className="h-4.5 w-4.5" />
                <span>{isAdmin ? (locale === "en" ? "Back to Reservations" : "Torna alle prenotazioni") : t.buttonRacerDashboard}</span>
              </Link>

              <Link to="/" className="flex items-center space-x-3 hover:opacity-90 transition-opacity">
                {companyConfig.logoUrl ? (
                  <img src={companyConfig.logoUrl} alt="Logo" className="h-8 object-contain max-w-20 rounded" />
                ) : (
                  <div className="bg-orange-600 p-1 rounded">
                    <Flame className="h-4.5 w-4.5 text-white" />
                  </div>
                )}
                <span className="text-md font-black uppercase text-white tracking-tight">{companyConfig.companyName}</span>
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 mt-10">

          {/* Action alerts */}
          {actionData?.success && (
            <div className="mb-6 bg-green-950/40 border border-green-500/30 rounded-2xl p-4 flex items-center space-x-3 text-green-200">
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
              <span className="text-xs font-bold uppercase">{actionData.success}</span>
            </div>
          )}
          {actionData?.error && (
            <div className="mb-6 bg-red-950/40 border border-red-500/30 rounded-2xl p-4 flex items-center space-x-3 text-red-200">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              <span className="text-xs font-bold uppercase">{actionData.error}</span>
            </div>
          )}

          {/* Order Header info block */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-orange-500 font-mono">
                {locale === "en" ? "Official Paddock Pass" : "Pass Paddock Ufficiale"}
              </span>
              <h1 className="text-3xl font-black uppercase text-white tracking-tight mt-1 flex items-center space-x-2">
                <span>{locale === "en" ? "Order Details" : "Dettagli Ordine"}</span>
                <span className="text-slate-600 font-mono font-normal text-sm select-all">#{booking.id.substring(0, 8)}</span>
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePrint}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-xl px-5 py-3 transition-colors flex items-center space-x-2 text-xs font-bold uppercase cursor-pointer"
              >
                <Printer className="h-4.5 w-4.5 text-slate-400" />
                <span>{locale === "en" ? "Print / Save PDF" : "Stampa / Salva PDF"}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Paddock Pass summary column */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Main parameters Card */}
              <div className="bg-slate-900/60 backdrop-blur border border-slate-850 p-6 rounded-3xl space-y-5 shadow-xl relative overflow-hidden">
                
                {/* Status indicator absolute corner */}
                <div className="absolute top-0 right-0">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 border-l border-b rounded-bl-2xl font-mono block ${
                    isCancelled
                      ? "bg-red-950/60 text-red-400 border-red-500/20"
                      : booking.status === "PENDING"
                        ? "bg-amber-950/60 text-amber-400 border-amber-500/20"
                        : "bg-green-950/60 text-green-400 border-green-500/20"
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

                <div className="flex items-center space-x-2 text-slate-450">
                  <Calendar className="h-4.5 w-4.5 text-orange-500" />
                  <span className="text-xs uppercase font-extrabold tracking-wider">{t.paddockDate}</span>
                </div>

                <div className="text-3xl font-black text-white font-mono">{booking.date}</div>

                <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-850 text-xs">
                  <div>
                    <span className="block text-slate-500 uppercase tracking-widest text-[9px] font-bold">{locale === "en" ? "Booking Owner" : "Intestatario Prenotazione"}</span>
                    <span className="block font-black text-slate-200 mt-1 uppercase truncate">{booking.user.name}</span>
                    <span className="block font-mono text-[10px] text-slate-400 truncate mt-0.5">{booking.user.email}</span>
                  </div>

                  <div>
                    <span className="block text-slate-500 uppercase tracking-widest text-[9px] font-bold">{locale === "en" ? "Format & Mode" : "Formato & Tipo"}</span>
                    <span className="block font-black text-slate-200 mt-1 uppercase">
                      {booking.bookingType === "CHAMPIONSHIP" ? `Championship (${booking.championshipType})` : "Standard Session Pack"}
                    </span>
                    <span className="block text-[10px] text-orange-450 uppercase mt-0.5">
                      {booking.bikeSelectionMode === "FIXED" ? (locale === "en" ? "Fixed Model" : "Monomarca") : (locale === "en" ? "Mixed Models" : "Misto")}
                    </span>
                  </div>

                  <div>
                    <span className="block text-slate-500 uppercase tracking-widest text-[9px] font-bold">{locale === "en" ? "Time Slots" : "Orari Turni"}</span>
                    <span className="block font-black text-white mt-1 font-mono tracking-wider">{booking.hours}</span>
                  </div>

                  <div>
                    <span className="block text-slate-500 uppercase tracking-widest text-[9px] font-bold">{locale === "en" ? "Track Sessions" : "Turni totali"}</span>
                    <span className="block font-black text-white mt-1">
                      {booking.bookingType === "CHAMPIONSHIP"
                        ? `${booking.sessionsCount} ${locale === "en" ? "Sessions" : "Turni"}`
                        : `${booking.sessionsCount} ${locale === "en" ? "session(s) per rider" : "turni per pilota"}`}
                    </span>
                  </div>
                </div>

              </div>

              {/* Pilot configurations List */}
              <div className="space-y-4">
                <h3 className="text-xs uppercase text-slate-400 font-extrabold tracking-wider">{locale === "en" ? "Rider Allocations" : "Assegnazioni Piloti"}</h3>
                
                {booking.bikes.map((bb, index) => {
                  const isPilotSelf = bb.pilotUserId === user.id;
                  const modifierCost = booking.bookingType === "STANDARD"
                    ? baseSessionsPrice * (bb.bike.model.priceModifier - 1.0)
                    : 0;
                  const insuranceCost = bb.insuranceSelected ? bb.bike.model.insurancePrice : 0;
                  const apparelCost = bb.apparelSelected ? 10.0 : 0;
                  const pilotTotal = basePricePerPerson + modifierCost + insuranceCost + apparelCost;

                  return (
                    <div key={index} className="bg-slate-900/40 border border-slate-850 p-6 rounded-3xl space-y-4 relative overflow-hidden">
                      
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                          <div className="bg-slate-900 h-6 w-6 rounded-full flex items-center justify-center text-xs font-black text-orange-500 border border-slate-800">
                            {index + 1}
                          </div>
                          <h4 className="text-sm font-black uppercase text-white">{bb.pilotName}</h4>
                          {isPilotSelf && (
                            <span className="text-[8px] bg-orange-600/20 text-orange-400 border border-orange-500/20 uppercase font-black px-1.5 py-0.5 rounded">
                              {locale === "en" ? "You" : "Tu"}
                            </span>
                          )}
                        </div>

                        {bb.pilotUser && (
                          <div className="flex items-center space-x-1 text-[9px] bg-blue-950/40 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-lg">
                            <UserCheck className="h-3 w-3" />
                            <span>@{bb.pilotUser.name} ({locale === "en" ? "Verified" : "Verificato"})</span>
                          </div>
                        )}
                      </div>

                      {/* Bike specific info */}
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-900 flex justify-between items-center text-xs">
                        <div className="space-y-1">
                          <span className="block text-slate-500 uppercase tracking-widest text-[8px] font-bold">{locale === "en" ? "Ohvale Bike Model" : "Modello Moto Ohvale"}</span>
                          <span className="font-extrabold text-white uppercase text-xs">{bb.bike.model.name}</span>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                            <span>Displacement: {bb.bike.model.displacement}cc</span>
                            {bb.bike.raceNumber && (
                              <span className="bg-orange-600/10 border border-orange-500/20 text-orange-500 font-mono text-[9px] px-1 rounded">
                                #{bb.bike.raceNumber}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Add-ons detail */}
                        <div className="flex flex-col gap-1 text-right shrink-0">
                          {bb.insuranceSelected ? (
                            <span className="text-[9px] bg-green-500/10 border border-green-500/25 text-green-400 font-extrabold uppercase px-2 py-0.5 rounded flex items-center justify-end space-x-1">
                              <ShieldCheck className="h-3 w-3" />
                              <span>{t.insuranceAdded}</span>
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-600 uppercase font-mono">{t.noCover}</span>
                          )}
                          {bb.apparelSelected && (
                            <span className="text-[9px] bg-blue-500/10 border border-blue-500/25 text-blue-400 font-extrabold uppercase px-2 py-0.5 rounded inline-block text-right">
                              {locale === "en" ? "Technical Apparel" : "Noleggio Abbigliamento"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Cost Details per Person */}
                      <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-900 text-[11px] space-y-2 text-slate-400 font-mono">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-900 pb-1.5 mb-1.5">
                          <span>{locale === "en" ? "Rider Cost Item" : "Costo Singolo Pilota"}</span>
                          <span>{locale === "en" ? "Price" : "Prezzo"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{locale === "en" ? "Base Racer Pass & Sessions" : "Quota Base Pilota & Turni"}</span>
                          <span className="text-white">€{basePricePerPerson.toFixed(2)}</span>
                        </div>
                        {modifierCost > 0 && (
                          <div className="flex justify-between">
                            <span>{locale === "en" ? `GP Model Upgrade (${bb.bike.model.name})` : `Modificatore Modello GP (${bb.bike.model.name})`}</span>
                            <span className="text-orange-400">+€{modifierCost.toFixed(2)}</span>
                          </div>
                        )}
                        {insuranceCost > 0 && (
                          <div className="flex justify-between">
                            <span>{locale === "en" ? "Crash Damage Protection" : "Assicurazione Danni Crash"}</span>
                            <span className="text-green-400">+€{insuranceCost.toFixed(2)}</span>
                          </div>
                        )}
                        {apparelCost > 0 && (
                          <div className="flex justify-between">
                            <span>{locale === "en" ? "Safety Apparel Rental" : "Noleggio Abbigliamento"}</span>
                            <span className="text-blue-400">+€{apparelCost.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-slate-900 pt-2 text-xs font-black uppercase tracking-wider">
                          <span className="text-slate-350">{locale === "en" ? "Rider Total Cost" : "Costo Totale Pilota"}</span>
                          <span className="text-green-400">€{pilotTotal.toFixed(2)}</span>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>

            </div>

            {/* QR Verification and Paddock Actions Column */}
            <div className="space-y-6">
              
              {/* QR Verification block */}
              <div className="bg-slate-900 border border-slate-850 p-6 rounded-3xl flex flex-col items-center text-center space-y-4 shadow-xl">
                <span className="block text-[10px] text-slate-500 uppercase tracking-widest font-black font-mono">
                  {locale === "en" ? "Verification QR Code" : "QR Code Verifica"}
                </span>
                
                {qrCodeSrc ? (
                  <div className="bg-white p-3 rounded-2xl shadow-xl">
                    <img 
                      src={qrCodeSrc} 
                      alt="Paddock Pass QR" 
                      className="h-36 w-36 object-contain"
                    />
                  </div>
                ) : (
                  <div className="h-36 w-36 bg-slate-950 border border-slate-850 rounded-2xl flex items-center justify-center">
                    <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                
                <p className="text-[10px] text-slate-400 leading-relaxed uppercase font-semibold">
                  {locale === "en" 
                    ? "Present this pass on your mobile device at track registration or scan to check status."
                    : "Presenta questo pass sul tuo smartphone al banco d'ingresso per la verifica."
                  }
                </p>
              </div>

              {/* Total Summary Block */}
              <div className="bg-slate-900/60 border border-slate-850 p-6 rounded-3xl space-y-4 shadow-xl">
                <div>
                  <span className="block text-slate-500 uppercase tracking-widest text-[9px] font-bold">{locale === "en" ? "Invoice Grand Total" : "Prezzo Totale Ricevuta"}</span>
                  <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">{t.vatInclusive}</span>
                </div>
                <div className="text-3xl font-black text-green-400">€{booking.totalPrice.toFixed(2)}</div>
              </div>

              {/* Average Price Per Person Block */}
              <div className="bg-slate-900/60 border border-slate-850 p-6 rounded-3xl space-y-4 shadow-xl">
                <div>
                  <span className="block text-slate-500 uppercase tracking-widest text-[9px] font-bold">
                    {locale === "en" ? "Avg. Price Per Person" : "Prezzo Medio a Persona"}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                    {locale === "en" ? "Total price split by rider count" : "Prezzo totale diviso per il numero piloti"}
                  </span>
                </div>
                <div className="text-2xl font-black text-orange-400">
                  €{(booking.totalPrice / booking.peopleCount).toFixed(2)}
                </div>
              </div>

              {/* Actions panel */}
              <div className="bg-slate-900/65 border border-slate-850 p-6 rounded-3xl space-y-4 shadow-xl">
                <h4 className="text-xs uppercase text-slate-400 font-extrabold tracking-wider border-b border-slate-850 pb-2.5">
                  {locale === "en" ? "Pass Actions" : "Azioni Pass"}
                </h4>

                {/* Cancel Booking Form if active */}
                {!isCancelled && (isAdmin || (isCreator && isFutureDate)) && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="cancel" />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full text-center bg-red-950/20 hover:bg-red-600 border border-red-500/20 hover:border-transparent text-red-400 hover:text-white text-xs font-bold uppercase py-3.5 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                      onClick={(e) => {
                        if (!confirm(t.cancellationConfirm)) {
                          e.preventDefault();
                        }
                      }}
                    >
                      {isSubmitting ? (locale === "en" ? "Cancelling..." : "Annullamento...") : t.buttonCancelReservation}
                    </button>
                  </Form>
                )}

                {/* Admin controls to confirm/activate status if pending or cancelled */}
                {isAdmin && (isCancelled || booking.status === "PENDING") && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="confirm" />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full text-center bg-green-950/20 hover:bg-green-650 border border-green-500/20 hover:border-transparent text-green-400 hover:text-white text-xs font-bold uppercase py-3.5 rounded-xl transition-all cursor-pointer"
                    >
                      {booking.status === "PENDING"
                        ? (locale === "en" ? "Confirm Booking" : "Conferma Prenotazione")
                        : (locale === "en" ? "Re-Confirm Booking" : "Ripristina Prenotazione")}
                    </button>
                  </Form>
                )}

                <div className="text-[10px] text-slate-500 leading-normal border-t border-slate-850 pt-3">
                  {isCancelled ? (
                    <span className="text-red-400 font-semibold uppercase">{locale === "en" ? "🚫 Cancelled Pass: Released bike allocations." : "🚫 Pass Annullato: Le moto sono state liberate."}</span>
                  ) : (
                    <span className="text-green-400 font-semibold uppercase">{locale === "en" ? "✅ Active Ticket: Present at pit entry." : "✅ Ticket Attivo: Presenta all'ingresso box."}</span>
                  )}
                </div>
              </div>

            </div>

          </div>

        </main>
      </div>

      {/* Platform Branding Footer */}
      <div className="max-w-7xl mx-auto text-center py-8 border-t border-slate-900/60 mt-12 text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono space-y-1 print:hidden">
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
