import { MaterialCommunityIcons } from "@expo/vector-icons";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Card,
  Chip,
  ProgressBar,
  Text,
  useTheme,
} from "react-native-paper";
import { budgetAPI, statsAPI } from "../../src/services/api";
import { cache, isNetworkError } from "../../src/services/offlineStore";
import { useAuthStore } from "../../src/store/authStore";

export default function HomeScreen() {
  const theme = useTheme() as any;
  const { user, currentHousehold, households, setCurrentHousehold } =
    useAuthStore();
  const [overview, setOverview] = useState<any>(null);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = async () => {
    if (!currentHousehold) {
      return;
    }
    const cacheKey = `overview_${currentHousehold.id}`;
    const budgetCacheKey = `budgets_${currentHousehold.id}`;
    try {
      const now = new Date();
      const sd = currentHousehold.monthStartDay || 1;
      let pm = now.getMonth() + 1;
      let py = now.getFullYear();
      if (sd > 1 && now.getDate() >= sd) {
        if (pm === 12) {
          pm = 1;
          py += 1;
        } else {
          pm += 1;
        }
      }
      const [overviewRes, budgetRes] = await Promise.all([
        statsAPI.overview(currentHousehold.id),
        budgetAPI.getAll({
          householdId: currentHousehold.id,
          month: pm,
          year: py,
        }),
      ]);
      setOverview(overviewRes.data);
      setBudgets(budgetRes.data.budgets);
      await cache.set(cacheKey, overviewRes.data);
      await cache.set(budgetCacheKey, budgetRes.data.budgets);
      setOffline(false);
    } catch (err: any) {
      if (isNetworkError(err)) {
        const cachedOverview = await cache.get(cacheKey);
        const cachedBudgets = await cache.get<any[]>(budgetCacheKey);
        if (cachedOverview) {
          setOverview(cachedOverview);
        }
        if (cachedBudgets) {
          setBudgets(cachedBudgets);
        }
        setOffline(true);
      } else {
        console.error(err);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional focus reload
    useCallback(() => {
      load();
    }, [currentHousehold])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <View
        style={[styles.centered, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  const budgetPercent =
    currentHousehold?.monthlyBudget && overview
      ? overview.thisMonth / currentHousehold.monthlyBudget
      : 0;

  return (
    <ScrollView
      refreshControl={
        <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
      }
      style={{ backgroundColor: theme.colors.background }}
    >
      {/* Offline-Banner */}
      {offline && (
        <View
          style={[
            styles.offlineBanner,
            { backgroundColor: `${theme.colors.error}22` },
          ]}
        >
          <MaterialCommunityIcons
            color={theme.colors.error}
            name="wifi-off"
            size={14}
          />
          <Text
            style={{ color: theme.colors.error, fontSize: 12, marginLeft: 6 }}
          >
            Offline — gespeicherte Daten werden angezeigt
          </Text>
        </View>
      )}

      {/* Header */}
      <LinearGradient
        colors={[theme.colors.gradientStart, theme.colors.gradientEnd]}
        style={styles.header}
      >
        <Text style={styles.greeting}>
          Hallo, {user?.name?.split(" ")[0]} 👋
        </Text>
        <Text style={styles.headerDate}>
          {format(new Date(), "EEEE, d. MMMM yyyy", { locale: de })}
        </Text>
        {households.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 12 }}
          >
            {households.map((h) => (
              <Chip
                icon="home"
                key={h.id}
                onPress={() => {
                  setCurrentHousehold(h);
                  setLoading(true);
                }}
                selected={h.id === currentHousehold?.id}
                selectedColor="#fff"
                style={[
                  styles.householdChip,
                  {
                    backgroundColor:
                      h.id === currentHousehold?.id
                        ? "rgba(255,255,255,0.35)"
                        : "rgba(255,255,255,0.15)",
                  },
                ]}
                textStyle={{ color: "#fff" }}
              >
                {h.name}
              </Chip>
            ))}
          </ScrollView>
        ) : currentHousehold ? (
          <Chip
            icon="home"
            style={styles.householdChip}
            textStyle={{ color: "#fff" }}
          >
            {currentHousehold.name}
          </Chip>
        ) : null}
      </LinearGradient>

      <View style={styles.content}>
        {/* Month Summary */}
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.colors.cardBackground },
          ]}
        >
          <Card.Content>
            <Text style={[styles.cardLabel, { color: theme.colors.onSurface }]}>
              Diesen Monat
            </Text>
            <View style={styles.amountRow}>
              <View>
                <Text
                  style={[
                    styles.amountSmall,
                    { color: theme.colors.expenseColor },
                  ]}
                >
                  Ausgaben
                </Text>
                <Text
                  style={[
                    styles.amountLarge,
                    { color: theme.colors.expenseColor },
                  ]}
                >
                  {overview?.thisMonth?.toFixed(2)}{" "}
                  {currentHousehold?.currency || "EUR"}
                </Text>
              </View>
              <View style={styles.changeContainer}>
                <MaterialCommunityIcons
                  color={
                    overview?.changePercent >= 0
                      ? theme.colors.expenseColor
                      : theme.colors.incomeColor
                  }
                  name={
                    overview?.changePercent >= 0
                      ? "trending-up"
                      : "trending-down"
                  }
                  size={24}
                />
                <Text
                  style={{
                    color:
                      overview?.changePercent >= 0
                        ? theme.colors.expenseColor
                        : theme.colors.incomeColor,
                  }}
                >
                  {overview?.changePercent > 0 ? "+" : ""}
                  {overview?.changePercent?.toFixed(1)}%
                </Text>
              </View>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 8,
              }}
            >
              <View>
                <Text
                  style={{
                    color: theme.colors.onSurface,
                    opacity: 0.6,
                    fontSize: 11,
                  }}
                >
                  Einnahmen
                </Text>
                <Text
                  style={{
                    color: theme.colors.incomeColor,
                    fontWeight: "600",
                    fontSize: 15,
                  }}
                >
                  +{(overview?.thisMonthIncome || 0).toFixed(2)}{" "}
                  {currentHousehold?.currency || "EUR"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={{
                    color: theme.colors.onSurface,
                    opacity: 0.6,
                    fontSize: 11,
                  }}
                >
                  Bilanz
                </Text>
                <Text
                  style={{
                    color:
                      (overview?.balance || 0) >= 0
                        ? theme.colors.incomeColor
                        : theme.colors.expenseColor,
                    fontWeight: "600",
                    fontSize: 15,
                  }}
                >
                  {(overview?.balance || 0) >= 0 ? "+" : ""}
                  {(overview?.balance || 0).toFixed(2)}{" "}
                  {currentHousehold?.currency || "EUR"}
                </Text>
              </View>
            </View>
            {overview?.savingsRate !== undefined && (
              <Text
                style={{
                  color:
                    (overview.savingsRate || 0) >= 0
                      ? theme.colors.incomeColor
                      : theme.colors.expenseColor,
                  fontSize: 11,
                  marginTop: 4,
                }}
              >
                Sparquote: {(overview.savingsRate || 0).toFixed(1)}%
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Budget Progress */}
        {currentHousehold?.monthlyBudget && (
          <Card
            style={[
              styles.card,
              { backgroundColor: theme.colors.cardBackground },
            ]}
          >
            <Card.Content>
              <Text
                style={[styles.cardLabel, { color: theme.colors.onSurface }]}
              >
                Monatsbudget
              </Text>
              <View style={styles.budgetRow}>
                <Text style={{ color: theme.colors.onSurface }}>
                  {overview?.thisMonth?.toFixed(2)} /{" "}
                  {Number.parseFloat(
                    String(currentHousehold.monthlyBudget)
                  ).toFixed(2)}{" "}
                  €
                </Text>
                <Text
                  style={{
                    color:
                      budgetPercent >= 1
                        ? theme.colors.error
                        : theme.colors.primary,
                    fontWeight: "bold",
                  }}
                >
                  {Math.round(budgetPercent * 100)}%
                </Text>
              </View>
              <ProgressBar
                color={
                  budgetPercent >= 1
                    ? theme.colors.error
                    : budgetPercent >= 0.8
                      ? theme.colors.warning
                      : theme.colors.primary
                }
                progress={Math.min(budgetPercent, 1)}
                style={styles.progressBar}
              />
              {budgetPercent >= 0.8 && (
                <Text
                  style={{
                    color:
                      budgetPercent >= 1
                        ? theme.colors.error
                        : theme.colors.warning,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {budgetPercent >= 1
                    ? "⚠️ Budget überschritten!"
                    : "⚠️ Budget fast aufgebraucht!"}
                </Text>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Monatsprognose */}
        {overview?.projectedExpenses > 0 && (
          <Card
            style={[
              styles.card,
              { backgroundColor: theme.colors.cardBackground },
            ]}
          >
            <Card.Content>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={[
                    styles.cardLabel,
                    { color: theme.colors.onSurface, marginBottom: 0 },
                  ]}
                >
                  Monats-Prognose
                </Text>
                <MaterialCommunityIcons
                  color={`${theme.colors.onSurface}60`}
                  name="chart-bar"
                  size={18}
                />
              </View>
              <View style={{ gap: 6 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.onSurface,
                      opacity: 0.6,
                      fontSize: 13,
                    }}
                  >
                    Hochgerechnete Ausgaben
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.expenseColor,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    {overview.projectedExpenses.toFixed(2)}{" "}
                    {currentHousehold?.currency || "EUR"}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.onSurface,
                      opacity: 0.6,
                      fontSize: 13,
                    }}
                  >
                    Verbleibend (prognostiziert)
                  </Text>
                  <Text
                    style={{
                      color:
                        (overview.projectedRemaining || 0) >= 0
                          ? theme.colors.incomeColor
                          : theme.colors.expenseColor,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    {(overview.projectedRemaining || 0).toFixed(2)}{" "}
                    {currentHousehold?.currency || "EUR"}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.onSurface,
                      opacity: 0.6,
                      fontSize: 13,
                    }}
                  >
                    Tag
                  </Text>
                  <Text style={{ color: theme.colors.onSurface, fontSize: 13 }}>
                    {overview.currentDay} / {overview.daysInMonth}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Top Category */}
        {overview?.topCategory && (
          <Card
            style={[
              styles.card,
              { backgroundColor: theme.colors.cardBackground },
            ]}
          >
            <Card.Content>
              <Text
                style={[styles.cardLabel, { color: theme.colors.onSurface }]}
              >
                Top Kategorie
              </Text>
              <View style={styles.topCategoryRow}>
                <Text style={styles.topCategoryIcon}>
                  {overview.topCategory.icon}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: theme.colors.onSurface, fontWeight: "600" }}
                  >
                    {overview.topCategory.nameDE || overview.topCategory.name}
                  </Text>
                  <Text style={{ color: theme.colors.onSurface, opacity: 0.6 }}>
                    {overview.topCategory.total?.toFixed(2)}{" "}
                    {currentHousehold?.currency || "EUR"}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Category Budgets */}
        {budgets.filter((b) => b.categoryId).length > 0 && (
          <Card
            style={[
              styles.card,
              { backgroundColor: theme.colors.cardBackground },
            ]}
          >
            <Card.Content>
              <Text
                style={[styles.cardLabel, { color: theme.colors.onSurface }]}
              >
                Kategoriebudgets
              </Text>
              {budgets
                .filter((b) => b.categoryId)
                .map((budget) => (
                  <View key={budget.id} style={styles.budgetItem}>
                    <View style={styles.budgetItemHeader}>
                      <Text style={{ color: theme.colors.onSurface }}>
                        {budget.Category?.icon}{" "}
                        {budget.Category?.nameDE || budget.Category?.name}
                      </Text>
                      <Text
                        style={{
                          color: budget.isOver
                            ? theme.colors.error
                            : theme.colors.onSurface,
                          fontSize: 12,
                        }}
                      >
                        {budget.spent?.toFixed(2)} / {budget.limitAmount} €
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
                      progress={Math.min(budget.percentage / 100, 1)}
                      style={{ height: 4, borderRadius: 2, marginTop: 4 }}
                    />
                  </View>
                ))}
            </Card.Content>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  header: { padding: 24, paddingTop: 56, paddingBottom: 32 },
  greeting: { fontSize: 26, fontWeight: "bold", color: "#fff" },
  headerDate: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  householdChip: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  content: { padding: 16, marginTop: -16 },
  card: { marginBottom: 12, elevation: 2, borderRadius: 16 },
  cardLabel: {
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.6,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  amountSmall: { fontSize: 12 },
  amountLarge: { fontSize: 32, fontWeight: "bold" },
  changeContainer: { alignItems: "center" },
  budgetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressBar: { height: 8, borderRadius: 4 },
  topCategoryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  topCategoryIcon: { fontSize: 32 },
  budgetItem: { marginBottom: 12 },
  budgetItemHeader: { flexDirection: "row", justifyContent: "space-between" },
});
