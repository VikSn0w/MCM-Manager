import { useState } from "react";
import { Form, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/calendar";
import { requireAdmin } from "../../utils/auth.server";
import { prisma } from "../../utils/db.server";
import { getLocale } from "../../utils/locale.server";
import { translations, type Locale } from "../../utils/translations";
import { 
  Calendar, 
  Save, 
  Trash2, 
  AlertTriangle, 
  Users, 
  ShieldAlert, 
  Info,
  CalendarCheck,
  CalendarDays,
  Plus
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const locale = await getLocale(request);
  const dayConfigs = await prisma.dayConfig.findMany({
    orderBy: { date: "asc" },
  });
  return { dayConfigs, locale };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();
  const dateStr = formData.get("date")?.toString();

  if (!dateStr) {
    return { error: "Date parameter is required." };
  }

  if (intent === "delete") {
    await prisma.dayConfig.delete({
      where: { date: dateStr },
    });
    return { success: "Custom date override successfully deleted." };
  }

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

  return null;
}

export default function AdminCalendar() {
  const { dayConfigs, locale } = useLoaderData<typeof loader>();
  const t = translations[locale as Locale];

  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedDate, setSelectedDate] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [maxCapacityPerSlot, setMaxCapacityPerSlot] = useState(5);
  const [customPriceModifier, setCustomPriceModifier] = useState("");
  const [notes, setNotes] = useState("");

  const handleEditOverride = (config: typeof dayConfigs[0]) => {
    setSelectedDate(config.date);
    setIsAvailable(config.isAvailable);
    setMaxCapacityPerSlot(config.maxCapacityPerSlot);
    setCustomPriceModifier(config.customPriceModifier?.toString() || "");
    setNotes(config.notes || "");
  };

  return (
    <div className="space-y-10">
      
      {/* Title */}
      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-orange-500 font-mono">
          {locale === "en" ? "Operations Hub" : "Operazioni e Calendario"}
        </span>
        <h1 className="text-3xl font-black uppercase text-white tracking-tight mt-1">
          {locale === "en" ? "Calendar & Capacity" : "Calendario e Turni Pista"}
        </h1>
      </div>

      {/* Info card */}
      <div className="bg-slate-900/60 border border-slate-850 p-5 rounded-2xl flex items-start space-x-3 shadow-xl">
        <Info className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 space-y-1">
          <span className="block font-bold text-white uppercase">
            {locale === "en" ? "Dynamic Daily Capacity & Event Controls" : "Controllo Turni e Limiti di Capacità Giornalieri"}
          </span>
          <p className="leading-relaxed font-light">
            {locale === "en" 
              ? "Customize daily track parameters. You can throttle track capacity per session slot (e.g., lower to 2 for VIP coaching sessions, or increase to 8 for corporate rentals), apply pricing overrides, or block dates completely for holidays, track maintenance, or external motorcycle races."
              : "Personalizza le impostazioni giornaliere. È possibile ridurre o aumentare la capacità di pista per ogni slot turni (es. limitare a 2 piloti per corsi esclusivi o aumentare a 8 per eventi aziendali), bloccare del tutto le date per manutenzioni o aggiungere sconti/tariffe speciali."
            }
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
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

    </div>
  );
}
