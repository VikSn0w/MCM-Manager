import { useState } from "react";
import { Form, useLoaderData, useNavigation, useActionData } from "react-router";
import type { Route } from "./+types/championships";
import { requireAdmin } from "../../utils/auth.server";
import { prisma } from "../../utils/db.server";
import { getLocale } from "../../utils/locale.server";
import { translations, type Locale } from "../../utils/translations";
import { 
  Flag, 
  Trash2, 
  Edit3, 
  Plus, 
  X, 
  CheckCircle, 
  AlertTriangle, 
  DollarSign, 
  Users, 
  Clock, 
  Calendar 
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const locale = await getLocale(request);

  const championships = await prisma.championship.findMany({
    orderBy: { createdAt: "desc" },
  });

  return { championships, locale };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  
  const intent = formData.get("intent")?.toString();
  const id = formData.get("id")?.toString();

  if (intent === "delete") {
    if (!id) return { error: "Missing championship ID." };
    try {
      await prisma.championship.delete({ where: { id } });
      return { success: "Championship format deleted successfully from the paddock system." };
    } catch (e: any) {
      return { error: `Cannot delete: ${e.message}` };
    }
  }

  const name = formData.get("name")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const price = parseFloat(formData.get("price")?.toString() || "0");
  const minRacers = parseInt(formData.get("minRacers")?.toString() || "5", 10);
  const sessionsCount = parseInt(formData.get("sessionsCount")?.toString() || "3", 10);
  const isAvailable = formData.get("isAvailable") === "true";
  const fixedDate = formData.get("fixedDate")?.toString().trim() || null;

  if (!name || !description || isNaN(price) || price <= 0 || isNaN(minRacers) || minRacers <= 0 || isNaN(sessionsCount) || sessionsCount <= 0) {
    return { error: "Please enter valid values for all fields." };
  }

  try {
    if (intent === "create") {
      await prisma.championship.create({
        data: {
          name,
          description,
          price,
          minRacers,
          sessionsCount,
          isAvailable,
          fixedDate,
        },
      });
      return { success: "Championship format created successfully." };
    }

    if (intent === "update") {
      if (!id) return { error: "Missing championship ID for update." };
      await prisma.championship.update({
        where: { id },
        data: {
          name,
          description,
          price,
          minRacers,
          sessionsCount,
          isAvailable,
          fixedDate,
        },
      });
      return { success: "Championship format updated successfully." };
    }
  } catch (error: any) {
    return { error: `Failed to save championship: ${error.message}` };
  }

  return null;
}

