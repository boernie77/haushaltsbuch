import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TextInput as RNTextInput, TouchableOpacity } from 'react-native';
import { Text, Button, useTheme, ActivityIndicator, Switch } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/store/authStore';
import { paperlessAPI } from '../src/services/api';
import Toast from 'react-native-toast-message';

type TabKey = 'config' | 'doctypes' | 'correspondents' | 'tags';

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
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<TabKey>('config');
  const [search, setSearch] = useState({ doctype: '', correspondent: '', tag: '' });

  const loadData = async (hid: string) => {
    const { data: d } = await paperlessAPI.getData(hid);
    setData(d);
  };

  useEffect(() => {
    if (!currentHousehold) return;
    paperlessAPI.getConfig(currentHousehold.id)
      .then(({ data: d }) => {
        if (d.config) { setBaseUrl(d.config.baseUrl || ''); setIsActive(d.config.isActive); setHasConfig(true); }
      }).catch(() => {})
      .finally(() => setLoading(false));
    loadData(currentHousehold.id).catch(() => {});
  }, [currentHousehold?.id]);

  const handleSave = async () => {
    if (!currentHousehold || !baseUrl.trim()) {
      Toast.show({ type: 'error', text1: 'Bitte URL eingeben' });
      return;
    }
    setSaving(true);
    try {
      await paperlessAPI.saveConfig({ householdId: currentHousehold.id, baseUrl: baseUrl.trim(), apiToken: apiToken || undefined, isActive });
      setHasConfig(true);
      setApiToken('');
      Toast.show({ type: 'success', text1: 'Paperless-Verbindung gespeichert' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Fehler beim Speichern' });
    } finally { setSaving(false); }
  };

  const handleSync = async () => {
    if (!currentHousehold) return;
    setSyncing(true);
    try {
      const { data: d } = await paperlessAPI.sync(currentHousehold.id);
      await loadData(currentHousehold.id);
      Toast.show({ type: 'success', text1: `Synchronisiert`, text2: `${d.synced.documentTypes} Typen · ${d.synced.correspondents} Korrespondenten · ${d.synced.tags} Tags` });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Synchronisierung fehlgeschlagen' });
    } finally { setSyncing(false); }
  };

  const toggleFavorite = async (type: string, id: string, current: boolean) => {
    if (!currentHousehold) return;
    try {
      await paperlessAPI.toggleFavorite({ type, id, isFavorite: !current });
      setData((prev: any) => {
        const key = type === 'doctype' ? 'documentTypes' : type === 'correspondent' ? 'correspondents' : 'tags';
        return { ...prev, [key]: prev[key].map((item: any) => item.id === id ? { ...item, isFavorite: !current } : item) };
      });
    } catch {
      Toast.show({ type: 'error', text1: 'Fehler beim Speichern' });
    }
  };

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'config', label: 'Verbindung', icon: 'cog' },
    { key: 'doctypes', label: 'Typen', icon: 'file-document' },
    { key: 'correspondents', label: 'Absender', icon: 'account-group' },
    { key: 'tags', label: 'Tags', icon: 'tag-multiple' },
  ];

  const renderList = (items: any[], type: string, searchKey: keyof typeof search, renderLabel: (item: any) => React.ReactNode) => {
    const q = search[searchKey].toLowerCase();
    const filtered = q ? (items || []).filter((i: any) => i.name.toLowerCase().includes(q)) : (items || []);
    return (<View>
      <View style={[styles.searchRow, { borderColor: theme.colors.primary + '40', backgroundColor: theme.colors.background }]}>
        <MaterialCommunityIcons name="magnify" size={16} color={theme.colors.onSurface + '60'} />
        <RNTextInput
          style={{ flex: 1, color: theme.colors.onSurface, fontSize: 14, marginLeft: 6 }}
          placeholder="Suchen..."
          placeholderTextColor={theme.colors.onSurface + '50'}
          value={search[searchKey]}
          onChangeText={v => setSearch(s => ({ ...s, [searchKey]: v }))}
        />
      </View>
      {filtered.length === 0 ? (
        <Text style={{ color: theme.colors.onSurface, opacity: 0.5, textAlign: 'center', marginTop: 32 }}>
          {q ? 'Keine Treffer' : 'Noch keine Daten — zuerst synchronisieren'}
        </Text>
      ) : (
        filtered.map((item: any) => (
          <View key={item.id} style={[styles.listRow, { borderBottomColor: theme.colors.onSurface + '15' }]}>
            <View style={{ flex: 1 }}>{renderLabel(item)}</View>
            <TouchableOpacity onPress={() => toggleFavorite(type, item.id, item.isFavorite)} style={styles.starBtn}>
              <MaterialCommunityIcons
                name={item.isFavorite ? 'star' : 'star-outline'}
                size={22}
                color={item.isFavorite ? '#F59E0B' : theme.colors.onSurface + '40'}
              />
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.primary, paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Button icon="arrow-left" textColor="#fff" onPress={() => router.back()} compact>Zurück</Button>
          <Text style={styles.headerTitle}>Paperless-ngx</Text>
          <View style={{ width: 80 }} />
        </View>
        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 8, paddingBottom: 4 }}>
          {tabs.map(t => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
              style={[styles.tabBtn, { backgroundColor: tab === t.key ? '#fff' : 'rgba(255,255,255,0.15)' }]}>
              <MaterialCommunityIcons name={t.icon as any} size={14} color={tab === t.key ? theme.colors.primary : '#fff'} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: tab === t.key ? theme.colors.primary : '#fff', marginLeft: 4 }}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}>
          {tab === 'config' && (
            <View style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
              <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>Verbindung konfigurieren</Text>

              <Text style={[styles.label, { color: theme.colors.onSurface }]}>Server-URL</Text>
              <RNTextInput
                style={[styles.input, { color: theme.colors.onSurface, borderColor: theme.colors.primary + '40', backgroundColor: theme.colors.background }]}
                value={baseUrl} onChangeText={setBaseUrl}
                placeholder="https://paperless.example.com"
                placeholderTextColor={theme.colors.onSurface + '60'}
                autoCapitalize="none" autoCorrect={false} keyboardType="url"
              />

              <Text style={[styles.label, { color: theme.colors.onSurface }]}>API Token</Text>
              <RNTextInput
                style={[styles.input, { color: theme.colors.onSurface, borderColor: theme.colors.primary + '40', backgroundColor: theme.colors.background }]}
                value={apiToken} onChangeText={setApiToken}
                placeholder={hasConfig ? 'Neuen Token eingeben (optional)' : 'API Token eingeben'}
                placeholderTextColor={theme.colors.onSurface + '60'}
                secureTextEntry autoCapitalize="none" autoCorrect={false}
              />

              <View style={styles.switchRow}>
                <Text style={{ color: theme.colors.onSurface, fontSize: 15 }}>Verbindung aktiv</Text>
                <Switch value={isActive} onValueChange={setIsActive} color={theme.colors.primary} />
              </View>

              <Button mode="contained" onPress={handleSave} disabled={saving} buttonColor={theme.colors.primary} icon="content-save" style={{ marginTop: 16 }}>
                {saving ? <ActivityIndicator size={16} color="#fff" /> : 'Speichern'}
              </Button>

              {hasConfig && (
                <Button mode="outlined" onPress={handleSync} disabled={syncing} icon="sync" style={{ marginTop: 12 }}>
                  {syncing ? <ActivityIndicator size={16} color={theme.colors.primary} /> : 'Von Paperless synchronisieren'}
                </Button>
              )}

              {hasConfig && (
                <Text style={{ color: theme.colors.onSurface, opacity: 0.5, fontSize: 12, marginTop: 12, textAlign: 'center' }}>
                  Tipp: Synchronisiere und markiere Favoriten ⭐ — diese stehen beim Quittungs-Upload zur Auswahl.
                </Text>
              )}
            </View>
          )}

          {tab === 'doctypes' && (
            <View style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
              <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>
                Dokumententypen ({data?.documentTypes?.length || 0})
              </Text>
              {renderList(data?.documentTypes || [], 'doctype', 'doctype', (item) => (
                <Text style={{ color: theme.colors.onSurface, fontSize: 15 }}>{item.name}</Text>
              ))}
            </View>
          )}

          {tab === 'correspondents' && (
            <View style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
              <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>
                Korrespondenten ({data?.correspondents?.length || 0})
              </Text>
              {renderList(data?.correspondents || [], 'correspondent', 'correspondent', (item) => (
                <Text style={{ color: theme.colors.onSurface, fontSize: 15 }}>{item.name}</Text>
              ))}
            </View>
          )}

          {tab === 'tags' && (
            <View style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
              <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>
                Tags ({data?.tags?.length || 0})
              </Text>
              {renderList(data?.tags || [], 'tag', 'tag', (item) => (
                <View style={[styles.tagChip, { backgroundColor: item.color || '#9CA3AF' }]}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{item.name}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 8, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  tabBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  card: { borderRadius: 16, padding: 16, elevation: 2, marginBottom: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 4 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  starBtn: { padding: 4 },
  tagChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
});
