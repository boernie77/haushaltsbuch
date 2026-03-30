import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, Button, useTheme, ActivityIndicator, List, Chip, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../src/services/api';
import Toast from 'react-native-toast-message';

export default function AdminScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();

  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'invites'>('overview');

  const load = async () => {
    try {
      const [statsRes, usersRes, invitesRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/admin/invite-codes'),
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data.users || []);
      setInvites(invitesRes.data.codes || []);
    } catch {
      Toast.show({ type: 'error', text1: 'Daten konnten nicht geladen werden' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleGenerateInvite = async () => {
    setGeneratingInvite(true);
    try {
      const { data } = await api.post('/admin/invite-codes', { type: 'new_household' });
      setInvites(prev => [data.invite, ...prev]);
      Toast.show({ type: 'success', text1: `Code: ${data.invite.code}`, text2: 'In Einladungen sichtbar' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Fehler beim Erstellen' });
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleToggleUser = async (userId: string, isActive: boolean) => {
    try {
      await api.put(`/admin/users/${userId}`, { isActive: !isActive });
      setUsers(us => us.map(u => u.id === userId ? { ...u, isActive: !isActive } : u));
      Toast.show({ type: 'success', text1: isActive ? 'Benutzer deaktiviert' : 'Benutzer aktiviert' });
    } catch {
      Toast.show({ type: 'error', text1: 'Fehler beim Aktualisieren' });
    }
  };


  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.primary, paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Button icon="arrow-left" textColor="#fff" onPress={() => router.back()} compact>
            Zurück
          </Button>
          <Text style={styles.headerTitle}>Admin-Bereich</Text>
          <View style={{ width: 80 }} />
        </View>
        {/* Tab bar */}
        <View style={styles.tabs}>
          {(['overview', 'users', 'invites'] as const).map(tab => (
            <Button
              key={tab}
              mode={activeTab === tab ? 'contained' : 'text'}
              onPress={() => setActiveTab(tab)}
              textColor={activeTab === tab ? theme.colors.primary : 'rgba(255,255,255,0.8)'}
              buttonColor={activeTab === tab ? '#fff' : 'transparent'}
              compact
              style={{ borderRadius: 20 }}
            >
              {tab === 'overview' ? 'Übersicht' : tab === 'users' ? 'Nutzer' : 'Einladungen'}
            </Button>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          {activeTab === 'overview' && stats && (
            <>
              <View style={styles.statsGrid}>
                {([
                  { label: 'Benutzer', value: stats.userCount, icon: 'account-group' },
                  { label: 'Haushalte', value: stats.householdCount, icon: 'home-group' },
                  { label: 'Buchungen', value: stats.transactionCount, icon: 'receipt' },
                ] as const).map(s => (
                  <View key={s.label} style={[styles.statCard, { backgroundColor: theme.colors.cardBackground }]}>
                    <MaterialCommunityIcons name={s.icon} size={32} color={theme.colors.primary} style={{ marginBottom: 6 }} />
                    <Text style={[styles.statValue, { color: theme.colors.primary }]}>{s.value}</Text>
                    <Text style={[styles.statLabel, { color: theme.colors.onSurface }]}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {activeTab === 'users' && (
            <>
              {users.map(user => (
                <List.Item
                  key={user.id}
                  title={user.name}
                  description={`${user.email} · ${user.role}`}
                  titleStyle={{ color: theme.colors.onSurface }}
                  descriptionStyle={{ color: theme.colors.onSurface, opacity: 0.6 }}
                  left={() => (
                    <List.Icon
                      icon={user.role === 'superadmin' ? 'crown' : user.role === 'admin' ? 'shield-account' : 'account'}
                      color={user.isActive ? theme.colors.primary : theme.colors.error}
                    />
                  )}
                  right={() => (
                    <Button
                      compact
                      mode="outlined"
                      textColor={user.isActive ? theme.colors.error : theme.colors.primary}
                      onPress={() => handleToggleUser(user.id, user.isActive)}
                    >
                      {user.isActive ? 'Deaktivieren' : 'Aktivieren'}
                    </Button>
                  )}
                  style={[styles.listItem, { backgroundColor: theme.colors.cardBackground }]}
                />
              ))}
            </>
          )}

          {activeTab === 'invites' && (
            <>
              <Button
                mode="contained"
                icon="ticket-plus"
                onPress={handleGenerateInvite}
                disabled={generatingInvite}
                buttonColor={theme.colors.primary}
                style={{ marginBottom: 16 }}
              >
                {generatingInvite ? <ActivityIndicator size={16} color="#fff" /> : 'Neuen Admin-Code erstellen'}
              </Button>
              {invites.map(invite => (
                <List.Item
                  key={invite.id}
                  title={invite.code}
                  titleStyle={{ color: theme.colors.primary, fontFamily: 'monospace', fontWeight: '600' }}
                  description={`Typ: ${invite.type} · ${invite.useCount}/${invite.maxUses} verwendet${invite.usedAt ? ' · Verwendet' : ''}`}
                  descriptionStyle={{ color: theme.colors.onSurface, opacity: 0.6, fontSize: 12 }}
                  left={() => <List.Icon icon={invite.usedAt ? 'ticket-confirmation' : 'ticket'} color={invite.usedAt ? theme.colors.primary : theme.colors.primary} />}
                  style={[styles.listItem, { backgroundColor: theme.colors.cardBackground }]}
                />
              ))}
            </>
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
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, marginBottom: 4 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', elevation: 2 },
  statValue: { fontSize: 28, fontWeight: 'bold' },
  statLabel: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  listItem: { borderRadius: 10, marginBottom: 4, elevation: 1 },
});
