import { Form, useLoaderData, useNavigation, useActionData } from "react-router";
import type { Route } from "./+types/settings";
import { requireAdmin } from "../../utils/auth.server";
import { prisma } from "../../utils/db.server";
import { getLocale } from "../../utils/locale.server";
import { translations, type Locale } from "../../utils/translations";
import { Settings, Save, CheckCircle, AlertTriangle, Building2, MapPin, Image, Bike as BikeIcon } from "lucide-react";
import { useState } from "react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const locale = await getLocale(request);

  const config = await prisma.companyConfig.findUnique({
    where: { id: "single-config" },
  }) || {
    companyName: "MCM Racing School",
    logoUrl: "/images/ohvale_gp_one_1780331510373.png",
    circuitName: "Autodromo di Franciacorta",
    googleMapsUrl: "",
    bikeAssignmentMode: "AUTO",
  };

  return { config, locale };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  
  const companyName = formData.get("companyName")?.toString().trim();
  const logoUrl = formData.get("logoUrl")?.toString().trim();
  const circuitName = formData.get("circuitName")?.toString().trim();
  const googleMapsUrl = formData.get("googleMapsUrl")?.toString().trim() || null;
  const bikeAssignmentModeRaw = formData.get("bikeAssignmentMode")?.toString();
  const bikeAssignmentMode = bikeAssignmentModeRaw === "MANUAL" ? "MANUAL" : "AUTO";

  if (!companyName || !logoUrl || !circuitName) {
    return { error: "Tutti i campi del profilo sono obbligatori." };
  }

  try {
    await prisma.companyConfig.upsert({
      where: { id: "single-config" },
      create: {
        id: "single-config",
        companyName,
        logoUrl,
        circuitName,
        googleMapsUrl,
        bikeAssignmentMode,
      },
      update: {
        companyName,
        logoUrl,
        circuitName,
        googleMapsUrl,
        bikeAssignmentMode,
      },
    });

    return { success: "Dati dell'azienda aggiornati." };
  } catch (error: any) {
    return { error: `Impossibile aggiornare le impostazioni: ${error.message}` };
  }
}

