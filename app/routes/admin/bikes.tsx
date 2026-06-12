import { useState, useEffect } from "react";
import { Form, useLoaderData, useNavigation, useActionData } from "react-router";
import type { Route } from "./+types/bikes";
import { requireAdmin } from "../../utils/auth.server";
import { prisma } from "../../utils/db.server";
import { getLocale } from "../../utils/locale.server";
import { translations, type Locale } from "../../utils/translations";
import { 
  Flag, 
  Plus, 
  Save, 
  Trash2, 
  AlertTriangle,
  ShieldCheck,
  Cpu,
  ShieldAlert,
  Copy,
  Layers,
  Settings,
  X
} from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const locale = await getLocale(request);
  const bikes = await prisma.bike.findMany({
    include: { model: true },
    orderBy: { createdAt: "desc" },
  });
  const bikeModels = await prisma.bikeModel.findMany({
    orderBy: { createdAt: "desc" },
  });
  return { bikes, bikeModels, locale };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  // File upload logic for model images
  const imageUrlInput = formData.get("imageUrl")?.toString() || null;
  const imageFile = formData.get("imageFile") as any;
  let imageUrl = imageUrlInput;

  if (imageFile && typeof imageFile === "object" && imageFile.name && imageFile.size > 0) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    
    try {
      const uploadDir = path.join(process.cwd(), "public", "images");
      await fs.mkdir(uploadDir, { recursive: true });
      
      const safeFilename = imageFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = path.join(uploadDir, safeFilename);
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      
      await fs.writeFile(filePath, buffer);
      imageUrl = `/images/${safeFilename}`;
    } catch (err) {
      console.error("Error saving uploaded bike image file:", err);
    }
  } else {
    const existingImageUrl = formData.get("existingImageUrl")?.toString();
    if (existingImageUrl !== undefined) {
      imageUrl = existingImageUrl || null;
    }
  }

  // Model actions
  if (intent === "add-model") {
    const name = formData.get("name")?.toString();
    const builder = formData.get("builder")?.toString() || "Ohvale";
    const model = formData.get("model")?.toString();
    const displacement = parseInt(formData.get("displacement")?.toString() || "0", 10);
    const priceModifier = parseFloat(formData.get("priceModifier")?.toString() || "1.0");
    const insurancePrice = parseFloat(formData.get("insurancePrice")?.toString() || "25.0");
    const insuranceCoverage = parseFloat(formData.get("insuranceCoverage")?.toString() || "250.0");
    const bgColor = formData.get("bgColor")?.toString() || null;
    const info = formData.get("info")?.toString() || null;
    
    const hp = formData.get("hp") && formData.get("hp")?.toString() !== "" ? parseFloat(formData.get("hp")!.toString()) : null;
    const hpRpm = formData.get("hpRpm") && formData.get("hpRpm")?.toString() !== "" ? parseInt(formData.get("hpRpm")!.toString(), 10) : null;
    const torque = formData.get("torque") && formData.get("torque")?.toString() !== "" ? parseFloat(formData.get("torque")!.toString()) : null;
    const torqueRpm = formData.get("torqueRpm") && formData.get("torqueRpm")?.toString() !== "" ? parseInt(formData.get("torqueRpm")!.toString(), 10) : null;
    const usage = formData.get("usage")?.toString() || "BOTH";
    const gearbox = formData.get("gearbox")?.toString() || null;

    if (!name || !model || displacement <= 0) {
      return { error: "Missing essential bike model specs." };
    }

    await prisma.bikeModel.create({
      data: { name, builder, model, displacement, priceModifier, insurancePrice, insuranceCoverage, imageUrl, bgColor, info, hp, hpRpm, torque, torqueRpm, usage, gearbox }
    });
    return { success: "Successfully created new Bike Model class." };
  }

  if (intent === "edit-model") {
    const id = formData.get("id")?.toString();
    const name = formData.get("name")?.toString();
    const builder = formData.get("builder")?.toString() || "Ohvale";
    const model = formData.get("model")?.toString();
    const displacement = parseInt(formData.get("displacement")?.toString() || "0", 10);
    const priceModifier = parseFloat(formData.get("priceModifier")?.toString() || "1.0");
    const insurancePrice = parseFloat(formData.get("insurancePrice")?.toString() || "25.0");
    const insuranceCoverage = parseFloat(formData.get("insuranceCoverage")?.toString() || "250.0");
    const bgColor = formData.get("bgColor")?.toString() || null;
    const info = formData.get("info")?.toString() || null;

    const hp = formData.get("hp") && formData.get("hp")?.toString() !== "" ? parseFloat(formData.get("hp")!.toString()) : null;
    const hpRpm = formData.get("hpRpm") && formData.get("hpRpm")?.toString() !== "" ? parseInt(formData.get("hpRpm")!.toString(), 10) : null;
    const torque = formData.get("torque") && formData.get("torque")?.toString() !== "" ? parseFloat(formData.get("torque")!.toString()) : null;
    const torqueRpm = formData.get("torqueRpm") && formData.get("torqueRpm")?.toString() !== "" ? parseInt(formData.get("torqueRpm")!.toString(), 10) : null;
    const usage = formData.get("usage")?.toString() || "BOTH";
    const gearbox = formData.get("gearbox")?.toString() || null;

    if (!id || !name || !model || displacement <= 0) {
      return { error: "Missing essential model details." };
    }

    await prisma.bikeModel.update({
      where: { id },
      data: { name, builder, model, displacement, priceModifier, insurancePrice, insuranceCoverage, imageUrl, bgColor, info, hp, hpRpm, torque, torqueRpm, usage, gearbox }
    });
    return { success: "Bike Model details successfully updated." };
  }

  if (intent === "delete-model") {
    const id = formData.get("id")?.toString();
    if (!id) return { error: "No model ID specified." };

    const count = await prisma.bike.count({ where: { modelId: id } });
    if (count > 0) {
      return { error: "Cannot delete this model because active physical instances are currently linked to it." };
    }

    await prisma.bikeModel.delete({ where: { id } });
    return { success: "Model class deleted successfully from catalog." };
  }

  // Instance actions
  if (intent === "add-instance") {
    const modelId = formData.get("modelId")?.toString();
    const raceNumberRaw = formData.get("raceNumber")?.toString();
    const raceNumber = raceNumberRaw ? parseInt(raceNumberRaw, 10) : null;
    const alias = formData.get("alias")?.toString() || null;
    const status = formData.get("status")?.toString() || "AVAILABLE";

    if (!modelId) return { error: "Please choose a Bike Model class." };

    await prisma.bike.create({
      data: { modelId, raceNumber, alias, status }
    });
    return { success: "New physical bike instance added to fleet." };
  }

  if (intent === "edit-instance") {
    const id = formData.get("id")?.toString();
    const modelId = formData.get("modelId")?.toString();
    const raceNumberRaw = formData.get("raceNumber")?.toString();
    const raceNumber = raceNumberRaw ? parseInt(raceNumberRaw, 10) : null;
    const alias = formData.get("alias")?.toString() || null;
    const status = formData.get("status")?.toString() || "AVAILABLE";

    if (!id || !modelId) return { error: "Missing physical unit parameters." };

    await prisma.bike.update({
      where: { id },
      data: { modelId, raceNumber, alias, status }
    });
    return { success: "Physical bike parameters updated." };
  }

  if (intent === "clone-instance") {
    const modelId = formData.get("modelId")?.toString();
    const raceNumberRaw = formData.get("raceNumber")?.toString();
    const raceNumber = raceNumberRaw ? parseInt(raceNumberRaw, 10) : null;
    const alias = formData.get("alias")?.toString() || null;
    const status = formData.get("status")?.toString() || "AVAILABLE";

    if (!modelId) return { error: "Missing base model for clone action." };

    await prisma.bike.create({
      data: { modelId, raceNumber, alias, status }
    });
    return { success: "Physical bike cloned successfully." };
  }

  if (intent === "delete-instance") {
    const id = formData.get("id")?.toString();
    if (!id) return { error: "Missing instance ID." };
    try {
      await prisma.bike.delete({ where: { id } });
      return { success: "Physical bike deleted from fleet." };
    } catch {
      return { error: "Cannot delete a bike that has active bookings. Please set its status to RETIRED instead." };
    }
  }

  if (intent === "bulk-status") {
    const bikeIdsJson = formData.get("bikeIds")?.toString() || "[]";
    const bikeIds = JSON.parse(bikeIdsJson) as string[];
    const status = formData.get("status")?.toString();

    if (bikeIds.length > 0 && status) {
      await prisma.bike.updateMany({
        where: { id: { in: bikeIds } },
        data: { status },
      });
      return { success: `Successfully updated status of ${bikeIds.length} bikes.` };
    }
  }

  if (intent === "bulk-delete") {
    const bikeIdsJson = formData.get("bikeIds")?.toString() || "[]";
    const bikeIds = JSON.parse(bikeIdsJson) as string[];

    if (bikeIds.length > 0) {
      try {
        await prisma.bike.deleteMany({
          where: { id: { in: bikeIds } },
        });
        return { success: `Successfully deleted ${bikeIds.length} physical units.` };
      } catch {
        return { error: "Cannot delete bikes that have active bookings. Set status to RETIRED instead." };
      }
    }
  }

  return null;
}

