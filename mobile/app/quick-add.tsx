import { MaterialCommunityIcons } from "@expo/vector-icons";
import { format } from "date-fns";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Button,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { categoryAPI, transactionAPI } from "../src/services/api";
import {
  cache,
  isNetworkError,
  offlineQueue,
} from "../src/services/offlineStore";
import { useAuthStore } from "../src/store/authStore";

// Schnellerfassung: Betrag + Kategorie + Stichwort in wenigen Sekunden direkt
// beim Bezahlen. Die Buchung wird mit pendingBankMatch angelegt und beim
// nächsten Bank-Sync-Import (Web) mit dem passenden Bankumsatz verschmolzen.
//
// Hinweis: Dieser Screen ist ein natives Modal (presentation: "modal"). Paper-
// Portals rendern hinter nativen Modals → hier nur React-Native-<Modal>.

interface QuickCategory {
  icon: string;
  id: string;
  name: string;
  nameDE?: string | null;
}

type TxType = "expense" | "income";

// Standard laut Backend (GET /transactions/quick-categories), falls offline.
const DEFAULT_MAX_TILES = 11;
const MAX_DECIMALS = 2;
const MAX_INTEGER_DIGITS = 7;
const KEYPAD_KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ",",
  "0",
  "back",
] as const;

const categoryName = (c: QuickCategory) => c.nameDE || c.name;

// Baut die Betragseingabe Taste für Taste auf (deutsches Komma, max. 2
// Nachkommastellen, keine führenden Nullen).
function applyKey(current: string, key: (typeof KEYPAD_KEYS)[number]) {
  if (key === "back") {
    return current.slice(0, -1);
  }
  const [integerPart, decimalPart] = current.split(",");
  if (key === ",") {
    if (current.includes(",")) {
      return current;
    }
    return current === "" ? "0," : `${current},`;
  }
  if (decimalPart !== undefined) {
    return decimalPart.length >= MAX_DECIMALS ? current : current + key;
  }
  if (integerPart === "0") {
    return key;
  }
  return integerPart.length >= MAX_INTEGER_DIGITS ? current : current + key;
}

