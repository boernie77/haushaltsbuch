import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Button,
  Divider,
  List,
  Switch,
  Text,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { api, householdAPI } from "../../src/services/api";
import { useAuthStore } from "../../src/store/authStore";

export default function SettingsScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { user, logout, updateTheme, currentHousehold } = useAuthStore();
  const [isDark, setIsDark] = useState(user?.theme === "masculine");
  const [familyMode, setFamilyMode] = useState(false);
  const [appUrl, setAppUrl] = useState("");

  const [aiSettings, setAiSettings] = useState<{
    aiEnabled: boolean;
    hasApiKey: boolean;
    maskedApiKey: string | null;
  }>({ aiEnabled: false, hasApiKey: false, maskedApiKey: null });
  const [aiKeyInput, setAiKeyInput] = useState("");
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ familyMode: boolean; appUrl: string }>("/config")
      .then(({ data }) => {
        setFamilyMode(data.familyMode);
        setAppUrl(data.appUrl || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (currentHousehold) {
      householdAPI
        .getAiSettings(currentHousehold.id)
        .then(({ data }) => setAiSettings(data))
        .catch(() => {});
    }
  }, [currentHousehold?.id]);

  const handleThemeChange = async (value: boolean) => {
    const newTheme = value ? "masculine" : "feminine";
    setIsDark(value);
    try {
      await api.put("/auth/profile", { theme: newTheme });
      updateTheme(newTheme);
    } catch {
      Toast.show({
        type: "error",
        text1: "Theme konnte nicht gespeichert werden",
      });
    }
  };

  const handleSaveAi = async () => {
    if (!currentHousehold) {
      return;
    }
    setAiSaving(true);
    try {
      const { data } = await householdAPI.saveAiSettings(currentHousehold.id, {
        aiEnabled: aiSettings.aiEnabled,
        apiKey: aiKeyInput,
      });
      setAiSettings(data);
      setAiKeyInput("");
      Toast.show({
        type: "success",
        text1: data.aiEnabled
          ? "KI-Analyse aktiviert"
          : "KI-Analyse deaktiviert",
      });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: err.response?.data?.message || "Fehler beim Speichern",
      });
    } finally {
      setAiSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Abmelden", "Möchtest du dich wirklich abmelden?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Abmelden",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.primary,
            paddingTop: insets.top + 16,
          },
        ]}
      >
        <Text style={styles.headerTitle}>Einstellungen</Text>
      </View>

      {/* Profile */}
      <View
        style={[
          styles.profileCard,
          { backgroundColor: theme.colors.cardBackground },
        ]}
      >
        <Avatar.Text
          label={user?.name?.charAt(0) || "?"}
          size={60}
          style={{ backgroundColor: theme.colors.primary }}
        />
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: theme.colors.onSurface }]}>
            {user?.name}
          </Text>
          <Text
            style={[styles.profileEmail, { color: theme.colors.onSurface }]}
          >
            {user?.email}
          </Text>
          <Text style={{ color: theme.colors.primary, fontSize: 12 }}>
            {user?.role === "superadmin"
              ? "👑 Super-Admin"
              : user?.role === "admin"
                ? "🔑 Admin"
                : "👤 Mitglied"}
          </Text>
        </View>
      </View>

      <List.Section>
        <List.Subheader style={{ color: theme.colors.primary }}>
          Design
        </List.Subheader>
        <List.Item
          description="Wechsle zwischen Rosa und Dunkel"
          descriptionStyle={{ color: theme.colors.onSurface, opacity: 0.6 }}
          left={() => (
            <List.Icon
              color={theme.colors.primary}
              icon={isDark ? "weather-night" : "weather-sunny"}
            />
          )}
          right={() => (
            <Switch
              color={theme.colors.primary}
              onValueChange={handleThemeChange}
              value={isDark}
            />
          )}
          style={{
            backgroundColor: theme.colors.cardBackground,
            paddingLeft: 8,
          }}
          title="Dunkles Design (Maskulin)"
          titleStyle={{ color: theme.colors.onSurface }}
        />
      </List.Section>

      <Divider />

      <List.Section>
        <List.Subheader style={{ color: theme.colors.primary }}>
          Haushalt
        </List.Subheader>
        <List.Item
          description={currentHousehold?.name}
          descriptionStyle={{ color: theme.colors.onSurface, opacity: 0.6 }}
          left={() => <List.Icon color={theme.colors.primary} icon="home" />}
          onPress={() => router.push("/household")}
          right={() => <List.Icon icon="chevron-right" />}
          style={{
            backgroundColor: theme.colors.cardBackground,
            paddingLeft: 8,
          }}
          title="Haushalt verwalten"
          titleStyle={{ color: theme.colors.onSurface }}
        />
        <List.Item
          left={() => <List.Icon color={theme.colors.primary} icon="wallet" />}
          onPress={() => router.push("/budget")}
          right={() => <List.Icon icon="chevron-right" />}
          style={{
            backgroundColor: theme.colors.cardBackground,
            paddingLeft: 8,
          }}
          title="Budget festlegen"
          titleStyle={{ color: theme.colors.onSurface }}
        />
        <List.Item
          left={() => (
            <List.Icon color={theme.colors.primary} icon="account-plus" />
          )}
          onPress={() => router.push("/invite")}
          right={() => <List.Icon icon="chevron-right" />}
          style={{
            backgroundColor: theme.colors.cardBackground,
            paddingLeft: 8,
          }}
          title="Mitglieder einladen"
          titleStyle={{ color: theme.colors.onSurface }}
        />
      </List.Section>

      <Divider />

      <List.Section>
        <List.Subheader style={{ color: theme.colors.primary }}>
          KI-Quittungsanalyse
        </List.Subheader>
        <View
          style={[
            styles.aiCard,
            { backgroundColor: theme.colors.cardBackground },
          ]}
        >
          <View style={styles.aiRow}>
            <Text style={[styles.aiLabel, { color: theme.colors.onSurface }]}>
              KI-Analyse aktivieren
            </Text>
            <Switch
              color={theme.colors.primary}
              onValueChange={(v) =>
                setAiSettings((s) => ({ ...s, aiEnabled: v }))
              }
              value={aiSettings.aiEnabled}
            />
          </View>
          {aiSettings.hasApiKey && (
            <Text
              style={{
                color: theme.colors.onSurface,
                opacity: 0.6,
                fontSize: 12,
                marginBottom: 8,
              }}
            >
              Key: {aiSettings.maskedApiKey}
            </Text>
          )}
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setAiKeyInput}
            placeholder={
              aiSettings.hasApiKey
                ? "Neuen Key eingeben (optional)"
                : "sk-ant-api03-..."
            }
            placeholderTextColor={`${theme.colors.onSurface}60`}
            secureTextEntry={!showAiKey}
            style={[
              styles.aiInput,
              {
                color: theme.colors.onSurface,
                borderColor: `${theme.colors.primary}40`,
                backgroundColor: theme.colors.background,
              },
            ]}
            value={aiKeyInput}
          />
          <View style={styles.aiRow}>
            <Button
              compact
              mode="text"
              onPress={() => setShowAiKey(!showAiKey)}
              textColor={theme.colors.primary}
            >
              {showAiKey ? "Verbergen" : "Anzeigen"}
            </Button>
            <Button
              buttonColor={theme.colors.primary}
              compact
              disabled={aiSaving}
              mode="contained"
              onPress={handleSaveAi}
            >
              {aiSaving ? (
                <ActivityIndicator color="#fff" size={14} />
              ) : (
                "Speichern"
              )}
            </Button>
          </View>
        </View>
      </List.Section>

      <Divider />

      <List.Section>
        <List.Subheader style={{ color: theme.colors.primary }}>
          Paperless
        </List.Subheader>
        <List.Item
          description="Quittungen automatisch archivieren"
          descriptionStyle={{ color: theme.colors.onSurface, opacity: 0.6 }}
          left={() => (
            <List.Icon
              color={theme.colors.primary}
              icon="file-document-multiple"
            />
          )}
          onPress={() => router.push("/paperless-settings")}
          right={() => <List.Icon icon="chevron-right" />}
          style={{
            backgroundColor: theme.colors.cardBackground,
            paddingLeft: 8,
          }}
          title="Paperless-ngx Verbindung"
          titleStyle={{ color: theme.colors.onSurface }}
        />
      </List.Section>

      {!familyMode &&
        (user?.role === "admin" || user?.role === "superadmin") && (
          <>
            <Divider />
            <List.Section>
              <List.Subheader style={{ color: theme.colors.primary }}>
                Administration
              </List.Subheader>
              <List.Item
                description="Benutzer & Einladungscodes verwalten"
                descriptionStyle={{
                  color: theme.colors.onSurface,
                  opacity: 0.6,
                }}
                left={() => (
                  <List.Icon color={theme.colors.primary} icon="shield-crown" />
                )}
                onPress={() => router.push("/admin")}
                right={() => <List.Icon icon="chevron-right" />}
                style={{
                  backgroundColor: theme.colors.cardBackground,
                  paddingLeft: 8,
                }}
                title="Admin-Bereich"
                titleStyle={{ color: theme.colors.onSurface }}
              />
            </List.Section>
          </>
        )}

      <List.Section>
        <List.Subheader>Rechtliches</List.Subheader>
        <List.Item
          left={() => (
            <List.Icon
              color={theme.colors.primary}
              icon="information-outline"
            />
          )}
          onPress={() => Linking.openURL(`${appUrl}/impressum`)}
          right={() => <List.Icon icon="open-in-new" />}
          style={{
            backgroundColor: theme.colors.cardBackground,
            paddingLeft: 8,
          }}
          title="Impressum"
          titleStyle={{ color: theme.colors.onSurface }}
        />
        <List.Item
          left={() => (
            <List.Icon
              color={theme.colors.primary}
              icon="shield-lock-outline"
            />
          )}
          onPress={() => Linking.openURL(`${appUrl}/datenschutz`)}
          right={() => <List.Icon icon="open-in-new" />}
          style={{
            backgroundColor: theme.colors.cardBackground,
            paddingLeft: 8,
          }}
          title="Datenschutzerklärung"
          titleStyle={{ color: theme.colors.onSurface }}
        />
      </List.Section>

      <View style={styles.logoutContainer}>
        <Button
          icon="logout"
          mode="outlined"
          onPress={handleLogout}
          style={{ borderColor: theme.colors.error }}
          textColor={theme.colors.error}
        >
          Abmelden
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 24 },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "#fff" },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    margin: 16,
    borderRadius: 16,
    elevation: 2,
  },
  profileInfo: { marginLeft: 16, flex: 1 },
  profileName: { fontSize: 18, fontWeight: "600" },
  profileEmail: { fontSize: 14, opacity: 0.7 },
  logoutContainer: { margin: 16, marginBottom: 40 },
  aiCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    elevation: 1,
  },
  aiRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  aiLabel: { fontSize: 14, fontWeight: "500" },
  aiInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
  },
});
