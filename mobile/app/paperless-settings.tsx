import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import type React from "react";
import { useEffect, useState } from "react";
import {
  TextInput as RNTextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Searchbar,
  Switch,
  Text,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { paperlessAPI } from "../src/services/api";
import { useAuthStore } from "../src/store/authStore";

type TabKey = "config" | "doctypes" | "correspondents" | "tags" | "users";

export default function PaperlessSettingsScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold } = useAuthStore();

  const [baseUrl, setBaseUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<TabKey>("config");
  const [search, setSearch] = useState({
    doctype: "",
    correspondent: "",
    tag: "",
    user: "",
  });
  const [newName, setNewName] = useState({
    doctype: "",
    correspondent: "",
    tag: "",
  });
  const [creating, setCreating] = useState({
    doctype: false,
    correspondent: false,
    tag: false,
  });
  const [tagColor, _setTagColor] = useState("#6B7280");

  const loadData = async (hid: string) => {
    const { data: d } = await paperlessAPI.getData(hid);
    setData(d);
  };

  useEffect(() => {
    if (!currentHousehold) {
      return;
    }
    paperlessAPI
      .getConfig(currentHousehold.id)
      .then(({ data: d }) => {
        if (d.config) {
          setBaseUrl(d.config.baseUrl || "");
          setIsActive(d.config.isActive);
          setHasConfig(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    loadData(currentHousehold.id).catch(() => {});
  }, [currentHousehold?.id]);

  const handleSave = async () => {
    if (!(currentHousehold && baseUrl.trim())) {
      Toast.show({ type: "error", text1: "Bitte URL eingeben" });
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
      setApiToken("");
      Toast.show({
        type: "success",
        text1: "Paperless-Verbindung gespeichert",
      });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: err.response?.data?.message || "Fehler beim Speichern",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!currentHousehold) {
      return;
    }
    setSyncing(true);
    try {
      const { data: d } = await paperlessAPI.sync(currentHousehold.id);
      await loadData(currentHousehold.id);
      Toast.show({
        type: "success",
        text1: "Synchronisiert",
        text2: `${d.synced.documentTypes} Typen · ${d.synced.correspondents} Korrespondenten · ${d.synced.tags} Tags`,
      });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: err.response?.data?.message || "Synchronisierung fehlgeschlagen",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleCreate = async (type: "doctype" | "correspondent" | "tag") => {
    if (!(currentHousehold && newName[type].trim())) {
      return;
    }
    setCreating((c) => ({ ...c, [type]: true }));
    try {
      if (type === "doctype") {
        await paperlessAPI.createDocType({
          householdId: currentHousehold.id,
          name: newName[type].trim(),
        });
      } else if (type === "correspondent") {
        await paperlessAPI.createCorrespondent({
          householdId: currentHousehold.id,
          name: newName[type].trim(),
        });
      } else {
        await paperlessAPI.createTag({
          householdId: currentHousehold.id,
          name: newName[type].trim(),
          color: tagColor,
        });
      }
      setNewName((n) => ({ ...n, [type]: "" }));
      await loadData(currentHousehold.id);
      Toast.show({ type: "success", text1: "Erstellt!" });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: err.response?.data?.error || "Fehler beim Erstellen",
      });
    } finally {
      setCreating((c) => ({ ...c, [type]: false }));
    }
  };

  const renderCreateRow = (type: "doctype" | "correspondent" | "tag") => (
    <View style={styles.createRow}>
      <RNTextInput
        autoCapitalize="words"
        onChangeText={(v) => setNewName((n) => ({ ...n, [type]: v }))}
        onSubmitEditing={() => handleCreate(type)}
        placeholder="Neu erstellen..."
        placeholderTextColor={`${theme.colors.onSurface}50`}
        returnKeyType="done"
        style={[
          styles.createInput,
          {
            color: theme.colors.onSurface,
            borderColor: `${theme.colors.primary}40`,
            backgroundColor: theme.colors.background,
          },
        ]}
        value={newName[type]}
      />
      <TouchableOpacity
        disabled={creating[type] || !newName[type].trim()}
        onPress={() => handleCreate(type)}
        style={[
          styles.createBtn,
          {
            backgroundColor: theme.colors.primary,
            opacity: creating[type] || !newName[type].trim() ? 0.4 : 1,
          },
        ]}
      >
        {creating[type] ? (
          <ActivityIndicator color="#fff" size={14} />
        ) : (
          <MaterialCommunityIcons color="#fff" name="plus" size={18} />
        )}
      </TouchableOpacity>
    </View>
  );

  const toggleUserEnabled = async (id: string, current: boolean) => {
    if (!currentHousehold) {
      return;
    }
    try {
      await paperlessAPI.toggleFavorite({
        type: "user",
        id,
        isFavorite: !current,
        isEnabled: !current,
      } as any);
      setData((prev: any) => ({
        ...prev,
        users: (prev.users || []).map((u: any) =>
          u.id === id ? { ...u, isEnabled: !current } : u
        ),
      }));
    } catch {
      Toast.show({ type: "error", text1: "Fehler beim Speichern" });
    }
  };

  const toggleFavorite = async (type: string, id: string, current: boolean) => {
    if (!currentHousehold) {
      return;
    }
    try {
      await paperlessAPI.toggleFavorite({ type, id, isFavorite: !current });
      setData((prev: any) => {
        const key =
          type === "doctype"
            ? "documentTypes"
            : type === "correspondent"
              ? "correspondents"
              : "tags";
        return {
          ...prev,
          [key]: prev[key].map((item: any) =>
            item.id === id ? { ...item, isFavorite: !current } : item
          ),
        };
      });
    } catch {
      Toast.show({ type: "error", text1: "Fehler beim Speichern" });
    }
  };

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: "config", label: "Verbindung", icon: "cog" },
    { key: "doctypes", label: "Typen", icon: "file-document" },
    { key: "correspondents", label: "Korrespondenten", icon: "account-group" },
    { key: "tags", label: "Tags", icon: "tag-multiple" },
    { key: "users", label: "Benutzer", icon: "account-check" },
  ];

  const renderList = (
    items: any[],
    type: string,
    searchKey: keyof typeof search,
    renderLabel: (item: any) => React.ReactNode
  ) => {
    const q = search[searchKey].toLowerCase();
    const filtered = q
      ? (items || []).filter((i: any) => i.name.toLowerCase().includes(q))
      : items || [];
    return (
      <View>
        <Searchbar
          iconColor={`${theme.colors.onSurface}60`}
          inputStyle={{
            fontSize: 14,
            color: theme.colors.onSurface,
            paddingLeft: 8,
          }}
          onChangeText={(v) => setSearch((s) => ({ ...s, [searchKey]: v }))}
          placeholder="Suchen..."
          placeholderTextColor={`${theme.colors.onSurface}50`}
          style={{
            marginBottom: 8,
            elevation: 0,
            borderWidth: 1,
            borderColor: `${theme.colors.primary}40`,
            backgroundColor: theme.colors.background,
          }}
          value={search[searchKey]}
        />
        {filtered.length === 0 ? (
          <Text
            style={{
              color: theme.colors.onSurface,
              opacity: 0.5,
              textAlign: "center",
              marginTop: 32,
            }}
          >
            {q ? "Keine Treffer" : "Noch keine Daten — zuerst synchronisieren"}
          </Text>
        ) : (
          filtered.map((item: any) => (
            <View
              key={item.id}
              style={[
                styles.listRow,
                { borderBottomColor: `${theme.colors.onSurface}15` },
              ]}
            >
              <View style={{ flex: 1 }}>{renderLabel(item)}</View>
              <TouchableOpacity
                onPress={() => toggleFavorite(type, item.id, item.isFavorite)}
                style={styles.starBtn}
              >
                <MaterialCommunityIcons
                  color={
                    item.isFavorite ? "#F59E0B" : `${theme.colors.onSurface}40`
                  }
                  name={item.isFavorite ? "star" : "star-outline"}
                  size={22}
                />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    );
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.primary,
            paddingTop: insets.top + 12,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Button
            compact
            icon="arrow-left"
            onPress={() => router.back()}
            textColor="#fff"
          >
            Zurück
          </Button>
          <Text style={styles.headerTitle}>Paperless-ngx</Text>
          <View style={{ width: 80 }} />
        </View>
        {/* Tabs */}
        <ScrollView
          contentContainerStyle={{
            gap: 6,
            paddingHorizontal: 8,
            paddingBottom: 4,
          }}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 8 }}
        >
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[
                styles.tabBtn,
                {
                  backgroundColor:
                    tab === t.key ? "#fff" : "rgba(255,255,255,0.15)",
                },
              ]}
            >
              <MaterialCommunityIcons
                color={tab === t.key ? theme.colors.primary : "#fff"}
                name={t.icon as any}
                size={14}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: tab === t.key ? theme.colors.primary : "#fff",
                  marginLeft: 4,
                }}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator
          color={theme.colors.primary}
          style={{ marginTop: 40 }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 80,
          }}
        >
          {tab === "config" && (
            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.cardBackground },
              ]}
            >
              <Text
                style={[styles.sectionLabel, { color: theme.colors.primary }]}
              >
                Verbindung konfigurieren
              </Text>

              <Text style={[styles.label, { color: theme.colors.onSurface }]}>
                Server-URL
              </Text>
              <RNTextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={setBaseUrl}
                placeholder="https://paperless.example.com"
                placeholderTextColor={`${theme.colors.onSurface}60`}
                style={[
                  styles.input,
                  {
                    color: theme.colors.onSurface,
                    borderColor: `${theme.colors.primary}40`,
                    backgroundColor: theme.colors.background,
                  },
                ]}
                value={baseUrl}
              />

              <Text style={[styles.label, { color: theme.colors.onSurface }]}>
                API Token
              </Text>
              <RNTextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setApiToken}
                placeholder={
                  hasConfig
                    ? "Neuen Token eingeben (optional)"
                    : "API Token eingeben"
                }
                placeholderTextColor={`${theme.colors.onSurface}60`}
                secureTextEntry
                style={[
                  styles.input,
                  {
                    color: theme.colors.onSurface,
                    borderColor: `${theme.colors.primary}40`,
                    backgroundColor: theme.colors.background,
                  },
                ]}
                value={apiToken}
              />

              <View style={styles.switchRow}>
                <Text style={{ color: theme.colors.onSurface, fontSize: 15 }}>
                  Verbindung aktiv
                </Text>
                <Switch
                  color={theme.colors.primary}
                  onValueChange={setIsActive}
                  value={isActive}
                />
              </View>

              <Button
                buttonColor={theme.colors.primary}
                disabled={saving}
                icon="content-save"
                mode="contained"
                onPress={handleSave}
                style={{ marginTop: 16 }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size={16} />
                ) : (
                  "Speichern"
                )}
              </Button>

              {hasConfig && (
                <Button
                  disabled={syncing}
                  icon="sync"
                  mode="outlined"
                  onPress={handleSync}
                  style={{ marginTop: 12 }}
                >
                  {syncing ? (
                    <ActivityIndicator color={theme.colors.primary} size={16} />
                  ) : (
                    "Von Paperless synchronisieren"
                  )}
                </Button>
              )}

              {hasConfig && (
                <Text
                  style={{
                    color: theme.colors.onSurface,
                    opacity: 0.5,
                    fontSize: 12,
                    marginTop: 12,
                    textAlign: "center",
                  }}
                >
                  Tipp: Synchronisiere und markiere Favoriten ⭐ — diese stehen
                  beim Quittungs-Upload zur Auswahl.
                </Text>
              )}
            </View>
          )}

          {tab === "doctypes" && (
            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.cardBackground },
              ]}
            >
              <Text
                style={[styles.sectionLabel, { color: theme.colors.primary }]}
              >
                Dokumententypen ({data?.documentTypes?.length || 0})
              </Text>
              {renderList(
                data?.documentTypes || [],
                "doctype",
                "doctype",
                (item) => (
                  <Text style={{ color: theme.colors.onSurface, fontSize: 15 }}>
                    {item.name}
                  </Text>
                )
              )}
              {hasConfig && renderCreateRow("doctype")}
            </View>
          )}

          {tab === "correspondents" && (
            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.cardBackground },
              ]}
            >
              <Text
                style={[styles.sectionLabel, { color: theme.colors.primary }]}
              >
                Korrespondenten ({data?.correspondents?.length || 0})
              </Text>
              {renderList(
                data?.correspondents || [],
                "correspondent",
                "correspondent",
                (item) => (
                  <Text style={{ color: theme.colors.onSurface, fontSize: 15 }}>
                    {item.name}
                  </Text>
                )
              )}
              {hasConfig && renderCreateRow("correspondent")}
            </View>
          )}

          {tab === "tags" && (
            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.cardBackground },
              ]}
            >
              <Text
                style={[styles.sectionLabel, { color: theme.colors.primary }]}
              >
                Tags ({data?.tags?.length || 0})
              </Text>
              {renderList(data?.tags || [], "tag", "tag", (item) => (
                <View
                  style={[
                    styles.tagChip,
                    { backgroundColor: item.color || "#9CA3AF" },
                  ]}
                >
                  <Text
                    style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}
                  >
                    {item.name}
                  </Text>
                </View>
              ))}
              {hasConfig && renderCreateRow("tag")}
            </View>
          )}

          {tab === "users" && (
            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.cardBackground },
              ]}
            >
              <Text
                style={[styles.sectionLabel, { color: theme.colors.primary }]}
              >
                Benutzer ({data?.users?.length || 0})
              </Text>
              <Text
                style={{
                  color: theme.colors.onSurface,
                  opacity: 0.55,
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                Deaktivierte Benutzer stehen beim Upload nicht zur Auswahl.
              </Text>
              <Searchbar
                iconColor={`${theme.colors.onSurface}60`}
                inputStyle={{
                  fontSize: 14,
                  color: theme.colors.onSurface,
                  paddingLeft: 8,
                }}
                onChangeText={(v) => setSearch((s) => ({ ...s, user: v }))}
                placeholder="Suchen..."
                placeholderTextColor={`${theme.colors.onSurface}50`}
                style={{
                  marginBottom: 8,
                  elevation: 0,
                  borderWidth: 1,
                  borderColor: `${theme.colors.primary}40`,
                  backgroundColor: theme.colors.background,
                }}
                value={search.user}
              />
              {(data?.users || [])
                .filter((u: any) => {
                  const q = search.user.toLowerCase();
                  return (
                    !q ||
                    u.fullName?.toLowerCase().includes(q) ||
                    u.username?.toLowerCase().includes(q)
                  );
                })
                .map((u: any) => (
                  <View
                    key={u.id}
                    style={[
                      styles.listRow,
                      { borderBottomColor: `${theme.colors.onSurface}15` },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: u.isEnabled
                            ? theme.colors.onSurface
                            : `${theme.colors.onSurface}50`,
                          fontSize: 15,
                          textDecorationLine: u.isEnabled
                            ? "none"
                            : "line-through",
                        }}
                      >
                        {u.fullName || u.username}
                      </Text>
                      {u.fullName && u.username !== u.fullName && (
                        <Text
                          style={{
                            color: `${theme.colors.onSurface}55`,
                            fontSize: 12,
                          }}
                        >
                          @{u.username}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => toggleUserEnabled(u.id, u.isEnabled)}
                      style={styles.starBtn}
                    >
                      <MaterialCommunityIcons
                        color={
                          u.isEnabled
                            ? "#22C55E"
                            : `${theme.colors.onSurface}30`
                        }
                        name={u.isEnabled ? "account-check" : "account-cancel"}
                        size={22}
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              {(data?.users || []).length === 0 && (
                <Text
                  style={{
                    color: theme.colors.onSurface,
                    opacity: 0.5,
                    textAlign: "center",
                    marginTop: 32,
                  }}
                >
                  Noch keine Benutzer — zuerst synchronisieren
                </Text>
              )}
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 18, fontWeight: "600", color: "#fff" },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  card: { borderRadius: 16, padding: 16, elevation: 2, marginBottom: 12 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  label: { fontSize: 14, fontWeight: "500", marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 4,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  starBtn: { padding: 4 },
  tagChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  createInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  createBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
});
