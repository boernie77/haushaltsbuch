import { MaterialCommunityIcons } from "@expo/vector-icons";
import { format } from "date-fns";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Chip,
  IconButton,
  List,
  Modal,
  Portal,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import {
  categoryAPI,
  ocrAPI,
  paperlessAPI,
  transactionAPI,
} from "../../src/services/api";
import { isNetworkError, offlineQueue } from "../../src/services/offlineStore";
import { useAuthStore } from "../../src/store/authStore";

export default function AddTransactionScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold } = useAuthStore();

  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [tip, setTip] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState<
    "weekly" | "monthly" | "yearly"
  >("monthly");
  const [recurringEndDate, setRecurringEndDate] = useState("");
  const [paperlessUsers, setPaperlessUsers] = useState<any[]>([]);
  const [ownerPaperlessUserId, setOwnerPaperlessUserId] = useState<
    string | null
  >(null);
  const [viewPaperlessUserIds, setViewPaperlessUserIds] = useState<string[]>(
    []
  );
  const [paperlessData, setPaperlessData] = useState<any>(null);
  const [paperlessDocType, setPaperlessDocType] = useState<any>(null);
  const [paperlessCorrespondent, setPaperlessCorrespondent] =
    useState<any>(null);
  const [paperlessTags, setPaperlessTags] = useState<any[]>([]);

  useEffect(() => {
    if (currentHousehold) {
      categoryAPI
        .getAll(currentHousehold.id)
        .then(({ data }) => setCategories(data.categories));
    }
  }, [currentHousehold]);

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Keine Berechtigung", "Kamerazugriff wird benötigt.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: false,
      allowsEditing: false,
    });
    if (!result.canceled) {
      setReceiptImage(result.assets[0].uri);
      analyzeReceipt(result.assets[0].uri);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) {
      setReceiptImage(result.assets[0].uri);
      analyzeReceipt(result.assets[0].uri);
    }
  };

  const discardReceipt = () => {
    setReceiptImage(null);
    setPaperlessData(null);
    setPaperlessDocType(null);
    setPaperlessCorrespondent(null);
    setPaperlessTags([]);
  };

  const analyzeReceipt = async (uri: string) => {
    setOcrLoading(true);
    try {
      const { data } = await ocrAPI.analyze(uri, currentHousehold?.id);
      const r = data.result;
      if (r.amount) {
        setAmount(Number.parseFloat(r.amount).toFixed(2));
      }
      if (r.merchant) {
        setMerchant(r.merchant);
      }
      if (r.description) {
        setDescription(r.description);
      }
      if (r.date) {
        setDate(r.date);
      }
      if (r.categoryId) {
        const cat = categories.find((c) => c.id === r.categoryId);
        if (cat) {
          setSelectedCategory(cat);
        }
      }
      Toast.show({
        type: "success",
        text1: "✅ Quittung analysiert",
        text2: `Erkannte Kategorie: ${r.confidence}% Sicherheit`,
      });
    } catch (_err) {
      Toast.show({
        type: "error",
        text1: "OCR fehlgeschlagen",
        text2: "Bitte manuell eingeben",
      });
    } finally {
      setOcrLoading(false);
    }
  };

  const loadPaperlessData = async () => {
    if (!currentHousehold || paperlessData) {
      return;
    }
    try {
      const { data } = await paperlessAPI.getData(currentHousehold.id);
      setPaperlessData({
        documentTypes: (data.documentTypes || []).filter(
          (i: any) => i.isFavorite
        ),
        correspondents: (data.correspondents || []).filter(
          (i: any) => i.isFavorite
        ),
        tags: (data.tags || []).filter((i: any) => i.isFavorite),
      });
      setPaperlessUsers((data.users || []).filter((u: any) => u.isEnabled));
    } catch {}
  };

  const handleSave = async () => {
    if (!(amount && currentHousehold)) {
      Toast.show({ type: "error", text1: "Bitte Betrag eingeben" });
      return;
    }
    setSaving(true);
    try {
      const tipAmount = Number.parseFloat(tip || "0") || 0;
      const totalAmount = Number.parseFloat(amount || "0") + tipAmount;
      const form = new FormData();
      form.append("amount", String(totalAmount));
      if (tipAmount > 0) {
        form.append("tip", String(tipAmount));
      }
      form.append("description", description);
      form.append("merchant", merchant);
      form.append("date", date);
      form.append("type", type);
      form.append("householdId", currentHousehold.id);
      if (selectedCategory) {
        form.append("categoryId", selectedCategory.id);
      }
      if (receiptImage) {
        form.append("receipt", {
          uri: receiptImage,
          type: "image/jpeg",
          name: "receipt.jpg",
        } as any);
      }
      if (isRecurring) {
        form.append("isRecurring", "true");
        form.append("recurringInterval", recurringInterval);
        if (recurringEndDate) {
          form.append("recurringEndDate", recurringEndDate);
        }
      }

      const { data } = await transactionAPI.create(form);

      // Upload to Paperless if configured
      if (
        receiptImage &&
        (paperlessDocType || paperlessCorrespondent || paperlessTags.length > 0)
      ) {
        try {
          await paperlessAPI.upload({
            transactionId: data.transaction.id,
            documentTypeId: paperlessDocType?.id,
            correspondentId: paperlessCorrespondent?.id,
            tagIds: JSON.stringify(paperlessTags.map((t: any) => t.id)),
            title: description || merchant || `Quittung ${date}`,
            ownerPaperlessUserId: ownerPaperlessUserId || undefined,
            viewPaperlessUserIds: viewPaperlessUserIds.length
              ? JSON.stringify(viewPaperlessUserIds)
              : undefined,
          });
          Toast.show({ type: "success", text1: "📄 An Paperless übertragen" });
        } catch {}
      }

      // Budget warning
      if (data.budgetWarning) {
        const w = data.budgetWarning[0];
        Toast.show({
          type: "error",
          text1: w.isOver ? "⚠️ Budget überschritten!" : "⚠️ Budget-Warnung",
          text2: `${Math.round(w.percentage)}% des Budgets verbraucht`,
          visibilityTime: 5000,
        });
      }

      Toast.show({ type: "success", text1: "Buchung gespeichert" });
      router.replace("/(tabs)");
    } catch (err: any) {
      if (isNetworkError(err) && !receiptImage) {
        // Offline: nur ohne Foto in Queue speichern
        await offlineQueue.add({
          amount,
          description,
          merchant,
          date,
          type,
          categoryId: selectedCategory?.id || null,
          householdId: currentHousehold.id,
        });
        Toast.show({
          type: "info",
          text1: "Offline gespeichert",
          text2: "Wird synchronisiert wenn du wieder online bist",
        });
        router.replace("/(tabs)");
      } else {
        Toast.show({
          type: "error",
          text1: "Fehler beim Speichern",
          text2: err.message,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.colors.primary,
              paddingTop: insets.top + 12,
            },
          ]}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons color="#fff" name="arrow-left" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Neue Buchung</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.content}>
          {/* Type */}
          <SegmentedButtons
            buttons={[
              { value: "expense", label: "💸 Ausgabe", icon: "minus-circle" },
              { value: "income", label: "💰 Einnahme", icon: "plus-circle" },
            ]}
            onValueChange={setType}
            style={styles.segmented}
            value={type}
          />

          {/* Amount */}
          <TextInput
            keyboardType="decimal-pad"
            label={
              tip && Number.parseFloat(tip) > 0
                ? `Betrag (€) — Gesamt: ${(Number.parseFloat(amount || "0") + Number.parseFloat(tip)).toFixed(2)} €`
                : "Betrag (€)"
            }
            left={<TextInput.Icon icon="currency-eur" />}
            mode="outlined"
            onChangeText={setAmount}
            style={styles.input}
            value={amount}
          />

          {/* Tip (only for expenses) */}
          {type === "expense" && (
            <TextInput
              keyboardType="decimal-pad"
              label="Trinkgeld (€)"
              left={<TextInput.Icon icon="hand-coin-outline" />}
              mode="outlined"
              onChangeText={setTip}
              style={styles.input}
              value={tip}
            />
          )}

          {/* Description */}
          <TextInput
            label="Beschreibung"
            left={<TextInput.Icon icon="text" />}
            mode="outlined"
            onChangeText={setDescription}
            style={styles.input}
            value={description}
          />

          {/* Merchant */}
          <TextInput
            label="Händler / Geschäft"
            left={<TextInput.Icon icon="store" />}
            mode="outlined"
            onChangeText={setMerchant}
            style={styles.input}
            value={merchant}
          />

          {/* Date */}
          <TextInput
            label="Datum (YYYY-MM-DD)"
            left={<TextInput.Icon icon="calendar" />}
            mode="outlined"
            onChangeText={setDate}
            style={styles.input}
            value={date}
          />

          {/* Wiederkehrende Buchung */}
          <View style={styles.recurringRow}>
            <MaterialCommunityIcons
              color={theme.colors.primary}
              name="repeat"
              size={18}
            />
            <Text
              style={[
                styles.label,
                {
                  color: theme.colors.onSurface,
                  marginTop: 0,
                  marginBottom: 0,
                  marginLeft: 8,
                  flex: 1,
                },
              ]}
            >
              Wiederkehrende Buchung
            </Text>
            <Switch
              color={theme.colors.primary}
              onValueChange={setIsRecurring}
              value={isRecurring}
            />
          </View>
          {isRecurring && (
            <>
              <View style={styles.chipRow}>
                {(["weekly", "monthly", "yearly"] as const).map((iv) => (
                  <Chip
                    key={iv}
                    onPress={() => setRecurringInterval(iv)}
                    selected={recurringInterval === iv}
                    selectedColor={theme.colors.primary}
                    style={{ marginRight: 8 }}
                  >
                    {iv === "weekly"
                      ? "Wöchentlich"
                      : iv === "monthly"
                        ? "Monatlich"
                        : "Jährlich"}
                  </Chip>
                ))}
              </View>
              <TextInput
                label="Enddatum (optional, YYYY-MM-DD)"
                left={<TextInput.Icon icon="calendar-end" />}
                mode="outlined"
                onChangeText={setRecurringEndDate}
                style={styles.input}
                value={recurringEndDate}
              />
            </>
          )}

          {/* Category */}
          <TouchableOpacity
            onPress={() => setShowCategories(true)}
            style={[
              styles.categoryPicker,
              {
                borderColor: theme.colors.outline,
                borderRadius: theme.roundness,
              },
            ]}
          >
            <Text style={{ color: theme.colors.onSurface }}>
              {selectedCategory
                ? `${selectedCategory.icon} ${selectedCategory.nameDE || selectedCategory.name}`
                : "Kategorie wählen..."}
            </Text>
            <MaterialCommunityIcons
              color={theme.colors.onSurface}
              name="chevron-down"
              size={20}
            />
          </TouchableOpacity>

          {/* Receipt Image */}
          <View style={styles.receiptSection}>
            <Text
              style={[styles.sectionLabel, { color: theme.colors.onSurface }]}
            >
              Quittung
            </Text>
            {ocrLoading && (
              <View style={styles.ocrLoading}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={{ color: theme.colors.onSurface, marginLeft: 8 }}>
                  Analysiere Quittung mit KI...
                </Text>
              </View>
            )}
            {receiptImage && (
              <>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setFullscreenImage(receiptImage)}
                >
                  <Image
                    resizeMode="cover"
                    source={{ uri: receiptImage }}
                    style={styles.receiptImage}
                  />
                  <View style={styles.fullscreenHint}>
                    <MaterialCommunityIcons
                      color="#fff"
                      name="magnify-plus-outline"
                      size={18}
                    />
                    <Text
                      style={{ color: "#fff", fontSize: 12, marginLeft: 4 }}
                    >
                      Tippen zum Vergrößern
                    </Text>
                  </View>
                </TouchableOpacity>
                <Button
                  icon="close"
                  mode="outlined"
                  onPress={discardReceipt}
                  style={{
                    borderColor: `${theme.colors.error}60`,
                    marginBottom: 8,
                    marginTop: 4,
                  }}
                  textColor={theme.colors.error}
                >
                  Quittung verwerfen
                </Button>
              </>
            )}
            <View style={styles.receiptButtons}>
              <Button
                icon="camera"
                mode="outlined"
                onPress={takePhoto}
                style={styles.receiptButton}
              >
                Foto aufnehmen
              </Button>
              <Button
                icon="image"
                mode="outlined"
                onPress={pickImage}
                style={styles.receiptButton}
              >
                Galerie
              </Button>
            </View>
          </View>

          {/* Paperless — auto-anzeigen wenn Bild vorhanden, nur Favoriten */}
          {receiptImage &&
            (() => {
              if (!paperlessData) {
                loadPaperlessData();
              }
              return null;
            })()}
          {receiptImage &&
            paperlessData &&
            (paperlessData.documentTypes.length > 0 ||
              paperlessData.correspondents.length > 0 ||
              paperlessData.tags.length > 0) && (
              <View
                style={[
                  styles.paperlessSection,
                  {
                    backgroundColor: theme.colors.surfaceVariant,
                    borderRadius: theme.roundness,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <MaterialCommunityIcons
                    color={theme.colors.primary}
                    name="file-document-outline"
                    size={18}
                  />
                  <Text
                    style={[
                      styles.sectionLabel,
                      {
                        color: theme.colors.primary,
                        marginBottom: 0,
                        marginLeft: 6,
                      },
                    ]}
                  >
                    Paperless
                  </Text>
                </View>
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
                      style={{ marginBottom: 8 }}
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
                          style={styles.chip}
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
                      style={{ marginBottom: 8 }}
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
                          style={styles.chip}
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
                      style={{ marginBottom: 8 }}
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
                          style={styles.chip}
                        >
                          {t.name}
                        </Chip>
                      ))}
                    </ScrollView>
                  </>
                )}
                {paperlessUsers.length > 0 && (
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
                      style={{ marginBottom: 8 }}
                    >
                      <Chip
                        onPress={() => setOwnerPaperlessUserId(null)}
                        selected={!ownerPaperlessUserId}
                        style={styles.chip}
                      >
                        Standard
                      </Chip>
                      {paperlessUsers.map((u: any) => (
                        <Chip
                          key={u.id}
                          onPress={() =>
                            setOwnerPaperlessUserId(
                              ownerPaperlessUserId === String(u.paperlessId)
                                ? null
                                : String(u.paperlessId)
                            )
                          }
                          selected={
                            ownerPaperlessUserId === String(u.paperlessId)
                          }
                          style={styles.chip}
                        >
                          {u.fullName || u.username}
                        </Chip>
                      ))}
                    </ScrollView>
                  </>
                )}
                {paperlessUsers.length > 1 && (
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
                    >
                      {paperlessUsers.map((u: any) => (
                        <Chip
                          key={u.id}
                          onPress={() => {
                            const id = String(u.paperlessId);
                            setViewPaperlessUserIds((prev) =>
                              prev.includes(id)
                                ? prev.filter((x) => x !== id)
                                : [...prev, id]
                            );
                          }}
                          selected={viewPaperlessUserIds.includes(
                            String(u.paperlessId)
                          )}
                          style={styles.chip}
                        >
                          {u.fullName || u.username}
                        </Chip>
                      ))}
                    </ScrollView>
                  </>
                )}
              </View>
            )}

          {/* Save Button */}
          <Button
            contentStyle={styles.saveButtonContent}
            disabled={saving}
            icon="check"
            loading={saving}
            mode="contained"
            onPress={handleSave}
            style={[
              styles.saveButton,
              {
                backgroundColor: theme.colors.primary,
                borderRadius: theme.roundness,
              },
            ]}
          >
            Speichern
          </Button>
        </View>
      </ScrollView>

      {/* Vollbild-Bild Modal */}
      <Portal>
        <Modal
          contentContainerStyle={styles.fullscreenModal}
          onDismiss={() => setFullscreenImage(null)}
          visible={!!fullscreenImage}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setFullscreenImage(null)}
            style={{ flex: 1 }}
          >
            {fullscreenImage && (
              <Image
                resizeMode="contain"
                source={{ uri: fullscreenImage }}
                style={styles.fullscreenImg}
              />
            )}
            <IconButton
              icon="close"
              iconColor="#fff"
              onPress={() => setFullscreenImage(null)}
              size={28}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                backgroundColor: "rgba(0,0,0,0.5)",
              }}
            />
          </TouchableOpacity>
        </Modal>
      </Portal>

      {/* Category Modal */}
      <Portal>
        <Modal
          contentContainerStyle={[
            styles.modal,
            { backgroundColor: theme.colors.surface },
          ]}
          onDismiss={() => setShowCategories(false)}
          visible={showCategories}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            Kategorie wählen
          </Text>
          <ScrollView>
            {categories.map((cat) => (
              <List.Item
                key={cat.id}
                onPress={() => {
                  setSelectedCategory(cat);
                  setShowCategories(false);
                }}
                right={() =>
                  selectedCategory?.id === cat.id ? (
                    <MaterialCommunityIcons
                      color={theme.colors.primary}
                      name="check"
                      size={20}
                    />
                  ) : null
                }
                title={`${cat.icon} ${cat.nameDE || cat.name}`}
                titleStyle={{ color: theme.colors.onSurface }}
              />
            ))}
          </ScrollView>
        </Modal>
      </Portal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: "600", color: "#fff" },
  content: { padding: 16 },
  segmented: { marginBottom: 16 },
  input: { marginBottom: 12 },
  categoryPicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  receiptSection: { marginBottom: 12 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.7,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ocrLoading: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    padding: 12,
  },
  receiptImage: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginBottom: 0,
  },
  fullscreenHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    paddingVertical: 5,
    marginBottom: 8,
  },
  fullscreenModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", margin: 0 },
  fullscreenImg: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  },
  receiptButtons: { flexDirection: "row", gap: 8 },
  receiptButton: { flex: 1 },
  paperlessSection: { padding: 12, marginBottom: 12 },
  chipLabel: { fontSize: 12, opacity: 0.6, marginBottom: 4, fontWeight: "500" },
  recurringRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    marginTop: 4,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  chip: { marginRight: 8 },
  saveButton: { marginTop: 8, elevation: 2 },
  saveButtonContent: { paddingVertical: 8 },
  modal: { margin: 20, padding: 20, borderRadius: 16, maxHeight: "80%" },
  modalTitle: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
});
