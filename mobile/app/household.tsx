import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  TextInput as RNTextInput,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  List,
  Text,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { householdAPI } from "../src/services/api";
import { useAuthStore } from "../src/store/authStore";

export default function HouseholdScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold, households, setCurrentHousehold, setHouseholds } =
    useAuthStore();

  const [name, setName] = useState(currentHousehold?.name || "");
  const [currency, setCurrency] = useState(currentHousehold?.currency || "EUR");
  const [monthlyBudget, setMonthlyBudget] = useState(
    currentHousehold?.monthlyBudget
      ? String(currentHousehold.monthlyBudget)
      : ""
  );
  const [members, setMembers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // Neues Haushaltsbuch
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCurrency, setNewCurrency] = useState("EUR");
  const [newBudget, setNewBudget] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (currentHousehold) {
      setName(currentHousehold.name);
      setCurrency(currentHousehold.currency || "EUR");
      setMonthlyBudget(
        currentHousehold.monthlyBudget
          ? String(currentHousehold.monthlyBudget)
          : ""
      );
      householdAPI
        .getMembers(currentHousehold.id)
        .then(({ data }) => setMembers(data.members || []))
        .catch(() => {})
        .finally(() => setLoadingMembers(false));
    }
  }, [currentHousehold?.id]);

  const handleSave = async () => {
    if (!(currentHousehold && name.trim())) {
      return;
    }
    setSaving(true);
    try {
      const { data } = await householdAPI.update(currentHousehold.id, {
        name: name.trim(),
        currency,
        monthlyBudget: monthlyBudget ? Number.parseFloat(monthlyBudget) : null,
      });
      const updated = {
        ...currentHousehold,
        name: data.household.name,
        currency: data.household.currency,
        monthlyBudget: data.household.monthlyBudget,
      };
      setCurrentHousehold(updated);
      setHouseholds(households.map((h) => (h.id === updated.id ? updated : h)));
      Toast.show({ type: "success", text1: "Haushalt gespeichert" });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: err.response?.data?.message || "Fehler beim Speichern",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = (userId: string, memberName: string) => {
    if (!currentHousehold) {
      return;
    }
    Alert.alert(
      "Mitglied entfernen",
      `${memberName} aus dem Haushalt entfernen?`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Entfernen",
          style: "destructive",
          onPress: async () => {
            try {
              await householdAPI.removeMember(currentHousehold.id, userId);
              setMembers((ms) => ms.filter((m) => m.userId !== userId));
              Toast.show({ type: "success", text1: "Mitglied entfernt" });
            } catch {
              Toast.show({ type: "error", text1: "Fehler beim Entfernen" });
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    if (!currentHousehold || households.length <= 1) {
      return;
    }
    Alert.alert(
      "Haushaltsbuch löschen",
      `„${currentHousehold.name}" wirklich löschen?\n\nAlle Buchungen, Budgets und Einstellungen werden unwiderruflich gelöscht!`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            try {
              await householdAPI.remove(currentHousehold.id);
              const remaining = households.filter(
                (h) => h.id !== currentHousehold.id
              );
              setHouseholds(remaining);
              setCurrentHousehold(remaining[0] || null);
              Toast.show({ type: "success", text1: "Haushaltsbuch gelöscht" });
              router.back();
            } catch (err: any) {
              Toast.show({
                type: "error",
                text1: err.response?.data?.error || "Fehler beim Löschen",
              });
            }
          },
        },
      ]
    );
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      return;
    }
    setCreating(true);
    try {
      await householdAPI.create({
        name: newName.trim(),
        currency: newCurrency,
        monthlyBudget: newBudget ? Number.parseFloat(newBudget) : null,
      });
      const { data } = await householdAPI.getAll();
      const all = data.households;
      setHouseholds(all);
      const created =
        all.find((h: any) => h.name === newName.trim()) || all.at(-1);
      setCurrentHousehold(created);
      setNewName("");
      setNewBudget("");
      setNewCurrency("EUR");
      setShowCreate(false);
      Toast.show({ type: "success", text1: "Haushaltsbuch erstellt" });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: err.response?.data?.error || "Fehler beim Erstellen",
      });
    } finally {
      setCreating(false);
    }
  };

  const CURRENCIES = ["EUR", "USD", "CHF", "GBP"];

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.primary,
            paddingTop: insets.top + 12,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Button
            compact
            icon="arrow-left"
            onPress={() => router.back()}
            textColor="#fff"
          >
            Zurück
          </Button>
          <Text style={styles.headerTitle}>Haushalt verwalten</Text>
          <View style={{ width: 80 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* Household switcher */}
        {households.length > 1 && (
          <View style={styles.section}>
            <Text
              style={[styles.sectionLabel, { color: theme.colors.primary }]}
            >
              Haushaltsbuch wechseln
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 8 }}
            >
              {households.map((h) => (
                <Chip
                  key={h.id}
                  onPress={() => setCurrentHousehold(h)}
                  selected={h.id === currentHousehold?.id}
                  selectedColor={theme.colors.primary}
                  style={{ marginRight: 8 }}
                >
                  {h.name}
                </Chip>
              ))}
            </ScrollView>
          </View>
        )}

        <Divider />

        {/* Neues Haushaltsbuch */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>
            Neues Haushaltsbuch
          </Text>
          {showCreate ? (
            <>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>
                Name *
              </Text>
              <RNTextInput
                onChangeText={setNewName}
                placeholder="z.B. Unser Haushalt"
                placeholderTextColor={`${theme.colors.onSurface}60`}
                style={[
                  styles.input,
                  {
                    color: theme.colors.onSurface,
                    borderColor: `${theme.colors.primary}40`,
                    backgroundColor: theme.colors.cardBackground,
                  },
                ]}
                value={newName}
              />
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>
                Währung
              </Text>
              <View style={styles.chipRow}>
                {CURRENCIES.map((c) => (
                  <Chip
                    key={c}
                    onPress={() => setNewCurrency(c)}
                    selected={newCurrency === c}
                    selectedColor={theme.colors.primary}
                    style={{ marginRight: 8 }}
                  >
                    {c}
                  </Chip>
                ))}
              </View>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>
                Monatsbudget (optional)
              </Text>
              <RNTextInput
                keyboardType="decimal-pad"
                onChangeText={setNewBudget}
                placeholder="z.B. 2000"
                placeholderTextColor={`${theme.colors.onSurface}60`}
                style={[
                  styles.input,
                  {
                    color: theme.colors.onSurface,
                    borderColor: `${theme.colors.primary}40`,
                    backgroundColor: theme.colors.cardBackground,
                  },
                ]}
                value={newBudget}
              />
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Button
                  mode="outlined"
                  onPress={() => setShowCreate(false)}
                  style={{ flex: 1 }}
                  textColor={theme.colors.onSurface}
                >
                  Abbrechen
                </Button>
                <Button
                  buttonColor={theme.colors.primary}
                  disabled={creating || !newName.trim()}
                  mode="contained"
                  onPress={handleCreate}
                  style={{ flex: 1 }}
                >
                  {creating ? (
                    <ActivityIndicator color="#fff" size={16} />
                  ) : (
                    "Erstellen"
                  )}
                </Button>
              </View>
            </>
          ) : (
            <Button
              icon="plus"
              mode="outlined"
              onPress={() => setShowCreate(true)}
              style={{ borderColor: `${theme.colors.primary}60` }}
              textColor={theme.colors.primary}
            >
              Neues Haushaltsbuch anlegen
            </Button>
          )}
        </View>

        <Divider />

        {/* Edit fields */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>
            Haushalt bearbeiten
          </Text>

          <Text style={[styles.label, { color: theme.colors.onSurface }]}>
            Name
          </Text>
          <RNTextInput
            onChangeText={setName}
            placeholder="Name des Haushalts"
            placeholderTextColor={`${theme.colors.onSurface}60`}
            style={[
              styles.input,
              {
                color: theme.colors.onSurface,
                borderColor: `${theme.colors.primary}40`,
                backgroundColor: theme.colors.cardBackground,
              },
            ]}
            value={name}
          />

          <Text style={[styles.label, { color: theme.colors.onSurface }]}>
            Währung
          </Text>
          <View style={styles.chipRow}>
            {CURRENCIES.map((c) => (
              <Chip
                key={c}
                onPress={() => setCurrency(c)}
                selected={currency === c}
                selectedColor={theme.colors.primary}
                style={{ marginRight: 8 }}
              >
                {c}
              </Chip>
            ))}
          </View>

          <Text style={[styles.label, { color: theme.colors.onSurface }]}>
            Monatsbudget (optional)
          </Text>
          <RNTextInput
            keyboardType="decimal-pad"
            onChangeText={setMonthlyBudget}
            placeholder="z.B. 2000"
            placeholderTextColor={`${theme.colors.onSurface}60`}
            style={[
              styles.input,
              {
                color: theme.colors.onSurface,
                borderColor: `${theme.colors.primary}40`,
                backgroundColor: theme.colors.cardBackground,
              },
            ]}
            value={monthlyBudget}
          />

          <Button
            buttonColor={theme.colors.primary}
            disabled={saving}
            mode="contained"
            onPress={handleSave}
            style={{ marginTop: 8 }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size={16} />
            ) : (
              "Speichern"
            )}
          </Button>
        </View>

        <Divider />

        {/* Members */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>
            Mitglieder
          </Text>
          {loadingMembers ? (
            <ActivityIndicator
              color={theme.colors.primary}
              style={{ marginTop: 16 }}
            />
          ) : (
            members.map((member) => (
              <List.Item
                description={
                  member.role === "admin"
                    ? "👑 Admin"
                    : member.role === "viewer"
                      ? "👁 Betrachter"
                      : "👤 Mitglied"
                }
                descriptionStyle={{
                  color: theme.colors.onSurface,
                  opacity: 0.6,
                }}
                key={member.userId}
                left={() => (
                  <List.Icon color={theme.colors.primary} icon="account" />
                )}
                right={() =>
                  member.role === "admin" ? null : (
                    <Button
                      compact
                      icon="account-remove"
                      onPress={() =>
                        handleRemoveMember(member.userId, member.User?.name)
                      }
                      textColor={theme.colors.error}
                    >
                      Entfernen
                    </Button>
                  )
                }
                style={{
                  backgroundColor: theme.colors.cardBackground,
                  borderRadius: 8,
                  marginBottom: 4,
                }}
                title={member.User?.name || "Unbekannt"}
                titleStyle={{ color: theme.colors.onSurface }}
              />
            ))
          )}
        </View>

        {/* Haushalt löschen */}
        {households.length > 1 && (
          <Button
            icon="delete"
            mode="outlined"
            onPress={handleDelete}
            style={{
              marginHorizontal: 16,
              marginTop: 8,
              borderColor: `${theme.colors.error}60`,
            }}
            textColor={theme.colors.error}
          >
            Haushaltsbuch löschen
          </Button>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 8, paddingBottom: 12 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 18, fontWeight: "600", color: "#fff" },
  section: { padding: 16 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  label: { fontSize: 14, fontWeight: "500", marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 4,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
});
