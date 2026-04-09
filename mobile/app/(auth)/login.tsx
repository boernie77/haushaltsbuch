import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Button, Text, TextInput, useTheme } from "react-native-paper";
import Toast from "react-native-toast-message";
import { householdAPI } from "../../src/services/api";
import { useAuthStore } from "../../src/store/authStore";

export default function LoginScreen() {
  const theme = useTheme() as any;
  const { login, setHouseholds, setCurrentHousehold } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!(email && password)) {
      Toast.show({ type: "error", text1: "Bitte alle Felder ausfüllen" });
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      const { data } = await householdAPI.getAll();
      setHouseholds(data.households);
      if (data.households.length > 0) {
        setCurrentHousehold(data.households[0]);
      }
      router.replace("/(tabs)");
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Anmeldung fehlgeschlagen",
        text2: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <LinearGradient
        colors={[theme.colors.gradientStart, theme.colors.gradientEnd]}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.logoContainer}>
            <Text style={styles.emoji}>💰</Text>
            <Text style={[styles.title, { color: "#fff" }]}>Haushaltsbuch</Text>
            <Text style={[styles.subtitle, { color: "rgba(255,255,255,0.8)" }]}>
              Deine Finanzen im Blick
            </Text>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.roundness,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
              Anmelden
            </Text>

            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              label="E-Mail"
              left={<TextInput.Icon icon="email" />}
              mode="outlined"
              onChangeText={setEmail}
              style={styles.input}
              value={email}
            />

            <TextInput
              label="Passwort"
              left={<TextInput.Icon icon="lock" />}
              mode="outlined"
              onChangeText={setPassword}
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off" : "eye"}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
              secureTextEntry={!showPassword}
              style={styles.input}
              value={password}
            />

            <Button
              contentStyle={styles.buttonContent}
              disabled={loading}
              loading={loading}
              mode="contained"
              onPress={handleLogin}
              style={[styles.button, { backgroundColor: theme.colors.primary }]}
            >
              Anmelden
            </Button>

            <Button
              mode="text"
              onPress={() => router.push("/(auth)/register")}
              style={styles.linkButton}
            >
              Noch kein Konto? Registrieren
            </Button>
            <Button
              labelStyle={{ fontSize: 12, opacity: 0.7 }}
              mode="text"
              onPress={() => {
                const { Linking } = require("react-native");
                Linking.openURL(
                  "https://haushalt.bernauer24.com/forgot-password"
                );
              }}
              style={styles.linkButton}
            >
              Passwort vergessen?
            </Button>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flexGrow: 1, justifyContent: "center", padding: 20 },
  logoContainer: { alignItems: "center", marginBottom: 32 },
  emoji: { fontSize: 64, marginBottom: 8 },
  title: { fontSize: 32, fontWeight: "bold", letterSpacing: 0.5 },
  subtitle: { fontSize: 16, marginTop: 4 },
  card: {
    padding: 24,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  cardTitle: { fontSize: 22, fontWeight: "600", marginBottom: 20 },
  input: { marginBottom: 12 },
  button: { marginTop: 8, borderRadius: 12 },
  buttonContent: { paddingVertical: 6 },
  linkButton: { marginTop: 8 },
});
