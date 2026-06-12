import { useState } from "react";
import { Form, useLoaderData, useNavigation, useActionData } from "react-router";
import type { Route } from "./+types/lessons";
import { requireAdmin } from "../../utils/auth.server";
import { prisma } from "../../utils/db.server";
import { getLocale } from "../../utils/locale.server";
import { translations, type Locale } from "../../utils/translations";
import { 
  BookOpen, 
  Trash2, 
  Edit3, 
  Plus, 
  X, 
  CheckCircle, 
  AlertTriangle, 
  DollarSign, 
  Clock, 
  Calendar 
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const locale = await getLocale(request);

  const [lessons, bikeModels] = await Promise.all([
    prisma.lesson.findMany({
      include: { bikeModel: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.bikeModel.findMany({
      orderBy: { name: "asc" }
    })
  ]);

  return { lessons, bikeModels, locale };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  
  const intent = formData.get("intent")?.toString();
  const id = formData.get("id")?.toString();

  if (intent === "delete") {
    if (!id) return { error: "Missing lesson ID." };
    try {
      await prisma.lesson.delete({ where: { id } });
      return { success: "Lesson deleted successfully from the paddock system." };
    } catch (e: any) {
      return { error: `Cannot delete lesson: ${e.message}` };
    }
  }

  const title = formData.get("title")?.toString().trim();
  const titleIt = formData.get("titleIt")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const descriptionIt = formData.get("descriptionIt")?.toString().trim();
  const duration = formData.get("duration")?.toString().trim();
  const durationIt = formData.get("durationIt")?.toString().trim();
  const time = formData.get("time")?.toString().trim();
  const timeIt = formData.get("timeIt")?.toString().trim();
  const cost = parseFloat(formData.get("cost")?.toString() || "0");
  const isAvailable = formData.get("isAvailable") === "true";
  const bikeModelId = formData.get("bikeModelId")?.toString().trim() || null;

  if (!title || !titleIt || !description || !descriptionIt || !duration || !durationIt || !time || !timeIt || isNaN(cost) || cost <= 0) {
    return { error: "Please enter valid values for all fields." };
  }

  try {
    if (intent === "create") {
      await prisma.lesson.create({
        data: {
          title,
          titleIt,
          description,
          descriptionIt,
          duration,
          durationIt,
          time,
          timeIt,
          cost,
          isAvailable,
          bikeModelId,
        },
      });
      return { success: "Academy lesson created successfully." };
    }

    if (intent === "update") {
      if (!id) return { error: "Missing lesson ID for update." };
      await prisma.lesson.update({
        where: { id },
        data: {
          title,
          titleIt,
          description,
          descriptionIt,
          duration,
          durationIt,
          time,
          timeIt,
          cost,
          isAvailable,
          bikeModelId,
        },
      });
      return { success: "Academy lesson updated successfully." };
    }
  } catch (error: any) {
    return { error: `Failed to save lesson: ${error.message}` };
  }

  return null;
}

export default function AdminLessons() {
  const { lessons, bikeModels, locale } = useLoaderData<typeof loader>();
  const actionData = useActionData() as { error?: string; success?: string } | undefined;
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const t = translations[locale as Locale];

  // UI state for modal
  const [isOpen, setIsOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<any>(null);

  const handleOpenCreate = () => {
    setEditingLesson(null);
    setIsOpen(true);
  };

  const handleOpenEdit = (lesson: any) => {
    setEditingLesson(lesson);
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
            {locale === "en" ? "Racing Academy Manager" : "Gestione Accademia"}
          </span>
          <h1 className="text-3xl font-black uppercase text-white tracking-tight mt-1 flex items-center space-x-2">
            <BookOpen className="h-8 w-8 text-orange-500" />
            <span>{locale === "en" ? "Academy Lessons" : "Lezioni Academy"}</span>
          </h1>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center space-x-1.5 bg-orange-600 text-white font-extrabold uppercase tracking-wider text-xs px-5 py-3 rounded-xl hover:bg-orange-500 shadow-xl shadow-orange-600/10 transition-all active:scale-[0.98] cursor-pointer"
        >
          <Plus className="h-4.5 w-4.5" />
          <span>{locale === "en" ? "Add Lesson" : "Aggiungi Corso"}</span>
        </button>
      </div>

      {actionData?.error && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-5 flex items-start space-x-3 text-red-200 text-sm max-w-4xl animate-pulse">
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

      {/* Grid of lessons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        {lessons.length === 0 ? (
          <div className="col-span-full bg-slate-900/60 border border-slate-850 p-16 rounded-3xl text-center space-y-4 shadow-xl">
            <BookOpen className="h-12 w-12 text-slate-700 mx-auto animate-pulse" />
            <h3 className="text-sm font-bold text-slate-400 uppercase">
              {locale === "en" ? "No Lessons Found" : "Nessuna Lezione Trovata"}
            </h3>
            <p className="text-xs text-slate-600 max-w-xs mx-auto">
              {locale === "en" ? "Use the button above to add riding classes and coaching packages." : "Usa il pulsante in alto per aggiungere corsi di guida."}
            </p>
          </div>
        ) : (
          lessons.map((lesson) => {
            const isUnavail = !lesson.isAvailable;
            return (
              <div 
                key={lesson.id}
                className={`bg-slate-900/60 border rounded-3xl overflow-hidden shadow-xl p-6 space-y-4 flex flex-col justify-between relative transition-all ${
                  isUnavail ? "border-slate-900 opacity-60" : "border-slate-850 hover:border-orange-500/50"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="text-lg font-black uppercase text-white leading-tight font-mono">{locale === "en" ? lesson.title : lesson.titleIt}</h3>
                      <div className="flex flex-col gap-1.5 mt-2">
                        <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 font-medium">
                          <Clock className="h-3.5 w-3.5 text-orange-500/85 shrink-0" />
                          <span>{locale === "en" ? "Duration: " : "Durata: "}{locale === "en" ? lesson.duration : lesson.durationIt}</span>
                        </div>
                        <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 font-medium">
                          <Calendar className="h-3.5 w-3.5 text-orange-500/85 shrink-0" />
                          <span>{locale === "en" ? "Timing: " : "Orario: "}{locale === "en" ? lesson.time : lesson.timeIt}</span>
                        </div>
                        <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 font-medium">
                          <BookOpen className="h-3.5 w-3.5 text-orange-500/85 shrink-0" />
                          <span>
                            {locale === "en" ? "Training Bike: " : "Moto: "}
                            {lesson.bikeModel ? (
                              <span className="text-white font-bold">{lesson.bikeModel.name} ({lesson.bikeModel.displacement}cc)</span>
                            ) : (
                              <span className="text-slate-500 italic">{locale === "en" ? "None Assigned" : "Nessuna Moto"}</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                      isUnavail
                        ? "bg-slate-950 text-slate-500 border-slate-900"
                        : "bg-green-950/60 text-green-400 border-green-500/10"
                    }`}>
                      {isUnavail ? (locale === "en" ? "DISABLED" : "DISATTIVATO") : (locale === "en" ? "ACTIVE" : "ATTIVO")}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 font-light leading-normal pt-2">
                    {locale === "en" ? lesson.description : lesson.descriptionIt}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-850 flex flex-col gap-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block text-[9px] text-slate-500 uppercase tracking-widest flex items-center space-x-1">
                        <DollarSign className="h-3.5 w-3.5" />
                        <span>{locale === "en" ? "Cost" : "Costo"}</span>
                      </span>
                      <span className="text-lg font-black text-white font-mono">€{lesson.cost.toFixed(2)}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex space-x-2.5">
                      <button
                        onClick={() => handleOpenEdit(lesson)}
                        className="py-2.5 px-4 bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-slate-800 text-slate-300 hover:text-white rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex justify-center items-center space-x-1.5 transition-colors cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>{locale === "en" ? "Edit" : "Modifica"}</span>
                      </button>

                      <Form method="post" onSubmit={(e) => {
                        if (!confirm(locale === "en" ? "Are you sure you want to delete this class?" : "Sei sicuro di voler eliminare questo corso?")) {
                          e.preventDefault();
                        }
                      }}>
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={lesson.id} />
                        <button
                          type="submit"
                          className="py-2.5 px-4 bg-red-950/20 hover:bg-red-600 border border-red-500/20 hover:border-transparent text-red-400 hover:text-white rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex justify-center items-center space-x-1.5 transition-all cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{locale === "en" ? "Delete" : "Elimina"}</span>
                        </button>
                      </Form>
                    </div>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Slideout Modal form for editing/creating */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />

          <div className="relative bg-slate-900 border border-slate-850 w-full max-w-xl rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6 overflow-hidden max-h-[90vh] flex flex-col">
            
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-slate-500 hover:text-white p-1 bg-slate-950 border border-slate-880 hover:border-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div className="shrink-0">
              <h2 className="text-xl font-black uppercase text-white">
                {editingLesson 
                  ? (locale === "en" ? `Edit Lesson: ${editingLesson.title}` : `Modifica Corso: ${editingLesson.titleIt}`) 
                  : (locale === "en" ? "Create Academy Lesson" : "Crea Lezione Academy")}
              </h2>
            </div>

            <Form method="post" className="space-y-4 overflow-y-auto pr-1 flex-1 py-1" onSubmit={handleClose}>
              <input type="hidden" name="intent" value={editingLesson ? "update" : "create"} />
              {editingLesson && <input type="hidden" name="id" value={editingLesson.id} />}

              {/* Title inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">Title (EN)</label>
                  <input
                    type="text"
                    name="title"
                    required
                    defaultValue={editingLesson?.title || ""}
                    placeholder="e.g. Basic Track Technique"
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">Titolo (IT)</label>
                  <input
                    type="text"
                    name="titleIt"
                    required
                    defaultValue={editingLesson?.titleIt || ""}
                    placeholder="e.g. Tecnica Base in Pista"
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                  />
                </div>
              </div>

              {/* Cost */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">{locale === "en" ? "Cost per Lesson (€)" : "Costo del Corso (€)"}</label>
                <input
                  type="number"
                  name="cost"
                  required
                  step="0.01"
                  min="1"
                  defaultValue={editingLesson?.cost || ""}
                  placeholder="120.00"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold font-mono"
                />
              </div>

              {/* Duration inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">Duration (EN)</label>
                  <input
                    type="text"
                    name="duration"
                    required
                    defaultValue={editingLesson?.duration || ""}
                    placeholder="e.g. 2 Hours"
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">Durata (IT)</label>
                  <input
                    type="text"
                    name="durationIt"
                    required
                    defaultValue={editingLesson?.durationIt || ""}
                    placeholder="e.g. 2 Ore"
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                  />
                </div>
              </div>

              {/* Time slots inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">Time Slots (EN)</label>
                  <input
                    type="text"
                    name="time"
                    required
                    defaultValue={editingLesson?.time || ""}
                    placeholder="e.g. 09:00 - 11:00 or Custom"
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">Orari (IT)</label>
                  <input
                    type="text"
                    name="timeIt"
                    required
                    defaultValue={editingLesson?.timeIt || ""}
                    placeholder="e.g. 09:00 - 11:00 o Su Misura"
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                  />
                </div>
              </div>

              {/* Descriptions */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">Description (EN)</label>
                <textarea
                  name="description"
                  required
                  rows={2}
                  defaultValue={editingLesson?.description || ""}
                  placeholder="Master corner entry speed..."
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold leading-normal"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">Descrizione (IT)</label>
                <textarea
                  name="descriptionIt"
                  required
                  rows={2}
                  defaultValue={editingLesson?.descriptionIt || ""}
                  placeholder="Perfeziona la velocità di inserimento curva..."
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold leading-normal"
                />
              </div>

              {/* Assigned Bike & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">{locale === "en" ? "Assigned Bike Model" : "Modello Moto Assegnata"}</label>
                  <select
                    name="bikeModelId"
                    defaultValue={editingLesson?.bikeModelId || ""}
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                  >
                    <option value="">{locale === "en" ? "-- No Bike Model Assigned --" : "-- Nessun Modello Assegnato --"}</option>
                    {bikeModels.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.displacement}cc) - {m.usage}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">{locale === "en" ? "Academy Status" : "Stato Accademia"}</label>
                  <select
                    name="isAvailable"
                    defaultValue={editingLesson ? (editingLesson.isAvailable ? "true" : "false") : "true"}
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner outline-none text-xs font-semibold"
                  >
                    <option value="true">{locale === "en" ? "Active (Listed on Academy page)" : "Attivo (Mostrato nella pagina Academy)"}</option>
                    <option value="false">{locale === "en" ? "Disabled" : "Disattivato"}</option>
                  </select>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-850 flex justify-end space-x-3 text-xs uppercase font-extrabold tracking-wider shrink-0">
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
                  {editingLesson ? (locale === "en" ? "Save Modifications" : "Salva Modifiche") : (locale === "en" ? "Create Lesson" : "Crea Corso")}
                </button>
              </div>

            </Form>
          </div>
        </div>
      )}

    </div>
  );
}
