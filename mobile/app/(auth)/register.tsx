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
import {
  Button,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import Toast from "react-native-toast-message";
import { householdAPI } from "../../src/services/api";
import { useAuthStore } from "../../src/store/authStore";

type BaseTheme = "feminine" | "masculine" | "professional";

export default function RegisterScreen() {
  const theme = useTheme() as any;
  const { register, setHouseholds, setCurrentHousehold, updateTheme } =
    useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [baseTheme, setBaseTheme] = useState<BaseTheme>("feminine");
  const [proVariant, setProVariant] = useState<"light" | "dark">("light");
  const [loading, setLoading] = useState(false);

  const finalTheme =
    baseTheme === "professional"
      ? (`professional-${proVariant}` as const)
      : baseTheme;

  const handleRegister = async () => {
    if (!(name && email && password)) {
      Toast.show({ type: "error", text1: "Bitte alle Felder ausfüllen" });
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password, inviteCode || undefined);
      // Update theme preference
      await import("../../src/services/api").then(({ api }) =>
        api.put("/auth/profile", { theme: finalTheme })
      );
      updateTheme(finalTheme);
      const { data } = await householdAPI.getAll();
      setHouseholds(data.households);
      if (data.households.length > 0) {
        setCurrentHousehold(data.households[0]);
      }
      router.replace("/(tabs)");
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Registrierung fehlgeschlagen",
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
              Konto erstellen
            </Text>

            <TextInput
              label="Name"
              left={<TextInput.Icon icon="account" />}
              mode="outlined"
              onChangeText={setName}
              style={styles.input}
              value={name}
            />
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
              label="Passwort (min. 8 Zeichen)"
              left={<TextInput.Icon icon="lock" />}
              mode="outlined"
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <TextInput
              autoCapitalize="characters"
              label="Einladungscode"
              left={<TextInput.Icon icon="ticket" />}
              mode="outlined"
              onChangeText={setInviteCode}
              style={styles.input}
              value={inviteCode}
            />
            <Text
              style={{
                fontSize: 11,
                color: "#9ca3af",
                marginTop: -8,
                marginBottom: 8,
                marginLeft: 4,
              }}
            >
              Nur der allererste Benutzer benötigt keinen Code.
            </Text>

            <Text style={[styles.label, { color: theme.colors.onSurface }]}>
              Design wählen:
            </Text>
            <SegmentedButtons
              buttons={[
                { value: "feminine", label: "🌸 Rosa", icon: "heart" },
                { value: "masculine", label: "💙 Dunkel", icon: "shield" },
                {
                  value: "professional",
                  label: "💼 Pro",
                  icon: "briefcase",
                },
              ]}
              onValueChange={(v) => setBaseTheme(v as BaseTheme)}
              style={styles.segmented}
              value={baseTheme}
            />

            {baseTheme === "professional" && (
              <>
                <Text
                  style={[
                    styles.label,
                    { color: theme.colors.onSurface, marginTop: 4 },
                  ]}
                >
                  Variante:
                </Text>
                <SegmentedButtons
                  buttons={[
                    {
                      value: "light",
                      label: "☀️ Hell",
                      icon: "weather-sunny",
                    },
                    {
                      value: "dark",
                      label: "🌙 Dunkel",
                      icon: "weather-night",
                    },
                  ]}
                  onValueChange={(v) => setProVariant(v as "light" | "dark")}
                  style={styles.segmented}
                  value={proVariant}
                />
              </>
            )}

            <Button
              contentStyle={styles.buttonContent}
              disabled={loading}
              loading={loading}
              mode="contained"
              onPress={handleRegister}
              style={[styles.button, { backgroundColor: theme.colors.primary }]}
            >
              Konto erstellen
            </Button>
            <Button
              mode="text"
              onPress={() => router.back()}
              style={styles.linkButton}
            >
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
  container: { flexGrow: 1, justifyContent: "center", padding: 20 },
  logoContainer: { alignItems: "center", marginBottom: 24 },
  emoji: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: "bold" },
  card: { padding: 24, elevation: 4 },
  cardTitle: { fontSize: 22, fontWeight: "600", marginBottom: 20 },
  input: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "500", marginBottom: 8 },
  segmented: { marginBottom: 16 },
  button: { marginTop: 8, borderRadius: 12 },
  buttonContent: { paddingVertical: 6 },
  linkButton: { marginTop: 8 },
});
