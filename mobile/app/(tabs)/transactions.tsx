import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Text, Card, useTheme, Chip, FAB, ActivityIndicator, Searchbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useAuthStore } from '../../src/store/authStore';
import { transactionAPI } from '../../src/services/api';

export default function TransactionsScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold } = useAuthStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const now = new Date();

  const load = useCallback(async (reset = false) => {
    if (!currentHousehold) return;
    try {
      const p = reset ? 1 : page;
      const { data } = await transactionAPI.getAll({
        householdId: currentHousehold.id,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        type: typeFilter !== 'all' ? typeFilter : undefined,
        search: search || undefined,
        page: p,
        limit: 30
      });
      if (reset) {
        setTransactions(data.transactions);
        setPage(2);
      } else {
        setTransactions(prev => [...prev, ...data.transactions]);
        setPage(p + 1);
      }
      setHasMore(data.transactions.length === 30);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentHousehold, typeFilter, search, page]);

  useEffect(() => { load(true); }, [currentHousehold, typeFilter]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity onPress={() => router.push({ pathname: '/transaction-detail', params: { id: item.id } })}>
      <Card style={[styles.transactionCard, { backgroundColor: theme.colors.cardBackground }]}>
        <Card.Content style={styles.cardContent}>
          <View style={[styles.iconContainer, { backgroundColor: item.Category?.color + '20' || '#eee' }]}>
            <Text style={styles.categoryIcon}>{item.Category?.icon || '📦'}</Text>
          </View>
          <View style={styles.transactionInfo}>
            <Text style={[styles.transactionDescription, { color: theme.colors.onSurface }]} numberOfLines={1}>
              {item.description || item.merchant || (item.Category?.nameDE || item.Category?.name) || 'Ausgabe'}
            </Text>
            <Text style={{ color: theme.colors.onSurface, opacity: 0.5, fontSize: 12 }}>
              {format(new Date(item.date), 'dd. MMM yyyy', { locale: de })}
              {item.merchant ? ` · ${item.merchant}` : ''}
            </Text>
          </View>
          <Text style={[styles.amount, { color: item.type === 'income' ? theme.colors.incomeColor : theme.colors.expenseColor }]}>
            {item.type === 'income' ? '+' : '-'}{parseFloat(item.amount).toFixed(2)} €
          </Text>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header + Filters (ein Block) */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary, paddingTop: insets.top + 16 }]}>
        <Text style={styles.headerTitle}>Buchungen</Text>
        <Text style={[styles.headerSub, { marginBottom: 12 }]}>{format(now, 'MMMM yyyy', { locale: de })}</Text>
        <Searchbar
          placeholder="Suchen..."
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => load(true)}
          style={[styles.searchInput, { elevation: 0 }]}
          inputStyle={{ color: '#fff', fontSize: 15 }}
          iconColor="rgba(255,255,255,0.7)"
          placeholderTextColor="rgba(255,255,255,0.6)"
        />
        <View style={styles.chips}>
          {['all', 'expense', 'income'].map(f => (
            <Chip
              key={f}
              selected={typeFilter === f}
              onPress={() => setTypeFilter(f)}
              style={[styles.filterChip, { backgroundColor: typeFilter === f ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)' }]}
              textStyle={{ color: '#fff', fontSize: 12 }}
            >
              {f === 'all' ? 'Alle' : f === 'expense' ? '💸 Ausgaben' : '💰 Einnahmen'}
            </Chip>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={() => { if (hasMore) load(); }}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 48 }}>📭</Text>
              <Text style={{ color: theme.colors.onSurface, opacity: 0.5, marginTop: 8 }}>Keine Buchungen gefunden</Text>
            </View>
          }
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => router.push('/(tabs)/add')}
        color="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
    marginBottom: 10,
  },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterChip: {},
  list: { padding: 12 },
  transactionCard: { marginBottom: 8, borderRadius: 12, elevation: 1 },
  cardContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  iconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  categoryIcon: { fontSize: 22 },
  transactionInfo: { flex: 1, marginLeft: 12 },
  transactionDescription: { fontSize: 15, fontWeight: '500' },
  amount: { fontSize: 16, fontWeight: '700' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingTop: 60 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
