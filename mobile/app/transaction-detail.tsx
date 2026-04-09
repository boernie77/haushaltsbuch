import { MaterialCommunityIcons } from "@expo/vector-icons";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Modal as RNModal,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Chip,
  IconButton,
  Modal,
  Portal,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import {
  categoryAPI,
  IMAGE_BASE_URL,
  paperlessAPI,
  transactionAPI,
} from "../src/services/api";
import { useAuthStore } from "../src/store/authStore";

export default function TransactionDetailScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentHousehold } = useAuthStore();

  const [transaction, setTransaction] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState(false);
  const [paperlessData, setPaperlessData] = useState<any>(null);
  const [showPaperlessModal, setShowPaperlessModal] = useState(false);
  const [paperlessDocType, setPaperlessDocType] = useState<any>(null);
  const [paperlessCorrespondent, setPaperlessCorrespondent] =
    useState<any>(null);
  const [paperlessTags, setPaperlessTags] = useState<any[]>([]);
  const [paperlessOwner, setPaperlessOwner] = useState<any>(null);
  const [paperlessViewUsers, setPaperlessViewUsers] = useState<any[]>([]);
  const [uploadingPaperless, setUploadingPaperless] = useState(false);
  const [hasPaperless, setHasPaperless] = useState(false);

  useEffect(() => {
    if (!(id && currentHousehold)) {
      return;
    }
    Promise.all([
      transactionAPI.getAll({
        householdId: currentHousehold.id,
        page: 1,
        limit: 200,
      }),
      categoryAPI.getAll(currentHousehold.id),
      paperlessAPI
        .getConfig(currentHousehold.id)
        .then((r) => setHasPaperless(!!r.data?.config?.isActive))
        .catch(() => {}),
    ])
      .then(([txRes, catRes]) => {
        const tx = txRes.data.transactions?.find((t: any) => t.id === id);
        if (tx) {
          setTransaction(tx);
          setAmount(String(tx.amount));
          setDescription(tx.description || "");
          setMerchant(tx.merchant || "");
          setDate(tx.date);
          setCategoryId(tx.categoryId || null);
        }
        setCategories(catRes.data.categories || []);
      })
      .catch(() => {
        Toast.show({
          type: "error",
          text1: "Buchung konnte nicht geladen werden",
        });
      })
      .finally(() => setLoading(false));
  }, [id, currentHousehold?.id]);

  const handleSave = async () => {
    if (!(id && amount)) {
      return;
    }
    setSaving(true);
    try {
      await transactionAPI.update(id, {
        amount: Number.parseFloat(amount),
        description,
        merchant,
        date,
        categoryId,
      });
      Toast.show({ type: "success", text1: "Buchung aktualisiert" });
      setEditing(false);
      router.back();
    } catch {
      Toast.show({ type: "error", text1: "Fehler beim Speichern" });
    } finally {
      setSaving(false);
    }
  };

  const openPaperlessModal = async () => {
    if (!currentHousehold) {
      return;
    }
    let pd = paperlessData;
    if (!pd) {
      try {
        const { data } = await paperlessAPI.getData(currentHousehold.id);
        pd = {
          documentTypes: (data.documentTypes || []).filter(
            (i: any) => i.isFavorite
          ),
          correspondents: (data.correspondents || []).filter(
            (i: any) => i.isFavorite
          ),
          tags: (data.tags || []).filter((i: any) => i.isFavorite),
          users: (data.users || []).filter((u: any) => u.isEnabled),
        };
        setPaperlessData(pd);
      } catch {}
    }
    // Vorauswahl aus gespeicherter Metadata wiederherstellen
    if (
      pd &&
      transaction?.paperlessMetadata &&
      !paperlessDocType &&
      !paperlessCorrespondent &&
      !paperlessTags.length
    ) {
      try {
        const meta = JSON.parse(transaction.paperlessMetadata);
        if (meta.documentTypeId) {
          setPaperlessDocType(
            pd.documentTypes.find((x: any) => x.id === meta.documentTypeId) ||
              null
          );
        }
        if (meta.correspondentId) {
          setPaperlessCorrespondent(
            pd.correspondents.find((x: any) => x.id === meta.correspondentId) ||
              null
          );
        }
        if (meta.tagIds) {
          const ids = JSON.parse(meta.tagIds);
          setPaperlessTags(pd.tags.filter((x: any) => ids.includes(x.id)));
        }
        if (meta.ownerPaperlessUserId) {
          setPaperlessOwner(
            pd.users.find(
              (u: any) => String(u.paperlessId) === meta.ownerPaperlessUserId
            ) || null
          );
        }
        if (meta.viewPaperlessUserIds) {
          const ids = JSON.parse(meta.viewPaperlessUserIds);
          setPaperlessViewUsers(
            pd.users.filter((u: any) => ids.includes(String(u.paperlessId)))
          );
        }
      } catch {}
    }
    setShowPaperlessModal(true);
  };

  const handlePaperlessUpload = async () => {
    if (!transaction) {
      return;
    }
    setUploadingPaperless(true);
    try {
      await paperlessAPI.upload({
        transactionId: transaction.id,
        documentTypeId: paperlessDocType?.id,
        correspondentId: paperlessCorrespondent?.id,
        tagIds: JSON.stringify(paperlessTags.map((t: any) => t.id)),
        title:
          transaction.description ||
          transaction.merchant ||
          `Quittung ${transaction.date}`,
        ownerPaperlessUserId: paperlessOwner
          ? String(paperlessOwner.paperlessId)
          : undefined,
        viewPaperlessUserIds: paperlessViewUsers.length
          ? JSON.stringify(paperlessViewUsers.map((u: any) => u.paperlessId))
          : undefined,
      });
      Toast.show({ type: "success", text1: "📄 An Paperless übertragen" });
      setShowPaperlessModal(false);
    } catch {
      Toast.show({ type: "error", text1: "Paperless-Upload fehlgeschlagen" });
    } finally {
      setUploadingPaperless(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Buchung löschen", "Diese Buchung wirklich löschen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          try {
            // biome-ignore lint/style/noNonNullAssertion: id is always defined here
            await transactionAPI.delete(id!);
            Toast.show({ type: "success", text1: "Buchung gelöscht" });
            router.back();
          } catch {
            Toast.show({ type: "error", text1: "Fehler beim Löschen" });
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View
        style={[styles.centered, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  if (!transaction) {
    return (
      <View
        style={[styles.centered, { backgroundColor: theme.colors.background }]}
      >
        <Text style={{ color: theme.colors.onSurface }}>
          Buchung nicht gefunden
        </Text>
        <Button onPress={() => router.back()} style={{ marginTop: 12 }}>
          Zurück
        </Button>
      </View>
    );
  }

  const _selectedCategory = categories.find((c) => c.id === categoryId);

  const receiptUrl = transaction?.receiptImage
    ? IMAGE_BASE_URL + transaction.receiptImage
    : null;

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
          <Text style={styles.headerTitle}>Buchung</Text>
          <Button
            compact
            icon={editing ? "close" : "pencil"}
            onPress={() => setEditing(!editing)}
            textColor="#fff"
          >
            {editing ? "Abbrechen" : "Bearbeiten"}
          </Button>
        </View>
      </View>

      {/* Vollbild-Modal mit Zoom */}
      <RNModal
        animationType="fade"
        onRequestClose={() => setFullscreenImage(false)}
        transparent
        visible={fullscreenImage && !!receiptUrl}
      >
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          <ScrollView
            bouncesZoom
            centerContent
            contentContainerStyle={{
              width: Dimensions.get("window").width,
              height: Dimensions.get("window").height,
            }}
            maximumZoomScale={5}
            minimumZoomScale={1}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
          >
            <Image
              resizeMode="contain"
              // biome-ignore lint/style/noNonNullAssertion: receiptUrl is always defined here
              source={{ uri: receiptUrl! }}
              style={{
                width: Dimensions.get("window").width,
                height: Dimensions.get("window").height,
              }}
            />
          </ScrollView>
          <IconButton
            icon="close"
            iconColor="#000"
            onPress={() => setFullscreenImage(false)}
            size={28}
            style={{
              position: "absolute",
              top: (StatusBar.currentHeight ?? 44) + 8,
              right: 8,
              backgroundColor: "rgba(0,0,0,0.12)",
            }}
          />
        </View>
      </RNModal>

      {/* Paperless-Upload Modal */}
      <Portal>
        <Modal
          contentContainerStyle={[
            styles.paperlessModal,
            { backgroundColor: theme.colors.surface },
          ]}
          onDismiss={() => setShowPaperlessModal(false)}
          visible={showPaperlessModal}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            📄 Zu Paperless hochladen
          </Text>
          {paperlessData ? (
            <>
              {paperlessData.documentTypes.length > 0 && (
                <>
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Dokumententyp
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 10 }}
                  >
                    {paperlessData.documentTypes.map((dt: any) => (
                      <Chip
                        key={dt.id}
                        onPress={() =>
                          setPaperlessDocType(
                            paperlessDocType?.id === dt.id ? null : dt
                          )
                        }
                        selected={paperlessDocType?.id === dt.id}
                        style={{ marginRight: 8 }}
                      >
                        {dt.name}
                      </Chip>
                    ))}
                  </ScrollView>
                </>
              )}
              {paperlessData.correspondents.length > 0 && (
                <>
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Korrespondent
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 10 }}
                  >
                    {paperlessData.correspondents.map((c: any) => (
                      <Chip
                        key={c.id}
                        onPress={() =>
                          setPaperlessCorrespondent(
                            paperlessCorrespondent?.id === c.id ? null : c
                          )
                        }
                        selected={paperlessCorrespondent?.id === c.id}
                        style={{ marginRight: 8 }}
                      >
                        {c.name}
                      </Chip>
                    ))}
                  </ScrollView>
                </>
              )}
              {paperlessData.tags.length > 0 && (
                <>
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Tags
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 16 }}
                  >
                    {paperlessData.tags.map((t: any) => (
                      <Chip
                        key={t.id}
                        onPress={() => {
                          const exists = paperlessTags.some(
                            (pt: any) => pt.id === t.id
                          );
                          setPaperlessTags(
                            exists
                              ? paperlessTags.filter(
                                  (pt: any) => pt.id !== t.id
                                )
                              : [...paperlessTags, t]
                          );
                        }}
                        selected={paperlessTags.some(
                          (pt: any) => pt.id === t.id
                        )}
                        style={{ marginRight: 8 }}
                      >
                        {t.name}
                      </Chip>
                    ))}
                  </ScrollView>
                </>
              )}
              {(paperlessData.users?.length ?? 0) > 0 && (
                <>
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Eigentümer
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 10 }}
                  >
                    <Chip
                      onPress={() => setPaperlessOwner(null)}
                      selected={!paperlessOwner}
                      style={{ marginRight: 8 }}
                    >
                      Standard
                    </Chip>
                    {paperlessData.users.map((u: any) => (
                      <Chip
                        key={u.id}
                        onPress={() =>
                          setPaperlessOwner(
                            paperlessOwner?.id === u.id ? null : u
                          )
                        }
                        selected={paperlessOwner?.id === u.id}
                        style={{ marginRight: 8 }}
                      >
                        {u.fullName || u.username}
                      </Chip>
                    ))}
                  </ScrollView>
                </>
              )}
              {(paperlessData.users?.length ?? 0) > 1 && (
                <>
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Sichtbar für
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 16 }}
                  >
                    {paperlessData.users.map((u: any) => (
                      <Chip
                        key={u.id}
                        onPress={() => {
                          const exists = paperlessViewUsers.some(
                            (v: any) => v.id === u.id
                          );
                          setPaperlessViewUsers(
                            exists
                              ? paperlessViewUsers.filter(
                                  (v: any) => v.id !== u.id
                                )
                              : [...paperlessViewUsers, u]
                          );
                        }}
                        selected={paperlessViewUsers.some(
                          (v: any) => v.id === u.id
                        )}
                        style={{ marginRight: 8 }}
                      >
                        {u.fullName || u.username}
                      </Chip>
                    ))}
                  </ScrollView>
                </>
              )}
              <Button
                buttonColor={theme.colors.primary}
                disabled={uploadingPaperless}
                icon="upload"
                loading={uploadingPaperless}
                mode="contained"
                onPress={handlePaperlessUpload}
              >
                Hochladen
              </Button>
            </>
          ) : (
            <ActivityIndicator
              color={theme.colors.primary}
              style={{ marginVertical: 20 }}
            />
          )}
        </Modal>
      </Portal>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {editing ? (
          /* Edit mode */
          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.cardBackground },
            ]}
          >
            <TextInput
              keyboardType="decimal-pad"
              label="Betrag (€)"
              mode="outlined"
              onChangeText={setAmount}
              style={styles.input}
              value={amount}
            />
            <TextInput
              label="Beschreibung"
              mode="outlined"
              onChangeText={setDescription}
              style={styles.input}
              value={description}
            />
            <TextInput
              label="Händler"
              mode="outlined"
              onChangeText={setMerchant}
              style={styles.input}
              value={merchant}
            />
            <TextInput
              label="Datum (YYYY-MM-DD)"
              mode="outlined"
              onChangeText={setDate}
              style={styles.input}
              value={date}
            />

            <Text
              style={[
                styles.rowLabel,
                { color: theme.colors.onSurface, marginBottom: 8 },
              ]}
            >
              Kategorie
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 16 }}
            >
              {categories.map((cat) => (
                <Chip
                  key={cat.id}
                  onPress={() =>
                    setCategoryId(categoryId === cat.id ? null : cat.id)
                  }
                  selected={categoryId === cat.id}
                  selectedColor={theme.colors.primary}
                  style={{ marginRight: 8 }}
                >
                  {cat.icon} {cat.nameDE || cat.name}
                </Chip>
              ))}
            </ScrollView>

            <Button
              buttonColor={theme.colors.primary}
              disabled={saving}
              icon="content-save"
              mode="contained"
              onPress={handleSave}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size={16} />
              ) : (
                "Speichern"
              )}
            </Button>
          </View>
        ) : (
          /* View mode */
          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.cardBackground },
            ]}
          >
            <View style={styles.amountRow}>
              <Text style={[styles.categoryIcon]}>
                {transaction.Category?.icon || "📦"}
              </Text>
              <Text
                style={[
                  styles.amount,
                  {
                    color:
                      transaction.type === "income"
                        ? theme.colors.incomeColor
                        : theme.colors.expenseColor,
                  },
                ]}
              >
                {transaction.type === "income" ? "+" : "-"}
                {Number.parseFloat(transaction.amount).toFixed(2)} €
              </Text>
            </View>

            {[
              {
                label: "Datum",
                value: format(new Date(transaction.date), "dd. MMMM yyyy", {
                  locale: de,
                }),
              },
              { label: "Beschreibung", value: transaction.description },
              { label: "Händler", value: transaction.merchant },
              {
                label: "Kategorie",
                value: transaction.Category
                  ? `${transaction.Category.icon} ${transaction.Category.nameDE || transaction.Category.name}`
                  : null,
              },
              {
                label: "Typ",
                value:
                  transaction.type === "income" ? "💰 Einnahme" : "💸 Ausgabe",
              },
            ]
              .filter((row) => row.value)
              .map((row) => (
                <View key={row.label} style={styles.row}>
                  <Text
                    style={[styles.rowLabel, { color: theme.colors.onSurface }]}
                  >
                    {row.label}
                  </Text>
                  <Text
                    style={[styles.rowValue, { color: theme.colors.onSurface }]}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}

            {transaction.receiptImage && (
              <View style={{ marginTop: 16 }}>
                <Text
                  style={[
                    styles.rowLabel,
                    { color: theme.colors.onSurface, marginBottom: 8 },
                  ]}
                >
                  Quittung
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setFullscreenImage(true)}
                >
                  <Image
                    resizeMode="cover"
                    source={{ uri: IMAGE_BASE_URL + transaction.receiptImage }}
                    style={styles.receiptThumb}
                  />
                  <View style={styles.fullscreenHint}>
                    <MaterialCommunityIcons
                      color="#fff"
                      name="magnify-plus-outline"
                      size={16}
                    />
                    <Text
                      style={{ color: "#fff", fontSize: 12, marginLeft: 4 }}
                    >
                      Tippen zum Vergrößern
                    </Text>
                  </View>
                </TouchableOpacity>
                {hasPaperless && !transaction.paperlessDocId && (
                  <Button
                    icon="file-document-outline"
                    mode="outlined"
                    onPress={openPaperlessModal}
                    style={{
                      marginTop: 8,
                      borderColor: `${theme.colors.primary}60`,
                    }}
                    textColor={theme.colors.primary}
                  >
                    Zu Paperless hochladen
                  </Button>
                )}
                {transaction.paperlessDocId && (
                  <Text
                    style={{
                      color: theme.colors.primary,
                      fontSize: 13,
                      marginTop: 6,
                      textAlign: "center",
                    }}
                  >
                    ✅ In Paperless gespeichert
                  </Text>
                )}
              </View>
            )}

            <Button
              icon="delete"
              mode="outlined"
              onPress={handleDelete}
              style={[styles.deleteButton, { borderColor: theme.colors.error }]}
              textColor={theme.colors.error}
            >
              Buchung löschen
            </Button>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { paddingHorizontal: 8, paddingBottom: 12 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 18, fontWeight: "600", color: "#fff" },
  card: { borderRadius: 16, padding: 20, elevation: 2 },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  categoryIcon: { fontSize: 40 },
  amount: { fontSize: 36, fontWeight: "bold" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  rowLabel: { opacity: 0.6, fontSize: 14 },
  rowValue: {
    fontSize: 14,
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  deleteButton: { marginTop: 20 },
  input: { marginBottom: 12 },
  receiptThumb: { width: "100%", height: 200, borderRadius: 12 },
  fullscreenHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    paddingVertical: 5,
  },
  paperlessModal: { margin: 20, padding: 20, borderRadius: 16 },
  modalTitle: { fontSize: 17, fontWeight: "600", marginBottom: 14 },
  chipLabel: { fontSize: 12, opacity: 0.6, marginBottom: 6, fontWeight: "500" },
});
