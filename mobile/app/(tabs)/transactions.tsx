import { MaterialCommunityIcons } from "@expo/vector-icons";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Card,
  Chip,
  FAB,
  Searchbar,
  Text,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { recurringAPI, transactionAPI } from "../../src/services/api";
import {
  cache,
  isNetworkError,
  offlineQueue,
} from "../../src/services/offlineStore";
import { useAuthStore } from "../../src/store/authStore";

export default function TransactionsScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold } = useAuthStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [offline, setOffline] = useState(false);
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

  const load = useCallback(
    async (reset = false) => {
      if (!currentHousehold) {
        return;
      }
      const cacheKey = `transactions_${currentHousehold.id}`;
      try {
        if (typeFilter === "recurring") {
          const { data } = await recurringAPI.getAll(currentHousehold.id);
          setRecurring(data.recurring || []);
          setOffline(false);
        } else {
          const p = reset ? 1 : page;
          const { data } = await transactionAPI.getAll({
            householdId: currentHousehold.id,
            month: selectedMonth,
            year: selectedYear,
            type: typeFilter === "all" ? undefined : typeFilter,
            search: search || undefined,
            page: p,
            limit: 30,
          });
          const fetched = data.transactions;
          if (reset) {
            setTransactions(fetched);
            setPage(2);
            if (!search && typeFilter === "all") {
              await cache.set(cacheKey, fetched);
            }
          } else {
            setTransactions((prev) => [...prev, ...fetched]);
            setPage(p + 1);
          }
          setHasMore(fetched.length === 30);
          setOffline(false);
        }
      } catch (err: any) {
        if (isNetworkError(err) && reset) {
          const pending = (await offlineQueue.getAll()).map((t) => ({
            ...t,
            id: t._offlineId,
            Category: null,
            _offline: true,
          }));
          const cached = (await cache.get<any[]>(cacheKey)) || [];
          setTransactions([...pending.reverse(), ...cached]);
          setOffline(true);
        } else {
          console.error(err);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentHousehold, typeFilter, search, page, selectedMonth, selectedYear]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: load is a closure over these deps
  useEffect(() => {
    setLoading(true);
    load(true);
  }, [currentHousehold, typeFilter, selectedMonth, selectedYear]);
  useFocusEffect(
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional focus reload
    useCallback(() => {
      setLoading(true);
      load(true);
    }, [currentHousehold])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      activeOpacity={item._offline ? 1 : 0.7}
      onPress={() =>
        !item._offline &&
        router.push({
          pathname: "/transaction-detail",
          params: { id: item.id },
        })
      }
    >
      <Card
        style={[
          styles.transactionCard,
          {
            backgroundColor: item._offline
              ? `${theme.colors.cardBackground}aa`
              : theme.colors.cardBackground,
          },
        ]}
      >
        <Card.Content style={styles.cardContent}>
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: item.Category?.color
                  ? `${item.Category.color}20`
                  : "#eee",
              },
            ]}
          >
            {item._offline ? (
              <MaterialCommunityIcons
                color={`${theme.colors.onSurface}60`}
                name="clock-outline"
                size={22}
              />
            ) : (
              <Text style={styles.categoryIcon}>
                {item.Category?.icon || "📦"}
              </Text>
            )}
          </View>
          <View style={styles.transactionInfo}>
            <Text
              numberOfLines={1}
              style={[
                styles.transactionDescription,
                {
                  color: item._offline
                    ? `${theme.colors.onSurface}80`
                    : theme.colors.onSurface,
                },
              ]}
            >
              {item.description || item.merchant || "Ausgabe"}
              {item._offline ? "  (ausstehend)" : ""}
            </Text>
            <Text
              style={{
                color: theme.colors.onSurface,
                opacity: 0.5,
                fontSize: 12,
              }}
            >
              {format(new Date(item.date), "dd. MMM yyyy", { locale: de })}
              {item.merchant ? ` · ${item.merchant}` : ""}
            </Text>
          </View>
          <Text
            style={[
              styles.amount,
              {
                color:
                  item.type === "income"
                    ? theme.colors.incomeColor
                    : theme.colors.expenseColor,
                opacity: item._offline ? 0.6 : 1,
              },
            ]}
          >
            {item.type === "income" ? "+" : "-"}
            {Number.parseFloat(item.amount).toFixed(2)} €
          </Text>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header + Filters (ein Block) */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.primary,
            paddingTop: insets.top + 16,
          },
        ]}
      >
        <Text style={styles.headerTitle}>Buchungen</Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <TouchableOpacity onPress={prevPeriod} style={{ padding: 4 }}>
            <MaterialCommunityIcons
              color="#fff"
              name="chevron-left"
              size={24}
            />
          </TouchableOpacity>
          <Text
            style={[
              styles.headerSub,
              {
                marginBottom: 0,
                marginHorizontal: 8,
                minWidth: 160,
                textAlign: "center",
              },
            ]}
          >
            {getPeriodLabel(selectedMonth, selectedYear)}
          </Text>
          <TouchableOpacity onPress={nextPeriod} style={{ padding: 4 }}>
            <MaterialCommunityIcons
              color="#fff"
              name="chevron-right"
              size={24}
            />
          </TouchableOpacity>
        </View>
        <Searchbar
          iconColor="rgba(255,255,255,0.7)"
          inputStyle={{ color: "#fff", fontSize: 15, paddingLeft: 8 }}
          onChangeText={setSearch}
          onSubmitEditing={() => load(true)}
          placeholder="Suchen..."
          placeholderTextColor="rgba(255,255,255,0.6)"
          style={[styles.searchInput, { elevation: 0 }]}
          value={search}
        />
        <View style={styles.chips}>
          {["all", "expense", "income", "recurring"].map((f) => (
            <Chip
              key={f}
              onPress={() => setTypeFilter(f)}
              selected={typeFilter === f}
              style={[
                styles.filterChip,
                {
                  backgroundColor:
                    typeFilter === f
                      ? "rgba(255,255,255,0.3)"
                      : "rgba(255,255,255,0.1)",
                },
              ]}
              textStyle={{ color: "#fff", fontSize: 12 }}
            >
              {f === "all"
                ? "Alle"
                : f === "expense"
                  ? "💸 Ausgaben"
                  : f === "income"
                    ? "💰 Einnahmen"
                    : "🔄 Wiederkehrend"}
            </Chip>
          ))}
        </View>
      </View>

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
            Offline — gespeicherte Daten · ausstehende Buchungen werden
            synchronisiert wenn du wieder online bist
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : typeFilter === "recurring" ? (
        <FlatList
          contentContainerStyle={styles.list}
          data={recurring}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 48 }}>🔄</Text>
              <Text
                style={{
                  color: theme.colors.onSurface,
                  opacity: 0.5,
                  marginTop: 8,
                }}
              >
                Keine wiederkehrenden Buchungen
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
          }
          renderItem={({ item }) => (
            <Card
              style={[
                styles.transactionCard,
                { backgroundColor: theme.colors.cardBackground },
              ]}
            >
              <Card.Content style={styles.cardContent}>
                <View
                  style={[
                    styles.iconContainer,
                    {
                      backgroundColor: item.Category?.color
                        ? `${item.Category.color}20`
                        : "#eee",
                    },
                  ]}
                >
                  <Text style={styles.categoryIcon}>
                    {item.Category?.icon || "🔄"}
                  </Text>
                </View>
                <View style={styles.transactionInfo}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.transactionDescription,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    {item.description || item.merchant || "Wiederkehrend"}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.onSurface,
                      opacity: 0.5,
                      fontSize: 12,
                    }}
                  >
                    {item.recurringInterval === "weekly"
                      ? "Wöchentlich"
                      : item.recurringInterval === "monthly"
                        ? "Monatlich"
                        : "Jährlich"}
                    {item.recurringNextDate
                      ? ` · Nächste: ${format(new Date(item.recurringNextDate), "dd.MM.yyyy")}`
                      : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text
                    style={[
                      styles.amount,
                      {
                        color:
                          item.type === "income"
                            ? theme.colors.incomeColor
                            : theme.colors.expenseColor,
                      },
                    ]}
                  >
                    {item.type === "income" ? "+" : "-"}
                    {Number.parseFloat(item.amount).toFixed(2)} €
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        "Beenden",
                        "Wiederkehrende Buchung beenden?",
                        [
                          { text: "Abbrechen", style: "cancel" },
                          {
                            text: "Beenden",
                            style: "destructive",
                            onPress: async () => {
                              await recurringAPI.stop(item.id);
                              setRecurring((prev) =>
                                prev.filter((r) => r.id !== item.id)
                              );
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <MaterialCommunityIcons
                      color={theme.colors.error}
                      name="close-circle-outline"
                      size={20}
                    />
                  </TouchableOpacity>
                </View>
              </Card.Content>
            </Card>
          )}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={transactions}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 48 }}>📭</Text>
              <Text
                style={{
                  color: theme.colors.onSurface,
                  opacity: 0.5,
                  marginTop: 8,
                }}
              >
                Keine Buchungen gefunden
              </Text>
            </View>
          }
          onEndReached={() => {
            if (hasMore) {
              load();
            }
          }}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
          }
          renderItem={renderItem}
        />
      )}

      <FAB
        color="#fff"
        icon="plus"
        onPress={() => router.push("/(tabs)/add")}
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "#fff" },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 14 },
  searchInput: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#fff",
    marginBottom: 10,
  },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: {},
  list: { padding: 12 },
  transactionCard: { marginBottom: 8, borderRadius: 12, elevation: 1 },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  categoryIcon: { fontSize: 22 },
  transactionInfo: { flex: 1, marginLeft: 12 },
  transactionDescription: { fontSize: 15, fontWeight: "500" },
  amount: { fontSize: 16, fontWeight: "700" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    paddingHorizontal: 16,
  },
  empty: { alignItems: "center", paddingTop: 60 },
  fab: { position: "absolute", right: 16, bottom: 16 },
});