export default function AdminSettings() {
  const { config, locale } = useLoaderData<typeof loader>();
  const actionData = useActionData() as { error?: string; success?: string } | undefined;
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";
  const [bikeAssignmentMode, setBikeAssignmentMode] = useState<"AUTO" | "MANUAL">(
    config.bikeAssignmentMode === "MANUAL" ? "MANUAL" : "AUTO"
  );

  const t = translations[locale as Locale];

  return (
    <div className="space-y-8 max-w-2xl">
      
      {/* Header title */}
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-orange-500 font-mono">
          {locale === "en" ? "SaaS Profile Customizer" : "Personalizzazione Profilo SaaS"}
        </span>
        <h1 className="text-3xl font-black uppercase text-white tracking-tight mt-1 flex items-center space-x-2">
          <Settings className="h-8 w-8 text-orange-500" />
          <span>{locale === "en" ? "Company & Racetrack Profile" : "Profilo Società e Circuito"}</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          {locale === "en" 
            ? "Configure global branding configurations. This application runs dynamically as a vertical customized for your circuit."
            : "Configura i dettagli del brand a livello globale. Questa applicazione funziona come verticale personalizzato per il tuo circuito."}
        </p>
      </div>

      {actionData?.error && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-5 flex items-start space-x-3 text-red-200 text-sm">
          <AlertTriangle className="h-5.5 w-5.5 text-red-500 shrink-0 mt-0.5" />
          <p>{actionData.error}</p>
        </div>
      )}

      {actionData?.success && (
        <div className="bg-green-950/40 border border-green-500/30 rounded-2xl p-5 flex items-start space-x-3 text-green-200 text-sm">
          <CheckCircle className="h-5.5 w-5.5 text-green-500 shrink-0 mt-0.5" />
          <p>{actionData.success}</p>
        </div>
      )}

      {/* Settings Form Card */}
      <div className="bg-slate-900/60 border border-slate-850 rounded-3xl p-6 sm:p-10 shadow-xl">
        <Form method="post" className="space-y-6">
          
          {/* Company Name */}
          <div className="space-y-2">
            <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider flex items-center space-x-1.5">
              <Building2 className="h-4 w-4 text-orange-500" />
              <span>{locale === "en" ? "Renting Company Name" : "Nome Società di Noleggio"}</span>
            </label>
            <input
              type="text"
              name="companyName"
              required
              defaultValue={config.companyName}
              placeholder="es. Ohvale Noleggi Srl"
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3.5 px-4 shadow-inner outline-none transition-all text-xs font-semibold"
            />
          </div>

          {/* Racetrack/Circuit Location */}
          <div className="space-y-2">
            <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider flex items-center space-x-1.5">
              <MapPin className="h-4 w-4 text-orange-500" />
              <span>{locale === "en" ? "Circuit / Track Location Name" : "Nome Circuito / Racetrack"}</span>
            </label>
            <input
              type="text"
              name="circuitName"
              required
              defaultValue={config.circuitName}
              placeholder="es. Autodromo del Mugello"
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3.5 px-4 shadow-inner outline-none transition-all text-xs font-semibold"
            />
          </div>

          {/* Company Logo Image URL */}
          <div className="space-y-2">
            <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider flex items-center space-x-1.5">
              <Image className="h-4 w-4 text-orange-500" />
              <span>{locale === "en" ? "Company Logo Path or URL" : "Percorso o URL del Logo Aziendale"}</span>
            </label>
            <input
              type="text"
              name="logoUrl"
              required
              defaultValue={config.logoUrl}
              placeholder="es. /images/logo-azienda.png"
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3.5 px-4 shadow-inner outline-none transition-all text-xs font-semibold"
            />
            
            {/* Visual Logo Preview */}
            {config.logoUrl && (
              <div className="mt-4 p-3 bg-slate-950 border border-slate-880 rounded-xl flex items-center space-x-3 w-fit">
                <span className="text-xs text-slate-400 uppercase font-mono">{locale === "en" ? "Logo Preview:" : "Anteprima Logo:"}</span>
                <div className="h-10 bg-slate-900 border border-slate-850 px-3 py-1.5 rounded-lg flex items-center justify-center">
                  <img
                    src={config.logoUrl}
                    alt="Logo attuale"
                    className="h-full object-contain max-w-40"
                    onError={(e) => {
                      // Fallback text if image doesn't load
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Google Maps Location URL */}
          <div className="space-y-2">
            <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider flex items-center space-x-1.5">
              <MapPin className="h-4 w-4 text-orange-500" />
              <span>{locale === "en" ? "Google Maps Embed URL or Navigation Link" : "URL di Incorporamento o Link Navigazione Google Maps"}</span>
            </label>
            <input
              type="text"
              name="googleMapsUrl"
              defaultValue={config.googleMapsUrl || ""}
              placeholder="es. https://www.google.com/maps/embed?pb=..."
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3.5 px-4 shadow-inner outline-none transition-all text-xs font-semibold"
            />
            <p className="text-xs text-slate-400 leading-normal">
              {locale === "en"
                ? "Provide a Google Maps iframe share embed URL (from Google Maps > Share > Embed map > src URL) to show an interactive map on the landing page, or standard link for button redirection."
                : "Inserisci l'URL iframe di condivisione di Google Maps (da Google Maps > Condividi > Incorpora mappa > URL src) per mostrare la mappa interattiva sulla landing page, oppure un link standard per reindirizzare tramite pulsante."}
            </p>
          </div>

          {/* Bike assignment policy */}
          <div className="space-y-2 pt-6 border-t border-slate-850">
            <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider flex items-center space-x-1.5">
              <BikeIcon className="h-4 w-4 text-orange-500" />
              <span>{locale === "en" ? "Bike Assignment Policy" : "Politica di Assegnazione Moto"}</span>
            </label>
            <p className="text-xs text-slate-400 leading-normal">
              {locale === "en"
                ? "Customers always choose a model, never an individual bike. This setting decides who picks the actual unit (e.g. “Stoner 27”)."
                : "I clienti scelgono sempre il modello, mai la singola moto. Questa impostazione decide chi sceglie l’esemplare (es. “Stoner 27”)."}
            </p>

            <input type="hidden" name="bikeAssignmentMode" value={bikeAssignmentMode} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <button
                type="button"
                onClick={() => setBikeAssignmentMode("AUTO")}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  bikeAssignmentMode === "AUTO"
                    ? "bg-slate-950 border-orange-500/60 text-white"
                    : "bg-slate-950/40 hover:bg-slate-950/80 border-slate-900 text-slate-400"
                }`}
              >
                <span className="block font-bold text-xs uppercase">
                  {locale === "en" ? "Automatic" : "Automatica"}
                </span>
                <span className="block text-xs text-slate-400 mt-1 leading-normal">
                  {locale === "en"
                    ? "The system allocates any free bike of the booked model. Nothing to review."
                    : "Il sistema assegna una moto libera del modello prenotato. Nessuna revisione necessaria."}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setBikeAssignmentMode("MANUAL")}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  bikeAssignmentMode === "MANUAL"
                    ? "bg-slate-950 border-orange-500/60 text-white"
                    : "bg-slate-950/40 hover:bg-slate-950/80 border-slate-900 text-slate-400"
                }`}
              >
                <span className="block font-bold text-xs uppercase">
                  {locale === "en" ? "Manual (MCM decides)" : "Manuale (decide MCM)"}
                </span>
                <span className="block text-xs text-slate-400 mt-1 leading-normal">
                  {locale === "en"
                    ? "Bikes are still reserved on booking so availability stays exact, but each booking waits in a review queue for staff to confirm or swap the units."
                    : "Le moto restano riservate alla prenotazione per mantenere esatta la disponibilità, ma ogni prenotazione attende in coda che lo staff confermi o cambi gli esemplari."}
                </span>
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-slate-850 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center space-x-2 bg-orange-600 text-white font-extrabold uppercase tracking-wider text-xs px-6 py-3.5 rounded-xl hover:bg-orange-500 shadow-xl shadow-orange-600/10 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-4.5 w-4.5" />
              <span>{isSaving ? (locale === "en" ? "Saving..." : "Salvataggio...") : (locale === "en" ? "Save Branding" : "Salva Dettagli")}</span>
            </button>
          </div>

        </Form>
      </div>

    </div>
  );
}
