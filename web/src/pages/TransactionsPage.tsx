import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Pencil,
  Plus,
  Receipt,
  Repeat,
  Search,
  Tag,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  categoryAPI,
  householdAPI,
  ocrAPI,
  paperlessAPI,
  recurringAPI,
  transactionAPI,
} from "../services/api";
import { useAuthStore } from "../store/authStore";

export default function TransactionsPage() {
  const { currentHousehold } = useAuthStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const startDay = currentHousehold?.monthStartDay || 1;
  const calcCurrentPeriod = (sd: number) => {
    let m = now.getMonth() + 1;
    let y = now.getFullYear();
    if (sd > 1 && now.getDate() < sd) {
      if (m === 1) {
        m = 12;
        y -= 1;
      } else {
        m -= 1;
      }
    }
    return { month: m, year: y };
  };
  const currentPeriod = calcCurrentPeriod(startDay);
  const [selectedMonth, setSelectedMonth] = useState(currentPeriod.month);
  const [selectedYear, setSelectedYear] = useState(currentPeriod.year);

  const getPeriodLabel = (m: number, y: number) => {
    if (startDay <= 1) {
      return format(new Date(y, m - 1, 1), "MMMM yyyy", { locale: de });
    }
    const start = new Date(y, m - 1, startDay);
    const end = new Date(y, m, startDay - 1);
    return `${format(start, "d. MMM", { locale: de })} – ${format(end, "d. MMM yyyy", { locale: de })}`;
  };
  const prevPeriod = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };
  const nextPeriod = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const [form, setForm] = useState({
    amount: "",
    description: "",
    merchant: "",
    date: format(new Date(), "yyyy-MM-dd"),
    type: "expense",
    categoryId: "",
    receiptFile: null as File | null,
    isRecurring: false,
    recurringInterval: "monthly",
    targetHouseholdId: "",
    tip: "",
  });
  const [splits, setSplits] = useState<
    { categoryId: string; amount: string; description: string }[]
  >([]);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [dupChecked, setDupChecked] = useState(false);
  const [allHouseholds, setAllHouseholds] = useState<any[]>([]);

  // Paperless Upload Dialog
  const [paperlessDialog, setPaperlessDialog] = useState<{
    transactionId: string;
    title: string;
  } | null>(null);
  const [paperlessData, setPaperlessData] = useState<any>(null);
  const [paperlessForm, setPaperlessForm] = useState({
    documentTypeId: "",
    correspondentId: "",
    tagIds: [] as string[],
    title: "",
    ownerPaperlessUserId: "",
    viewPaperlessUserIds: [] as string[],
  });
  const [uploading, setUploading] = useState(false);
  const [receiptModal, setReceiptModal] = useState<string | null>(null);

  const [recurring, setRecurring] = useState<any[]>([]);
  const [moveDialog, setMoveDialog] = useState<{
    id: string;
    description: string;
  } | null>(null);
  const [moveTargetId, setMoveTargetId] = useState("");

  const [paperlessUsers, setPaperlessUsers] = useState<any[]>([]);

  const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace("/api", "");

  const loadCountRef = useRef(0);

  const load = async () => {
    if (!currentHousehold) {
      return;
    }
    const requestId = ++loadCountRef.current;
    setLoading(true);
    try {
      const { data } = await transactionAPI.getAll({
        householdId: currentHousehold.id,
        month: selectedMonth,
        year: selectedYear,
        type: typeFilter === "all" ? undefined : typeFilter,
        search: search || undefined,
      });
      if (requestId !== loadCountRef.current) {
        return;
      }
      setTransactions(data.transactions);
    } finally {
      if (requestId === loadCountRef.current) {
        setLoading(false);
      }
    }
  };

  // Reload transactions when period or filter changes — clear list immediately to avoid stale data
  // biome-ignore lint/correctness/useExhaustiveDependencies: load is a closure over the listed deps
  useEffect(() => {
    setTransactions([]);
    load();
  }, [currentHousehold, typeFilter, selectedMonth, selectedYear]);

  // Load static data only when household changes
  useEffect(() => {
    if (!currentHousehold) {
      return;
    }
    categoryAPI
      .getAll(currentHousehold.id)
      .then(({ data }) => setCategories(data.categories));
    paperlessAPI
      .getData(currentHousehold.id)
      .then(({ data }) => {
        setPaperlessData(data);
        setPaperlessUsers((data.users || []).filter((u: any) => u.isEnabled));
      })
      .catch(() => {});
    recurringAPI
      .getAll(currentHousehold.id)
      .then(({ data }) => setRecurring(data.recurring || []))
      .catch(() => {});
    householdAPI
      .getAll()
      .then(({ data }) => setAllHouseholds(data.households || []))
      .catch(() => {});
  }, [currentHousehold]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setForm((f) => ({ ...f, receiptFile: file }));
    setOcrLoading(true);
    try {
      const { data } = await ocrAPI.analyze(file);
      const r = data.result;
      setForm((f) => ({
        ...f,
        amount: r.amount?.toString() || f.amount,
        merchant: r.merchant || f.merchant,
        description: r.description || f.description,
        date: r.date || f.date,
        categoryId: r.categoryId || f.categoryId,
      }));
      toast.success(`✅ KI erkannte: ${r.confidence}% Sicherheit`);
    } catch {
      toast.error("OCR fehlgeschlagen – bitte manuell eingeben");
    } finally {
      setOcrLoading(false);
    }
  };

  const checkDuplicates = async () => {
    if (editingId) {
      return; // Beim Bearbeiten keinen Duplikat-Check
    }
    if (!(form.amount && form.date && currentHousehold)) {
      return;
    }
    try {
      const { data } = await transactionAPI.duplicateCheck({
        householdId: currentHousehold.id,
        amount: form.amount,
        date: form.date,
        description: form.description,
        merchant: form.merchant,
        ...(editingId ? { excludeId: editingId } : {}),
      });
      setDuplicates(data.duplicates || []);
      setDupChecked(true);
    } catch {}
  };

  const resetForm = () => {
    setForm({
      amount: "",
      description: "",
      merchant: "",
      date: format(new Date(), "yyyy-MM-dd"),
      type: "expense",
      categoryId: "",
      receiptFile: null,
      isRecurring: false,
      recurringInterval: "monthly",
      targetHouseholdId: "",
      tip: "",
    });
    setSplits([]);
    setDuplicates([]);
    setDupChecked(false);
  };

  const openEdit = (t: any) => {
    const tipVal = Number.parseFloat(t.tip || "0");
    setForm({
      amount: (Number.parseFloat(t.amount) - tipVal).toFixed(2),
      description: t.description || "",
      merchant: t.merchant || "",
      date: format(new Date(t.date), "yyyy-MM-dd"),
      type: t.type,
      categoryId: t.categoryId || "",
      receiptFile: null,
      isRecurring: t.isRecurring,
      recurringInterval: t.recurringInterval || "monthly",
      targetHouseholdId: t.targetHouseholdId || "",
      tip: tipVal > 0 ? tipVal.toFixed(2) : "",
    });
    setEditingId(t.id);
    setShowForm(true);
    setDuplicates([]);
    setDupChecked(false);
    setSplits([]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(form.amount && currentHousehold)) {
      return;
    }
    try {
      const tipAmount = Number.parseFloat(form.tip || "0") || 0;
      const totalAmount = Number.parseFloat(form.amount) + tipAmount;
      if (editingId) {
        // Update existing
        await transactionAPI.update(editingId, {
          amount: totalAmount,
          tip: tipAmount,
          description: form.description,
          merchant: form.merchant,
          date: form.date,
          type: form.type,
          categoryId: form.categoryId || null,
          tags: [],
          isRecurring: form.isRecurring,
          recurringInterval: form.isRecurring ? form.recurringInterval : null,
        });
        toast.success("Buchung aktualisiert");
      } else {
        // Create new
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => {
          if (k === "receiptFile" && v) {
            fd.append("receipt", v as File);
          } else if (k === "amount") {
            fd.append("amount", String(totalAmount));
          } else if (k === "tip") {
            if (tipAmount > 0) {
              fd.append("tip", String(tipAmount));
            }
          } else if (
            ![
              "receiptFile",
              "isRecurring",
              "recurringInterval",
              "targetHouseholdId",
            ].includes(k) &&
            v
          ) {
            fd.append(k, v as string);
          }
        });
        if (form.isRecurring) {
          fd.append("isRecurring", "true");
          fd.append("recurringInterval", form.recurringInterval);
        }
        if (form.type === "transfer" && form.targetHouseholdId) {
          fd.append("targetHouseholdId", form.targetHouseholdId);
        }
        if (splits.length > 0) {
          fd.append(
            "splits",
            JSON.stringify(
              splits.map((s) => ({ ...s, amount: Number.parseFloat(s.amount) }))
            )
          );
        }
        fd.append("householdId", currentHousehold.id);
        const { data } = await transactionAPI.create(fd);
        if (data.budgetWarning) {
          toast.error(
            `⚠️ Budget zu ${data.budgetWarning[0].percentage}% ausgeschöpft!`,
            { duration: 6000 }
          );
        }
        toast.success("Gespeichert");
      }
      setShowForm(false);
      setEditingId(null);
      resetForm();
      load();
      recurringAPI
        .getAll(currentHousehold.id)
        .then(({ data }) => setRecurring(data.recurring || []));
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehler beim Speichern");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Buchung löschen?")) {
      return;
    }
    try {
      await transactionAPI.delete(id);
      toast.success("Gelöscht");
      load();
    } catch {
      toast.error("Fehler beim Löschen");
    }
  };

  const handleMove = async () => {
    if (!(moveDialog && moveTargetId)) {
      return;
    }
    try {
      const { data } = await transactionAPI.move(moveDialog.id, moveTargetId);
      if (data.warning) {
        toast(data.warning, { icon: "⚠️", duration: 5000 });
      } else {
        toast.success("Buchung verschoben");
      }
      const movedId = moveDialog.id;
      setMoveDialog(null);
      setMoveTargetId("");
      setTransactions((prev) => prev.filter((t) => t.id !== movedId));
      setRecurring((prev) => prev.filter((r) => r.id !== movedId));
    } catch {
      toast.error("Fehler beim Verschieben");
    }
  };

  const openPaperlessDialog = (t: any) => {
    setPaperlessForm({
      documentTypeId: "",
      correspondentId: "",
      tagIds: [],
      title: t.description || t.merchant || "",
      ownerPaperlessUserId: "",
      viewPaperlessUserIds: [],
    });
    setPaperlessDialog({
      transactionId: t.id,
      title: t.description || t.merchant || "Quittung",
    });
  };

  const handlePaperlessUpload = async () => {
    if (!paperlessDialog) {
      return;
    }
    setUploading(true);
    try {
      await paperlessAPI.upload({
        transactionId: paperlessDialog.transactionId,
        documentTypeId: paperlessForm.documentTypeId || undefined,
        correspondentId: paperlessForm.correspondentId || undefined,
        tagIds: paperlessForm.tagIds.length
          ? JSON.stringify(paperlessForm.tagIds)
          : undefined,
        title: paperlessForm.title || undefined,
        ownerPaperlessUserId: paperlessForm.ownerPaperlessUserId || undefined,
        viewPaperlessUserIds: paperlessForm.viewPaperlessUserIds?.length
          ? JSON.stringify(paperlessForm.viewPaperlessUserIds)
          : undefined,
      });
      toast.success("Zu Paperless hochgeladen!");
      setPaperlessDialog(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const favDocTypes =
    paperlessData?.documentTypes?.filter((x: any) => x.isFavorite) || [];
  const favCorrespondents =
    paperlessData?.correspondents?.filter((x: any) => x.isFavorite) || [];
  const favTags = paperlessData?.tags?.filter((x: any) => x.isFavorite) || [];
  const hasPaperless =
    favDocTypes.length > 0 ||
    favCorrespondents.length > 0 ||
    favTags.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Buchungen
        </h1>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => {
            setEditingId(null);
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus size={18} /> Neue Buchung
        </button>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap gap-3 p-4">
        {/* Month Navigation */}
        <div className="flex w-full items-center justify-center gap-2">
          <button
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
            onClick={prevPeriod}
            type="button"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="min-w-[160px] text-center font-medium text-gray-700 text-sm dark:text-gray-300">
            {getPeriodLabel(selectedMonth, selectedYear)}
          </span>
          <button
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
            onClick={nextPeriod}
            type="button"
          >
            <ChevronRight size={20} />
          </button>
          {(selectedMonth !== currentPeriod.month ||
            selectedYear !== currentPeriod.year) && (
            <button
              className="rounded-lg px-2 py-1 text-[var(--primary)] text-xs transition-colors hover:bg-[var(--primary)]/10"
              onClick={() => {
                setSelectedMonth(currentPeriod.month);
                setSelectedYear(currentPeriod.year);
              }}
              type="button"
            >
              Heute
            </button>
          )}
        </div>
        <form className="flex flex-1 gap-2" onSubmit={handleSearch}>
          <div className="relative min-w-0 flex-1">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              className="input w-full"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen..."
              style={{ paddingLeft: "2.25rem" }}
              value={search}
            />
          </div>
          <button className="btn-primary shrink-0 px-3" type="submit">
            Suchen
          </button>
        </form>
        <div className="flex gap-2">
          {["all", "expense", "income", "recurring"].map((f) => (
            <button
              className={`rounded-xl px-3 py-2 font-medium text-sm transition-all ${typeFilter === f ? "bg-[var(--primary)] text-white" : "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300"}`}
              key={f}
              onClick={() => setTypeFilter(f)}
            >
              {f === "all"
                ? "Alle"
                : f === "expense"
                  ? "💸 Ausgaben"
                  : f === "income"
                    ? "💰 Einnahmen"
                    : "🔄 Wiederkehrend"}
            </button>
          ))}
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
            {editingId ? "Buchung bearbeiten" : "Neue Buchung"}
          </h2>
          <form
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
            onSubmit={handleSave}
          >
            <div className="flex gap-2 md:col-span-2">
              {[
                ["expense", "💸 Ausgabe"],
                ["income", "💰 Einnahme"],
                ["transfer", "🔄 Umbuchung"],
              ].map(([t, label]) => (
                <button
                  className={`flex-1 rounded-xl py-2 font-medium text-sm transition-all ${form.type === t ? "bg-[var(--primary)] text-white" : "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300"}`}
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Betrag (€) *
                {form.tip && Number.parseFloat(form.tip) > 0 && (
                  <span className="ml-2 text-gray-400 text-xs">
                    Gesamt:{" "}
                    {(
                      Number.parseFloat(form.amount || "0") +
                      Number.parseFloat(form.tip)
                    ).toFixed(2)}{" "}
                    €
                  </span>
                )}
              </label>
              <input
                className="input"
                onBlur={checkDuplicates}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                required
                step="0.01"
                type="number"
                value={form.amount}
              />
            </div>
            {form.type === "expense" && (
              <div>
                <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                  Trinkgeld (€)
                </label>
                <input
                  className="input"
                  min="0"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tip: e.target.value }))
                  }
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={form.tip}
                />
              </div>
            )}
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Datum
              </label>
              <input
                className="input"
                onBlur={checkDuplicates}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
                type="date"
                value={form.date}
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Beschreibung
              </label>
              <input
                className="input"
                onBlur={checkDuplicates}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                type="text"
                value={form.description}
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Händler
              </label>
              <input
                className="input"
                onChange={(e) =>
                  setForm((f) => ({ ...f, merchant: e.target.value }))
                }
                type="text"
                value={form.merchant}
              />
            </div>
            {form.type !== "transfer" && (
              <div>
                <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                  Kategorie
                </label>
                <select
                  className="input"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categoryId: e.target.value }))
                  }
                  value={form.categoryId}
                >
                  <option value="">-- Wählen --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.nameDE || c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {form.type === "transfer" && (
              <div>
                <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                  Ziel-Haushalt
                </label>
                <select
                  className="input"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      targetHouseholdId: e.target.value,
                    }))
                  }
                  value={form.targetHouseholdId}
                >
                  <option value="">-- Wählen --</option>
                  {allHouseholds
                    .filter((h) => h.id !== currentHousehold?.id)
                    .map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Duplikat-Warnung */}
            {dupChecked && duplicates.length > 0 && (
              <div className="rounded-xl border border-orange-300 bg-orange-50 p-3 md:col-span-2 dark:border-orange-700 dark:bg-orange-900/20">
                <p className="mb-2 font-medium text-orange-700 text-sm dark:text-orange-300">
                  ⚠️ Mögliche Duplikate gefunden:
                </p>
                {duplicates.map((d) => (
                  <p
                    className="text-orange-600 text-xs dark:text-orange-400"
                    key={d.id}
                  >
                    {format(new Date(d.date), "dd.MM.yyyy")} ·{" "}
                    {d.description || d.merchant || "—"} ·{" "}
                    {Number.parseFloat(d.amount).toFixed(2)} €
                  </p>
                ))}
              </div>
            )}

            {/* Split-Buchungen */}
            {form.type === "expense" && (
              <div className="md:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <label className="font-medium text-gray-700 text-sm dark:text-gray-300">
                    Aufteilen auf Kategorien (optional)
                  </label>
                  <button
                    className="text-[var(--primary)] text-xs hover:underline"
                    onClick={() =>
                      setSplits((s) => [
                        ...s,
                        { categoryId: "", amount: "", description: "" },
                      ])
                    }
                    type="button"
                  >
                    + Zeile hinzufügen
                  </button>
                </div>
                {splits.map((split, i) => (
                  <div className="mb-2 flex gap-2" key={i}>
                    <select
                      className="input flex-1 text-sm"
                      onChange={(e) =>
                        setSplits((s) =>
                          s.map((x, j) =>
                            j === i ? { ...x, categoryId: e.target.value } : x
                          )
                        )
                      }
                      value={split.categoryId}
                    >
                      <option value="">Kategorie</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon} {c.nameDE || c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input w-24 text-sm"
                      onChange={(e) =>
                        setSplits((s) =>
                          s.map((x, j) =>
                            j === i ? { ...x, amount: e.target.value } : x
                          )
                        )
                      }
                      placeholder="Betrag"
                      step="0.01"
                      type="number"
                      value={split.amount}
                    />
                    <input
                      className="input flex-1 text-sm"
                      onChange={(e) =>
                        setSplits((s) =>
                          s.map((x, j) =>
                            j === i ? { ...x, description: e.target.value } : x
                          )
                        )
                      }
                      placeholder="Notiz"
                      type="text"
                      value={split.description}
                    />
                    <button
                      className="px-1 text-gray-400 hover:text-red-500"
                      onClick={() =>
                        setSplits((s) => s.filter((_, j) => j !== i))
                      }
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Quittung{" "}
                {ocrLoading && (
                  <span className="animate-pulse text-[var(--primary)]">
                    KI analysiert...
                  </span>
                )}
              </label>
              <input
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
              <button
                className="w-full rounded-xl border-2 border-gray-300 border-dashed py-3 text-gray-500 text-sm transition-all hover:border-[var(--primary)] hover:text-[var(--primary)] dark:border-slate-600"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                📷 Quittung hochladen / fotografieren
                {form.receiptFile && (
                  <span className="mt-1 block text-green-600 text-xs">
                    ✓ {form.receiptFile.name}
                  </span>
                )}
              </button>
            </div>
            {/* Wiederkehrende Buchung */}
            <div className="md:col-span-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  checked={form.isRecurring}
                  className="rounded"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isRecurring: e.target.checked }))
                  }
                  type="checkbox"
                />
                <Repeat className="text-[var(--primary)]" size={15} />
                <span className="font-medium text-gray-700 text-sm dark:text-gray-300">
                  Wiederkehrende Buchung
                </span>
              </label>
              {form.isRecurring && (
                <div className="mt-2 flex gap-2">
                  {["weekly", "monthly", "yearly"].map((iv) => (
                    <button
                      className={`rounded-xl px-3 py-1.5 font-medium text-xs transition-all ${form.recurringInterval === iv ? "bg-[var(--primary)] text-white" : "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300"}`}
                      key={iv}
                      onClick={() =>
                        setForm((f) => ({ ...f, recurringInterval: iv }))
                      }
                      type="button"
                    >
                      {iv === "weekly"
                        ? "Wöchentlich"
                        : iv === "monthly"
                          ? "Monatlich"
                          : "Jährlich"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 md:col-span-2">
              <button
                className="rounded-xl bg-gray-100 px-4 py-2 font-medium text-gray-700 text-sm dark:bg-slate-700 dark:text-gray-300"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  resetForm();
                }}
                type="button"
              >
                Abbrechen
              </button>
              <button className="btn-primary" type="submit">
                {editingId ? "Aktualisieren" : "Speichern"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transaction List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-[var(--primary)] border-b-2" />
          </div>
        ) : typeFilter === "recurring" ? (
          recurring.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <div className="mb-4 text-5xl">🔄</div>
              <p>Keine wiederkehrenden Buchungen</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-700">
                <tr>
                  {[
                    "Kategorie",
                    "Beschreibung",
                    "Betrag",
                    "Intervall",
                    "Nächste Buchung",
                    "",
                  ].map((h) => (
                    <th
                      className="px-4 py-3 text-left font-semibold text-gray-500 text-xs uppercase tracking-wide"
                      key={h}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {recurring.map((r) => (
                  <tr
                    className="transition-colors hover:bg-pink-50/50 dark:hover:bg-slate-700/50"
                    key={r.id}
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-sm">
                        <span className="text-base">
                          {r.Category?.icon || "📦"}
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          {r.Category?.nameDE || r.Category?.name || "—"}
                        </span>
                      </span>
                    </td>
                    <td className="max-w-40 truncate px-4 py-3 text-gray-700 text-sm dark:text-gray-300">
                      {r.description || r.merchant || "—"}
                    </td>
                    <td
                      className={`px-4 py-3 font-bold text-sm ${r.type === "income" ? "text-green-600" : "text-[var(--expense)]"}`}
                    >
                      {r.type === "income" ? "+" : "-"}
                      {Number.parseFloat(r.amount).toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">
                      {r.recurringInterval === "weekly"
                        ? "Wöchentlich"
                        : r.recurringInterval === "monthly"
                          ? "Monatlich"
                          : "Jährlich"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">
                      {r.recurringNextDate
                        ? format(new Date(r.recurringNextDate), "dd.MM.yyyy")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          className="text-gray-400 transition-colors hover:text-[var(--primary)]"
                          onClick={() => openEdit(r)}
                          title="Bearbeiten"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="text-gray-400 transition-colors hover:text-red-500"
                          onClick={async () => {
                            if (!confirm("Wiederkehrende Buchung beenden?")) {
                              return;
                            }
                            await recurringAPI.stop(r.id);
                            setRecurring((prev) =>
                              prev.filter((x) => x.id !== r.id)
                            );
                          }}
                          title="Beenden"
                        >
                          <X size={16} />
                        </button>
                        <button
                          className="text-gray-400 transition-colors hover:text-blue-500"
                          onClick={() => {
                            setMoveDialog({
                              id: r.id,
                              description:
                                r.description || r.merchant || "Buchung",
                            });
                            setMoveTargetId("");
                          }}
                          title="In anderes Haushaltsbuch verschieben"
                        >
                          <ArrowRightLeft size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <div className="mb-4 text-5xl">📭</div>
            <p>Keine Buchungen gefunden</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                {[
                  "Datum",
                  "Kategorie",
                  "Beschreibung",
                  "Händler",
                  "Betrag",
                  "",
                ].map((h) => (
                  <th
                    className="px-4 py-3 text-left font-semibold text-gray-500 text-xs uppercase tracking-wide"
                    key={h}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {transactions.map((t) => (
                <tr
                  className="transition-colors hover:bg-pink-50/50 dark:hover:bg-slate-700/50"
                  key={t.id}
                >
                  <td className="px-4 py-3 text-gray-600 text-sm dark:text-gray-400">
                    {format(new Date(t.date), "dd.MM.yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span className="text-base">
                        {t.Category?.icon || "📦"}
                      </span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {t.Category?.nameDE || t.Category?.name || "—"}
                      </span>
                    </span>
                  </td>
                  <td className="max-w-40 truncate px-4 py-3 text-gray-700 text-sm dark:text-gray-300">
                    {t.description || "—"}
                  </td>
                  <td className="max-w-32 truncate px-4 py-3 text-gray-500 text-sm dark:text-gray-400">
                    {t.merchant || "—"}
                  </td>
                  <td
                    className={`px-4 py-3 font-bold text-sm ${t.type === "income" ? "text-green-600" : "text-[var(--expense)]"}`}
                  >
                    {t.type === "income" ? "+" : "-"}
                    {Number.parseFloat(t.amount).toFixed(2)} €
                    {t.isRecurring && (
                      <span title="Wiederkehrend">
                        <Repeat className="ml-1 inline opacity-40" size={11} />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        className="text-gray-400 transition-colors hover:text-[var(--primary)]"
                        onClick={() => openEdit(t)}
                        title="Bearbeiten"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="text-gray-400 transition-colors hover:text-red-500"
                        onClick={() => handleDelete(t.id)}
                        title="Löschen"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        className="text-gray-400 transition-colors hover:text-blue-500"
                        onClick={() => {
                          setMoveDialog({
                            id: t.id,
                            description:
                              t.description || t.merchant || "Buchung",
                          });
                          setMoveTargetId("");
                        }}
                        title="In anderes Haushaltsbuch verschieben"
                      >
                        <ArrowRightLeft size={16} />
                      </button>
                      {t.receiptImage && (
                        <button
                          className="text-gray-400 transition-colors hover:text-[var(--primary)]"
                          onClick={() =>
                            setReceiptModal(API_BASE + t.receiptImage)
                          }
                          title="Quittung anzeigen"
                        >
                          <Receipt size={16} />
                        </button>
                      )}
                      {t.receiptImage && hasPaperless && (
                        <button
                          className={`transition-colors ${t.paperlessDocId ? "text-green-500" : "text-gray-400 hover:text-[var(--primary)]"}`}
                          onClick={() => openPaperlessDialog(t)}
                          title={
                            t.paperlessDocId
                              ? "Bereits in Paperless"
                              : "Zu Paperless hochladen"
                          }
                        >
                          <FileText size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Verschieben-Modal */}
      {moveDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setMoveDialog(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 font-bold text-gray-900 text-lg dark:text-white">
              Buchung verschieben
            </h3>
            <p className="mb-4 text-gray-500 text-sm">
              „{moveDialog.description}" in ein anderes Haushaltsbuch
              verschieben:
            </p>
            {allHouseholds.filter((h) => h.id !== currentHousehold?.id)
              .length === 0 ? (
              <p className="mb-4 text-gray-400 text-sm">
                Du hast nur ein Haushaltsbuch. Erstelle ein weiteres, um
                Buchungen verschieben zu können.
              </p>
            ) : (
              <select
                className="input mb-4 w-full"
                onChange={(e) => setMoveTargetId(e.target.value)}
                value={moveTargetId}
              >
                <option value="">— Haushaltsbuch wählen —</option>
                {allHouseholds
                  .filter((h) => h.id !== currentHousehold?.id)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
              </select>
            )}
            <div className="flex justify-end gap-3">
              <button
                className="rounded-xl bg-gray-100 px-4 py-2 font-medium text-gray-700 text-sm dark:bg-slate-700 dark:text-gray-300"
                onClick={() => setMoveDialog(null)}
              >
                Abbrechen
              </button>
              <button
                className="btn-primary disabled:opacity-50"
                disabled={!moveTargetId}
                onClick={handleMove}
              >
                Verschieben
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quittungs-Vollbild-Modal */}
      {receiptModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setReceiptModal(null)}
        >
          <div
            className="relative max-h-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute -top-10 right-0 flex items-center gap-1 text-sm text-white/70 hover:text-white"
              onClick={() => setReceiptModal(null)}
            >
              <X size={18} /> Schließen
            </button>
            <img
              alt="Quittung"
              className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
              src={receiptModal}
            />
            <a
              className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full bg-black/50 px-3 py-1.5 text-white text-xs hover:bg-black/70"
              href={receiptModal}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ZoomIn size={12} /> Original öffnen
            </a>
          </div>
        </div>
      )}

      {/* Paperless Upload Dialog */}
      {paperlessDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                <FileText className="text-[var(--primary)]" size={18} /> Zu
                Paperless hochladen
              </h2>
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setPaperlessDialog(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                  Titel
                </label>
                <input
                  className="input"
                  onChange={(e) =>
                    setPaperlessForm((f) => ({ ...f, title: e.target.value }))
                  }
                  type="text"
                  value={paperlessForm.title}
                />
              </div>

              {favDocTypes.length > 0 && (
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Dokumententyp
                  </label>
                  <select
                    className="input"
                    onChange={(e) =>
                      setPaperlessForm((f) => ({
                        ...f,
                        documentTypeId: e.target.value,
                      }))
                    }
                    value={paperlessForm.documentTypeId}
                  >
                    <option value="">— keiner —</option>
                    {favDocTypes.map((dt: any) => (
                      <option key={dt.id} value={dt.id}>
                        {dt.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {favCorrespondents.length > 0 && (
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Korrespondent
                  </label>
                  <select
                    className="input"
                    onChange={(e) =>
                      setPaperlessForm((f) => ({
                        ...f,
                        correspondentId: e.target.value,
                      }))
                    }
                    value={paperlessForm.correspondentId}
                  >
                    <option value="">— keiner —</option>
                    {favCorrespondents.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {favTags.length > 0 && (
                <div>
                  <label className="mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {favTags.map((tag: any) => {
                      const selected = paperlessForm.tagIds.includes(tag.id);
                      return (
                        <button
                          className={`rounded-full border-2 px-3 py-1 font-medium text-white text-xs transition-all ${selected ? "scale-105 border-white" : "border-transparent opacity-70"}`}
                          key={tag.id}
                          onClick={() =>
                            setPaperlessForm((f) => ({
                              ...f,
                              tagIds: selected
                                ? f.tagIds.filter((id) => id !== tag.id)
                                : [...f.tagIds, tag.id],
                            }))
                          }
                          style={{ background: tag.color || "#9CA3AF" }}
                          type="button"
                        >
                          <Tag className="mr-1 inline" size={10} />
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {paperlessUsers.length > 0 && (
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Eigentümer in Paperless
                  </label>
                  <select
                    className="input"
                    onChange={(e) =>
                      setPaperlessForm((f: any) => ({
                        ...f,
                        ownerPaperlessUserId: e.target.value,
                      }))
                    }
                    value={paperlessForm.ownerPaperlessUserId || ""}
                  >
                    <option value="">— Standard —</option>
                    {paperlessUsers.map((u: any) => (
                      <option key={u.id} value={u.paperlessId}>
                        {u.fullName || u.username}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {paperlessUsers.length > 1 && (
                <div>
                  <label className="mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Sichtbar für
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {paperlessUsers.map((u: any) => {
                      const selected = (
                        paperlessForm.viewPaperlessUserIds || []
                      ).includes(String(u.paperlessId));
                      return (
                        <button
                          className={`rounded-full border-2 px-3 py-1 font-medium text-xs transition-all ${selected ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-transparent bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300"}`}
                          key={u.id}
                          onClick={() =>
                            setPaperlessForm((f: any) => ({
                              ...f,
                              viewPaperlessUserIds: selected
                                ? (f.viewPaperlessUserIds || []).filter(
                                    (id: string) => id !== String(u.paperlessId)
                                  )
                                : [
                                    ...(f.viewPaperlessUserIds || []),
                                    String(u.paperlessId),
                                  ],
                            }))
                          }
                          type="button"
                        >
                          {u.fullName || u.username}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-xl bg-gray-100 px-4 py-2 font-medium text-sm dark:bg-slate-700"
                onClick={() => setPaperlessDialog(null)}
              >
                Abbrechen
              </button>
              <button
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
                disabled={uploading}
                onClick={handlePaperlessUpload}
              >
                {uploading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <FileText size={16} />
                )}
                Hochladen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
