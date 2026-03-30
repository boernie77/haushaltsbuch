import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, TextInput as RNTextInput } from 'react-native';
import { Text, Button, useTheme, ActivityIndicator, Divider, List, Chip } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/store/authStore';
import { householdAPI } from '../src/services/api';
import Toast from 'react-native-toast-message';

export default function HouseholdScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold, households, setCurrentHousehold, setHouseholds } = useAuthStore();

  const [name, setName] = useState(currentHousehold?.name || '');
  const [currency, setCurrency] = useState(currentHousehold?.currency || 'EUR');
  const [monthlyBudget, setMonthlyBudget] = useState(
    currentHousehold?.monthlyBudget ? String(currentHousehold.monthlyBudget) : ''
  );
  const [members, setMembers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    if (currentHousehold) {
      setName(currentHousehold.name);
      setCurrency(currentHousehold.currency || 'EUR');
      setMonthlyBudget(currentHousehold.monthlyBudget ? String(currentHousehold.monthlyBudget) : '');
      householdAPI.getMembers(currentHousehold.id)
        .then(({ data }) => setMembers(data.members || []))
        .catch(() => {})
        .finally(() => setLoadingMembers(false));
    }
  }, [currentHousehold?.id]);

  const handleSave = async () => {
    if (!currentHousehold || !name.trim()) return;
    setSaving(true);
    try {
      const { data } = await householdAPI.update(currentHousehold.id, {
        name: name.trim(),
        currency,
        monthlyBudget: monthlyBudget ? parseFloat(monthlyBudget) : null,
      });
      const updated = { ...currentHousehold, name: data.household.name, currency: data.household.currency, monthlyBudget: data.household.monthlyBudget };
      setCurrentHousehold(updated);
      setHouseholds(households.map(h => h.id === updated.id ? updated : h));
      Toast.show({ type: 'success', text1: 'Haushalt gespeichert' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Fehler beim Speichern' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = (userId: string, memberName: string) => {
    if (!currentHousehold) return;
    Alert.alert('Mitglied entfernen', `${memberName} aus dem Haushalt entfernen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Entfernen', style: 'destructive', onPress: async () => {
          try {
            await householdAPI.removeMember(currentHousehold.id, userId);
            setMembers(ms => ms.filter(m => m.userId !== userId));
            Toast.show({ type: 'success', text1: 'Mitglied entfernt' });
          } catch {
            Toast.show({ type: 'error', text1: 'Fehler beim Entfernen' });
          }
        }
      }
    ]);
  };

  const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP'];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary, paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Button icon="arrow-left" textColor="#fff" onPress={() => router.back()} compact>
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
            <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>Haushaltsbuch wechseln</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {households.map(h => (
                <Chip
                  key={h.id}
                  selected={h.id === currentHousehold?.id}
                  onPress={() => setCurrentHousehold(h)}
                  style={{ marginRight: 8 }}
                  selectedColor={theme.colors.primary}
                >
                  {h.name}
                </Chip>
              ))}
            </ScrollView>
          </View>
        )}

        <Divider />

        {/* Edit fields */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>Haushalt bearbeiten</Text>

          <Text style={[styles.label, { color: theme.colors.onSurface }]}>Name</Text>
          <RNTextInput
            style={[styles.input, { color: theme.colors.onSurface, borderColor: theme.colors.primary + '40', backgroundColor: theme.colors.cardBackground }]}
            value={name}
            onChangeText={setName}
            placeholder="Name des Haushalts"
            placeholderTextColor={theme.colors.onSurface + '60'}
          />

          <Text style={[styles.label, { color: theme.colors.onSurface }]}>Währung</Text>
          <View style={styles.chipRow}>
            {CURRENCIES.map(c => (
              <Chip
                key={c}
                selected={currency === c}
                onPress={() => setCurrency(c)}
                style={{ marginRight: 8 }}
                selectedColor={theme.colors.primary}
              >
                {c}
              </Chip>
            ))}
          </View>

          <Text style={[styles.label, { color: theme.colors.onSurface }]}>Monatsbudget (optional)</Text>
          <RNTextInput
            style={[styles.input, { color: theme.colors.onSurface, borderColor: theme.colors.primary + '40', backgroundColor: theme.colors.cardBackground }]}
            value={monthlyBudget}
            onChangeText={setMonthlyBudget}
            placeholder="z.B. 2000"
            placeholderTextColor={theme.colors.onSurface + '60'}
            keyboardType="decimal-pad"
          />

          <Button mode="contained" onPress={handleSave} disabled={saving} buttonColor={theme.colors.primary} style={{ marginTop: 8 }}>
            {saving ? <ActivityIndicator size={16} color="#fff" /> : 'Speichern'}
          </Button>
        </View>

        <Divider />

        {/* Members */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>Mitglieder</Text>
          {loadingMembers ? (
            <ActivityIndicator style={{ marginTop: 16 }} color={theme.colors.primary} />
          ) : (
            members.map(member => (
              <List.Item
                key={member.userId}
                title={member.User?.name || 'Unbekannt'}
                description={member.role === 'admin' ? '👑 Admin' : member.role === 'viewer' ? '👁 Betrachter' : '👤 Mitglied'}
                titleStyle={{ color: theme.colors.onSurface }}
                descriptionStyle={{ color: theme.colors.onSurface, opacity: 0.6 }}
                left={() => <List.Icon icon="account" color={theme.colors.primary} />}
                right={() => member.role !== 'admin' ? (
                  <Button
                    icon="account-remove"
                    compact
                    textColor={theme.colors.error}
                    onPress={() => handleRemoveMember(member.userId, member.User?.name)}
                  >
                    Entfernen
                  </Button>
                ) : null}
                style={{ backgroundColor: theme.colors.cardBackground, borderRadius: 8, marginBottom: 4 }}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 8, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  section: { padding: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
});
