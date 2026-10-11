import { Form, Link, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/grid";
import { requireAdmin } from "../../utils/auth.server";
import { prisma } from "../../utils/db.server";
import { getLocale } from "../../utils/locale.server";
import { bikeDisplayName } from "../../utils/bike";
import { Flag, AlertTriangle, CheckCircle, Layers, Printer, Users } from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const locale = await getLocale(request);

  const url = new URL(request.url);
  const selectedId = url.searchParams.get("championshipId");

  const championships = await prisma.championship.findMany({
    orderBy: [{ fixedDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, fixedDate: true },
  });

  const activeId = selectedId || championships[0]?.id || null;

  const active = activeId
    ? await prisma.championship.findUnique({
        where: { id: activeId },
        include: {
          groups: {
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: {
              entries: {
                where: { booking: { status: { in: ["CONFIRMED", "PENDING"] } } },
                orderBy: [{ gridPosition: "asc" }],
                include: {
                  bike: { include: { model: { select: { name: true, model: true } } } },
                  booking: { select: { id: true, status: true, date: true } },
                },
              },
            },
          },
        },
      })
    : null;

  return { championships, active, locale };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();

  const intent = formData.get("intent")?.toString();
  if (intent !== "moveRider") return null;

  const entryId = formData.get("entryId")?.toString();
  const targetGroupId = formData.get("targetGroupId")?.toString();

  if (!entryId || !targetGroupId) {
    return { error: "Mancano il pilota o il gruppo di destinazione." };
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const entry = await tx.bookingBike.findUnique({
          where: { id: entryId },
          include: {
            bike: true,
            booking: { select: { date: true, status: true } },
            championshipGroup: { select: { id: true, championshipId: true } },
          },
        });

        if (!entry) throw new Error("Questa iscrizione non esiste più.");
        if (!entry.championshipGroup) throw new Error("Questo pilota non fa parte di un gruppo di campionato.");
        if (entry.championshipGroupId === targetGroupId) return;

        const target = await tx.championshipGroup.findUnique({ where: { id: targetGroupId } });
        if (!target) throw new Error("Questo gruppo non esiste più.");
        if (target.championshipId !== entry.championshipGroup.championshipId) {
          throw new Error("Puoi spostare un pilota solo tra gruppi dello stesso campionato.");
        }

        const taken = await tx.bookingBike.count({
          where: {
            championshipGroupId: targetGroupId,
            booking: { status: { in: ["CONFIRMED", "PENDING"] } },
          },
        });
        if (taken >= target.capacity) {
          throw new Error(`"${target.name}" è al completo (${target.capacity} piloti).`);
        }

        // Each heat reuses the whole fleet, so the rider's current bike may
        // already be spoken for in the destination group. Keep the bike when it
        // is free there, otherwise pick another of the same model.
        const clash = await tx.bookingBike.findFirst({
          where: {
            championshipGroupId: targetGroupId,
            bikeId: entry.bikeId,
            booking: { status: { in: ["CONFIRMED", "PENDING"] } },
          },
        });

        let bikeId = entry.bikeId;
        if (clash) {
          const usedThere = await tx.bookingBike.findMany({
            where: {
              championshipGroupId: targetGroupId,
              booking: { status: { in: ["CONFIRMED", "PENDING"] } },
            },
            select: { bikeId: true },
          });
          const busy = new Set(usedThere.map((u) => u.bikeId));

          const replacement = await tx.bike.findFirst({
            where: {
              status: "AVAILABLE",
              modelId: entry.bike.modelId,
              id: { notIn: [...busy] },
            },
          });
          if (!replacement) {
            throw new Error(
              `Nessuna moto ${entry.bike.modelId ? "di quel modello" : ""} libera in "${target.name}".`
            );
          }
          bikeId = replacement.id;
        }

        await tx.bookingBike.update({
          where: { id: entryId },
          data: {
            championshipGroupId: targetGroupId,
            bikeId,
            gridPosition: taken + 1,
          },
        });
      },
      { isolationLevel: "Serializable" }
    );
  } catch (err: any) {
    if (typeof err === "object" && err !== null && err.code === "P2034") {
      return { error: "Un'altra modifica è arrivata nello stesso momento. Ricarica e riprova." };
    }
    return { error: err?.message || "Impossibile spostare il pilota." };
  }

  return { success: "Pilota spostato." };
}

