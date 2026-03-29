import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button, useTheme, SegmentedButtons } from 'react-native-paper';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { householdAPI } from '../../src/services/api';
import Toast from 'react-native-toast-message';
import { LinearGradient } from 'expo-linear-gradient';

export default function RegisterScreen() {
  const theme = useTheme() as any;
  const { register, setHouseholds, setCurrentHousehold, updateTheme } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<'feminine' | 'masculine'>('feminine');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Toast.show({ type: 'error', text1: 'Bitte alle Felder ausfüllen' });
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password, inviteCode || undefined);
      // Update theme preference
      await import('../../src/services/api').then(({ api }) =>
        api.put('/auth/profile', { theme: selectedTheme })
      );
      updateTheme(selectedTheme);
      const { data } = await householdAPI.getAll();
      setHouseholds(data.households);
      if (data.households.length > 0) setCurrentHousehold(data.households[0]);
      router.replace('/(tabs)');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Registrierung fehlgeschlagen', text2: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <LinearGradient colors={[theme.colors.gradientStart, theme.colors.gradientEnd]} style={styles.gradient}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.logoContainer}>
            <Text style={styles.emoji}>💰</Text>
            <Text style={[styles.title, { color: '#fff' }]}>Haushaltsbuch</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderRadius: theme.roundness }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>Konto erstellen</Text>

            <TextInput label="Name" value={name} onChangeText={setName} mode="outlined" style={styles.input}
              left={<TextInput.Icon icon="account" />} />
            <TextInput label="E-Mail" value={email} onChangeText={setEmail} mode="outlined"
              keyboardType="email-address" autoCapitalize="none" style={styles.input}
              left={<TextInput.Icon icon="email" />} />
            <TextInput label="Passwort (min. 8 Zeichen)" value={password} onChangeText={setPassword}
              mode="outlined" secureTextEntry style={styles.input} left={<TextInput.Icon icon="lock" />} />
            <TextInput label="Einladungscode (optional)" value={inviteCode} onChangeText={setInviteCode}
              mode="outlined" style={styles.input} left={<TextInput.Icon icon="ticket" />} />

            <Text style={[styles.label, { color: theme.colors.onSurface }]}>Design wählen:</Text>
            <SegmentedButtons
              value={selectedTheme}
              onValueChange={(v) => setSelectedTheme(v as any)}
              buttons={[
                { value: 'feminine', label: '🌸 Rosa', icon: 'heart' },
                { value: 'masculine', label: '💙 Dunkel', icon: 'shield' }
              ]}
              style={styles.segmented}
            />

            <Button mode="contained" onPress={handleRegister} loading={loading} disabled={loading}
              style={[styles.button, { backgroundColor: theme.colors.primary }]}
              contentStyle={styles.buttonContent}>
              Konto erstellen
            </Button>
            <Button mode="text" onPress={() => router.back()} style={styles.linkButton}>
              Bereits registriert? Anmelden
            </Button>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  logoContainer: { alignItems: 'center', marginBottom: 24 },
  emoji: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: 'bold' },
  card: { padding: 24, elevation: 4 },
  cardTitle: { fontSize: 22, fontWeight: '600', marginBottom: 20 },
  input: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  segmented: { marginBottom: 16 },
  button: { marginTop: 8, borderRadius: 12 },
  buttonContent: { paddingVertical: 6 },
  linkButton: { marginTop: 8 },
});
