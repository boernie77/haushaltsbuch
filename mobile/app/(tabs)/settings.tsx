import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, TextInput, Linking } from 'react-native';
import { Text, List, Switch, useTheme, Avatar, Divider, Button, ActivityIndicator } from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/store/authStore';
import { api, householdAPI } from '../../src/services/api';
import Toast from 'react-native-toast-message';

export default function SettingsScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { user, logout, updateTheme, currentHousehold } = useAuthStore();
  const [isDark, setIsDark] = useState(user?.theme === 'masculine');

  const [aiSettings, setAiSettings] = useState<{ aiEnabled: boolean; hasApiKey: boolean; maskedApiKey: string | null }>({ aiEnabled: false, hasApiKey: false, maskedApiKey: null });
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  useEffect(() => {
    if (currentHousehold) {
      householdAPI.getAiSettings(currentHousehold.id).then(({ data }) => setAiSettings(data)).catch(() => {});
    }
  }, [currentHousehold?.id]);

  const handleThemeChange = async (value: boolean) => {
    const newTheme = value ? 'masculine' : 'feminine';
    setIsDark(value);
    try {
      await api.put('/auth/profile', { theme: newTheme });
      updateTheme(newTheme);
    } catch {
      Toast.show({ type: 'error', text1: 'Theme konnte nicht gespeichert werden' });
    }
  };

  const handleSaveAi = async () => {
    if (!currentHousehold) return;
    setAiSaving(true);
    try {
      const { data } = await householdAPI.saveAiSettings(currentHousehold.id, { aiEnabled: aiSettings.aiEnabled, apiKey: aiKeyInput });
      setAiSettings(data);
      setAiKeyInput('');
      Toast.show({ type: 'success', text1: data.aiEnabled ? 'KI-Analyse aktiviert' : 'KI-Analyse deaktiviert' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Fehler beim Speichern' });
    } finally {
      setAiSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Abmelden', 'Möchtest du dich wirklich abmelden?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Abmelden', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } }
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary, paddingTop: insets.top + 16 }]}>
        <Text style={styles.headerTitle}>Einstellungen</Text>
      </View>

      {/* Profile */}
      <View style={[styles.profileCard, { backgroundColor: theme.colors.cardBackground }]}>
        <Avatar.Text size={60} label={user?.name?.charAt(0) || '?'} style={{ backgroundColor: theme.colors.primary }} />
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: theme.colors.onSurface }]}>{user?.name}</Text>
          <Text style={[styles.profileEmail, { color: theme.colors.onSurface }]}>{user?.email}</Text>
          <Text style={{ color: theme.colors.primary, fontSize: 12 }}>
            {user?.role === 'superadmin' ? '👑 Super-Admin' : user?.role === 'admin' ? '🔑 Admin' : '👤 Mitglied'}
          </Text>
        </View>
      </View>

      <List.Section>
        <List.Subheader style={{ color: theme.colors.primary }}>Design</List.Subheader>
        <List.Item
          title="Dunkles Design (Maskulin)"
          description="Wechsle zwischen Rosa und Dunkel"
          titleStyle={{ color: theme.colors.onSurface }}
          descriptionStyle={{ color: theme.colors.onSurface, opacity: 0.6 }}
          left={() => <List.Icon icon={isDark ? 'weather-night' : 'weather-sunny'} color={theme.colors.primary} />}
          right={() => <Switch value={isDark} onValueChange={handleThemeChange} color={theme.colors.primary} />}
          style={{ backgroundColor: theme.colors.cardBackground, paddingLeft: 8 }}
        />
      </List.Section>

      <Divider />

      <List.Section>
        <List.Subheader style={{ color: theme.colors.primary }}>Haushalt</List.Subheader>
        <List.Item
          title="Haushalt verwalten"
          description={currentHousehold?.name}
          titleStyle={{ color: theme.colors.onSurface }}
          descriptionStyle={{ color: theme.colors.onSurface, opacity: 0.6 }}
          left={() => <List.Icon icon="home" color={theme.colors.primary} />}
          right={() => <List.Icon icon="chevron-right" />}
          onPress={() => router.push('/household')}
          style={{ backgroundColor: theme.colors.cardBackground, paddingLeft: 8 }}
        />
        <List.Item
          title="Budget festlegen"
          titleStyle={{ color: theme.colors.onSurface }}
          left={() => <List.Icon icon="wallet" color={theme.colors.primary} />}
          right={() => <List.Icon icon="chevron-right" />}
          onPress={() => router.push('/budget')}
          style={{ backgroundColor: theme.colors.cardBackground, paddingLeft: 8 }}
        />
        <List.Item
          title="Mitglieder einladen"
          titleStyle={{ color: theme.colors.onSurface }}
          left={() => <List.Icon icon="account-plus" color={theme.colors.primary} />}
          right={() => <List.Icon icon="chevron-right" />}
          onPress={() => router.push('/invite')}
          style={{ backgroundColor: theme.colors.cardBackground, paddingLeft: 8 }}
        />
      </List.Section>

      <Divider />

      <List.Section>
        <List.Subheader style={{ color: theme.colors.primary }}>KI-Quittungsanalyse</List.Subheader>
        <View style={[styles.aiCard, { backgroundColor: theme.colors.cardBackground }]}>
          <View style={styles.aiRow}>
            <Text style={[styles.aiLabel, { color: theme.colors.onSurface }]}>KI-Analyse aktivieren</Text>
            <Switch value={aiSettings.aiEnabled} onValueChange={v => setAiSettings(s => ({ ...s, aiEnabled: v }))} color={theme.colors.primary} />
          </View>
          {aiSettings.hasApiKey && (
            <Text style={{ color: theme.colors.onSurface, opacity: 0.6, fontSize: 12, marginBottom: 8 }}>
              Key: {aiSettings.maskedApiKey}
            </Text>
          )}
          <TextInput
            style={[styles.aiInput, { color: theme.colors.onSurface, borderColor: theme.colors.primary + '40', backgroundColor: theme.colors.background }]}
            placeholder={aiSettings.hasApiKey ? 'Neuen Key eingeben (optional)' : 'sk-ant-api03-...'}
            placeholderTextColor={theme.colors.onSurface + '60'}
            value={aiKeyInput}
            onChangeText={setAiKeyInput}
            secureTextEntry={!showAiKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.aiRow}>
            <Button mode="text" compact onPress={() => setShowAiKey(!showAiKey)} textColor={theme.colors.primary}>
              {showAiKey ? 'Verbergen' : 'Anzeigen'}
            </Button>
            <Button mode="contained" compact onPress={handleSaveAi} disabled={aiSaving} buttonColor={theme.colors.primary}>
              {aiSaving ? <ActivityIndicator size={14} color="#fff" /> : 'Speichern'}
            </Button>
          </View>
        </View>
      </List.Section>

      <Divider />

      <List.Section>
        <List.Subheader style={{ color: theme.colors.primary }}>Paperless</List.Subheader>
        <List.Item
          title="Paperless-ngx Verbindung"
          description="Quittungen automatisch archivieren"
          titleStyle={{ color: theme.colors.onSurface }}
          descriptionStyle={{ color: theme.colors.onSurface, opacity: 0.6 }}
          left={() => <List.Icon icon="file-document-multiple" color={theme.colors.primary} />}
          right={() => <List.Icon icon="chevron-right" />}
          onPress={() => router.push('/paperless-settings')}
          style={{ backgroundColor: theme.colors.cardBackground, paddingLeft: 8 }}
        />
      </List.Section>

      {(user?.role === 'admin' || user?.role === 'superadmin') && (
        <>
          <Divider />
          <List.Section>
            <List.Subheader style={{ color: theme.colors.primary }}>Administration</List.Subheader>
            <List.Item
              title="Admin-Bereich"
              description="Benutzer & Einladungscodes verwalten"
              titleStyle={{ color: theme.colors.onSurface }}
              descriptionStyle={{ color: theme.colors.onSurface, opacity: 0.6 }}
              left={() => <List.Icon icon="shield-crown" color={theme.colors.primary} />}
              right={() => <List.Icon icon="chevron-right" />}
              onPress={() => router.push('/admin')}
              style={{ backgroundColor: theme.colors.cardBackground, paddingLeft: 8 }}
            />
          </List.Section>
        </>
      )}

      <List.Section>
        <List.Subheader>Rechtliches</List.Subheader>
        <List.Item
          title="Impressum"
          left={() => <List.Icon icon="information-outline" color={theme.colors.primary} />}
          right={() => <List.Icon icon="open-in-new" />}
          onPress={() => Linking.openURL('https://haushalt.bernauer24.com/impressum')}
          style={{ backgroundColor: theme.colors.cardBackground, paddingLeft: 8 }}
          titleStyle={{ color: theme.colors.onSurface }}
        />
        <List.Item
          title="Datenschutzerklärung"
          left={() => <List.Icon icon="shield-lock-outline" color={theme.colors.primary} />}
          right={() => <List.Icon icon="open-in-new" />}
          onPress={() => Linking.openURL('https://haushalt.bernauer24.com/datenschutz')}
          style={{ backgroundColor: theme.colors.cardBackground, paddingLeft: 8 }}
          titleStyle={{ color: theme.colors.onSurface }}
        />
      </List.Section>

      <View style={styles.logoutContainer}>
        <Button mode="outlined" onPress={handleLogout} icon="logout"
          textColor={theme.colors.error} style={{ borderColor: theme.colors.error }}>
          Abmelden
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 24 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: 20, margin: 16, borderRadius: 16, elevation: 2 },
  profileInfo: { marginLeft: 16, flex: 1 },
  profileName: { fontSize: 18, fontWeight: '600' },
  profileEmail: { fontSize: 14, opacity: 0.7 },
  logoutContainer: { margin: 16, marginBottom: 40 },
  aiCard: { marginHorizontal: 16, marginBottom: 8, padding: 16, borderRadius: 12, elevation: 1 },
  aiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  aiLabel: { fontSize: 14, fontWeight: '500' },
  aiInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, marginBottom: 8 },
});
