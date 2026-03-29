import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, List, Switch, useTheme, Avatar, Divider, Button } from 'react-native-paper';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { api } from '../../src/services/api';
import Toast from 'react-native-toast-message';

export default function SettingsScreen() {
  const theme = useTheme() as any;
  const { user, logout, updateTheme, currentHousehold } = useAuthStore();
  const [isDark, setIsDark] = useState(user?.theme === 'masculine');

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

  const handleLogout = () => {
    Alert.alert('Abmelden', 'Möchtest du dich wirklich abmelden?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Abmelden', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } }
    ]);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
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
          style={{ backgroundColor: theme.colors.cardBackground }}
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
          style={{ backgroundColor: theme.colors.cardBackground }}
        />
        <List.Item
          title="Budget festlegen"
          titleStyle={{ color: theme.colors.onSurface }}
          left={() => <List.Icon icon="wallet" color={theme.colors.primary} />}
          right={() => <List.Icon icon="chevron-right" />}
          onPress={() => router.push('/budget')}
          style={{ backgroundColor: theme.colors.cardBackground }}
        />
        <List.Item
          title="Mitglieder einladen"
          titleStyle={{ color: theme.colors.onSurface }}
          left={() => <List.Icon icon="account-plus" color={theme.colors.primary} />}
          right={() => <List.Icon icon="chevron-right" />}
          onPress={() => router.push('/invite')}
          style={{ backgroundColor: theme.colors.cardBackground }}
        />
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
          style={{ backgroundColor: theme.colors.cardBackground }}
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
              style={{ backgroundColor: theme.colors.cardBackground }}
            />
          </List.Section>
        </>
      )}

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
  header: { padding: 24, paddingTop: 52 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: 20, margin: 16, borderRadius: 16, elevation: 2 },
  profileInfo: { marginLeft: 16, flex: 1 },
  profileName: { fontSize: 18, fontWeight: '600' },
  profileEmail: { fontSize: 14, opacity: 0.7 },
  logoutContainer: { margin: 16, marginBottom: 40 },
});