export default function AdminChampionships() {
  const { championships, locale } = useLoaderData<typeof loader>();
  const actionData = useActionData() as { error?: string; success?: string } | undefined;
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const t = translations[locale as Locale];

  // UI state for dialogs
  const [isOpen, setIsOpen] = useState(false);
  const [editingChamp, setEditingChamp] = useState<any>(null);

  const handleOpenCreate = () => {
    setEditingChamp(null);
    setIsOpen(true);
  };

  const handleOpenEdit = (champ: any) => {
    setEditingChamp(champ);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <div className="space-y-8">
      
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-orange-500 font-mono">
            {locale === "en" ? "Racing Grid Manager" : "Gestione Campionati"}
          </span>
          <h1 className="text-3xl font-black uppercase text-white tracking-tight mt-1 flex items-center space-x-2">
            <Flag className="h-8 w-8 text-orange-500" />
            <span>{locale === "en" ? "Championship Formats" : "Formati Campionato"}</span>
          </h1>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center space-x-1.5 bg-orange-600 text-white font-extrabold uppercase tracking-wider text-xs px-5 py-3 rounded-xl hover:bg-orange-500 shadow-xl shadow-orange-600/10 transition-all active:scale-[0.98] cursor-pointer"
        >
          <Plus className="h-4.5 w-4.5" />
          <span>{locale === "en" ? "Create Format" : "Crea Formato"}</span>
        </button>
      </div>

      {actionData?.error && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-5 flex items-start space-x-3 text-red-200 text-sm max-w-4xl">
          <AlertTriangle className="h-5.5 w-5.5 text-red-500 shrink-0 mt-0.5" />
          <p>{actionData.error}</p>
        </div>
      )}

      {actionData?.success && (
        <div className="bg-green-950/40 border border-green-500/30 rounded-2xl p-5 flex items-start space-x-3 text-green-200 text-sm max-w-4xl">
          <CheckCircle className="h-5.5 w-5.5 text-green-500 shrink-0 mt-0.5" />
          <p>{actionData.success}</p>
        </div>
      )}

      {/* Grid of championships */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        {championships.length === 0 ? (
          <div className="col-span-full bg-slate-900/60 border border-slate-850 p-16 rounded-3xl text-center space-y-4 shadow-xl">
            <Flag className="h-12 w-12 text-slate-700 mx-auto animate-pulse" />
            <h3 className="text-sm font-bold text-slate-400 uppercase">
              {locale === "en" ? "No Championship Formats Found" : "Nessun Formato Campionato Trovato"}
            </h3>
            <p className="text-xs text-slate-600 max-w-xs mx-auto">
              {locale === "en" ? "Use the create button above to add championship packages to the database." : "Usa il pulsante in alto per aggiungere pacchetti campionato."}
            </p>
          </div>
        ) : (
          championships.map((champ) => {
            const isUnavail = !champ.isAvailable;
            return (
              <div 
                key={champ.id}
                className={`bg-slate-900/60 border rounded-3xl overflow-hidden shadow-xl p-6 space-y-4 flex flex-col justify-between relative transition-all ${
                  isUnavail ? "border-slate-900 opacity-60" : "border-slate-850 hover:border-orange-500/50"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="text-lg font-black uppercase text-white leading-tight">{champ.name}</h3>
                      {champ.fixedDate && (
                        <div className="flex items-center space-x-1 mt-1 text-[10px] text-orange-400 font-bold uppercase font-mono">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{locale === "en" ? `Event Date: ${champ.fixedDate}` : `Data Evento: ${champ.fixedDate}`}</span>
                        </div>
                      )}
                    </div>
                    <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                      isUnavail
                        ? "bg-slate-950 text-slate-500 border-slate-900"
                        : "bg-green-950/60 text-green-400 border-green-500/10"
                    }`}>
                      {isUnavail ? (locale === "en" ? "DISABLED" : "DISATTIVATO") : (locale === "en" ? "ACTIVE" : "ATTIVO")}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 font-light leading-normal">{champ.description}</p>
                </div>

                <div className="pt-4 border-t border-slate-850 flex flex-col gap-3.5">
                  {/* Info stats */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="block text-[9px] text-slate-500 uppercase tracking-widest flex items-center space-x-1">
                        <DollarSign className="h-3.5 w-3.5" />
                        <span>Price</span>
                      </span>
                      <span className="text-sm font-black text-white">€{champ.price}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-slate-500 uppercase tracking-widest flex items-center space-x-1">
                        <Users className="h-3.5 w-3.5" />
                        <span>Grid Min</span>
                      </span>
                      <span className="text-sm font-black text-white">{champ.minRacers} {locale === "en" ? "racers" : "piloti"}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-slate-500 uppercase tracking-widest flex items-center space-x-1">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Sessions</span>
                      </span>
                      <span className="text-sm font-black text-white">{champ.sessionsCount} {locale === "en" ? "laps" : "turni"}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex space-x-3 pt-2.5">
                    <button
                      onClick={() => handleOpenEdit(champ)}
                      className="flex-1 py-2.5 bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-slate-800 text-slate-300 hover:text-white rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex justify-center items-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>{locale === "en" ? "Edit" : "Modifica"}</span>
                    </button>

                    <Form method="post" className="flex-1" onSubmit={(e) => {
                      if (!confirm(locale === "en" ? "Are you sure you want to delete this championship format?" : "Sei sicuro di voler eliminare questo formato campionato?")) {
                        e.preventDefault();
                      }
                    }}>
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={champ.id} />
                      <button
                        type="submit"
                        className="w-full py-2.5 bg-red-950/20 hover:bg-red-600 border border-red-500/20 hover:border-transparent text-red-400 hover:text-white rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex justify-center items-center space-x-1.5 transition-all cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{locale === "en" ? "Delete" : "Elimina"}</span>
                      </button>
                    </Form>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Slideout Modal/Drawer form for editing/creating */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />

          {/* Dialog Body */}
          <div className="relative bg-slate-900 border border-slate-850 w-full max-w-lg rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6 overflow-hidden">
            
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-slate-500 hover:text-white p-1 bg-slate-950 border border-slate-880 hover:border-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div>
              <h2 className="text-xl font-black uppercase text-white">
                {editingChamp 
                  ? (locale === "en" ? `Edit Format: ${editingChamp.name}` : `Modifica Formato: ${editingChamp.name}`) 
                  : (locale === "en" ? "Create Championship Format" : "Crea Formato Campionato")}
              </h2>
            </div>

            <Form method="post" className="space-y-4" onSubmit={handleClose}>
              <input type="hidden" name="intent" value={editingChamp ? "update" : "create"} />
              {editingChamp && <input type="hidden" name="id" value={editingChamp.id} />}

              {/* Name */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">{locale === "en" ? "Format Name" : "Nome Formato"}</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={editingChamp?.name || ""}
                  placeholder="e.g. GP Sprint, Autumn GP Enduro"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">{locale === "en" ? "Description Laps/Races" : "Descrizione Turni/Giri"}</label>
                <textarea
                  name="description"
                  required
                  rows={2}
                  defaultValue={editingChamp?.description || ""}
                  placeholder="e.g. 10m free laps + 10m qualify + 8-lap race"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold leading-normal"
                />
              </div>

              {/* Price per Racer */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">{locale === "en" ? "Price per Racer (€)" : "Prezzo per Pilota (€)"}</label>
                <input
                  type="number"
                  name="price"
                  required
                  step="0.01"
                  min="1"
                  defaultValue={editingChamp?.price || ""}
                  placeholder="65.00"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Min Racers count */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">{locale === "en" ? "Min. Racers Grid" : "Min. Piloti Griglia"}</label>
                  <input
                    type="number"
                    name="minRacers"
                    required
                    min="1"
                    defaultValue={editingChamp?.minRacers || 5}
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                  />
                </div>

                {/* Sessions count */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">{locale === "en" ? "Occupied Sessions" : "Turni Occupati"}</label>
                  <input
                    type="number"
                    name="sessionsCount"
                    required
                    min="1"
                    defaultValue={editingChamp?.sessionsCount || 3}
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                  />
                </div>
              </div>

              {/* Scheduled Calendar Event Date (fixedDate) */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">
                  {locale === "en" ? "Scheduled Event Date (Optional)" : "Data Evento Programmato (Opzionale)"}
                </label>
                <input
                  type="date"
                  name="fixedDate"
                  defaultValue={editingChamp?.fixedDate || ""}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                />
                <span className="block text-[9px] text-slate-500 leading-normal">
                  {locale === "en" 
                    ? "* Leave empty for general booking availability. Set a date to display directly on the frontpage events calendar."
                    : "* Lascia vuoto per prenotazioni generali. Imposta una data per pubblicarla sul calendario eventi in homepage."}
                </span>
              </div>

              {/* isAvailable toggler */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">{locale === "en" ? "Paddock Availability Status" : "Stato Disponibilità Paddock"}</label>
                <select
                  name="isAvailable"
                  defaultValue={editingChamp ? (editingChamp.isAvailable ? "true" : "false") : "true"}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                >
                  <option value="true">{locale === "en" ? "Active (Selectable by customers)" : "Attivo (Selezionabile dai clienti)"}</option>
                  <option value="false">{locale === "en" ? "Disabled" : "Disattivato"}</option>
                </select>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-850 flex justify-end space-x-3 text-xs uppercase font-extrabold tracking-wider">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-3 border border-slate-850 text-slate-400 hover:text-white rounded-xl hover:bg-slate-850 transition-all cursor-pointer"
                >
                  {locale === "en" ? "Cancel" : "Annulla"}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-orange-600 text-white px-5 py-3 rounded-xl hover:bg-orange-500 shadow-xl shadow-orange-600/10 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {editingChamp ? (locale === "en" ? "Save Modifications" : "Salva Modifiche") : (locale === "en" ? "Create Format" : "Crea Formato")}
                </button>
              </div>

            </Form>
          </div>
        </div>
      )}

    </div>
  );
}
