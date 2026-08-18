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
  Calendar ,
  Layers,
  UserPlus
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const locale = await getLocale(request);

  const [championships, fleetSize, slots] = await Promise.all([
    prisma.championship.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        groups: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: { _count: { select: { entries: true } } },
        },
      },
    }),
    // Heats reuse the whole fleet, so one heat can never hold more riders than
    // there are rentable bikes.
    prisma.bike.count({ where: { status: "AVAILABLE" } }),
    prisma.timeSlot.findMany({ orderBy: { time: "asc" }, select: { time: true, label: true } }),
  ]);

  return { championships, locale, fleetSize, slots };
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

  // ---- Skill groups (heats) -------------------------------------------------

  if (intent === "deleteGroup") {
    const groupId = formData.get("groupId")?.toString();
    if (!groupId) return { error: "Missing group ID." };

    const entries = await prisma.bookingBike.count({ where: { championshipGroupId: groupId } });
    if (entries > 0) {
      return { error: `Cannot delete a group with ${entries} rider(s) in it. Move them to another group first.` };
    }

    await prisma.championshipGroup.delete({ where: { id: groupId } });
    return { success: "Group removed." };
  }

  if (intent === "saveGroup" || intent === "seedGroups") {
    const championshipId = formData.get("championshipId")?.toString();
    if (!championshipId) return { error: "Missing championship ID." };

    const championship = await prisma.championship.findUnique({ where: { id: championshipId } });
    if (!championship) return { error: "That championship no longer exists." };

    const fleetSize = await prisma.bike.count({ where: { status: "AVAILABLE" } });

    if (intent === "seedGroups") {
      // The four brackets used on the printed assignment sheet.
      const defaults = ["Rookie", "Esperti", "Veloci", "Gruppo Misto"];
      const existing = await prisma.championshipGroup.findMany({
        where: { championshipId },
        select: { name: true },
      });
      const taken = new Set(existing.map((g) => g.name.toLowerCase()));
      const toCreate = defaults.filter((n) => !taken.has(n.toLowerCase()));

      if (toCreate.length === 0) return { error: "Those groups already exist for this championship." };

      await prisma.championshipGroup.createMany({
        data: toCreate.map((n, i) => ({
          championshipId,
          name: n,
          capacity: Math.max(1, fleetSize || 7),
          sortOrder: defaults.indexOf(n),
        })),
      });
      return { success: `Added ${toCreate.length} standard group(s).` };
    }

    const groupId = formData.get("groupId")?.toString() || null;
    const groupName = formData.get("groupName")?.toString().trim();
    const groupDescription = formData.get("groupDescription")?.toString().trim() || null;
    const capacity = parseInt(formData.get("capacity")?.toString() || "0", 10);
    const timeSlot = formData.get("timeSlot")?.toString().trim() || null;
    const sortOrder = parseInt(formData.get("sortOrder")?.toString() || "0", 10);

    if (!groupName) return { error: "Group name is required." };
    if (!Number.isInteger(capacity) || capacity < 1) return { error: "Capacity must be at least 1." };
    if (fleetSize > 0 && capacity > fleetSize) {
      return { error: `Capacity cannot exceed the ${fleetSize} rentable bikes — a heat gives every rider a bike.` };
    }
    if (!Number.isInteger(sortOrder)) return { error: "Display order must be a whole number." };

    if (timeSlot) {
      const known = await prisma.timeSlot.findFirst({ where: { time: timeSlot } });
      if (!known) return { error: `"${timeSlot}" is not one of the configured session slots.` };
    }

    try {
      if (groupId) {
        await prisma.championshipGroup.update({
          where: { id: groupId },
          data: { name: groupName, description: groupDescription, capacity, timeSlot, sortOrder },
        });
        return { success: "Group updated." };
      }

      await prisma.championshipGroup.create({
        data: {
          championshipId,
          name: groupName,
          description: groupDescription,
          capacity,
          timeSlot,
          sortOrder,
        },
      });
      return { success: "Group added." };
    } catch (e: any) {
      if (e?.code === "P2002") {
        return { error: `This championship already has a group called "${groupName}".` };
      }
      return { error: `Could not save the group: ${e.message}` };
    }
  }

  const name = formData.get("name")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const price = parseFloat(formData.get("price")?.toString() || "0");
  const minRacers = parseInt(formData.get("minRacers")?.toString() || "5", 10);
  const sessionsCount = parseInt(formData.get("sessionsCount")?.toString() || "3", 10);
  const isAvailable = formData.get("isAvailable") === "true";
  const fixedDate = formData.get("fixedDate")?.toString().trim() || null;
  const lockMode = formData.get("lockMode")?.toString() === "TIME_WINDOW" ? "TIME_WINDOW" : "FULL_DAY";
  // Multi-select: every reserved slot arrives as its own "lockedHours" entry.
  const lockedHoursList = formData.getAll("lockedHours").map((h) => h.toString().trim()).filter(Boolean);
  const lockedHours = lockedHoursList.length > 0 ? lockedHoursList.join(", ") : null;

  if (!name || !description || isNaN(price) || price <= 0 || isNaN(minRacers) || minRacers <= 0 || isNaN(sessionsCount) || sessionsCount <= 0) {
    return { error: "Please enter valid values for all fields." };
  }

  if (fixedDate && !/^\d{4}-\d{2}-\d{2}$/.test(fixedDate)) {
    return { error: "Event date must be in YYYY-MM-DD format." };
  }

  // A window that reserves nothing would quietly behave like no lock at all.
  if (fixedDate && lockMode === "TIME_WINDOW" && lockedHoursList.length === 0) {
    return { error: "Pick at least one session slot for the reserved time window." };
  }

  if (lockedHoursList.length > 0) {
    const known = await prisma.timeSlot.findMany({ select: { time: true } });
    const knownTimes = new Set(known.map((k) => k.time));
    const unknown = lockedHoursList.find((h) => !knownTimes.has(h));
    if (unknown) return { error: `"${unknown}" is not a configured session slot.` };
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
          lockMode,
          lockedHours,
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
          lockMode,
          lockedHours,
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
  const { championships, locale, fleetSize, slots } = useLoaderData<typeof loader>();
  const actionData = useActionData() as { error?: string; success?: string } | undefined;
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const t = translations[locale as Locale];

  // UI state for dialogs
  const [isOpen, setIsOpen] = useState(false);
  const [editingChamp, setEditingChamp] = useState<any>(null);
  // Group editor: which championship, and which group (null = new).
  const [groupDialog, setGroupDialog] = useState<{ champId: string; group: any | null } | null>(null);
  // Track reservation controls inside the championship dialog.
  const [lockMode, setLockMode] = useState<"FULL_DAY" | "TIME_WINDOW">("FULL_DAY");

  const handleOpenCreate = () => {
    setEditingChamp(null);
    setLockMode("FULL_DAY");
    setIsOpen(true);
  };

  const handleOpenEdit = (champ: any) => {
    setEditingChamp(champ);
    setLockMode(champ.lockMode === "TIME_WINDOW" ? "TIME_WINDOW" : "FULL_DAY");
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
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-400 normal-case">
                            {champ.lockMode === "TIME_WINDOW"
                              ? (champ.lockedHours || (locale === "en" ? "no slots reserved" : "nessun orario riservato"))
                              : (locale === "en" ? "full day" : "intera giornata")}
                          </span>
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

                  {/* Skill groups / heats */}
                  <div className="pt-3 border-t border-slate-850 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-500 uppercase tracking-widest flex items-center space-x-1">
                        <Layers className="h-3.5 w-3.5" />
                        <span>{locale === "en" ? "Skill Groups" : "Gruppi di Livello"}</span>
                      </span>
                      <button
                        onClick={() => setGroupDialog({ champId: champ.id, group: null })}
                        className="text-[9px] font-extrabold uppercase text-orange-500 hover:text-orange-400 flex items-center space-x-1 cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                        <span>{locale === "en" ? "Add" : "Aggiungi"}</span>
                      </button>
                    </div>

                    {champ.groups.length === 0 ? (
                      <div className="space-y-2">
                        <p className="text-[10px] text-slate-500 leading-normal">
                          {locale === "en"
                            ? "No groups yet. Riders cannot pick a level until this championship has at least one."
                            : "Nessun gruppo. I piloti non possono scegliere un livello finché non ne esiste almeno uno."}
                        </p>
                        <Form method="post">
                          <input type="hidden" name="intent" value="seedGroups" />
                          <input type="hidden" name="championshipId" value={champ.id} />
                          <button
                            type="submit"
                            className="w-full py-2 bg-slate-950 hover:bg-slate-850 border border-slate-850 text-slate-300 hover:text-white rounded-lg text-[9px] font-extrabold uppercase tracking-wider flex justify-center items-center space-x-1.5 transition-colors cursor-pointer"
                          >
                            <UserPlus className="h-3 w-3" />
                            <span>{locale === "en" ? "Add standard groups" : "Aggiungi gruppi standard"}</span>
                          </button>
                        </Form>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {champ.groups.map((g: any) => {
                          const full = g._count.entries >= g.capacity;
                          return (
                            <div key={g.id} className="bg-slate-950 border border-slate-900 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <span className="block text-[10px] font-bold text-white truncate">{g.name}</span>
                                {g.timeSlot && (
                                  <span className="block text-[9px] text-slate-500 font-mono">{g.timeSlot}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                  full
                                    ? "bg-red-950/40 text-red-400 border-red-500/20"
                                    : "bg-slate-900 text-slate-400 border-slate-800"
                                }`}>
                                  {g._count.entries}/{g.capacity}
                                </span>
                                <button
                                  onClick={() => setGroupDialog({ champId: champ.id, group: g })}
                                  className="text-slate-500 hover:text-white cursor-pointer"
                                  title={locale === "en" ? "Edit group" : "Modifica gruppo"}
                                >
                                  <Edit3 className="h-3 w-3" />
                                </button>
                                <Form method="post" onSubmit={(e) => {
                                  if (!confirm(locale === "en" ? `Delete group "${g.name}"?` : `Eliminare il gruppo "${g.name}"?`)) {
                                    e.preventDefault();
                                  }
                                }}>
                                  <input type="hidden" name="intent" value="deleteGroup" />
                                  <input type="hidden" name="groupId" value={g.id} />
                                  <button type="submit" className="text-red-500/70 hover:text-red-400 cursor-pointer flex" title={locale === "en" ? "Delete group" : "Elimina gruppo"}>
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </Form>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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

              {/* Track reservation on the event date */}
              <div className="space-y-2.5 bg-slate-950/50 border border-slate-850 rounded-2xl p-4">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-widest">
                  {locale === "en" ? "Track Reservation" : "Riserva Pista"}
                </label>
                <p className="text-[9px] text-slate-500 leading-normal">
                  {locale === "en"
                    ? "Applies only when an event date is set. Ordinary bookings are refused for whatever this reserves."
                    : "Vale solo con una data evento impostata. Le prenotazioni ordinarie vengono rifiutate su ciò che viene riservato."}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setLockMode("FULL_DAY")}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      lockMode === "FULL_DAY"
                        ? "bg-slate-950 border-orange-500/60 text-white"
                        : "bg-slate-950/40 hover:bg-slate-950/80 border-slate-900 text-slate-500"
                    }`}
                  >
                    <span className="block font-bold text-[10px] uppercase">
                      {locale === "en" ? "Entire day" : "Intera giornata"}
                    </span>
                    <span className="block text-[9px] text-slate-500 mt-0.5 leading-normal">
                      {locale === "en" ? "Closes the circuit to all other bookings." : "Chiude la pista a ogni altra prenotazione."}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLockMode("TIME_WINDOW")}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      lockMode === "TIME_WINDOW"
                        ? "bg-slate-950 border-orange-500/60 text-white"
                        : "bg-slate-950/40 hover:bg-slate-950/80 border-slate-900 text-slate-500"
                    }`}
                  >
                    <span className="block font-bold text-[10px] uppercase">
                      {locale === "en" ? "Time window" : "Finestra oraria"}
                    </span>
                    <span className="block text-[9px] text-slate-500 mt-0.5 leading-normal">
                      {locale === "en" ? "Reserves only the slots you pick." : "Riserva solo gli orari selezionati."}
                    </span>
                  </button>
                </div>

                <input type="hidden" name="lockMode" value={lockMode} />

                {lockMode === "TIME_WINDOW" && (
                  <div className="space-y-1.5 pt-1">
                    <span className="block text-[9px] uppercase text-slate-400 font-bold tracking-widest">
                      {locale === "en" ? "Reserved slots" : "Orari riservati"}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {slots.map((slot) => {
                        const current: string[] = (editingChamp?.lockedHours || "")
                          .split(",")
                          .map((h: string) => h.trim())
                          .filter(Boolean);
                        return (
                          <label
                            key={slot.time}
                            className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-slate-800"
                          >
                            <input
                              type="checkbox"
                              name="lockedHours"
                              value={slot.time}
                              defaultChecked={current.includes(slot.time)}
                              className="h-3 w-3 rounded bg-slate-950 border-slate-800 text-orange-500 focus:ring-orange-500/30"
                            />
                            <span className="text-[10px] font-mono font-bold text-slate-300">{slot.time}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
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


      {/* Skill group editor */}
      {groupDialog && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setGroupDialog(null)} />

          <div className="relative bg-slate-900 border border-slate-850 w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
            <button
              onClick={() => setGroupDialog(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white p-1 bg-slate-950 border border-slate-880 hover:border-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div>
              <h2 className="text-lg font-black uppercase text-white">
                {groupDialog.group
                  ? (locale === "en" ? "Edit Group" : "Modifica Gruppo")
                  : (locale === "en" ? "New Skill Group" : "Nuovo Gruppo di Livello")}
              </h2>
              <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                {locale === "en"
                  ? "Each group races as its own heat, so the whole fleet is available again in every group."
                  : "Ogni gruppo corre nella propria manche, quindi l'intera flotta torna disponibile in ogni gruppo."}
              </p>
            </div>

            <Form method="post" className="space-y-4" onSubmit={() => setGroupDialog(null)}>
              <input type="hidden" name="intent" value="saveGroup" />
              <input type="hidden" name="championshipId" value={groupDialog.champId} />
              {groupDialog.group && <input type="hidden" name="groupId" value={groupDialog.group.id} />}

              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                  {locale === "en" ? "Group Name" : "Nome Gruppo"}
                </label>
                <input
                  type="text"
                  name="groupName"
                  required
                  defaultValue={groupDialog.group?.name || ""}
                  placeholder="Rookie / Esperti / Veloci / Gruppo Misto"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                  {locale === "en" ? "Description (optional)" : "Descrizione (facoltativa)"}
                </label>
                <input
                  type="text"
                  name="groupDescription"
                  defaultValue={groupDialog.group?.description || ""}
                  placeholder={locale === "en" ? "e.g. First time on an Ohvale" : "es. Prima volta su Ohvale"}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                    {locale === "en" ? "Riders per heat" : "Piloti per manche"}
                  </label>
                  <input
                    type="number"
                    name="capacity"
                    required
                    min={1}
                    max={Math.max(1, fleetSize)}
                    defaultValue={groupDialog.group?.capacity ?? Math.max(1, fleetSize)}
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-semibold"
                  />
                  <p className="text-[9px] text-slate-500">
                    {locale === "en" ? `Max ${fleetSize} (rentable bikes)` : `Max ${fleetSize} (moto noleggiabili)`}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                    {locale === "en" ? "Display order" : "Ordine"}
                  </label>
                  <input
                    type="number"
                    name="sortOrder"
                    required
                    defaultValue={groupDialog.group?.sortOrder ?? 0}
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                  {locale === "en" ? "Heat time (optional)" : "Orario manche (facoltativo)"}
                </label>
                <select
                  name="timeSlot"
                  defaultValue={groupDialog.group?.timeSlot || ""}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 text-white rounded-xl py-3 px-4 outline-none text-xs font-semibold cursor-pointer"
                >
                  <option value="">{locale === "en" ? "Not scheduled" : "Non programmato"}</option>
                  {slots.map((slot) => (
                    <option key={slot.time} value={slot.time}>
                      {slot.time} — {slot.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-2 text-[10px] font-extrabold uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setGroupDialog(null)}
                  className="bg-slate-950 border border-slate-850 text-slate-400 hover:text-white px-5 py-3 rounded-xl transition-colors cursor-pointer"
                >
                  {locale === "en" ? "Cancel" : "Annulla"}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-orange-600 text-white px-5 py-3 rounded-xl hover:bg-orange-500 shadow-xl shadow-orange-600/10 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {groupDialog.group ? (locale === "en" ? "Save Group" : "Salva Gruppo") : (locale === "en" ? "Add Group" : "Aggiungi Gruppo")}
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}

    </div>
  );
}
