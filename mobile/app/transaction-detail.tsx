import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, Button, useTheme, ActivityIndicator, Chip, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { transactionAPI, categoryAPI } from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';
import Toast from 'react-native-toast-message';

export default function TransactionDetailScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentHousehold } = useAuthStore();

  const [transaction, setTransaction] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !currentHousehold) return;
    Promise.all([
      transactionAPI.getAll({ householdId: currentHousehold.id, page: 1, limit: 200 }),
      categoryAPI.getAll(currentHousehold.id),
    ]).then(([txRes, catRes]) => {
      const tx = txRes.data.transactions?.find((t: any) => t.id === id);
      if (tx) {
        setTransaction(tx);
        setAmount(String(tx.amount));
        setDescription(tx.description || '');
        setMerchant(tx.merchant || '');
        setDate(tx.date);
        setCategoryId(tx.categoryId || null);
      }
      setCategories(catRes.data.categories || []);
    }).catch(() => {
      Toast.show({ type: 'error', text1: 'Buchung konnte nicht geladen werden' });
    }).finally(() => setLoading(false));
  }, [id, currentHousehold?.id]);

  const handleSave = async () => {
    if (!id || !amount) return;
    setSaving(true);
    try {
      await transactionAPI.update(id, { amount: parseFloat(amount), description, merchant, date, categoryId });
      Toast.show({ type: 'success', text1: 'Buchung aktualisiert' });
      setEditing(false);
      router.back();
    } catch {
      Toast.show({ type: 'error', text1: 'Fehler beim Speichern' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Buchung löschen', 'Diese Buchung wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive', onPress: async () => {
          try {
            await transactionAPI.delete(id!);
            Toast.show({ type: 'success', text1: 'Buchung gelöscht' });
            router.back();
          } catch {
            Toast.show({ type: 'error', text1: 'Fehler beim Löschen' });
          }
        }
      }
    ]);
  };

  if (loading) return (
    <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  if (!transaction) return (
    <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
      <Text style={{ color: theme.colors.onSurface }}>Buchung nicht gefunden</Text>
      <Button onPress={() => router.back()} style={{ marginTop: 12 }}>Zurück</Button>
    </View>
  );

  const selectedCategory = categories.find(c => c.id === categoryId);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.primary, paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Button icon="arrow-left" textColor="#fff" onPress={() => router.back()} compact>
            Zurück
          </Button>
          <Text style={styles.headerTitle}>Buchung</Text>
          <Button icon={editing ? 'close' : 'pencil'} textColor="#fff" onPress={() => setEditing(!editing)} compact>
            {editing ? 'Abbrechen' : 'Bearbeiten'}
          </Button>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {!editing ? (
          /* View mode */
          <View style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
            <View style={styles.amountRow}>
              <Text style={[styles.categoryIcon]}>{transaction.Category?.icon || '📦'}</Text>
              <Text style={[styles.amount, { color: transaction.type === 'income' ? theme.colors.incomeColor : theme.colors.expenseColor }]}>
                {transaction.type === 'income' ? '+' : '-'}{parseFloat(transaction.amount).toFixed(2)} €
              </Text>
            </View>

            {[
              { label: 'Datum', value: format(new Date(transaction.date), 'dd. MMMM yyyy', { locale: de }) },
              { label: 'Beschreibung', value: transaction.description },
              { label: 'Händler', value: transaction.merchant },
              { label: 'Kategorie', value: transaction.Category ? `${transaction.Category.icon} ${transaction.Category.nameDE || transaction.Category.name}` : null },
              { label: 'Typ', value: transaction.type === 'income' ? '💰 Einnahme' : '💸 Ausgabe' },
            ].filter(row => row.value).map(row => (
              <View key={row.label} style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.colors.onSurface }]}>{row.label}</Text>
                <Text style={[styles.rowValue, { color: theme.colors.onSurface }]}>{row.value}</Text>
              </View>
            ))}

            <Button
              mode="outlined"
              icon="delete"
              textColor={theme.colors.error}
              style={[styles.deleteButton, { borderColor: theme.colors.error }]}
              onPress={handleDelete}
            >
              Buchung löschen
            </Button>
          </View>
        ) : (
          /* Edit mode */
          <View style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
            <TextInput
              label="Betrag (€)"
              value={amount}
              onChangeText={setAmount}
              mode="outlined"
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <TextInput
              label="Beschreibung"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Händler"
              value={merchant}
              onChangeText={setMerchant}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Datum (YYYY-MM-DD)"
              value={date}
              onChangeText={setDate}
              mode="outlined"
              style={styles.input}
            />

            <Text style={[styles.rowLabel, { color: theme.colors.onSurface, marginBottom: 8 }]}>Kategorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {categories.map(cat => (
                <Chip
                  key={cat.id}
                  selected={categoryId === cat.id}
                  onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)}
                  style={{ marginRight: 8 }}
                  selectedColor={theme.colors.primary}
                >
                  {cat.icon} {cat.nameDE || cat.name}
                </Chip>
              ))}
            </ScrollView>

            <Button
              mode="contained"
              onPress={handleSave}
              disabled={saving}
              buttonColor={theme.colors.primary}
              icon="content-save"
            >
              {saving ? <ActivityIndicator size={16} color="#fff" /> : 'Speichern'}
            </Button>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 8, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  card: { borderRadius: 16, padding: 20, elevation: 2 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  categoryIcon: { fontSize: 40 },
  amount: { fontSize: 36, fontWeight: 'bold' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.08)' },
  rowLabel: { opacity: 0.6, fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  deleteButton: { marginTop: 20 },
  input: { marginBottom: 12 },
});