function parseAmount(input: string) {
  const n = Number.parseFloat(input.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function moveItem<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

interface TileProps {
  category: QuickCategory;
  highlighted: boolean;
  onPress: () => void;
}

function CategoryTile({ category, highlighted, onPress }: TileProps) {
  const theme = useTheme() as any;
  return (
    <TouchableOpacity
      accessibilityLabel={categoryName(category)}
      accessibilityState={{ selected: highlighted }}
      onPress={onPress}
      style={[
        styles.tile,
        {
          backgroundColor: highlighted
            ? theme.colors.primaryContainer
            : theme.colors.cardBackground,
          borderColor: highlighted
            ? theme.colors.primary
            : theme.colors.outline,
        },
      ]}
    >
      <Text style={styles.tileIcon}>{category.icon}</Text>
      <Text
        numberOfLines={1}
        style={[styles.tileLabel, { color: theme.colors.onSurface }]}
      >
        {categoryName(category)}
      </Text>
    </TouchableOpacity>
  );
}

interface AllCategoriesModalProps {
  categories: QuickCategory[];
  onClose: () => void;
  onSelect: (category: QuickCategory) => void;
  selectedId: string | null;
  visible: boolean;
}

function AllCategoriesModal({
  categories,
  onClose,
  onSelect,
  selectedId,
  visible,
}: AllCategoriesModalProps) {
  const theme = useTheme() as any;
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <Pressable
        accessibilityLabel="Schließen"
        onPress={onClose}
        style={styles.backdrop}
      >
        {/* Innerer Pressable fängt Taps ab, damit sie nicht schließen. */}
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            Kategorie wählen
          </Text>
          <ScrollView>
            <View style={styles.tileGrid}>
              {categories.map((category) => (
                <CategoryTile
                  category={category}
                  highlighted={selectedId === category.id}
                  key={category.id}
                  onPress={() => onSelect(category)}
                />
              ))}
            </View>
            {categories.length === 0 && (
              <Text style={{ color: theme.colors.onSurface, opacity: 0.6 }}>
                Kategorien konnten nicht geladen werden.
              </Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface EditTilesModalProps {
  allCategories: QuickCategory[];
  custom: boolean;
  initialTiles: QuickCategory[];
  maxTiles: number;
  onClose: () => void;
  onSave: (categoryIds: string[]) => Promise<void>;
  type: TxType;
  visible: boolean;
}

// Kacheln auswählen + sortieren. Pfeile statt Drag & Drop, damit keine
// zusätzliche native Bibliothek nötig ist.
function EditTilesModal({
  allCategories,
  custom,
  initialTiles,
  maxTiles,
  onClose,
  onSave,
  type,
  visible,
}: EditTilesModalProps) {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const [chosen, setChosen] = useState<QuickCategory[]>(initialTiles);
  const [saving, setSaving] = useState(false);

  const chosenIds = new Set(chosen.map((c) => c.id));
  const available = allCategories.filter((c) => !chosenIds.has(c.id));
  const full = chosen.length >= maxTiles;

  const save = async (ids: string[]) => {
    setSaving(true);
    try {
      await onSave(ids);
      onClose();
    } catch {
      // Fehler-Toast kommt aus onSave; Modal bleibt offen zum Wiederholen.
    } finally {
      setSaving(false);
    }
  };

  const iconButton = (
    icon: string,
    label: string,
    onPress: () => void,
    disabled = false
  ) => (
    <TouchableOpacity
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={{ opacity: disabled ? 0.25 : 1, padding: 4 }}
    >
      <MaterialCommunityIcons
        color={theme.colors.onSurface}
        name={icon as any}
        size={22}
      />
    </TouchableOpacity>
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      // Beim Öffnen den aktuellen Stand übernehmen (nicht bei jedem Render,
      // sonst gehen Änderungen verloren).
      onShow={() => setChosen(initialTiles)}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View
          style={[styles.editHeader, { borderColor: theme.colors.outline }]}
        >
          <TouchableOpacity disabled={saving} onPress={onClose}>
            <Text style={{ color: theme.colors.primary, fontSize: 16 }}>
              Abbrechen
            </Text>
          </TouchableOpacity>
          <Text style={[styles.editTitle, { color: theme.colors.onSurface }]}>
            Kacheln {type === "expense" ? "Ausgaben" : "Einnahmen"}
          </Text>
          <TouchableOpacity
            disabled={saving}
            onPress={() => save(chosen.map((c) => c.id))}
          >
            <Text
              style={{
                color: theme.colors.primary,
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              Fertig
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.editContent}>
          <Text
            style={[styles.sectionLabel, { color: theme.colors.onSurface }]}
          >
            Deine Kacheln ({chosen.length}/{maxTiles})
          </Text>
          {chosen.length === 0 && (
            <Text style={[styles.hint, { color: theme.colors.onSurface }]}>
              Noch keine Kacheln. Tippe unten auf eine Kategorie, um sie
              hinzuzufügen.
            </Text>
          )}
          {chosen.map((category, index) => (
            <View
              key={category.id}
              style={[
                styles.editRow,
                { backgroundColor: theme.colors.cardBackground },
              ]}
            >
              <Text style={styles.editRowIcon}>{category.icon}</Text>
              <Text
                numberOfLines={1}
                style={[styles.editRowLabel, { color: theme.colors.onSurface }]}
              >
                {categoryName(category)}
              </Text>
              {iconButton(
                "arrow-up",
                "Nach oben",
                () => setChosen((prev) => moveItem(prev, index, index - 1)),
                index === 0
              )}
              {iconButton(
                "arrow-down",
                "Nach unten",
                () => setChosen((prev) => moveItem(prev, index, index + 1)),
                index === chosen.length - 1
              )}
              {iconButton("close", "Entfernen", () =>
                setChosen((prev) => prev.filter((c) => c.id !== category.id))
              )}
            </View>
          ))}

          <Text
            style={[
              styles.sectionLabel,
              { color: theme.colors.onSurface, marginTop: 20 },
            ]}
          >
            Hinzufügen
          </Text>
          {full && (
            <Text style={[styles.hint, { color: theme.colors.onSurface }]}>
              Maximal {maxTiles} Kacheln. Entferne erst eine.
            </Text>
          )}
          {available.map((category) => (
            <TouchableOpacity
              disabled={full}
              key={category.id}
              onPress={() => setChosen((prev) => [...prev, category])}
              style={[
                styles.editRow,
                {
                  backgroundColor: theme.colors.cardBackground,
                  opacity: full ? 0.4 : 1,
                },
              ]}
            >
              <Text style={styles.editRowIcon}>{category.icon}</Text>
              <Text
                numberOfLines={1}
                style={[styles.editRowLabel, { color: theme.colors.onSurface }]}
              >
                {categoryName(category)}
              </Text>
              <MaterialCommunityIcons
                color={theme.colors.primary}
                name="plus-circle-outline"
                size={22}
              />
            </TouchableOpacity>
          ))}

          {custom && (
            <Button
              disabled={saving}
              mode="text"
              onPress={() => save([])}
              style={{ marginTop: 16 }}
            >
              Zurücksetzen: automatisch nach Nutzung
            </Button>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function QuickAddScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold } = useAuthStore();
  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [tiles, setTiles] = useState<QuickCategory[]>([]);
  const [customTiles, setCustomTiles] = useState(false);
  const [maxTiles, setMaxTiles] = useState(DEFAULT_MAX_TILES);
  const [allCategories, setAllCategories] = useState<QuickCategory[]>([]);
  const [selected, setSelected] = useState<QuickCategory | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const householdId = currentHousehold?.id;

  useEffect(() => {
    if (!householdId) {
      return;
    }
    const cacheKey = `quick_all_categories_${householdId}`;
    const load = async () => {
      try {
        const { data } = await categoryAPI.getAll(householdId);
        setAllCategories(data.categories || []);
        await cache.set(cacheKey, data.categories || []);
      } catch {
        setAllCategories((await cache.get<QuickCategory[]>(cacheKey)) || []);
      }
    };
    load();
  }, [householdId]);

  useEffect(() => {
    if (!householdId) {
      return;
    }
    const cacheKey = `quick_tiles_${householdId}_${type}`;
    const load = async () => {
      try {
        const { data } = await transactionAPI.quickCategories(
          householdId,
          type
        );
        setTiles(data.categories || []);
        setCustomTiles(!!data.custom);
        setMaxTiles(data.maxTiles || DEFAULT_MAX_TILES);
        await cache.set(cacheKey, data);
      } catch {
        const cached = await cache.get<any>(cacheKey);
        setTiles(cached?.categories || []);
        setCustomTiles(!!cached?.custom);
      }
    };
    load();
  }, [householdId, type]);

  const saveTiles = async (categoryIds: string[]) => {
    if (!householdId) {
      return;
    }
    try {
      const { data } = await transactionAPI.setQuickCategories(
        householdId,
        type,
        categoryIds
      );
      setTiles(data.categories || []);
      setCustomTiles(!!data.custom);
      await cache.set(`quick_tiles_${householdId}_${type}`, data);
      Toast.show({ type: "success", text1: "Kacheln gespeichert" });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Kacheln nicht gespeichert",
        text2: isNetworkError(err)
          ? "Keine Verbindung zum Server"
          : err.response?.data?.error || err.message,
      });
      throw err;
    }
  };

  const visibleTiles = tiles.slice(0, maxTiles);
  const selectedIsTile = visibleTiles.some((c) => c.id === selected?.id);
  const amountValue = parseAmount(amount);
  const accent =
    type === "expense" ? theme.colors.expenseColor : theme.colors.incomeColor;

  const close = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  const handleSave = async () => {
    if (!currentHousehold || amountValue <= 0) {
      Toast.show({ type: "error", text1: "Bitte Betrag eingeben" });
      return;
    }
    setSaving(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const description = note.trim();
    try {
      const form = new FormData();
      form.append("amount", String(amountValue));
      form.append("type", type);
      form.append("date", today);
      form.append("householdId", currentHousehold.id);
      form.append("description", description);
      form.append("pendingBankMatch", "true");
      if (selected) {
        form.append("categoryId", selected.id);
      }
      const { data } = await transactionAPI.create(form);
      if (data.budgetWarning) {
        const w = data.budgetWarning[0];
        Toast.show({
          type: "error",
          text1: w.isOver ? "⚠️ Budget überschritten!" : "⚠️ Budget-Warnung",
          text2: `${Math.round(w.percentage)}% des Budgets verbraucht`,
          visibilityTime: 5000,
        });
      } else {
        Toast.show({ type: "success", text1: "⚡ Schnell erfasst" });
      }
      close();
    } catch (err: any) {
      if (isNetworkError(err)) {
        await offlineQueue.add({
          amount: String(amountValue),
          description,
          merchant: "",
          date: today,
          type,
          categoryId: selected?.id || null,
          householdId: currentHousehold.id,
          pendingBankMatch: true,
        });
        Toast.show({
          type: "info",
          text1: "Offline gespeichert",
          text2: "Wird synchronisiert, wenn du wieder online bist",
        });
        close();
      } else {
        Toast.show({
          type: "error",
          text1: "Fehler beim Speichern",
          text2: err.response?.data?.error || err.message,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const moreHighlighted = !!selected && !selectedIsTile;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.primary,
            paddingTop: insets.top + 12,
          },
        ]}
      >
        <TouchableOpacity accessibilityLabel="Schließen" onPress={close}>
          <MaterialCommunityIcons color="#fff" name="close" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⚡ Schnell erfassen</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SegmentedButtons
          buttons={[
            { value: "expense", label: "Ausgabe" },
            { value: "income", label: "Einnahme" },
          ]}
          density="small"
          onValueChange={(v) => {
            setType(v as TxType);
            setSelected(null);
          }}
          value={type}
        />

        <Text
          accessibilityLabel={`Betrag ${amount || "0"} Euro`}
          style={[styles.amount, { color: accent }]}
        >
          {amount || "0"}
          <Text style={[styles.amountCurrency, { color: accent }]}> €</Text>
        </Text>

        <View>
          <View style={styles.tileGrid}>
            {visibleTiles.map((category) => (
              <CategoryTile
                category={category}
                highlighted={selected?.id === category.id}
                key={category.id}
                onPress={() =>
                  setSelected(selected?.id === category.id ? null : category)
                }
              />
            ))}
            <CategoryTile
              category={
                moreHighlighted && selected
                  ? selected
                  : { id: "more", icon: "⋯", name: "Mehr" }
              }
              highlighted={moreHighlighted}
              onPress={() => setShowAll(true)}
            />
          </View>
          <TouchableOpacity
            accessibilityLabel="Kacheln anpassen"
            onPress={() => setEditing(true)}
            style={styles.editLink}
          >
            <MaterialCommunityIcons
              color={theme.colors.primary}
              name="pencil-outline"
              size={14}
            />
            <Text style={{ color: theme.colors.primary, fontSize: 13 }}>
              {customTiles ? "Kacheln anpassen" : "Eigene Kacheln festlegen"}
            </Text>
          </TouchableOpacity>
        </View>

        <TextInput
          dense
          label="Stichwort (optional)"
          left={<TextInput.Icon icon="pencil-outline" />}
          mode="outlined"
          onChangeText={setNote}
          placeholder="z. B. Pizza mit Team"
          returnKeyType="done"
          value={note}
        />

        <View style={styles.keypad}>
          {KEYPAD_KEYS.map((key) => (
            <TouchableOpacity
              accessibilityLabel={key === "back" ? "Löschen" : key}
              key={key}
              onLongPress={key === "back" ? () => setAmount("") : undefined}
              onPress={() => setAmount((prev) => applyKey(prev, key))}
              style={[
                styles.key,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
            >
              {key === "back" ? (
                <MaterialCommunityIcons
                  color={theme.colors.onSurface}
                  name="backspace-outline"
                  size={22}
                />
              ) : (
                <Text
                  style={[styles.keyText, { color: theme.colors.onSurface }]}
                >
                  {key}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <Button
          contentStyle={{ paddingVertical: 6 }}
          disabled={saving || amountValue <= 0}
          loading={saving}
          mode="contained"
          onPress={handleSave}
        >
          Speichern
        </Button>
        <Text style={[styles.meta, { color: theme.colors.onSurface }]}>
          Heute · wird beim nächsten Bank-Import abgeglichen
        </Text>
      </ScrollView>

      <AllCategoriesModal
        categories={allCategories}
        onClose={() => setShowAll(false)}
        onSelect={(category) => {
          setSelected(category);
          setShowAll(false);
        }}
        selectedId={selected?.id || null}
        visible={showAll}
      />
      <EditTilesModal
        allCategories={allCategories}
        custom={customTiles}
        initialTiles={visibleTiles}
        maxTiles={maxTiles}
        onClose={() => setEditing(false)}
        onSave={saveTiles}
        type={type}
        visible={editing}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  content: { padding: 16, gap: 14 },
  amount: {
    fontSize: 44,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -1,
  },
  amountCurrency: { fontSize: 28, fontWeight: "400" },
  // 4 Spalten, linksbündig (auch bei unvollständiger letzter Reihe).
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 6,
    rowGap: 8,
  },
  tile: {
    width: "23%",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 2,
    alignItems: "center",
  },
  tileIcon: { fontSize: 22 },
  tileLabel: { fontSize: 11, marginTop: 2 },
  editLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 4,
    paddingTop: 8,
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 6,
  },
  key: {
    width: "32.5%",
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: { fontSize: 22, fontWeight: "500" },
  meta: { fontSize: 12, textAlign: "center", opacity: 0.6 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  sheet: { borderRadius: 16, padding: 16, maxHeight: "80%" },
  modalTitle: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  editTitle: { fontSize: 17, fontWeight: "600" },
  editContent: { padding: 16, gap: 6 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  hint: { fontSize: 13, opacity: 0.6, marginBottom: 6 },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  editRowIcon: { fontSize: 20 },
  editRowLabel: { flex: 1, fontSize: 15 },
});
