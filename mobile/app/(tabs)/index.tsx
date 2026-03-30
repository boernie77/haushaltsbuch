import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Text, Card, useTheme, ProgressBar, Chip, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useAuthStore } from '../../src/store/authStore';
import { statsAPI, budgetAPI } from '../../src/services/api';

export default function HomeScreen() {
  const theme = useTheme() as any;
  const { user, currentHousehold, households, setCurrentHousehold } = useAuthStore();
  const [overview, setOverview] = useState<any>(null);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!currentHousehold) return;
    try {
      const now = new Date();
      const [overviewRes, budgetRes] = await Promise.all([
        statsAPI.overview(currentHousehold.id),
        budgetAPI.getAll({ householdId: currentHousehold.id, month: now.getMonth() + 1, year: now.getFullYear() })
      ]);
      setOverview(overviewRes.data);
      setBudgets(budgetRes.data.budgets);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [currentHousehold]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return (
    <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  const budgetPercent = currentHousehold?.monthlyBudget && overview
    ? overview.thisMonth / currentHousehold.monthlyBudget : 0;

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <LinearGradient colors={[theme.colors.gradientStart, theme.colors.gradientEnd]} style={styles.header}>
        <Text style={styles.greeting}>Hallo, {user?.name?.split(' ')[0]} 👋</Text>
        <Text style={styles.headerDate}>{format(new Date(), 'EEEE, d. MMMM yyyy', { locale: de })}</Text>
        {households.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {households.map(h => (
              <Chip
                key={h.id}
                selected={h.id === currentHousehold?.id}
                onPress={() => { setCurrentHousehold(h); setLoading(true); }}
                icon="home"
                style={[styles.householdChip, { backgroundColor: h.id === currentHousehold?.id ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)' }]}
                textStyle={{ color: '#fff' }}
                selectedColor="#fff"
              >
                {h.name}
              </Chip>
            ))}
          </ScrollView>
        ) : currentHousehold ? (
          <Chip icon="home" style={styles.householdChip} textStyle={{ color: '#fff' }}>
            {currentHousehold.name}
          </Chip>
        ) : null}
      </LinearGradient>

      <View style={styles.content}>
        {/* Month Summary */}
        <Card style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
          <Card.Content>
            <Text style={[styles.cardLabel, { color: theme.colors.onSurface }]}>Diesen Monat</Text>
            <View style={styles.amountRow}>
              <View>
                <Text style={[styles.amountSmall, { color: theme.colors.expenseColor }]}>Ausgaben</Text>
                <Text style={[styles.amountLarge, { color: theme.colors.expenseColor }]}>
                  {overview?.thisMonth?.toFixed(2)} {currentHousehold?.currency || 'EUR'}
                </Text>
              </View>
              <View style={styles.changeContainer}>
                <MaterialCommunityIcons
                  name={overview?.changePercent >= 0 ? 'trending-up' : 'trending-down'}
                  color={overview?.changePercent >= 0 ? theme.colors.expenseColor : theme.colors.incomeColor}
                  size={24}
                />
                <Text style={{ color: overview?.changePercent >= 0 ? theme.colors.expenseColor : theme.colors.incomeColor }}>
                  {overview?.changePercent > 0 ? '+' : ''}{overview?.changePercent?.toFixed(1)}%
                </Text>
              </View>
            </View>
            <Text style={{ color: theme.colors.onSurface, opacity: 0.6, fontSize: 12 }}>
              Vormonat: {overview?.lastMonth?.toFixed(2)} {currentHousehold?.currency || 'EUR'}
            </Text>
          </Card.Content>
        </Card>

        {/* Budget Progress */}
        {currentHousehold?.monthlyBudget && (
          <Card style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
            <Card.Content>
              <Text style={[styles.cardLabel, { color: theme.colors.onSurface }]}>Monatsbudget</Text>
              <View style={styles.budgetRow}>
                <Text style={{ color: theme.colors.onSurface }}>
                  {overview?.thisMonth?.toFixed(2)} / {parseFloat(String(currentHousehold.monthlyBudget)).toFixed(2)} €
                </Text>
                <Text style={{ color: budgetPercent >= 1 ? theme.colors.error : theme.colors.primary, fontWeight: 'bold' }}>
                  {Math.round(budgetPercent * 100)}%
                </Text>
              </View>
              <ProgressBar
                progress={Math.min(budgetPercent, 1)}
                color={budgetPercent >= 1 ? theme.colors.error : budgetPercent >= 0.8 ? theme.colors.warning : theme.colors.primary}
                style={styles.progressBar}
              />
              {budgetPercent >= 0.8 && (
                <Text style={{ color: budgetPercent >= 1 ? theme.colors.error : theme.colors.warning, fontSize: 12, marginTop: 4 }}>
                  {budgetPercent >= 1 ? '⚠️ Budget überschritten!' : '⚠️ Budget fast aufgebraucht!'}
                </Text>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Top Category */}
        {overview?.topCategory && (
          <Card style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
            <Card.Content>
              <Text style={[styles.cardLabel, { color: theme.colors.onSurface }]}>Top Kategorie</Text>
              <View style={styles.topCategoryRow}>
                <Text style={styles.topCategoryIcon}>{overview.topCategory.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                    {overview.topCategory.nameDE || overview.topCategory.name}
                  </Text>
                  <Text style={{ color: theme.colors.onSurface, opacity: 0.6 }}>
                    {overview.topCategory.total?.toFixed(2)} {currentHousehold?.currency || 'EUR'}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Category Budgets */}
        {budgets.filter(b => b.categoryId).length > 0 && (
          <Card style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
            <Card.Content>
              <Text style={[styles.cardLabel, { color: theme.colors.onSurface }]}>Kategoriebudgets</Text>
              {budgets.filter(b => b.categoryId).map(budget => (
                <View key={budget.id} style={styles.budgetItem}>
                  <View style={styles.budgetItemHeader}>
                    <Text style={{ color: theme.colors.onSurface }}>
                      {budget.Category?.icon} {budget.Category?.nameDE || budget.Category?.name}
                    </Text>
                    <Text style={{ color: budget.isOver ? theme.colors.error : theme.colors.onSurface, fontSize: 12 }}>
                      {budget.spent?.toFixed(2)} / {budget.limitAmount} €
                    </Text>
                  </View>
                  <ProgressBar
                    progress={Math.min(budget.percentage / 100, 1)}
                    color={budget.isOver ? theme.colors.error : budget.isWarning ? theme.colors.warning : theme.colors.primary}
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 24, paddingTop: 56, paddingBottom: 32 },
  greeting: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  headerDate: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  householdChip: { marginTop: 12, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)' },
  content: { padding: 16, marginTop: -16 },
  card: { marginBottom: 12, elevation: 2, borderRadius: 16 },
  cardLabel: { fontSize: 13, fontWeight: '600', opacity: 0.6, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  amountSmall: { fontSize: 12 },
  amountLarge: { fontSize: 32, fontWeight: 'bold' },
  changeContainer: { alignItems: 'center' },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressBar: { height: 8, borderRadius: 4 },
  topCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topCategoryIcon: { fontSize: 32 },
  budgetItem: { marginBottom: 12 },
  budgetItemHeader: { flexDirection: 'row', justifyContent: 'space-between' },
});
