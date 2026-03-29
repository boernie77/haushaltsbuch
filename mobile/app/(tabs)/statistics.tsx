import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Text, Card, useTheme, SegmentedButtons, ActivityIndicator } from 'react-native-paper';
import { BarChart, PieChart, LineChart } from 'react-native-chart-kit';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useAuthStore } from '../../src/store/authStore';
import { statsAPI } from '../../src/services/api';

const WIDTH = Dimensions.get('window').width - 32;
const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export default function StatisticsScreen() {
  const theme = useTheme() as any;
  const { currentHousehold } = useAuthStore();
  const [view, setView] = useState('monthly');
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [yearlyData, setYearlyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const now = new Date();

  useEffect(() => {
    if (!currentHousehold) return;
    setLoading(true);
    Promise.all([
      statsAPI.monthly({ householdId: currentHousehold.id, year: now.getFullYear(), month: now.getMonth() + 1 }),
      statsAPI.yearly({ householdId: currentHousehold.id, year: now.getFullYear() })
    ]).then(([m, y]) => {
      setMonthlyData(m.data);
      setYearlyData(y.data);
    }).finally(() => setLoading(false));
  }, [currentHousehold]);

  const chartConfig = {
    backgroundColor: theme.colors.cardBackground,
    backgroundGradientFrom: theme.colors.cardBackground,
    backgroundGradientTo: theme.colors.cardBackground,
    decimalPlaces: 0,
    color: (opacity = 1) => theme.colors.primary + Math.round(opacity * 255).toString(16).padStart(2, '0'),
    labelColor: () => theme.colors.onSurface,
    style: { borderRadius: 16 },
  };

  if (loading) return (
    <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  const pieData = monthlyData?.byCategory?.slice(0, 6).map((c: any, i: number) => ({
    name: c.category?.nameDE || c.category?.name || 'Sonstiges',
    amount: c.total,
    color: theme.colors.chartColors[i % theme.colors.chartColors.length],
    legendFontColor: theme.colors.onSurface,
    legendFontSize: 12,
  })) || [];

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <Text style={styles.headerTitle}>Statistiken</Text>
        <Text style={styles.headerSub}>{format(now, 'MMMM yyyy', { locale: de })}</Text>
      </View>

      <View style={styles.content}>
        <SegmentedButtons
          value={view}
          onValueChange={setView}
          buttons={[
            { value: 'monthly', label: 'Monat' },
            { value: 'yearly', label: 'Jahr' },
          ]}
          style={styles.segmented}
        />

        {view === 'monthly' && monthlyData && (
          <>
            {/* Summary Cards */}
            <View style={styles.summaryRow}>
              <Card style={[styles.summaryCard, { backgroundColor: theme.colors.expenseColor + '20' }]}>
                <Card.Content>
                  <Text style={{ fontSize: 11, color: theme.colors.expenseColor }}>AUSGABEN</Text>
                  <Text style={{ fontSize: 22, fontWeight: 'bold', color: theme.colors.expenseColor }}>
                    {monthlyData.totalExpenses.toFixed(2)} €
                  </Text>
                </Card.Content>
              </Card>
              <Card style={[styles.summaryCard, { backgroundColor: theme.colors.incomeColor + '20' }]}>
                <Card.Content>
                  <Text style={{ fontSize: 11, color: theme.colors.incomeColor }}>EINNAHMEN</Text>
                  <Text style={{ fontSize: 22, fontWeight: 'bold', color: theme.colors.incomeColor }}>
                    {monthlyData.totalIncome.toFixed(2)} €
                  </Text>
                </Card.Content>
              </Card>
            </View>

            {/* Pie Chart */}
            {pieData.length > 0 && (
              <Card style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
                <Card.Content>
                  <Text style={[styles.cardLabel, { color: theme.colors.onSurface }]}>Ausgaben nach Kategorie</Text>
                  <PieChart
                    data={pieData}
                    width={WIDTH}
                    height={200}
                    chartConfig={chartConfig}
                    accessor="amount"
                    backgroundColor="transparent"
                    paddingLeft="15"
                    absolute={false}
                  />
                </Card.Content>
              </Card>
            )}

            {/* Daily Spending */}
            {monthlyData.dailySpending?.length > 0 && (
              <Card style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
                <Card.Content>
                  <Text style={[styles.cardLabel, { color: theme.colors.onSurface }]}>Tägliche Ausgaben</Text>
                  <LineChart
                    data={{
                      labels: monthlyData.dailySpending.slice(-7).map((d: any) =>
                        format(new Date(d.day), 'dd.')),
                      datasets: [{ data: monthlyData.dailySpending.slice(-7).map((d: any) => d.total) }]
                    }}
                    width={WIDTH}
                    height={180}
                    chartConfig={chartConfig}
                    bezier
                    style={{ borderRadius: 12 }}
                  />
                </Card.Content>
              </Card>
            )}
          </>
        )}

        {view === 'yearly' && yearlyData && (
          <>
            {/* Year Summary */}
            <View style={styles.summaryRow}>
              <Card style={[styles.summaryCard, { backgroundColor: theme.colors.expenseColor + '20' }]}>
                <Card.Content>
                  <Text style={{ fontSize: 11, color: theme.colors.expenseColor }}>JAHRESAUSGABEN</Text>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.colors.expenseColor }}>
                    {yearlyData.totalExpenses.toFixed(0)} €
                  </Text>
                </Card.Content>
              </Card>
              <Card style={[styles.summaryCard, { backgroundColor: theme.colors.incomeColor + '20' }]}>
                <Card.Content>
                  <Text style={{ fontSize: 11, color: theme.colors.incomeColor }}>JAHRESEINNAHMEN</Text>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.colors.incomeColor }}>
                    {yearlyData.totalIncome.toFixed(0)} €
                  </Text>
                </Card.Content>
              </Card>
            </View>

            {/* Monthly Bar Chart */}
            <Card style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
              <Card.Content>
                <Text style={[styles.cardLabel, { color: theme.colors.onSurface }]}>Monatliche Ausgaben {yearlyData.year}</Text>
                <BarChart
                  data={{
                    labels: MONTH_NAMES,
                    datasets: [{ data: yearlyData.monthly.map((m: any) => m.expenses) }]
                  }}
                  width={WIDTH}
                  height={220}
                  chartConfig={chartConfig}
                  style={{ borderRadius: 12 }}
                  yAxisLabel=""
                  yAxisSuffix="€"
                  showValuesOnTopOfBars={false}
                />
              </Card.Content>
            </Card>

            {/* Category breakdown */}
            <Card style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
              <Card.Content>
                <Text style={[styles.cardLabel, { color: theme.colors.onSurface }]}>Top Kategorien</Text>
                {yearlyData.byCategory.slice(0, 8).map((c: any, i: number) => (
                  <View key={i} style={styles.categoryRow}>
                    <Text style={{ fontSize: 20 }}>{c.category?.icon}</Text>
                    <Text style={{ flex: 1, color: theme.colors.onSurface, marginLeft: 8 }}>
                      {c.category?.nameDE || c.category?.name}
                    </Text>
                    <Text style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                      {c.total.toFixed(2)} €
                    </Text>
                  </View>
                ))}
              </Card.Content>
            </Card>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 24, paddingTop: 52 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2 },
  content: { padding: 16 },
  segmented: { marginBottom: 16 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryCard: { flex: 1, borderRadius: 12 },
  card: { marginBottom: 12, elevation: 2, borderRadius: 16 },
  cardLabel: { fontSize: 13, fontWeight: '600', opacity: 0.6, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.1)' },
});
