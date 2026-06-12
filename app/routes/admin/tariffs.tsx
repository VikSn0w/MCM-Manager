import { useState, useEffect } from "react";
import { Form, useLoaderData, useNavigation, useActionData } from "react-router";
import type { Route } from "./+types/tariffs";
import { requireAdmin } from "../../utils/auth.server";
import { prisma } from "../../utils/db.server";
import { getLocale } from "../../utils/locale.server";
import { translations, type Locale } from "../../utils/translations";
import { 
  DollarSign, 
  Save, 
  Calendar, 
  CheckCircle,
  HelpCircle,
  AlertTriangle,
  Info
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const locale = await getLocale(request);
  const tariffs = await prisma.tariff.findMany({
    orderBy: { dayOfWeek: "asc" },
  });
  return { tariffs, locale };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  
  const dayOfWeek = parseInt(formData.get("dayOfWeek")?.toString() || "-1", 10);
  const basePricePerSession = parseFloat(formData.get("basePricePerSession")?.toString() || "0");
  const basePricePerPerson = parseFloat(formData.get("basePricePerPerson")?.toString() || "0");
  const minSessions = parseInt(formData.get("minSessions")?.toString() || "1", 10);
  const maxSessions = parseInt(formData.get("maxSessions")?.toString() || "6", 10);
  const discountThreshold = parseInt(formData.get("discountThreshold")?.toString() || "3", 10);
  const discountThresholdPrice = parseFloat(formData.get("discountThresholdPrice")?.toString() || "0");
  const pricePerSessionAfterThreshold = parseFloat(formData.get("pricePerSessionAfterThreshold")?.toString() || "0");

  if (
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    basePricePerSession <= 0 ||
    basePricePerPerson <= 0 ||
    discountThreshold <= 0 ||
    discountThresholdPrice <= 0 ||
    pricePerSessionAfterThreshold < 0
  ) {
    return { error: "Invalid pricing variables." };
  }

  await prisma.tariff.update({
    where: { dayOfWeek },
    data: {
      basePricePerSession,
      basePricePerPerson,
      minSessions,
      maxSessions,
      discountThreshold,
      discountThresholdPrice,
      pricePerSessionAfterThreshold,
    },
  });

  return { success: "Tariff rules updated successfully." };
}