export default function AdminBikes() {
  const { bikes, bikeModels, locale } = useLoaderData<typeof loader>();
  const actionData = useActionData() as { error?: string; success?: string } | undefined;
  const t = translations[locale as Locale];
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Tab selection
  const [activeTab, setActiveTab] = useState<"fleet" | "models">("fleet");

  // Toggle Forms
  const [isAddingInstance, setIsAddingInstance] = useState(false);
  const [isAddingModel, setIsAddingModel] = useState(false);

  // Editing state IDs
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [cloningInstanceId, setCloningInstanceId] = useState<string | null>(null);

  // Upload drag state
  const [addPreviewUrl, setAddPreviewUrl] = useState<string | null>(null);
  const [isAddDragging, setIsAddDragging] = useState(false);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const [isEditDragging, setIsEditDragging] = useState(false);

  // Search/Filters (Fleet Tab)
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modelFilter, setModelFilter] = useState("ALL");
  const [selectedBikeIds, setSelectedBikeIds] = useState<string[]>([]);

  // Automatically reset UI forms after successful save
  useEffect(() => {
    if (actionData?.success) {
      setIsAddingInstance(false);
      setIsAddingModel(false);
      setEditingInstanceId(null);
      setEditingModelId(null);
      setCloningInstanceId(null);
      setAddPreviewUrl(null);
      setEditPreviewUrl(null);
    }
  }, [actionData]);

  // Bulk selectors
  const toggleSelectBike = (bikeId: string) => {
    setSelectedBikeIds((prev) => 
      prev.includes(bikeId) ? prev.filter(id => id !== bikeId) : [...prev, bikeId]
    );
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent, type: "add" | "edit", modelId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (type === "edit") {
      setIsEditDragging(false);
    } else {
      setIsAddDragging(false);
    }

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        const inputId = type === "edit" ? `edit-image-file-${modelId}` : "add-image-file";
        const fileInput = document.getElementById(inputId) as HTMLInputElement;
        if (fileInput) {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          fileInput.files = dataTransfer.files;
          
          const previewUrl = URL.createObjectURL(file);
          if (type === "edit") {
            setEditPreviewUrl(previewUrl);
          } else {
            setAddPreviewUrl(previewUrl);
          }
        }
      }
    }
  };

  // Fleet count stats
  const totalCount = bikes.length;
  const availableCount = bikes.filter(b => b.status === "AVAILABLE").length;
  const maintenanceCount = bikes.filter(b => b.status === "MAINTENANCE").length;
  const retiredCount = bikes.filter(b => b.status === "RETIRED").length;

  const filteredBikes = bikes.filter((bike) => {
    const matchesSearch = 
      bike.model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (bike.alias && bike.alias.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (bike.raceNumber && bike.raceNumber.toString().includes(searchQuery));

    const matchesStatus = statusFilter === "ALL" || bike.status === statusFilter;
    const matchesModel = modelFilter === "ALL" || bike.modelId === modelFilter;

    return matchesSearch && matchesStatus && matchesModel;
  });

  const allFilteredSelected = filteredBikes.length > 0 && filteredBikes.every(b => selectedBikeIds.includes(b.id));
  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredIds = filteredBikes.map(b => b.id);
      setSelectedBikeIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      const filteredIds = filteredBikes.map(b => b.id);
      setSelectedBikeIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  return (
    <div className="space-y-8">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-900 pb-5">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-orange-500 font-mono">
            {locale === "en" ? "Garage Control" : "Controllo Garage"}
          </span>
          <h1 className="text-3xl font-black uppercase text-white tracking-tight mt-1">
            {locale === "en" ? "Fleet Catalog & Paddock" : "Catalogo Modelli e Flotta"}
          </h1>
        </div>

        {/* Tab switch control */}
        <div className="flex bg-slate-950 p-1.5 rounded-xl border border-slate-850 shrink-0">
          <button
            onClick={() => setActiveTab("fleet")}
            className={`px-4 py-2 text-xs font-extrabold uppercase rounded-lg transition-all cursor-pointer ${
              activeTab === "fleet"
                ? "bg-orange-600 text-white shadow shadow-orange-600/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {locale === "en" ? "Paddock Fleet Units" : "Moto nel Paddock"}
          </button>
          <button
            onClick={() => setActiveTab("models")}
            className={`px-4 py-2 text-xs font-extrabold uppercase rounded-lg transition-all cursor-pointer ${
              activeTab === "models"
                ? "bg-orange-600 text-white shadow shadow-orange-600/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {locale === "en" ? "Bike Catalog Models" : "Catalogo Modelli"}
          </button>
        </div>
      </div>

      {/* Response indicators */}
      {actionData?.error && (
        <div className="bg-red-950/40 border border-red-500/25 rounded-2xl p-4 flex items-center space-x-3 text-red-200 text-xs font-semibold">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <span>{actionData.error}</span>
        </div>
      )}
      {actionData?.success && (
        <div className="bg-green-950/40 border border-green-500/25 rounded-2xl p-4 flex items-center space-x-3 text-green-200 text-xs font-semibold animate-pulse">
          <ShieldCheck className="h-5 w-5 text-green-500 shrink-0" />
          <span>{actionData.success}</span>
        </div>
      )}

      {/* TAB 1: FLEET UNITS */}
      {activeTab === "fleet" && (
        <div className="space-y-6">
          
          {/* Quick numbers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-slate-900/40 border border-slate-850 p-5 rounded-2xl">
              <span className="block text-slate-500 uppercase tracking-wider text-[9px] font-extrabold">{locale === "en" ? "Total Fleet size" : "Flotta Attiva"}</span>
              <span className="text-xl font-black text-white mt-1.5 block">{totalCount} units</span>
            </div>
            <div className="bg-slate-900/40 border border-slate-850 p-5 rounded-2xl">
              <span className="block text-slate-500 uppercase tracking-wider text-[9px] font-extrabold">{locale === "en" ? "Ready Available" : "Disponibili per Noleggio"}</span>
              <span className="text-xl font-black text-green-400 mt-1.5 block">{availableCount} units</span>
            </div>
            <div className="bg-slate-900/40 border border-slate-850 p-5 rounded-2xl">
              <span className="block text-slate-500 uppercase tracking-wider text-[9px] font-extrabold">{locale === "en" ? "Maintenance Queue" : "In Manutenzione"}</span>
              <span className="text-xl font-black text-orange-400 mt-1.5 block">{maintenanceCount} units</span>
            </div>
            <div className="bg-slate-900/40 border border-slate-850 p-5 rounded-2xl">
              <span className="block text-slate-500 uppercase tracking-wider text-[9px] font-extrabold">{locale === "en" ? "Retired Units" : "Ritirate / Deposte"}</span>
              <span className="text-xl font-black text-slate-500 mt-1.5 block">{retiredCount} units</span>
            </div>
          </div>

          {/* Action Trigger Row */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 items-center bg-slate-900/20 p-4 rounded-2xl border border-slate-850/50">
            <div className="w-full sm:max-w-xs">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={locale === "en" ? "Search by nickname, race #..." : "Cerca per alias, numero..."}
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-2.5 px-3.5 outline-none text-xs font-semibold placeholder-slate-700"
              />
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-white rounded-xl py-2.5 px-3 text-xs uppercase font-bold outline-none cursor-pointer"
              >
                <option value="ALL">ALL STATUS</option>
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
                <option value="RETIRED">RETIRED</option>
              </select>

              <select
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-white rounded-xl py-2.5 px-3 text-xs uppercase font-bold outline-none cursor-pointer max-w-[150px] truncate"
              >
                <option value="ALL">ALL MODELS</option>
                {bikeModels.map(m => (
                  <option key={m.id} value={m.id}>{m.model}</option>
                ))}
              </select>

              <button
                onClick={() => {
                  setIsAddingInstance(!isAddingInstance);
                  setEditingInstanceId(null);
                  setCloningInstanceId(null);
                }}
                className="flex items-center space-x-1 bg-orange-600 hover:bg-orange-500 text-white font-extrabold uppercase text-[10px] tracking-wider px-4 py-2.5 rounded-xl transition-all cursor-pointer shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>{isAddingInstance ? "Close" : "Add Instance"}</span>
              </button>
            </div>
          </div>

          {/* Form: Add Instance */}
          {isAddingInstance && (
            <div className="bg-slate-900/60 border border-orange-500/20 rounded-3xl p-6 space-y-4">
              <div className="border-b border-slate-850 pb-2">
                <h3 className="text-sm font-black uppercase text-white">{locale === "en" ? "Register Physical Unit" : "Registra Moto Paddock"}</h3>
                <p className="text-[11px] text-slate-500">Pick one of your database model classes to link this physical machine.</p>
              </div>

              <Form method="post" className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <input type="hidden" name="intent" value="add-instance" />
                
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-extrabold mb-1.5">Model Class</label>
                  <select
                    name="modelId"
                    required
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-semibold outline-none"
                  >
                    <option value="">-- SELECT MODEL --</option>
                    {bikeModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.displacement}cc)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-extrabold mb-1.5">Race Number</label>
                  <input
                    type="number"
                    name="raceNumber"
                    placeholder="e.g. 46"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-extrabold mb-1.5">Paddock Alias / Nickname</label>
                  <input
                    type="text"
                    name="alias"
                    placeholder="e.g. The Doctor"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-extrabold mb-1.5">Status</label>
                  <select
                    name="status"
                    defaultValue="AVAILABLE"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-bold uppercase outline-none cursor-pointer"
                  >
                    <option value="AVAILABLE">AVAILABLE</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="RETIRED">RETIRED</option>
                  </select>
                </div>

                <div className="sm:col-span-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-green-600 hover:bg-green-500 text-white font-extrabold uppercase text-[10px] tracking-wider px-5 py-3 rounded-xl shadow-lg transition-all"
                  >
                    {locale === "en" ? "Register Machine" : "Registra Macchina"}
                  </button>
                </div>
              </Form>
            </div>
          )}

          {/* Grid check selection bar */}
          {filteredBikes.length > 0 && (
            <div className="flex justify-between items-center bg-slate-900/20 border border-slate-850/30 rounded-2xl px-5 py-3.5 text-[11px] text-slate-500 font-extrabold uppercase font-mono">
              <label className="flex items-center space-x-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  className="h-4 w-4 bg-slate-950 border-slate-800 rounded text-orange-600 focus:ring-orange-500 focus:ring-offset-slate-950 cursor-pointer"
                />
                <span>Select All Filtered</span>
              </label>
              <span>{locale === "en" ? `Filtered: ${filteredBikes.length} of ${bikes.length}` : `Filtrate: ${filteredBikes.length} di ${bikes.length}`}</span>
            </div>
          )}

          {/* Datagrid list */}
          <div className="grid grid-cols-1 gap-4">
            {filteredBikes.length === 0 ? (
              <div className="bg-slate-900/20 border border-slate-850 p-12 rounded-3xl text-center">
                <Flag className="h-10 w-10 text-slate-600 mx-auto mb-3 animate-pulse" />
                <span className="block text-xs uppercase font-bold text-slate-400">No physical units found matching current filter states.</span>
              </div>
            ) : (
              filteredBikes.map((bike) => {
                const isEditing = editingInstanceId === bike.id;
                const isCloning = cloningInstanceId === bike.id;

                return (
                  <div
                    key={bike.id}
                    className={`bg-slate-900/40 border p-5 rounded-3xl backdrop-blur transition-all ${
                      isEditing
                        ? "border-orange-500"
                        : isCloning
                          ? "border-green-500"
                          : bike.status === "MAINTENANCE"
                            ? "border-red-950/40 opacity-80"
                            : bike.status === "RETIRED"
                              ? "border-slate-900 opacity-60"
                              : "border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    {/* View Instance Mode */}
                    {!isEditing && !isCloning ? (
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center space-x-4">
                          <input
                            type="checkbox"
                            checked={selectedBikeIds.includes(bike.id)}
                            onChange={() => toggleSelectBike(bike.id)}
                            className="h-4 w-4 bg-slate-950 border-slate-800 rounded text-orange-600 focus:ring-orange-500 cursor-pointer shrink-0"
                          />

                          <div 
                            className="h-14 w-18 rounded-xl border flex items-center justify-center overflow-hidden shrink-0"
                            style={{ backgroundColor: bike.model.bgColor || '#1e293b' }}
                          >
                            {bike.model.imageUrl ? (
                              <img src={bike.model.imageUrl} alt={bike.model.name} className="h-full w-full object-contain p-1.5" />
                            ) : (
                              <Flag className="h-5 w-5 text-slate-655" />
                            )}
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              {bike.raceNumber && (
                                <span className="bg-orange-600 text-white font-mono font-black text-[10px] px-1.5 py-0.5 rounded shadow">
                                  #{bike.raceNumber}
                                </span>
                              )}
                              <h3 className="font-extrabold text-sm text-white uppercase">{bike.model.name}</h3>
                              <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                                bike.status === "AVAILABLE"
                                  ? "bg-green-950/60 text-green-400 border-green-500/10"
                                  : bike.status === "MAINTENANCE"
                                    ? "bg-red-950/60 text-red-400 border-red-500/10"
                                    : "bg-slate-950 text-slate-500 border-slate-800"
                              }`}>
                                {bike.status}
                              </span>
                            </div>
                            {bike.alias && (
                              <div className="text-[11px] text-orange-500 font-bold uppercase tracking-wider font-mono">
                                "{bike.alias}"
                              </div>
                            )}
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest font-mono flex items-center space-x-2">
                              <span>Engine: {bike.model.displacement}cc</span>
                              <span>•</span>
                              <span>Base modifier: x{bike.model.priceModifier.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 self-end md:self-auto shrink-0 w-full md:w-auto justify-end">
                          <button
                            onClick={() => {
                              setEditingInstanceId(bike.id);
                              setCloningInstanceId(null);
                              setIsAddingInstance(false);
                            }}
                            className="text-[10px] font-black uppercase text-orange-500 hover:text-orange-400 py-2 px-3 border border-slate-800 rounded-lg hover:bg-slate-850 cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setCloningInstanceId(bike.id);
                              setEditingInstanceId(null);
                              setIsAddingInstance(false);
                            }}
                            className="text-[10px] font-black uppercase text-green-500 hover:text-green-400 py-2 px-3 border border-slate-800 rounded-lg hover:bg-slate-850 cursor-pointer"
                          >
                            Clone
                          </button>
                          <Form
                            method="post"
                            className="inline"
                            onSubmit={(e) => {
                              if (!window.confirm(locale === "en" ? "Delete physical bike?" : "Eliminare la moto?")) {
                                e.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="intent" value="delete-instance" />
                            <input type="hidden" name="id" value={bike.id} />
                            <button
                              type="submit"
                              className="text-[10px] font-black uppercase text-red-500 hover:text-red-400 py-2 px-3 border border-slate-850 rounded-lg hover:bg-red-950/20 cursor-pointer"
                            >
                              Delete
                            </button>
                          </Form>
                        </div>
                      </div>
                    ) : isEditing ? (
                      // EDIT INSTANCE FORM
                      <Form method="post" className="space-y-4">
                        <input type="hidden" name="intent" value="edit-instance" />
                        <input type="hidden" name="id" value={bike.id} />

                        <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                          <span className="text-[11px] font-bold text-slate-500 uppercase">Edit Physical Unit specs</span>
                          <button type="button" onClick={() => setEditingInstanceId(null)} className="text-[10px] font-bold uppercase text-slate-500 hover:text-white">Cancel</button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-[9px] uppercase text-slate-400 font-extrabold mb-1">Model Class</label>
                            <select
                              name="modelId"
                              defaultValue={bike.modelId}
                              className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2 px-3 text-xs outline-none"
                            >
                              {bikeModels.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[9px] uppercase text-slate-400 font-extrabold mb-1">Race Number</label>
                            <input
                              type="number"
                              name="raceNumber"
                              defaultValue={bike.raceNumber || ""}
                              className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2 px-3 text-xs outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] uppercase text-slate-400 font-extrabold mb-1">Paddock Alias</label>
                            <input
                              type="text"
                              name="alias"
                              defaultValue={bike.alias || ""}
                              className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2 px-3 text-xs outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] uppercase text-slate-400 font-extrabold mb-1">Status</label>
                            <select
                              name="status"
                              defaultValue={bike.status}
                              className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2 px-3 text-xs uppercase font-extrabold outline-none cursor-pointer"
                            >
                              <option value="AVAILABLE">AVAILABLE</option>
                              <option value="MAINTENANCE">MAINTENANCE</option>
                              <option value="RETIRED">RETIRED</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex justify-end space-x-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setEditingInstanceId(null)}
                            className="bg-slate-950 text-slate-400 hover:text-white px-4 py-2 text-xs uppercase font-bold rounded-lg border border-slate-850"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 text-xs uppercase font-bold rounded-lg"
                          >
                            Update
                          </button>
                        </div>
                      </Form>
                    ) : (
                      // CLONE INSTANCE FORM
                      <Form method="post" className="space-y-4">
                        <input type="hidden" name="intent" value="clone-instance" />
                        <input type="hidden" name="modelId" value={bike.modelId} />

                        <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                          <span className="text-[11px] font-bold text-green-500 uppercase">Clone physical unit duplicate</span>
                          <button type="button" onClick={() => setCloningInstanceId(null)} className="text-[10px] font-bold uppercase text-slate-500 hover:text-white">Cancel</button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-[9px] uppercase text-slate-400 font-extrabold mb-1">Base Model Class</label>
                            <div className="w-full bg-slate-950/60 border border-slate-850 rounded-xl py-2.5 px-3.5 text-xs text-slate-450 font-semibold uppercase font-mono">
                              {bike.model.name}
                            </div>
                          </div>

                          <div>
                            <label className="block text-[9px] uppercase text-slate-400 font-extrabold mb-1">New Race Number</label>
                            <input
                              type="number"
                              name="raceNumber"
                              required
                              placeholder="e.g. 99"
                              className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2.5 px-3 text-xs outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] uppercase text-slate-400 font-extrabold mb-1">New Paddock Alias</label>
                            <input
                              type="text"
                              name="alias"
                              required
                              placeholder="e.g. Stoner Clone"
                              className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2.5 px-3 text-xs outline-none"
                            />
                          </div>

                          <input type="hidden" name="status" value="AVAILABLE" />
                        </div>

                        <div className="flex justify-end space-x-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setCloningInstanceId(null)}
                            className="bg-slate-950 text-slate-400 hover:text-white px-4 py-2 text-xs uppercase font-bold rounded-lg border border-slate-850"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 text-xs uppercase font-bold rounded-lg"
                          >
                            Save Clone
                          </button>
                        </div>
                      </Form>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Floating Bulk Actions Panel */}
          {selectedBikeIds.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-905 border border-orange-500/30 shadow-2xl shadow-orange-600/10 px-5 py-3.5 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-[90vw] md:max-w-max text-xs uppercase font-bold font-mono">
              <div className="flex items-center space-x-2 text-slate-300">
                <span className="h-2 w-2 rounded-full bg-orange-500 animate-ping" />
                <span>{selectedBikeIds.length} chosen</span>
              </div>
              <div className="h-5 w-px bg-slate-800" />
              
              <div className="flex flex-wrap gap-2">
                <Form method="post" className="inline" onSubmit={() => setSelectedBikeIds([])}>
                  <input type="hidden" name="intent" value="bulk-status" />
                  <input type="hidden" name="status" value="AVAILABLE" />
                  <input type="hidden" name="bikeIds" value={JSON.stringify(selectedBikeIds)} />
                  <button type="submit" className="bg-green-950/60 border border-green-500/20 text-green-400 hover:bg-green-600 hover:text-white px-3 py-2 rounded-lg transition-all cursor-pointer">Available</button>
                </Form>

                <Form method="post" className="inline" onSubmit={() => setSelectedBikeIds([])}>
                  <input type="hidden" name="intent" value="bulk-status" />
                  <input type="hidden" name="status" value="MAINTENANCE" />
                  <input type="hidden" name="bikeIds" value={JSON.stringify(selectedBikeIds)} />
                  <button type="submit" className="bg-orange-950/60 border border-orange-500/20 text-orange-400 hover:bg-orange-600 hover:text-white px-3 py-2 rounded-lg transition-all cursor-pointer">Maintenance</button>
                </Form>

                <Form method="post" className="inline" onSubmit={() => setSelectedBikeIds([])}>
                  <input type="hidden" name="intent" value="bulk-status" />
                  <input type="hidden" name="status" value="RETIRED" />
                  <input type="hidden" name="bikeIds" value={JSON.stringify(selectedBikeIds)} />
                  <button type="submit" className="bg-slate-950 border border-slate-850 text-slate-400 hover:bg-slate-800 hover:text-white px-3 py-2 rounded-lg transition-all cursor-pointer">Retire</button>
                </Form>

                <Form 
                  method="post" 
                  className="inline" 
                  onSubmit={(e) => {
                    if (!window.confirm("Delete selected?")) e.preventDefault();
                    else setSelectedBikeIds([]);
                  }}
                >
                  <input type="hidden" name="intent" value="bulk-delete" />
                  <input type="hidden" name="bikeIds" value={JSON.stringify(selectedBikeIds)} />
                  <button type="submit" className="bg-red-950/60 border border-red-500/20 text-red-400 hover:bg-red-650 hover:text-white px-3 py-2 rounded-lg transition-all cursor-pointer">Delete</button>
                </Form>

                <button onClick={() => setSelectedBikeIds([])} className="text-slate-500 hover:text-white underline ml-1 cursor-pointer">Cancel</button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* TAB 2: MODEL CATALOG */}
      {activeTab === "models" && (
        <div className="space-y-6">
          
          <div className="flex justify-between items-center bg-slate-900/20 p-4 rounded-2xl border border-slate-850/50">
            <span className="text-xs uppercase font-extrabold tracking-wider text-slate-500">Configure catalog bike models with visual presentation specifications</span>
            <button
              onClick={() => {
                setIsAddingModel(!isAddingModel);
                setEditingModelId(null);
                setAddPreviewUrl(null);
              }}
              className="flex items-center space-x-1.5 bg-orange-600 hover:bg-orange-500 text-white font-extrabold uppercase text-[10px] tracking-wider px-4 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{isAddingModel ? "Close Form" : "Create Bike Model"}</span>
            </button>
          </div>

          {/* Form: Add Model */}
          {isAddingModel && (
            <div className="bg-slate-900/60 border border-orange-500/20 rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="border-b border-slate-850 pb-2">
                <h3 className="text-sm font-black uppercase text-white">Create New Catalog Class</h3>
                <p className="text-[11px] text-slate-500 font-light">Add engine properties, base modifiers, crash insurance settings, and backdrop frames.</p>
              </div>

              <Form method="post" encType="multipart/form-data" className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <input type="hidden" name="intent" value="add-model" />

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-2">Model Title</label>
                  <input type="text" required name="name" placeholder="Ohvale GP-2 190" className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs outline-none" />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-2">Model Tag / Code</label>
                  <input type="text" required name="model" placeholder="GP-2 190" className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs outline-none" />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-2">Displacement (cc)</label>
                  <input type="number" required name="displacement" placeholder="190" className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-2">Price Modifier (multiplier)</label>
                  <input type="number" step="0.05" required name="priceModifier" defaultValue="1.0" className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-2">Builder Manufacturer</label>
                  <input type="text" required name="builder" defaultValue="Ohvale" className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs outline-none" />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-2">Model Description / Details</label>
                  <textarea name="info" placeholder="Add specifications details here..." className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2 px-3 text-xs outline-none" rows={1} />
                </div>

                {/* Performance Specs & Usage */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-6 gap-6 bg-slate-950 p-5 rounded-2xl border border-slate-850">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Horsepower (HP)</label>
                    <input type="number" step="0.1" name="hp" placeholder="e.g. 15.0" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">HP RPM</label>
                    <input type="number" name="hpRpm" placeholder="e.g. 9500" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Torque (Nm)</label>
                    <input type="number" step="0.1" name="torque" placeholder="e.g. 12.0" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Torque RPM</label>
                    <input type="number" name="torqueRpm" placeholder="e.g. 7000" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Gearbox</label>
                    <input type="text" name="gearbox" placeholder="e.g. Automatic, 4-Speed" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-405 font-bold mb-2">Usage Category</label>
                    <select name="usage" defaultValue="BOTH" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs outline-none">
                      <option value="BOTH">Rental & Academy (BOTH)</option>
                      <option value="RENTAL">Rental Only (RENTAL)</option>
                      <option value="ACADEMY">Academy Only (ACADEMY)</option>
                    </select>
                  </div>
                </div>

                {/* Upload drag & drop */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-950 p-5 rounded-2xl border border-slate-850">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Model Presentation Image</label>
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={() => setIsAddDragging(false)}
                      onDragEnter={() => setIsAddDragging(true)}
                      onDrop={(e) => handleDrop(e, "add")}
                      onClick={() => document.getElementById("add-image-file")?.click()}
                      className={`h-32 border-2 border-dashed rounded-2xl flex flex-col justify-center items-center p-4 cursor-pointer transition-all ${
                        isAddDragging ? "border-orange-500 bg-orange-600/5" : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                      }`}
                    >
                      <input type="file" id="add-image-file" name="imageFile" accept="image/*" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setAddPreviewUrl(URL.createObjectURL(file));
                      }} />
                      
                      {addPreviewUrl ? (
                        <div className="flex items-center space-x-3 justify-center h-full">
                          <img src={addPreviewUrl} alt="Upload preview" className="h-20 w-28 object-contain" />
                          <div className="text-left">
                            <span className="block text-xs font-bold text-green-400 uppercase">File loaded!</span>
                            <span className="block text-[9px] text-slate-500">Click to change</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center space-y-1">
                          <Flag className="h-6 w-6 text-slate-650 mx-auto animate-bounce" />
                          <span className="block text-[11px] font-bold text-slate-350">Drag & Drop Image Here</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] text-slate-450 font-bold uppercase mb-1">Or manual URL/Path</label>
                      <input type="text" name="imageUrl" placeholder="/images/ohvale-model.png" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs outline-none" />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-455 font-bold uppercase mb-1">Visual Backdrop color</label>
                      <div className="flex items-center space-x-2">
                        <input type="color" defaultValue="#1e293b" onInput={(e) => {
                          const txt = document.getElementById("add-bg-text") as HTMLInputElement;
                          if (txt) txt.value = e.currentTarget.value;
                        }} className="h-9 w-11 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer" />
                        <input type="text" name="bgColor" id="add-bg-text" defaultValue="#1e293b" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-2.5 px-3.5 text-xs font-mono outline-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Insurance configurations */}
                <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-950 p-5 rounded-2xl border border-slate-850">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2 flex items-center space-x-1"><ShieldCheck className="h-4 w-4 text-green-500" /><span>Default Insurance Price (€)</span></label>
                    <input type="number" required name="insurancePrice" defaultValue="25" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2 flex items-center space-x-1"><ShieldAlert className="h-4 w-4 text-orange-500" /><span>Default Coverage Limit (€)</span></label>
                    <input type="number" required name="insuranceCoverage" defaultValue="250" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                  </div>
                </div>

                <div className="md:col-span-3 flex justify-end">
                  <button type="submit" className="bg-green-600 hover:bg-green-500 text-white font-extrabold uppercase text-[10px] tracking-wider px-6 py-3.5 rounded-xl shadow-lg cursor-pointer">
                    Save Model Class
                  </button>
                </div>
              </Form>
            </div>
          )}

          {/* Model Datagrid */}
          <div className="grid grid-cols-1 gap-6">
            {bikeModels.length === 0 ? (
              <div className="bg-slate-900/20 border border-slate-850 p-12 rounded-3xl text-center">
                <Flag className="h-10 w-10 text-slate-600 mx-auto mb-3 animate-pulse" />
                <span className="block text-xs uppercase font-bold text-slate-400">No Bike Models defined in database. Create one above first.</span>
              </div>
            ) : (
              bikeModels.map((model) => {
                const isEditing = editingModelId === model.id;

                return (
                  <div
                    key={model.id}
                    className={`bg-slate-900/40 border p-6 rounded-3xl backdrop-blur transition-all ${
                      isEditing ? "border-orange-500" : "border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    {!isEditing ? (
                      // VIEW MODEL VIEW
                      <div className="flex flex-col lg:flex-row justify-between gap-6">
                        
                        <div className="flex items-start space-x-4">
                          <div 
                            className="h-20 w-28 rounded-2xl border flex items-center justify-center overflow-hidden shrink-0 shadow-lg"
                            style={{ backgroundColor: model.bgColor || '#1e293b' }}
                          >
                            {model.imageUrl ? (
                              <img src={model.imageUrl} alt={model.name} className="h-full w-full object-contain p-2 select-none pointer-events-none" />
                            ) : (
                              <Flag className="h-6 w-6 text-slate-655" />
                            )}
                          </div>

                          <div className="space-y-1">
                            <h3 className="font-extrabold text-base text-white uppercase leading-tight">{model.name}</h3>
                            <div className="text-[10px] text-orange-500 font-bold uppercase tracking-widest font-mono">
                              Model tag: {model.model} | Builder: {model.builder}
                            </div>
                            <p className="text-xs text-slate-400 max-w-lg mt-1 font-light leading-relaxed">{model.info || "No specifications description provided."}</p>
                          </div>
                        </div>

                        {/* Parameter details */}
                        <div className="flex flex-wrap items-center gap-6 bg-slate-950/80 p-4 rounded-2xl border border-slate-900 text-xs font-mono text-slate-400">
                          <div>
                            <span className="block text-[8px] text-slate-500 uppercase">Engine cc</span>
                            <span className="text-xs font-extrabold text-white">{model.displacement}cc</span>
                          </div>
                          {model.hp && (
                            <>
                              <div className="h-6 w-px bg-slate-900" />
                              <div>
                                <span className="block text-[8px] text-slate-500 uppercase">Power</span>
                                <span className="text-xs font-extrabold text-white">{model.hp.toFixed(1)} HP {model.hpRpm ? `@${model.hpRpm}` : ""}</span>
                              </div>
                            </>
                          )}
                          {model.torque && (
                            <>
                              <div className="h-6 w-px bg-slate-900" />
                              <div>
                                <span className="block text-[8px] text-slate-500 uppercase">Torque</span>
                                <span className="text-xs font-extrabold text-white">{model.torque.toFixed(1)} Nm {model.torqueRpm ? `@${model.torqueRpm}` : ""}</span>
                              </div>
                            </>
                          )}
                          <div className="h-6 w-px bg-slate-900" />
                          <div>
                            <span className="block text-[8px] text-slate-500 uppercase">Usage</span>
                            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${
                              model.usage === "ACADEMY"
                                ? "bg-purple-950/60 text-purple-400 border-purple-500/20"
                                : model.usage === "RENTAL"
                                ? "bg-blue-950/60 text-blue-400 border-blue-500/20"
                                : "bg-orange-950/60 text-orange-400 border-orange-500/20"
                            }`}>{model.usage}</span>
                          </div>
                          {model.gearbox && (
                            <>
                              <div className="h-6 w-px bg-slate-900" />
                              <div>
                                <span className="block text-[8px] text-slate-500 uppercase">Gearbox</span>
                                <span className="text-xs font-extrabold text-white uppercase">{model.gearbox}</span>
                              </div>
                            </>
                          )}
                          <div className="h-6 w-px bg-slate-900" />
                          <div>
                            <span className="block text-[8px] text-slate-500 uppercase">Modifier</span>
                            <span className="text-xs font-extrabold text-white">x{model.priceModifier.toFixed(2)}</span>
                          </div>
                          <div className="h-6 w-px bg-slate-900" />
                          <div>
                            <span className="block text-[8px] text-slate-500 uppercase">Ins. Price</span>
                            <span className="text-xs font-extrabold text-green-400">€{model.insurancePrice.toFixed(0)}</span>
                          </div>
                          <div className="h-6 w-px bg-slate-900" />
                          <div>
                            <span className="block text-[8px] text-slate-500 uppercase">Coverage Limit</span>
                            <span className="text-xs font-extrabold text-orange-500">€{model.insuranceCoverage.toFixed(0)}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 self-end lg:self-center shrink-0 w-full lg:w-auto justify-end">
                          <button
                            onClick={() => {
                              setEditingModelId(model.id);
                              setIsAddingModel(false);
                              setEditPreviewUrl(model.imageUrl);
                            }}
                            className="text-[10px] font-black uppercase text-orange-500 hover:text-orange-400 py-2.5 px-4 border border-slate-800 rounded-lg hover:bg-slate-850 cursor-pointer"
                          >
                            Edit Model
                          </button>
                          <Form
                            method="post"
                            className="inline"
                            onSubmit={(e) => {
                              if (!window.confirm("Are you sure? This will delete the model catalog definition. Safe guards will prevent deletion if active bikes exist.")) {
                                e.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="intent" value="delete-model" />
                            <input type="hidden" name="id" value={model.id} />
                            <button
                              type="submit"
                              className="text-[10px] font-black uppercase text-red-500 hover:text-red-400 py-2.5 px-4 border border-slate-850 rounded-lg hover:bg-red-950/20 cursor-pointer"
                            >
                              Delete
                            </button>
                          </Form>
                        </div>

                      </div>
                    ) : (
                      // EDIT MODEL FORM
                      <Form method="post" encType="multipart/form-data" className="space-y-6">
                        <input type="hidden" name="intent" value="edit-model" />
                        <input type="hidden" name="id" value={model.id} />
                        <input type="hidden" name="existingImageUrl" value={model.imageUrl || ""} />

                        <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                          <span className="text-xs font-bold text-slate-400 uppercase">Edit Catalog Specifications class</span>
                          <button type="button" onClick={() => setEditingModelId(null)} className="text-[10px] font-bold uppercase text-slate-500 hover:text-white">Cancel</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Model Title</label>
                            <input type="text" required name="name" defaultValue={model.name} className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-3 px-4 text-xs outline-none" />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Model Tag / Code</label>
                            <input type="text" required name="model" defaultValue={model.model} className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-3 px-4 text-xs outline-none" />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Displacement (cc)</label>
                            <input type="number" required name="displacement" defaultValue={model.displacement} className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Price Modifier</label>
                            <input type="number" step="0.05" required name="priceModifier" defaultValue={model.priceModifier} className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Builder Manufacturer</label>
                            <input type="text" required name="builder" defaultValue={model.builder} className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-3 px-4 text-xs outline-none" />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Model Description / Details</label>
                            <textarea name="info" defaultValue={model.info || ""} className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2.5 px-3.5 text-xs outline-none" rows={1} />
                          </div>

                          {/* Performance Specs & Usage */}
                          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-6 gap-6 bg-slate-950 p-5 rounded-2xl border border-slate-850">
                            <div>
                              <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Horsepower (HP)</label>
                              <input type="number" step="0.1" name="hp" defaultValue={model.hp || ""} placeholder="e.g. 15.0" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">HP RPM</label>
                              <input type="number" name="hpRpm" defaultValue={model.hpRpm || ""} placeholder="e.g. 9500" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Torque (Nm)</label>
                              <input type="number" step="0.1" name="torque" defaultValue={model.torque || ""} placeholder="e.g. 12.0" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Torque RPM</label>
                              <input type="number" name="torqueRpm" defaultValue={model.torqueRpm || ""} placeholder="e.g. 7000" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Gearbox</label>
                              <input type="text" name="gearbox" defaultValue={model.gearbox || ""} placeholder="e.g. Automatic, 4-Speed" className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs outline-none" />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Usage Category</label>
                              <select name="usage" defaultValue={model.usage || "BOTH"} className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs outline-none">
                                <option value="BOTH">Rental & Academy (BOTH)</option>
                                <option value="RENTAL">Rental Only (RENTAL)</option>
                                <option value="ACADEMY">Academy Only (ACADEMY)</option>
                              </select>
                            </div>
                          </div>

                          {/* Image drag & drop */}
                          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-950 p-5 rounded-2xl border border-slate-850">
                            <div className="md:col-span-2">
                              <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2">Model Presentation Image</label>
                              <div
                                onDragOver={handleDragOver}
                                onDragLeave={() => setIsEditDragging(false)}
                                onDragEnter={() => setIsEditDragging(true)}
                                onDrop={(e) => handleDrop(e, "edit", model.id)}
                                onClick={() => document.getElementById(`edit-image-file-${model.id}`)?.click()}
                                className={`h-32 border-2 border-dashed rounded-2xl flex flex-col justify-center items-center p-4 cursor-pointer transition-all ${
                                  isEditDragging ? "border-orange-500 bg-orange-600/5" : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                                }`}
                              >
                                <input type="file" id={`edit-image-file-${model.id}`} name="imageFile" accept="image/*" className="hidden" onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) setEditPreviewUrl(URL.createObjectURL(file));
                                }} />
                                
                                {editPreviewUrl ? (
                                  <div className="flex items-center space-x-3 justify-center h-full">
                                    <img src={editPreviewUrl} alt="Upload preview" className="h-20 w-28 object-contain" />
                                    <div className="text-left">
                                      <span className="block text-xs font-bold text-green-400 uppercase">File loaded!</span>
                                      <span className="block text-[9px] text-slate-500 font-light">Click to change</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-center space-y-1">
                                    <Flag className="h-6 w-6 text-slate-650 mx-auto animate-bounce" />
                                    <span className="block text-[11px] font-bold text-slate-350">Drag & Drop Image Here</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div>
                                <label className="block text-[10px] text-slate-450 font-bold uppercase mb-1">Or manual URL/Path</label>
                                <input type="text" name="imageUrl" defaultValue={model.imageUrl || ""} className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs outline-none" />
                              </div>

                              <div>
                                <label className="block text-[10px] text-slate-455 font-bold uppercase mb-1">Visual Backdrop color</label>
                                <div className="flex items-center space-x-2">
                                  <input type="color" defaultValue={model.bgColor || "#1e293b"} onInput={(e) => {
                                    const txt = document.getElementById(`edit-bg-text-${model.id}`) as HTMLInputElement;
                                    if (txt) txt.value = e.currentTarget.value;
                                  }} className="h-9 w-11 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer" />
                                  <input type="text" name="bgColor" id={`edit-bg-text-${model.id}`} defaultValue={model.bgColor || "#1e293b"} className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl py-2.5 px-3.5 text-xs font-mono outline-none" />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Insurance settings */}
                          <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-950 p-5 rounded-2xl border border-slate-850">
                            <div>
                              <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2 flex items-center space-x-1"><ShieldCheck className="h-4 w-4 text-green-500" /><span>Insurance Price (€)</span></label>
                              <input type="number" required name="insurancePrice" defaultValue={model.insurancePrice} className="w-full bg-slate-900 border border-slate-850 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase text-slate-400 font-bold mb-2 flex items-center space-x-1"><ShieldAlert className="h-4 w-4 text-orange-500" /><span>Damage Coverage Limit (€)</span></label>
                              <input type="number" required name="insuranceCoverage" defaultValue={model.insuranceCoverage} className="w-full bg-slate-900 border border-slate-850 text-white rounded-xl py-3 px-4 text-xs font-mono outline-none" />
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-850">
                          <button type="button" onClick={() => setEditingModelId(null)} className="bg-slate-950 text-slate-400 hover:text-white px-5 py-2.5 rounded-xl border border-slate-850 text-xs font-bold uppercase cursor-pointer">
                            Cancel
                          </button>
                          <button type="submit" className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase cursor-pointer">
                            Update Model specifications
                          </button>
                        </div>

                      </Form>
                    )}
                  </div>
                );
              })
            )}
          </div>

        </div>
      )}

    </div>
  );
}
