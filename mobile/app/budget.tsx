import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, TextInput as RNTextInput } from 'react-native';
import { Text, Button, useTheme, ActivityIndicator, Divider, Chip, ProgressBar } from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/store/authStore';
import { budgetAPI, categoryAPI } from '../src/services/api';
import Toast from 'react-native-toast-message';

export default function BudgetScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold } = useAuthStore();

  const [budgets, setBudgets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const now = new Date();
  const [formCategoryId, setFormCategoryId] = useState<string | null>(null);
  const [formLimit, setFormLimit] = useState('');
  const [formMonth, setFormMonth] = useState<number | null>(now.getMonth() + 1);
  const [formYear, setFormYear] = useState(now.getFullYear());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!currentHousehold) return;
    try {
      const [budgetRes, catRes] = await Promise.all([
        budgetAPI.getAll({ householdId: currentHousehold.id, month: now.getMonth() + 1, year: now.getFullYear() }),
        categoryAPI.getAll(currentHousehold.id),
      ]);
      setBudgets(budgetRes.data.budgets || []);
      setCategories(catRes.data.categories || []);
    } catch {
      Toast.show({ type: 'error', text1: 'Budgets konnten nicht geladen werden' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentHousehold?.id]);

  const handleSave = async () => {
    if (!currentHousehold || !formLimit) return;
    setSaving(true);
    try {
      await budgetAPI.create({
        householdId: currentHousehold.id,
        categoryId: formCategoryId,
        limitAmount: parseFloat(formLimit),
        month: formMonth,
        year: formYear,
      });
      Toast.show({ type: 'success', text1: 'Budget gespeichert' });
      setShowForm(false);
      setFormCategoryId(null);
      setFormLimit('');
      load();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Fehler beim Speichern' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Budget löschen', 'Dieses Budget wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive', onPress: async () => {
          try {
            await budgetAPI.delete(id);
            setBudgets(bs => bs.filter(b => b.id !== id));
            Toast.show({ type: 'success', text1: 'Budget gelöscht' });
          } catch {
            Toast.show({ type: 'error', text1: 'Fehler beim Löschen' });
          }
        }
      }
    ]);
  };

  const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.primary, paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Button icon="arrow-left" textColor="#fff" onPress={() => router.back()} compact>
            Zurück
          </Button>
          <Text style={styles.headerTitle}>Budgets</Text>
          <Button icon="plus" textColor="#fff" onPress={() => setShowForm(!showForm)} compact>
            Neu
          </Button>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* New budget form */}
        {showForm && (
          <View style={[styles.formCard, { backgroundColor: theme.colors.cardBackground }]}>
            <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>Neues Budget</Text>

            <Text style={[styles.label, { color: theme.colors.onSurface }]}>Kategorie (leer = Gesamtbudget)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <Chip
                selected={!formCategoryId}
                onPress={() => setFormCategoryId(null)}
                style={{ marginRight: 8 }}
                selectedColor={theme.colors.primary}
              >
                Gesamt
              </Chip>
              {categories.map(cat => (
                <Chip
                  key={cat.id}
                  selected={formCategoryId === cat.id}
                  onPress={() => setFormCategoryId(cat.id)}
                  style={{ marginRight: 8 }}
                  selectedColor={theme.colors.primary}
                >
                  {cat.icon} {cat.nameDE || cat.name}
                </Chip>
              ))}
            </ScrollView>

            <Text style={[styles.label, { color: theme.colors.onSurface }]}>Limit (€)</Text>
            <RNTextInput
              style={[styles.input, { color: theme.colors.onSurface, borderColor: theme.colors.primary + '40', backgroundColor: theme.colors.background }]}
              value={formLimit}
              onChangeText={setFormLimit}
              placeholder="z.B. 500"
              placeholderTextColor={theme.colors.onSurface + '60'}
              keyboardType="decimal-pad"
            />

            <Text style={[styles.label, { color: theme.colors.onSurface }]}>Monat</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <Chip
                selected={!formMonth}
                onPress={() => setFormMonth(null)}
                style={{ marginRight: 8 }}
                selectedColor={theme.colors.primary}
              >
                Ganzes Jahr
              </Chip>
              {MONTHS.map((m, i) => (
                <Chip
                  key={i}
                  selected={formMonth === i + 1}
                  onPress={() => setFormMonth(i + 1)}
                  style={{ marginRight: 8 }}
                  selectedColor={theme.colors.primary}
                >
                  {m}
                </Chip>
              ))}
            </ScrollView>

            <View style={styles.formButtons}>
              <Button mode="outlined" onPress={() => setShowForm(false)} style={{ flex: 1, marginRight: 8 }}>
                Abbrechen
              </Button>
              <Button mode="contained" onPress={handleSave} disabled={saving} buttonColor={theme.colors.primary} style={{ flex: 1 }}>
                {saving ? <ActivityIndicator size={16} color="#fff" /> : 'Speichern'}
              </Button>
            </View>
          </View>
        )}

        {/* Budget list */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
        ) : budgets.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: theme.colors.onSurface, opacity: 0.5, fontSize: 16 }}>Keine Budgets vorhanden</Text>
          </View>
        ) : (
          budgets.map(budget => {
            const pct = Math.min((budget.percentage || 0) / 100, 1);
            return (
              <View key={budget.id} style={[styles.budgetCard, { backgroundColor: theme.colors.cardBackground }]}>
                <View style={styles.budgetHeader}>
                  <Text style={{ color: theme.colors.onSurface, fontWeight: '600', fontSize: 15 }}>
                    {budget.Category ? `${budget.Category.icon} ${budget.Category.nameDE || budget.Category.name}` : 'Gesamtbudget'}
                  </Text>
                  <Button icon="delete" compact textColor={theme.colors.error} onPress={() => handleDelete(budget.id)}>
                    {''}
                  </Button>
                </View>
                <View style={styles.budgetNumbers}>
                  <Text style={{ color: theme.colors.onSurface, opacity: 0.7 }}>
                    {budget.spent?.toFixed(2)} / {parseFloat(budget.limitAmount).toFixed(2)} €
                  </Text>
                  <Text style={{ color: budget.isOver ? theme.colors.error : budget.isWarning ? theme.colors.warning : theme.colors.primary, fontWeight: '600' }}>
                    {Math.round(budget.percentage || 0)}%
                  </Text>
                </View>
                <ProgressBar
                  progress={pct}
                  color={budget.isOver ? theme.colors.error : budget.isWarning ? theme.colors.warning : theme.colors.primary}
                  style={styles.progressBar}
                />
                {budget.month && (
                  <Text style={{ color: theme.colors.onSurface, opacity: 0.5, fontSize: 12, marginTop: 4 }}>
                    {MONTHS[budget.month - 1]} {budget.year}
                  </Text>
                )}
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  formCard: { margin: 16, padding: 16, borderRadius: 16, elevation: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 8 },
  formButtons: { flexDirection: 'row', marginTop: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  budgetCard: { margin: 12, marginBottom: 0, padding: 16, borderRadius: 16, elevation: 2 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  budgetNumbers: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressBar: { height: 8, borderRadius: 4 },
});