export default function AdminTariffs() {
  const { tariffs, locale } = useLoaderData<typeof loader>();
  const t = translations[locale as Locale];

  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [editingDay, setEditingDay] = useState<number | null>(null);
  const actionData = useActionData<any>();

  useEffect(() => {
    if (actionData?.success) {
      setEditingDay(null);
    }
  }, [actionData]);

  const weekdays = locale === "en"
    ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    : ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

  return (
    <div className="space-y-10">
      
      {/* Title */}
      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-orange-500 font-mono">
          {locale === "en" ? "Pricing Control" : "Controllo Tariffe"}
        </span>
        <h1 className="text-3xl font-black uppercase text-white tracking-tight mt-1">
          {locale === "en" ? "Tariff Scheduler" : "Tariffe del Weekend e Turni"}
        </h1>
      </div>

      {/* Action Feedback Banners */}
      {actionData?.success && (
        <div className="bg-green-950/60 border border-green-500/20 text-green-400 p-4.5 rounded-2xl flex items-center space-x-3 text-xs font-semibold animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
          <span>{locale === "en" ? "Tariff rules updated successfully." : "Tariffe aggiornate con successo."}</span>
        </div>
      )}

      {actionData?.error && (
        <div className="bg-red-950/60 border border-red-500/20 text-red-400 p-4.5 rounded-2xl flex items-center space-x-3 text-xs font-semibold animate-in fade-in slide-in-from-top-4 duration-300">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <span>{actionData.error}</span>
        </div>
      )}

      {/* Info card */}
      <div className="bg-slate-900/60 border border-slate-850 p-5 rounded-2xl flex items-start space-x-3 shadow-xl">
        <Info className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 space-y-1">
          <span className="block font-bold text-white uppercase">
            {locale === "en" ? "Understanding Weekly Tariffs" : "Configurazione delle Tariffe Settimanali"}
          </span>
          <p className="leading-relaxed font-light">
            {locale === "en" 
              ? "Weekly tariffs are applied automatically during customer checkouts. You can define distinct base prices per session and base prices per rider for each day of the week. Perfect for weekend price hikes or weekday discounts."
              : "Le tariffe settimanali si applicano automaticamente al checkout del cliente. È possibile definire prezzi distinti per ogni turno o per piloti associati ad ogni giorno della settimana. Ideale per sconti infrasettimanali o maggiorazioni weekend."
            }
          </p>
        </div>
      </div>

      {/* Grid of days */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {tariffs.map((tariff) => {
          const isWeekend = tariff.dayOfWeek === 0 || tariff.dayOfWeek === 6;
          const isEditing = editingDay === tariff.dayOfWeek;

          return (
            <div 
              key={tariff.dayOfWeek}
              className={`bg-slate-900/60 backdrop-blur border rounded-3xl p-6 sm:p-8 shadow-xl transition-all ${
                isEditing 
                  ? "border-orange-500" 
                  : isWeekend
                    ? "border-orange-950/40"
                    : "border-slate-850 hover:border-slate-800"
              }`}
            >
              {!isEditing ? (
                // VIEW MODE
                <div className="space-y-6">
                  
                  {/* Header info */}
                  <div className="flex justify-between items-center border-b border-slate-850 pb-4">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-5 w-5 text-slate-400" />
                      <h3 className="text-lg font-extrabold text-white uppercase">{weekdays[tariff.dayOfWeek]}</h3>
                    </div>

                    <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                      isWeekend 
                        ? "bg-orange-950/60 text-orange-400 border-orange-500/10" 
                        : "bg-green-950/60 text-green-400 border-green-500/10"
                    }`}>
                      {isWeekend ? t.weekendPremium : t.weekdayStandard}
                    </span>
                  </div>

                  {/* Pricing specs grid */}
                  <div className="grid grid-cols-2 gap-6 text-xs font-mono">
                    
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-900">
                      <span className="block text-slate-500 uppercase tracking-widest text-[9px] mb-1">
                        {locale === "en" ? "Base Price / Session" : "Prezzo Base / Turno"}
                      </span>
                      <span className="text-xl font-black text-white">€{tariff.basePricePerSession.toFixed(2)}</span>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-900">
                      <span className="block text-slate-500 uppercase tracking-widest text-[9px] mb-1">
                        {locale === "en" ? "Base Price / Rider" : "Prezzo Base / Pilota"}
                      </span>
                      <span className="text-xl font-black text-white">€{tariff.basePricePerPerson.toFixed(2)}</span>
                    </div>

                    <div className="col-span-2 bg-slate-950/80 p-4 rounded-xl border border-slate-900/60 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 uppercase tracking-widest text-[9px]">
                          {locale === "en" ? "Package Promo" : "Promo Pacchetto"}
                        </span>
                        <span className="text-xs font-bold text-orange-400 font-mono">
                          {tariff.discountThreshold ?? 3} {locale === "en" ? "Turns" : "Turni"} @ €{(tariff.discountThresholdPrice ?? 60.0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-t border-slate-900 pt-1.5 text-[9px]">
                        <span className="text-slate-500 uppercase tracking-widest">
                          {locale === "en" ? "Extra Turn Rate" : "Tariffa Turni Extra"}
                        </span>
                        <span className="font-semibold text-slate-300 font-mono">
                          €{(tariff.pricePerSessionAfterThreshold ?? 20.0).toFixed(2)} / {locale === "en" ? "session" : "sessione"}
                        </span>
                      </div>
                    </div>

                    <div className="col-span-2 flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-wider font-bold pt-2 border-t border-slate-850/60">
                      <span>{locale === "en" ? "Min Sessions" : "Min Turni"}: <strong className="text-white">{tariff.minSessions}</strong></span>
                      <span>{locale === "en" ? "Max Sessions" : "Max Turni"}: <strong className="text-white">{tariff.maxSessions}</strong></span>
                    </div>

                  </div>

                  {/* Action */}
                  <div className="pt-4 border-t border-slate-850 flex justify-end">
                    <button
                      onClick={() => setEditingDay(tariff.dayOfWeek)}
                      className="text-xs font-black uppercase text-orange-500 hover:text-orange-400 transition-colors outline-none cursor-pointer"
                    >
                      {locale === "en" ? "Configure rates" : "Modifica Tariffe"}
                    </button>
                  </div>

                </div>
              ) : (
                // EDIT MODE
                <Form method="post" className="space-y-6">
                  <input type="hidden" name="dayOfWeek" value={tariff.dayOfWeek} />

                  <div className="border-b border-slate-850 pb-4 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-5 w-5 text-orange-500" />
                      <h3 className="text-lg font-extrabold text-white uppercase">{weekdays[tariff.dayOfWeek]} {locale === "en" ? "rates" : "tariffe"}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingDay(null)}
                      className="text-xs text-slate-500 hover:text-white uppercase font-bold cursor-pointer"
                    >
                      {locale === "en" ? "Cancel" : "Annulla"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    
                    <div>
                      <label className="block text-xs uppercase text-slate-500 font-bold tracking-wider mb-2">
                        {locale === "en" ? "Base Price / Session (€)" : "Prezzo Base / Turno (€)"}
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        required
                        name="basePricePerSession"
                        defaultValue={tariff.basePricePerSession}
                        className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs uppercase text-slate-500 font-bold tracking-wider mb-2">
                        {locale === "en" ? "Base Price / Rider Entrance (€)" : "Prezzo Base / Ingresso Pilota (€)"}
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        required
                        name="basePricePerPerson"
                        defaultValue={tariff.basePricePerPerson}
                        className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs uppercase text-slate-500 font-bold tracking-wider mb-2">
                        {locale === "en" ? "Min Sessions Limit" : "Limite Min Turni"}
                      </label>
                      <input
                        type="number"
                        required
                        name="minSessions"
                        defaultValue={tariff.minSessions}
                        className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs uppercase text-slate-500 font-bold tracking-wider mb-2">
                        {locale === "en" ? "Max Sessions Limit" : "Limite Max Turni"}
                      </label>
                      <input
                        type="number"
                        required
                        name="maxSessions"
                        defaultValue={tariff.maxSessions}
                        className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs uppercase text-slate-500 font-bold tracking-wider mb-2">
                        {locale === "en" ? "Discount Trigger (Sessions)" : "Soglia Sconto Turni (Sessioni)"}
                      </label>
                      <input
                        type="number"
                        required
                        name="discountThreshold"
                        defaultValue={tariff.discountThreshold ?? 3}
                        className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs uppercase text-slate-500 font-bold tracking-wider mb-2">
                        {locale === "en" ? "Package Price (€)" : "Prezzo Pacchetto Sconto (€)"}
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        required
                        name="discountThresholdPrice"
                        defaultValue={tariff.discountThresholdPrice ?? 60.0}
                        className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs uppercase text-slate-500 font-bold tracking-wider mb-2">
                        {locale === "en" ? "Subsequent Rate Per Session (€)" : "Prezzo Turni Successivi (€)"}
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        required
                        name="pricePerSessionAfterThreshold"
                        defaultValue={tariff.pricePerSessionAfterThreshold ?? 20.0}
                        className="w-full bg-slate-950 border border-slate-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2 flex justify-end space-x-4 pt-4 border-t border-slate-850">
                      <button
                        type="button"
                        onClick={() => setEditingDay(null)}
                        className="text-xs font-bold uppercase text-slate-400 hover:text-white px-5 py-3 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                      >
                        {locale === "en" ? "Cancel" : "Annulla"}
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex items-center space-x-1.5 bg-orange-600 text-white font-extrabold uppercase text-xs px-6 py-3.5 rounded-xl hover:bg-orange-500 shadow-xl transition-all active:scale-[0.98] cursor-pointer"
                      >
                        <Save className="h-4.5 w-4.5" />
                        <span>{locale === "en" ? "Save rates" : "Salva Tariffe"}</span>
                      </button>
                    </div>

                  </div>
                </Form>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
