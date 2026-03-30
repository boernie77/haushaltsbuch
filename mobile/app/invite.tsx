import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Share, Clipboard } from 'react-native';
import { Text, Button, useTheme, ActivityIndicator, Chip } from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../src/store/authStore';
import { householdAPI } from '../src/services/api';
import Toast from 'react-native-toast-message';

export default function InviteScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold } = useAuthStore();

  const role = 'member';
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!currentHousehold) return;
    setGenerating(true);
    try {
      const { data } = await householdAPI.createInvite(currentHousehold.id, { role });
      setGeneratedCode(data.code);
      Toast.show({ type: 'success', text1: 'Einladungscode erstellt' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Fehler beim Erstellen' });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (generatedCode) {
      Clipboard.setString(generatedCode);
      Toast.show({ type: 'success', text1: 'Code kopiert!' });
    }
  };

  const handleShare = async () => {
    if (!generatedCode) return;
    try {
      await Share.share({
        message: `Tritt meinem Haushaltsbuch "${currentHousehold?.name}" bei!\n\nEinladungscode: ${generatedCode}`,
      });
    } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.primary, paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Button icon="arrow-left" textColor="#fff" onPress={() => router.back()} compact>
            Zurück
          </Button>
          <Text style={styles.headerTitle}>Mitglieder einladen</Text>
          <View style={{ width: 80 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <View style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
          <MaterialCommunityIcons name="account-plus" size={48} color={theme.colors.primary} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
            Einladungslink erstellen
          </Text>
          <Text style={[styles.cardDesc, { color: theme.colors.onSurface }]}>
            Erstelle einen Einladungscode für {currentHousehold?.name}. Das neue Mitglied gibt diesen Code bei der Registrierung ein.
          </Text>

          <Button
            mode="contained"
            onPress={handleGenerate}
            disabled={generating}
            buttonColor={theme.colors.primary}
            icon="ticket"
            style={{ marginTop: 16 }}
          >
            {generating ? <ActivityIndicator size={16} color="#fff" /> : 'Code generieren'}
          </Button>
        </View>

        {generatedCode && (
          <View style={[styles.codeCard, { backgroundColor: theme.colors.cardBackground, borderColor: theme.colors.primary + '40' }]}>
            <Text style={[styles.codeLabel, { color: theme.colors.onSurface }]}>Einladungscode</Text>
            <Text style={[styles.code, { color: theme.colors.primary }]}>{generatedCode}</Text>
            <View style={styles.codeButtons}>
              <Button mode="outlined" icon="content-copy" onPress={handleCopy} style={{ flex: 1, marginRight: 8 }}>
                Kopieren
              </Button>
              <Button mode="contained" icon="share-variant" onPress={handleShare} buttonColor={theme.colors.primary} style={{ flex: 1 }}>
                Teilen
              </Button>
            </View>
          </View>
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
  card: { borderRadius: 16, padding: 20, marginBottom: 16, elevation: 2 },
  cardTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  cardDesc: { opacity: 0.7, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  codeCard: { borderRadius: 16, padding: 20, borderWidth: 2, elevation: 2 },
  codeLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, opacity: 0.6 },
  code: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', letterSpacing: 4, marginBottom: 16 },
  codeButtons: { flexDirection: 'row' },
});
