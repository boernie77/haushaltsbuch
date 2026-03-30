import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, Image, Alert, KeyboardAvoidingView, Platform, Dimensions
} from 'react-native';
import {
  Text, TextInput, Button, useTheme, SegmentedButtons, Chip, Portal, Modal, List, ActivityIndicator, IconButton
} from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../src/store/authStore';
import { transactionAPI, categoryAPI, ocrAPI, paperlessAPI, IMAGE_BASE_URL } from '../../src/services/api';

export default function AddTransactionScreen() {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const { currentHousehold } = useAuthStore();

  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [paperlessData, setPaperlessData] = useState<any>(null);
  const [paperlessDocType, setPaperlessDocType] = useState<any>(null);
  const [paperlessCorrespondent, setPaperlessCorrespondent] = useState<any>(null);
  const [paperlessTags, setPaperlessTags] = useState<any[]>([]);

  useEffect(() => {
    if (currentHousehold) {
      categoryAPI.getAll(currentHousehold.id).then(({ data }) => setCategories(data.categories));
    }
  }, [currentHousehold]);

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Keine Berechtigung', 'Kamerazugriff wird benötigt.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8, base64: false, allowsEditing: false
    });
    if (!result.canceled) {
      setReceiptImage(result.assets[0].uri);
      analyzeReceipt(result.assets[0].uri);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8
    });
    if (!result.canceled) {
      setReceiptImage(result.assets[0].uri);
      analyzeReceipt(result.assets[0].uri);
    }
  };

  const discardReceipt = () => {
    setReceiptImage(null);
    setShowPaperless(false);
    setPaperlessDocType(null);
    setPaperlessCorrespondent(null);
    setPaperlessTags([]);
  };

  const analyzeReceipt = async (uri: string) => {
    setOcrLoading(true);
    try {
      const { data } = await ocrAPI.analyze(uri, currentHousehold?.id);
      const r = data.result;
      if (r.amount) setAmount(r.amount.toString());
      if (r.merchant) setMerchant(r.merchant);
      if (r.description) setDescription(r.description);
      if (r.date) setDate(r.date);
      if (r.categoryId) {
        const cat = categories.find(c => c.id === r.categoryId);
        if (cat) setSelectedCategory(cat);
      }
      Toast.show({ type: 'success', text1: '✅ Quittung analysiert', text2: `Erkannte Kategorie: ${r.confidence}% Sicherheit` });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'OCR fehlgeschlagen', text2: 'Bitte manuell eingeben' });
    } finally {
      setOcrLoading(false);
    }
  };

  const loadPaperlessData = async () => {
    if (!currentHousehold || paperlessData) return;
    try {
      const { data } = await paperlessAPI.getData(currentHousehold.id);
      // Nur Favoriten anzeigen
      setPaperlessData({
        documentTypes: (data.documentTypes || []).filter((i: any) => i.isFavorite),
        correspondents: (data.correspondents || []).filter((i: any) => i.isFavorite),
        tags: (data.tags || []).filter((i: any) => i.isFavorite),
      });
    } catch {}
  };

  const handleSave = async () => {
    if (!amount || !currentHousehold) {
      Toast.show({ type: 'error', text1: 'Bitte Betrag eingeben' });
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append('amount', amount);
      form.append('description', description);
      form.append('merchant', merchant);
      form.append('date', date);
      form.append('type', type);
      form.append('householdId', currentHousehold.id);
      if (selectedCategory) form.append('categoryId', selectedCategory.id);
      if (receiptImage) {
        form.append('receipt', { uri: receiptImage, type: 'image/jpeg', name: 'receipt.jpg' } as any);
      }

      const { data } = await transactionAPI.create(form);

      // Upload to Paperless if configured
      if (receiptImage && (paperlessDocType || paperlessCorrespondent || paperlessTags.length > 0)) {
        try {
          await paperlessAPI.upload({
            transactionId: data.transaction.id,
            documentTypeId: paperlessDocType?.id,
            correspondentId: paperlessCorrespondent?.id,
            tagIds: JSON.stringify(paperlessTags.map((t: any) => t.id)),
            title: description || merchant || `Quittung ${date}`
          });
          Toast.show({ type: 'success', text1: '📄 An Paperless übertragen' });
        } catch {}
      }

      // Budget warning
      if (data.budgetWarning) {
        const w = data.budgetWarning[0];
        Toast.show({
          type: 'error',
          text1: w.isOver ? '⚠️ Budget überschritten!' : '⚠️ Budget-Warnung',
          text2: `${Math.round(w.percentage)}% des Budgets verbraucht`,
          visibilityTime: 5000
        });
      }

      Toast.show({ type: 'success', text1: 'Ausgabe gespeichert' });
      router.replace('/(tabs)');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Fehler beim Speichern', text2: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.colors.primary, paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" color="#fff" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Neue Buchung</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.content}>
          {/* Type */}
          <SegmentedButtons
            value={type}
            onValueChange={setType}
            buttons={[
              { value: 'expense', label: '💸 Ausgabe', icon: 'minus-circle' },
              { value: 'income', label: '💰 Einnahme', icon: 'plus-circle' }
            ]}
            style={styles.segmented}
          />

          {/* Amount */}
          <TextInput
            label="Betrag (€)"
            value={amount}
            onChangeText={setAmount}
            mode="outlined"
            keyboardType="decimal-pad"
            style={styles.input}
            left={<TextInput.Icon icon="currency-eur" />}
          />

          {/* Description */}
          <TextInput
            label="Beschreibung"
            value={description}
            onChangeText={setDescription}
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="text" />}
          />

          {/* Merchant */}
          <TextInput
            label="Händler / Geschäft"
            value={merchant}
            onChangeText={setMerchant}
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="store" />}
          />

          {/* Date */}
          <TextInput
            label="Datum (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="calendar" />}
          />

          {/* Category */}
          <TouchableOpacity
            style={[styles.categoryPicker, { borderColor: theme.colors.outline, borderRadius: theme.roundness }]}
            onPress={() => setShowCategories(true)}
          >
            <Text style={{ color: theme.colors.onSurface }}>
              {selectedCategory ? `${selectedCategory.icon} ${selectedCategory.nameDE || selectedCategory.name}` : 'Kategorie wählen...'}
            </Text>
            <MaterialCommunityIcons name="chevron-down" color={theme.colors.onSurface} size={20} />
          </TouchableOpacity>

          {/* Receipt Image */}
          <View style={styles.receiptSection}>
            <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>Quittung</Text>
            {ocrLoading && (
              <View style={styles.ocrLoading}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={{ color: theme.colors.onSurface, marginLeft: 8 }}>Analysiere Quittung mit KI...</Text>
              </View>
            )}
            {receiptImage && (
              <>
                <TouchableOpacity onPress={() => setFullscreenImage(receiptImage)} activeOpacity={0.85}>
                  <Image source={{ uri: receiptImage }} style={styles.receiptImage} resizeMode="cover" />
                  <View style={styles.fullscreenHint}>
                    <MaterialCommunityIcons name="magnify-plus-outline" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12, marginLeft: 4 }}>Tippen zum Vergrößern</Text>
                  </View>
                </TouchableOpacity>
                <Button
                  mode="outlined"
                  onPress={discardReceipt}
                  icon="close"
                  textColor={theme.colors.error}
                  style={{ borderColor: theme.colors.error + '60', marginBottom: 8, marginTop: 4 }}
                >
                  Quittung verwerfen
                </Button>
              </>
            )}
            <View style={styles.receiptButtons}>
              <Button mode="outlined" onPress={takePhoto} icon="camera" style={styles.receiptButton}>
                Foto aufnehmen
              </Button>
              <Button mode="outlined" onPress={pickImage} icon="image" style={styles.receiptButton}>
                Galerie
              </Button>
            </View>
          </View>

          {/* Paperless — auto-anzeigen wenn Bild vorhanden, nur Favoriten */}
          {receiptImage && (() => { if (!paperlessData) loadPaperlessData(); return null; })()}
          {receiptImage && paperlessData && (paperlessData.documentTypes.length > 0 || paperlessData.correspondents.length > 0 || paperlessData.tags.length > 0) && (
            <View style={[styles.paperlessSection, { backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.roundness }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <MaterialCommunityIcons name="file-document-outline" color={theme.colors.primary} size={18} />
                <Text style={[styles.sectionLabel, { color: theme.colors.primary, marginBottom: 0, marginLeft: 6 }]}>Paperless</Text>
              </View>
              {paperlessData.documentTypes.length > 0 && <>
                <Text style={[styles.chipLabel, { color: theme.colors.onSurface }]}>Dokumententyp</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {paperlessData.documentTypes.map((dt: any) => (
                    <Chip key={dt.id} selected={paperlessDocType?.id === dt.id}
                      onPress={() => setPaperlessDocType(paperlessDocType?.id === dt.id ? null : dt)}
                      style={styles.chip}>{dt.name}</Chip>
                  ))}
                </ScrollView>
              </>}
              {paperlessData.correspondents.length > 0 && <>
                <Text style={[styles.chipLabel, { color: theme.colors.onSurface }]}>Absender</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {paperlessData.correspondents.map((c: any) => (
                    <Chip key={c.id} selected={paperlessCorrespondent?.id === c.id}
                      onPress={() => setPaperlessCorrespondent(paperlessCorrespondent?.id === c.id ? null : c)}
                      style={styles.chip}>{c.name}</Chip>
                  ))}
                </ScrollView>
              </>}
              {paperlessData.tags.length > 0 && <>
                <Text style={[styles.chipLabel, { color: theme.colors.onSurface }]}>Tags</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {paperlessData.tags.map((t: any) => (
                    <Chip key={t.id} selected={paperlessTags.some((pt: any) => pt.id === t.id)}
                      onPress={() => {
                        const exists = paperlessTags.some((pt: any) => pt.id === t.id);
                        setPaperlessTags(exists ? paperlessTags.filter((pt: any) => pt.id !== t.id) : [...paperlessTags, t]);
                      }}
                      style={styles.chip}>{t.name}</Chip>
                  ))}
                </ScrollView>
              </>}
            </View>
          )}

          {/* Save Button */}
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={[styles.saveButton, { backgroundColor: theme.colors.primary, borderRadius: theme.roundness }]}
            contentStyle={styles.saveButtonContent}
            icon="check"
          >
            Speichern
          </Button>
        </View>
      </ScrollView>

      {/* Vollbild-Bild Modal */}
      <Portal>
        <Modal visible={!!fullscreenImage} onDismiss={() => setFullscreenImage(null)}
          contentContainerStyle={styles.fullscreenModal}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setFullscreenImage(null)} activeOpacity={1}>
            {fullscreenImage && (
              <Image source={{ uri: fullscreenImage }} style={styles.fullscreenImg} resizeMode="contain" />
            )}
            <IconButton icon="close" iconColor="#fff" size={28}
              style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)' }}
              onPress={() => setFullscreenImage(null)} />
          </TouchableOpacity>
        </Modal>
      </Portal>

      {/* Category Modal */}
      <Portal>
        <Modal visible={showCategories} onDismiss={() => setShowCategories(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Kategorie wählen</Text>
          <ScrollView>
            {categories.map(cat => (
              <List.Item
                key={cat.id}
                title={`${cat.icon} ${cat.nameDE || cat.name}`}
                onPress={() => { setSelectedCategory(cat); setShowCategories(false); }}
                titleStyle={{ color: theme.colors.onSurface }}
                right={() => selectedCategory?.id === cat.id ? <MaterialCommunityIcons name="check" size={20} color={theme.colors.primary} /> : null}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  content: { padding: 16 },
  segmented: { marginBottom: 16 },
  input: { marginBottom: 12 },
  categoryPicker: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderWidth: 1, marginBottom: 12 },
  receiptSection: { marginBottom: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '600', opacity: 0.7, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  ocrLoading: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, padding: 12 },
  receiptImage: { width: '100%', height: 220, borderRadius: 12, marginBottom: 0 },
  fullscreenHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, paddingVertical: 5, marginBottom: 8 },
  fullscreenModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', margin: 0 },
  fullscreenImg: { width: Dimensions.get('window').width, height: Dimensions.get('window').height },
  receiptButtons: { flexDirection: 'row', gap: 8 },
  receiptButton: { flex: 1 },
  paperlessSection: { padding: 12, marginBottom: 12 },
  chipLabel: { fontSize: 12, opacity: 0.6, marginBottom: 4, fontWeight: '500' },
  chip: { marginRight: 8 },
  saveButton: { marginTop: 8, elevation: 2 },
  saveButtonContent: { paddingVertical: 8 },
  modal: { margin: 20, padding: 20, borderRadius: 16, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
});
