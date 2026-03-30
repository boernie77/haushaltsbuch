import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TextInput as RNTextInput } from 'react-native';
import { Text, Button, useTheme, ActivityIndicator, Switch } from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/store/authStore';
import { paperlessAPI } from '../src/services/api';
import Toast from 'react-native-toast-message';

export default function PaperlessSettingsScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold } = useAuthStore();

  const [baseUrl, setBaseUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    if (!currentHousehold) return;
    paperlessAPI.getConfig(currentHousehold.id)
      .then(({ data }) => {
        if (data.config) {
          setBaseUrl(data.config.baseUrl || '');
          setApiToken('');
          setIsActive(data.config.isActive);
          setHasConfig(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentHousehold?.id]);

  const handleSave = async () => {
    if (!currentHousehold || !baseUrl.trim()) {
      Toast.show({ type: 'error', text1: 'Bitte URL eingeben' });
      return;
    }
    setSaving(true);
    try {
      await paperlessAPI.saveConfig({
        householdId: currentHousehold.id,
        baseUrl: baseUrl.trim(),
        apiToken: apiToken || undefined,
        isActive,
      });
      setHasConfig(true);
      setApiToken('');
      Toast.show({ type: 'success', text1: 'Paperless-Verbindung gespeichert' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Fehler beim Speichern' });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!currentHousehold) return;
    setSyncing(true);
    try {
      await paperlessAPI.sync(currentHousehold.id);
      Toast.show({ type: 'success', text1: 'Synchronisierung abgeschlossen' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Synchronisierung fehlgeschlagen' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.primary, paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Button icon="arrow-left" textColor="#fff" onPress={() => router.back()} compact>
            Zurück
          </Button>
          <Text style={styles.headerTitle}>Paperless-ngx</Text>
          <View style={{ width: 80 }} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
          <View style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
            <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>Verbindung konfigurieren</Text>

            <Text style={[styles.label, { color: theme.colors.onSurface }]}>Server-URL</Text>
            <RNTextInput
              style={[styles.input, { color: theme.colors.onSurface, borderColor: theme.colors.primary + '40', backgroundColor: theme.colors.background }]}
              value={baseUrl}
              onChangeText={setBaseUrl}
              placeholder="https://paperless.example.com"
              placeholderTextColor={theme.colors.onSurface + '60'}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Text style={[styles.label, { color: theme.colors.onSurface }]}>API Token</Text>
            <RNTextInput
              style={[styles.input, { color: theme.colors.onSurface, borderColor: theme.colors.primary + '40', backgroundColor: theme.colors.background }]}
              value={apiToken}
              onChangeText={setApiToken}
              placeholder={hasConfig ? 'Neuen Token eingeben (optional)' : 'API Token eingeben'}
              placeholderTextColor={theme.colors.onSurface + '60'}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.switchRow}>
              <Text style={{ color: theme.colors.onSurface, fontSize: 15 }}>Verbindung aktiv</Text>
              <Switch value={isActive} onValueChange={setIsActive} color={theme.colors.primary} />
            </View>

            <Button
              mode="contained"
              onPress={handleSave}
              disabled={saving}
              buttonColor={theme.colors.primary}
              icon="content-save"
              style={{ marginTop: 16 }}
            >
              {saving ? <ActivityIndicator size={16} color="#fff" /> : 'Speichern'}
            </Button>
          </View>

          {hasConfig && isActive && (
            <Button
              mode="outlined"
              onPress={handleSync}
              disabled={syncing}
              icon="sync"
              style={{ marginTop: 12 }}
            >
              {syncing ? <ActivityIndicator size={16} color={theme.colors.primary} /> : 'Jetzt synchronisieren'}
            </Button>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 8, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  card: { borderRadius: 16, padding: 20, elevation: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 4 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
});
