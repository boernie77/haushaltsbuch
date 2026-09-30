import { MaterialCommunityIcons } from "@expo/vector-icons";
import { format } from "date-fns";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Button,
  Modal,
  Portal,
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

interface QuickCategory {
  icon: string;
  id: string;
  name: string;
  nameDE?: string | null;
}

type TxType = "expense" | "income";

// 7 Kacheln + "Mehr" = 2 Reihen à 4.
const TILE_COUNT = 7;
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

export default function QuickAddScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold } = useAuthStore();
  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [tiles, setTiles] = useState<QuickCategory[]>([]);
  const [allCategories, setAllCategories] = useState<QuickCategory[]>([]);
  const [selected, setSelected] = useState<QuickCategory | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentHousehold) {
      return;
    }
    const cacheKey = `quick_categories_${currentHousehold.id}_${type}`;
    const load = async () => {
      try {
        const { data } = await transactionAPI.frequentCategories(
          currentHousehold.id,
          type
        );
        setTiles(data.categories || []);
        await cache.set(cacheKey, data.categories || []);
      } catch {
        setTiles((await cache.get<QuickCategory[]>(cacheKey)) || []);
      }
    };
    load();
  }, [currentHousehold, type]);

  const openAllCategories = async () => {
    setShowAll(true);
    if (allCategories.length > 0 || !currentHousehold) {
      return;
    }
    const cacheKey = `quick_all_categories_${currentHousehold.id}`;
    try {
      const { data } = await categoryAPI.getAll(currentHousehold.id);
      setAllCategories(data.categories || []);
      await cache.set(cacheKey, data.categories || []);
    } catch {
      setAllCategories((await cache.get<QuickCategory[]>(cacheKey)) || []);
    }
  };

  const visibleTiles = tiles.slice(0, TILE_COUNT);
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

  const renderTile = (category: QuickCategory) => {
    const isSelected = selected?.id === category.id;
    return (
      <TouchableOpacity
        accessibilityLabel={categoryName(category)}
        accessibilityState={{ selected: isSelected }}
        key={category.id}
        onPress={() => setSelected(isSelected ? null : category)}
        style={[
          styles.tile,
          {
            backgroundColor: isSelected
              ? theme.colors.primaryContainer
              : theme.colors.cardBackground,
            borderColor: isSelected
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
  };

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

        <View style={styles.tileGrid}>
          {visibleTiles.map(renderTile)}
          <TouchableOpacity
            accessibilityLabel="Weitere Kategorien"
            onPress={openAllCategories}
            style={[
              styles.tile,
              {
                backgroundColor:
                  selected && !selectedIsTile
                    ? theme.colors.primaryContainer
                    : theme.colors.cardBackground,
                borderColor:
                  selected && !selectedIsTile
                    ? theme.colors.primary
                    : theme.colors.outline,
              },
            ]}
          >
            <Text style={styles.tileIcon}>
              {selected && !selectedIsTile ? selected.icon : "⋯"}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.tileLabel, { color: theme.colors.onSurface }]}
            >
              {selected && !selectedIsTile ? categoryName(selected) : "Mehr"}
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

      <Portal>
        <Modal
          contentContainerStyle={[
            styles.modal,
            { backgroundColor: theme.colors.surface },
          ]}
          onDismiss={() => setShowAll(false)}
          visible={showAll}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            Kategorie wählen
          </Text>
          <ScrollView>
            <View style={styles.tileGrid}>
              {allCategories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  onPress={() => {
                    setSelected(category);
                    setShowAll(false);
                  }}
                  style={[
                    styles.tile,
                    {
                      backgroundColor:
                        selected?.id === category.id
                          ? theme.colors.primaryContainer
                          : theme.colors.cardBackground,
                      borderColor: theme.colors.outline,
                    },
                  ]}
                >
                  <Text style={styles.tileIcon}>{category.icon}</Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tileLabel,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    {categoryName(category)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </Modal>
      </Portal>
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
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  tile: {
    width: "23.5%",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 2,
    alignItems: "center",
  },
  tileIcon: { fontSize: 22 },
  tileLabel: { fontSize: 11, marginTop: 2 },
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
  modal: { margin: 20, borderRadius: 16, padding: 16, maxHeight: "80%" },
  modalTitle: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
});
