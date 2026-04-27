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
  ProgressBar,
  Text,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { budgetAPI, categoryAPI, savingsGoalAPI } from "../src/services/api";
import { useAuthStore } from "../src/store/authStore";

export default function BudgetScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold } = useAuthStore();

  const [budgets, setBudgets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const now = new Date();
  const startDay = currentHousehold?.monthStartDay || 1;
  let periodMonth = now.getMonth() + 1;
  let periodYear = now.getFullYear();
  if (startDay > 1 && now.getDate() >= startDay) {
    if (periodMonth === 12) {
      periodMonth = 1;
      periodYear += 1;
    } else {
      periodMonth += 1;
    }
  }
  const [formCategoryId, setFormCategoryId] = useState<string | null>(null);
  const [formLimit, setFormLimit] = useState("");
  const [formMonth, setFormMonth] = useState<number | null>(periodMonth);
  const [formYear, _setFormYear] = useState(periodYear);
  const [saving, setSaving] = useState(false);
  const [goals, setGoals] = useState<any[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [depositGoalId, setDepositGoalId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("");

  const load = async () => {
    if (!currentHousehold) {
      return;
    }
    try {
      const [budgetRes, catRes] = await Promise.all([
        budgetAPI.getAll({
          householdId: currentHousehold.id,
          month: periodMonth,
          year: periodYear,
        }),
        categoryAPI.getAll(currentHousehold.id),
      ]);
      setBudgets(budgetRes.data.budgets || []);
      setCategories(catRes.data.categories || []);
      const goalRes = await savingsGoalAPI.getAll(currentHousehold.id);
      setGoals(goalRes.data.goals || []);
    } catch {
      Toast.show({
        type: "error",
        text1: "Budgets konnten nicht geladen werden",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [currentHousehold?.id]);

  const handleSave = async () => {
    if (!(currentHousehold && formLimit)) {
      return;
    }
    setSaving(true);
    try {
      await budgetAPI.create({
        householdId: currentHousehold.id,
        categoryId: formCategoryId,
        limitAmount: Number.parseFloat(formLimit),
        month: formMonth,
        year: formYear,
      });
      Toast.show({ type: "success", text1: "Budget gespeichert" });
      setShowForm(false);
      setFormCategoryId(null);
      setFormLimit("");
      load();
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: err.response?.data?.message || "Fehler beim Speichern",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert("Budget löschen", "Dieses Budget wirklich löschen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          try {
            await budgetAPI.delete(id);
            setBudgets((bs) => bs.filter((b) => b.id !== id));
            Toast.show({ type: "success", text1: "Budget gelöscht" });
          } catch {
            Toast.show({ type: "error", text1: "Fehler beim Löschen" });
          }
        },
      },
    ]);
  };

  const handleSaveGoal = async () => {
    if (!(currentHousehold && goalName && goalTarget)) {
      return;
    }
    setSavingGoal(true);
    try {
      await savingsGoalAPI.create({
        householdId: currentHousehold.id,
        name: goalName,
        targetAmount: Number.parseFloat(goalTarget),
        icon: "🎯",
      });
      Toast.show({ type: "success", text1: "Sparziel erstellt" });
      setShowGoalForm(false);
      setGoalName("");
      setGoalTarget("");
      load();
    } catch {
      Toast.show({ type: "error", text1: "Fehler beim Erstellen" });
    } finally {
      setSavingGoal(false);
    }
  };

  const handleDeposit = async (goalId: string) => {
    const amt = Number.parseFloat(depositAmount);
    if (!amt || amt <= 0) {
      return;
    }
    const goal = goals.find((g) => g.id === goalId);
    try {
      await savingsGoalAPI.update(goalId, {
        savedAmount: (Number.parseFloat(goal.savedAmount) || 0) + amt,
      });
      Toast.show({ type: "success", text1: "Eingezahlt!" });
      setDepositGoalId(null);
      setDepositAmount("");
      load();
    } catch {
      Toast.show({ type: "error", text1: "Fehler" });
    }
  };

  const MONTHS = [
    "Jan",
    "Feb",
    "Mär",
    "Apr",
    "Mai",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Okt",
    "Nov",
    "Dez",
  ];

  return (
    <View
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
        <View style={styles.headerRow}>
          <Button
            compact
            icon="arrow-left"
            onPress={() => router.back()}
            textColor="#fff"
          >
            Zurück
          </Button>
          <Text style={styles.headerTitle}>Budgets</Text>
          <Button
            compact
            icon="plus"
            onPress={() => setShowForm(!showForm)}
            textColor="#fff"
          >
            Neu
          </Button>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* New budget form */}
        {showForm && (
          <View
            style={[
              styles.formCard,
              { backgroundColor: theme.colors.cardBackground },
            ]}
          >
            <Text
              style={[styles.sectionLabel, { color: theme.colors.primary }]}
            >
              Neues Budget
            </Text>

            <Text style={[styles.label, { color: theme.colors.onSurface }]}>
              Kategorie (leer = Gesamtbudget)
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              <Chip
                onPress={() => setFormCategoryId(null)}
                selected={!formCategoryId}
                selectedColor={theme.colors.primary}
                style={{ marginRight: 8 }}
              >
                Gesamt
              </Chip>
              {categories.map((cat) => (
                <Chip
                  key={cat.id}
                  onPress={() => setFormCategoryId(cat.id)}
                  selected={formCategoryId === cat.id}
                  selectedColor={theme.colors.primary}
                  style={{ marginRight: 8 }}
                >
                  {cat.icon} {cat.nameDE || cat.name}
                </Chip>
              ))}
            </ScrollView>

            <Text style={[styles.label, { color: theme.colors.onSurface }]}>
              Limit (€)
            </Text>
            <RNTextInput
              keyboardType="decimal-pad"
              onChangeText={setFormLimit}
              placeholder="z.B. 500"
              placeholderTextColor={`${theme.colors.onSurface}60`}
              style={[
                styles.input,
                {
                  color: theme.colors.onSurface,
                  borderColor: `${theme.colors.primary}40`,
                  backgroundColor: theme.colors.background,
                },
              ]}
              value={formLimit}
            />

            <Text style={[styles.label, { color: theme.colors.onSurface }]}>
              Monat
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              <Chip
                onPress={() => setFormMonth(null)}
                selected={!formMonth}
                selectedColor={theme.colors.primary}
                style={{ marginRight: 8 }}
              >
                Ganzes Jahr
              </Chip>
              {MONTHS.map((m, i) => (
                <Chip
                  key={i}
                  onPress={() => setFormMonth(i + 1)}
                  selected={formMonth === i + 1}
                  selectedColor={theme.colors.primary}
                  style={{ marginRight: 8 }}
                >
                  {m}
                </Chip>
              ))}
            </ScrollView>

            <View style={styles.formButtons}>
              <Button
                mode="outlined"
                onPress={() => setShowForm(false)}
                style={{ flex: 1, marginRight: 8 }}
              >
                Abbrechen
              </Button>
              <Button
                buttonColor={theme.colors.primary}
                disabled={saving}
                mode="contained"
                onPress={handleSave}
                style={{ flex: 1 }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size={16} />
                ) : (
                  "Speichern"
                )}
              </Button>
            </View>
          </View>
        )}

        {/* Budget list */}
        {loading ? (
          <ActivityIndicator
            color={theme.colors.primary}
            style={{ marginTop: 40 }}
          />
        ) : budgets.length === 0 ? (
          <View style={styles.empty}>
            <Text
              style={{
                color: theme.colors.onSurface,
                opacity: 0.5,
                fontSize: 16,
              }}
            >
              Keine Budgets vorhanden
            </Text>
          </View>
        ) : (
          budgets.map((budget) => {
            const pct = Math.min((budget.percentage || 0) / 100, 1);
            return (
              <View
                key={budget.id}
                style={[
                  styles.budgetCard,
                  { backgroundColor: theme.colors.cardBackground },
                ]}
              >
                <View style={styles.budgetHeader}>
                  <Text
                    style={{
                      color: theme.colors.onSurface,
                      fontWeight: "600",
                      fontSize: 15,
                    }}
                  >
                    {budget.Category
                      ? `${budget.Category.icon} ${budget.Category.nameDE || budget.Category.name}`
                      : "Gesamtbudget"}
                  </Text>
                  <Button
                    compact
                    icon="delete"
                    onPress={() => handleDelete(budget.id)}
                    textColor={theme.colors.error}
                  >
                    {""}
                  </Button>
                </View>
                <View style={styles.budgetNumbers}>
                  <Text style={{ color: theme.colors.onSurface, opacity: 0.7 }}>
                    {budget.spent?.toFixed(2)} /{" "}
                    {Number.parseFloat(budget.limitAmount).toFixed(2)} €
                  </Text>
                  <Text
                    style={{
                      color: budget.isOver
                        ? theme.colors.error
                        : budget.isWarning
                          ? theme.colors.warning
                          : theme.colors.primary,
                      fontWeight: "600",
                    }}
                  >
                    {Math.round(budget.percentage || 0)}%
                  </Text>
                </View>
                <ProgressBar
                  color={
                    budget.isOver
                      ? theme.colors.error
                      : budget.isWarning
                        ? theme.colors.warning
                        : theme.colors.primary
                  }
                  progress={pct}
                  style={styles.progressBar}
                />
                {budget.month && (
                  <Text
                    style={{
                      color: theme.colors.onSurface,
                      opacity: 0.5,
                      fontSize: 12,
                      marginTop: 4,
                    }}
                  >
                    {MONTHS[budget.month - 1]} {budget.year}
                  </Text>
                )}
              </View>
            );
          })
        )}
        {/* Divider + Sparziele */}
        <View
          style={{
            margin: 16,
            marginTop: 24,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              color: theme.colors.primary,
              fontWeight: "700",
              fontSize: 16,
            }}
          >
            🎯 Sparziele
          </Text>
          <Button
            compact
            icon="plus"
            onPress={() => setShowGoalForm(!showGoalForm)}
            textColor={theme.colors.primary}
          >
            Neu
          </Button>
        </View>

        {showGoalForm && (
          <View
            style={[
              styles.formCard,
              { backgroundColor: theme.colors.cardBackground },
            ]}
          >
            <Text style={[styles.label, { color: theme.colors.onSurface }]}>
              Name
            </Text>
            <RNTextInput
              onChangeText={setGoalName}
              placeholder="z.B. Urlaub"
              placeholderTextColor={`${theme.colors.onSurface}60`}
              style={[
                styles.input,
                {
                  color: theme.colors.onSurface,
                  borderColor: `${theme.colors.primary}40`,
                  backgroundColor: theme.colors.background,
                },
              ]}
              value={goalName}
            />
            <Text style={[styles.label, { color: theme.colors.onSurface }]}>
              Zielbetrag (€)
            </Text>
            <RNTextInput
              keyboardType="decimal-pad"
              onChangeText={setGoalTarget}
              placeholder="z.B. 1000"
              placeholderTextColor={`${theme.colors.onSurface}60`}
              style={[
                styles.input,
                {
                  color: theme.colors.onSurface,
                  borderColor: `${theme.colors.primary}40`,
                  backgroundColor: theme.colors.background,
                },
              ]}
              value={goalTarget}
            />
            <View style={styles.formButtons}>
              <Button
                mode="outlined"
                onPress={() => setShowGoalForm(false)}
                style={{ flex: 1, marginRight: 8 }}
              >
                Abbrechen
              </Button>
              <Button
                buttonColor={theme.colors.primary}
                disabled={savingGoal}
                mode="contained"
                onPress={handleSaveGoal}
                style={{ flex: 1 }}
              >
                {savingGoal ? (
                  <ActivityIndicator color="#fff" size={16} />
                ) : (
                  "Erstellen"
                )}
              </Button>
            </View>
          </View>
        )}

        {goals.length === 0 && !showGoalForm ? (
          <Text
            style={{
              color: theme.colors.onSurface,
              opacity: 0.4,
              textAlign: "center",
              paddingVertical: 16,
            }}
          >
            Noch keine Sparziele
          </Text>
        ) : (
          goals.map((goal) => {
            const pct =
              goal.targetAmount > 0
                ? Math.min(goal.savedAmount / goal.targetAmount, 1)
                : 0;
            return (
              <View
                key={goal.id}
                style={[
                  styles.budgetCard,
                  {
                    backgroundColor: theme.colors.cardBackground,
                    borderWidth: goal.isCompleted ? 2 : 0,
                    borderColor: "#22c55e",
                  },
                ]}
              >
                <View style={styles.budgetHeader}>
                  <Text
                    style={{
                      color: theme.colors.onSurface,
                      fontWeight: "600",
                      fontSize: 15,
                    }}
                  >
                    {goal.icon} {goal.name} {goal.isCompleted ? "✅" : ""}
                  </Text>
                  <Button
                    compact
                    icon="delete"
                    onPress={async () => {
                      await savingsGoalAPI.delete(goal.id);
                      setGoals((gs) => gs.filter((g) => g.id !== goal.id));
                    }}
                    textColor={theme.colors.error}
                  >
                    {""}
                  </Button>
                </View>
                <View style={styles.budgetNumbers}>
                  <Text style={{ color: theme.colors.onSurface, opacity: 0.7 }}>
                    {Number.parseFloat(goal.savedAmount).toFixed(2)} /{" "}
                    {Number.parseFloat(goal.targetAmount).toFixed(2)} €
                  </Text>
                  <Text
                    style={{
                      color: goal.isCompleted
                        ? "#22c55e"
                        : theme.colors.primary,
                      fontWeight: "600",
                    }}
                  >
                    {Math.round(pct * 100)}%
                  </Text>
                </View>
                <ProgressBar
                  color={goal.isCompleted ? "#22c55e" : theme.colors.primary}
                  progress={pct}
                  style={styles.progressBar}
                />
                {!goal.isCompleted &&
                  (depositGoalId === goal.id ? (
                    <View
                      style={{ flexDirection: "row", gap: 8, marginTop: 8 }}
                    >
                      <RNTextInput
                        autoFocus
                        keyboardType="decimal-pad"
                        onChangeText={setDepositAmount}
                        placeholder="Betrag"
                        placeholderTextColor={`${theme.colors.onSurface}60`}
                        style={[
                          styles.input,
                          {
                            flex: 1,
                            color: theme.colors.onSurface,
                            borderColor: `${theme.colors.primary}40`,
                            backgroundColor: theme.colors.background,
                            marginBottom: 0,
                          },
                        ]}
                        value={depositAmount}
                      />
                      <Button
                        buttonColor={theme.colors.primary}
                        compact
                        mode="contained"
                        onPress={() => handleDeposit(goal.id)}
                        style={{ marginTop: 2 }}
                      >
                        OK
                      </Button>
                      <Button
                        compact
                        mode="outlined"
                        onPress={() => {
                          setDepositGoalId(null);
                          setDepositAmount("");
                        }}
                        style={{ marginTop: 2 }}
                      >
                        ✕
                      </Button>
                    </View>
                  ) : (
                    <Button
                      compact
                      mode="text"
                      onPress={() => setDepositGoalId(goal.id)}
                      style={{ marginTop: 4, alignSelf: "flex-start" }}
                      textColor={theme.colors.primary}
                    >
                      + Einzahlen
                    </Button>
                  ))}
              </View>
            );
          })
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
  formCard: { margin: 16, padding: 16, borderRadius: 16, elevation: 2 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  label: { fontSize: 14, fontWeight: "500", marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  formButtons: { flexDirection: "row", marginTop: 8 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  budgetCard: {
    margin: 12,
    marginBottom: 0,
    padding: 16,
    borderRadius: 16,
    elevation: 2,
  },
  budgetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  budgetNumbers: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressBar: { height: 8, borderRadius: 4 },
});