export default function AdminGrid() {
  const { championships, active, locale } = useLoaderData<typeof loader>();
  const actionData = useActionData() as { error?: string; success?: string } | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [searchParams, setSearchParams] = useSearchParams();

  const totalRiders = active?.groups.reduce((acc, g) => acc + g.entries.length, 0) ?? 0;

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-orange-500 font-mono">
            {locale === "en" ? "Race Day Grid" : "Griglia Gara"}
          </span>
          <h1 className="text-3xl font-black uppercase text-white tracking-tight mt-1 flex items-center space-x-2">
            <Layers className="h-8 w-8 text-orange-500" />
            <span>{locale === "en" ? "Bike Assignment Sheet" : "Assegnazione Moto"}</span>
          </h1>
          {active?.fixedDate && (
            <p className="text-xs text-orange-400 font-bold uppercase font-mono mt-1">{active.fixedDate}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={active?.id || ""}
            onChange={(e) => setSearchParams({ championshipId: e.target.value })}
            className="bg-slate-950 border border-slate-850 text-white rounded-xl py-2.5 px-4 text-xs font-semibold outline-none focus:border-orange-500 cursor-pointer"
          >
            {championships.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.fixedDate ? ` — ${c.fixedDate}` : ""}
              </option>
            ))}
          </select>

          <button
            onClick={() => window.print()}
            className="py-2.5 px-4 bg-slate-950 hover:bg-slate-850 border border-slate-850 text-slate-300 hover:text-white rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{locale === "en" ? "Print" : "Stampa"}</span>
          </button>
        </div>
      </div>

      {actionData?.error && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-4 flex items-start space-x-3 text-red-200 text-sm">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p>{actionData.error}</p>
        </div>
      )}
      {actionData?.success && (
        <div className="bg-green-950/40 border border-green-500/30 rounded-2xl p-4 flex items-start space-x-3 text-green-200 text-sm">
          <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
          <p>{actionData.success}</p>
        </div>
      )}

      {!active ? (
        <div className="bg-slate-900/60 border border-slate-850 rounded-3xl p-10 text-center text-slate-400 text-sm">
          {locale === "en"
            ? "No championships yet. Create one to build a grid."
            : "Nessun campionato. Creane uno per costruire la griglia."}
        </div>
      ) : active.groups.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-850 rounded-3xl p-10 text-center space-y-3">
          <p className="text-slate-400 text-sm">
            {locale === "en"
              ? "This championship has no skill groups yet."
              : "Questo campionato non ha ancora gruppi di livello."}
          </p>
          <Link
            to="/admin/championships"
            className="inline-block py-2.5 px-5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition-colors"
          >
            {locale === "en" ? "Manage groups" : "Gestisci gruppi"}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Users className="h-4 w-4 text-slate-600" />
            <span>
              {locale === "en"
                ? `${totalRiders} rider(s) entered across ${active.groups.length} group(s)`
                : `${totalRiders} pilota/i in ${active.groups.length} gruppo/i`}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {active.groups.map((group) => (
              <div key={group.id} className="bg-slate-900/60 border border-slate-850 rounded-3xl overflow-hidden shadow-xl flex flex-col">

                {/* Group header, styled like the printed sheet */}
                <div className="bg-lime-400 px-4 py-3">
                  <h2 className="text-slate-950 font-black uppercase text-sm tracking-tight text-center leading-tight">
                    {group.name}
                  </h2>
                  {group.timeSlot && (
                    <p className="text-slate-900/70 text-xs font-bold text-center font-mono">{group.timeSlot}</p>
                  )}
                </div>

                <div className="p-3 space-y-1.5 flex-1">
                  {group.entries.length === 0 ? (
                    <p className="text-xs text-slate-600 text-center py-6 uppercase tracking-wider">
                      {locale === "en" ? "Empty grid" : "Griglia vuota"}
                    </p>
                  ) : (
                    group.entries.map((entry, idx) => (
                      <div key={entry.id} className="border-b border-slate-850 last:border-0 pb-1.5 last:pb-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lime-400 font-black text-xs w-4 shrink-0">{entry.gridPosition ?? idx + 1}</span>
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs text-white font-semibold truncate">
                              {entry.pilotName || (locale === "en" ? "Rider" : "Pilota")}
                            </span>
                            <span className="block text-xs text-slate-400 truncate">{entry.bike.model.model}</span>
                          </div>
                          <span className="text-xs font-mono font-bold text-white shrink-0">
                            {bikeDisplayName(entry.bike)}
                          </span>
                        </div>

                        {active.groups.length > 1 && (
                          <Form method="post" className="mt-1 pl-6 print:hidden">
                            <input type="hidden" name="intent" value="moveRider" />
                            <input type="hidden" name="entryId" value={entry.id} />
                            <select
                              name="targetGroupId"
                              defaultValue={group.id}
                              disabled={isSubmitting}
                              onChange={(e) => e.currentTarget.form?.requestSubmit()}
                              className="w-full bg-slate-950 border border-slate-880 text-xs text-slate-400 rounded px-1.5 py-0.5 outline-none focus:border-orange-500 cursor-pointer disabled:opacity-50"
                              title={locale === "en" ? "Move rider to another group" : "Sposta il pilota in un altro gruppo"}
                            >
                              {active.groups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.id === group.id ? (locale === "en" ? "— stay here —" : "— resta qui —") : g.name}
                                </option>
                              ))}
                            </select>
                          </Form>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="px-3 py-2 border-t border-slate-850 text-xs font-mono text-slate-400 text-center">
                  {group.entries.length}/{group.capacity}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
}
