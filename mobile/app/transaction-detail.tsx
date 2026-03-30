import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, Image, TouchableOpacity, Dimensions } from 'react-native';
import { Text, Button, useTheme, ActivityIndicator, Chip, TextInput, Portal, Modal, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { transactionAPI, categoryAPI, paperlessAPI, IMAGE_BASE_URL } from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';
import Toast from 'react-native-toast-message';

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

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState(false);
  const [paperlessData, setPaperlessData] = useState<any>(null);
  const [showPaperlessModal, setShowPaperlessModal] = useState(false);
  const [paperlessDocType, setPaperlessDocType] = useState<any>(null);
  const [paperlessCorrespondent, setPaperlessCorrespondent] = useState<any>(null);
  const [paperlessTags, setPaperlessTags] = useState<any[]>([]);
  const [uploadingPaperless, setUploadingPaperless] = useState(false);

  useEffect(() => {
    if (!id || !currentHousehold) return;
    Promise.all([
      transactionAPI.getAll({ householdId: currentHousehold.id, page: 1, limit: 200 }),
      categoryAPI.getAll(currentHousehold.id),
    ]).then(([txRes, catRes]) => {
      const tx = txRes.data.transactions?.find((t: any) => t.id === id);
      if (tx) {
        setTransaction(tx);
        setAmount(String(tx.amount));
        setDescription(tx.description || '');
        setMerchant(tx.merchant || '');
        setDate(tx.date);
        setCategoryId(tx.categoryId || null);
      }
      setCategories(catRes.data.categories || []);
    }).catch(() => {
      Toast.show({ type: 'error', text1: 'Buchung konnte nicht geladen werden' });
    }).finally(() => setLoading(false));
  }, [id, currentHousehold?.id]);

  const handleSave = async () => {
    if (!id || !amount) return;
    setSaving(true);
    try {
      await transactionAPI.update(id, { amount: parseFloat(amount), description, merchant, date, categoryId });
      Toast.show({ type: 'success', text1: 'Buchung aktualisiert' });
      setEditing(false);
      router.back();
    } catch {
      Toast.show({ type: 'error', text1: 'Fehler beim Speichern' });
    } finally {
      setSaving(false);
    }
  };

  const openPaperlessModal = async () => {
    if (!currentHousehold) return;
    if (!paperlessData) {
      try {
        const { data } = await paperlessAPI.getData(currentHousehold.id);
        setPaperlessData({
          documentTypes: (data.documentTypes || []).filter((i: any) => i.isFavorite),
          correspondents: (data.correspondents || []).filter((i: any) => i.isFavorite),
          tags: (data.tags || []).filter((i: any) => i.isFavorite),
        });
      } catch {}
    }
    setShowPaperlessModal(true);
  };

  const handlePaperlessUpload = async () => {
    if (!transaction) return;
    setUploadingPaperless(true);
    try {
      await paperlessAPI.upload({
        transactionId: transaction.id,
        documentTypeId: paperlessDocType?.id,
        correspondentId: paperlessCorrespondent?.id,
        tagIds: JSON.stringify(paperlessTags.map((t: any) => t.id)),
        title: transaction.description || transaction.merchant || `Quittung ${transaction.date}`,
      });
      Toast.show({ type: 'success', text1: '📄 An Paperless übertragen' });
      setShowPaperlessModal(false);
    } catch {
      Toast.show({ type: 'error', text1: 'Paperless-Upload fehlgeschlagen' });
    } finally {
      setUploadingPaperless(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Buchung löschen', 'Diese Buchung wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive', onPress: async () => {
          try {
            await transactionAPI.delete(id!);
            Toast.show({ type: 'success', text1: 'Buchung gelöscht' });
            router.back();
          } catch {
            Toast.show({ type: 'error', text1: 'Fehler beim Löschen' });
          }
        }
      }
    ]);
  };

  if (loading) return (
    <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  if (!transaction) return (
    <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
      <Text style={{ color: theme.colors.onSurface }}>Buchung nicht gefunden</Text>
      <Button onPress={() => router.back()} style={{ marginTop: 12 }}>Zurück</Button>
    </View>
  );

  const selectedCategory = categories.find(c => c.id === categoryId);

  const receiptUrl = transaction?.receiptImage ? IMAGE_BASE_URL + transaction.receiptImage : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.primary, paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Button icon="arrow-left" textColor="#fff" onPress={() => router.back()} compact>
            Zurück
          </Button>
          <Text style={styles.headerTitle}>Buchung</Text>
          <Button icon={editing ? 'close' : 'pencil'} textColor="#fff" onPress={() => setEditing(!editing)} compact>
            {editing ? 'Abbrechen' : 'Bearbeiten'}
          </Button>
        </View>
      </View>

      {/* Vollbild-Modal */}
      <Portal>
        <Modal visible={fullscreenImage && !!receiptUrl} onDismiss={() => setFullscreenImage(false)}
          contentContainerStyle={styles.fullscreenModal}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setFullscreenImage(false)} activeOpacity={1}>
            {receiptUrl && <Image source={{ uri: receiptUrl }} style={styles.fullscreenImg} resizeMode="contain" />}
            <IconButton icon="close" iconColor="#fff" size={28}
              style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)' }}
              onPress={() => setFullscreenImage(false)} />
          </TouchableOpacity>
        </Modal>
      </Portal>

      {/* Paperless-Upload Modal */}
      <Portal>
        <Modal visible={showPaperlessModal} onDismiss={() => setShowPaperlessModal(false)}
          contentContainerStyle={[styles.paperlessModal, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>📄 Zu Paperless hochladen</Text>
          {paperlessData ? (<>
            {paperlessData.documentTypes.length > 0 && <>
              <Text style={[styles.chipLabel, { color: theme.colors.onSurface }]}>Dokumententyp</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {paperlessData.documentTypes.map((dt: any) => (
                  <Chip key={dt.id} selected={paperlessDocType?.id === dt.id}
                    onPress={() => setPaperlessDocType(paperlessDocType?.id === dt.id ? null : dt)}
                    style={{ marginRight: 8 }}>{dt.name}</Chip>
                ))}
              </ScrollView>
            </>}
            {paperlessData.correspondents.length > 0 && <>
              <Text style={[styles.chipLabel, { color: theme.colors.onSurface }]}>Absender</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {paperlessData.correspondents.map((c: any) => (
                  <Chip key={c.id} selected={paperlessCorrespondent?.id === c.id}
                    onPress={() => setPaperlessCorrespondent(paperlessCorrespondent?.id === c.id ? null : c)}
                    style={{ marginRight: 8 }}>{c.name}</Chip>
                ))}
              </ScrollView>
            </>}
            {paperlessData.tags.length > 0 && <>
              <Text style={[styles.chipLabel, { color: theme.colors.onSurface }]}>Tags</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {paperlessData.tags.map((t: any) => (
                  <Chip key={t.id} selected={paperlessTags.some((pt: any) => pt.id === t.id)}
                    onPress={() => {
                      const exists = paperlessTags.some((pt: any) => pt.id === t.id);
                      setPaperlessTags(exists ? paperlessTags.filter((pt: any) => pt.id !== t.id) : [...paperlessTags, t]);
                    }}
                    style={{ marginRight: 8 }}>{t.name}</Chip>
                ))}
              </ScrollView>
            </>}
            <Button mode="contained" onPress={handlePaperlessUpload} loading={uploadingPaperless}
              disabled={uploadingPaperless} buttonColor={theme.colors.primary} icon="upload">
              Hochladen
            </Button>
          </>) : <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 20 }} />}
        </Modal>
      </Portal>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {!editing ? (
          /* View mode */
          <View style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
            <View style={styles.amountRow}>
              <Text style={[styles.categoryIcon]}>{transaction.Category?.icon || '📦'}</Text>
              <Text style={[styles.amount, { color: transaction.type === 'income' ? theme.colors.incomeColor : theme.colors.expenseColor }]}>
                {transaction.type === 'income' ? '+' : '-'}{parseFloat(transaction.amount).toFixed(2)} €
              </Text>
            </View>

            {[
              { label: 'Datum', value: format(new Date(transaction.date), 'dd. MMMM yyyy', { locale: de }) },
              { label: 'Beschreibung', value: transaction.description },
              { label: 'Händler', value: transaction.merchant },
              { label: 'Kategorie', value: transaction.Category ? `${transaction.Category.icon} ${transaction.Category.nameDE || transaction.Category.name}` : null },
              { label: 'Typ', value: transaction.type === 'income' ? '💰 Einnahme' : '💸 Ausgabe' },
            ].filter(row => row.value).map(row => (
              <View key={row.label} style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.colors.onSurface }]}>{row.label}</Text>
                <Text style={[styles.rowValue, { color: theme.colors.onSurface }]}>{row.value}</Text>
              </View>
            ))}

            {transaction.receiptImage && (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.rowLabel, { color: theme.colors.onSurface, marginBottom: 8 }]}>Quittung</Text>
                <TouchableOpacity onPress={() => setFullscreenImage(true)} activeOpacity={0.85}>
                  <Image
                    source={{ uri: IMAGE_BASE_URL + transaction.receiptImage }}
                    style={styles.receiptThumb}
                    resizeMode="cover"
                  />
                  <View style={styles.fullscreenHint}>
                    <MaterialCommunityIcons name="magnify-plus-outline" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12, marginLeft: 4 }}>Tippen zum Vergrößern</Text>
                  </View>
                </TouchableOpacity>
                {!transaction.paperlessDocId && (
                  <Button mode="outlined" icon="file-document-outline" onPress={openPaperlessModal}
                    style={{ marginTop: 8, borderColor: theme.colors.primary + '60' }}
                    textColor={theme.colors.primary}>
                    Zu Paperless hochladen
                  </Button>
                )}
                {transaction.paperlessDocId && (
                  <Text style={{ color: theme.colors.primary, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                    ✅ In Paperless gespeichert
                  </Text>
                )}
              </View>
            )}

            <Button
              mode="outlined"
              icon="delete"
              textColor={theme.colors.error}
              style={[styles.deleteButton, { borderColor: theme.colors.error }]}
              onPress={handleDelete}
            >
              Buchung löschen
            </Button>
          </View>
        ) : (
          /* Edit mode */
          <View style={[styles.card, { backgroundColor: theme.colors.cardBackground }]}>
            <TextInput
              label="Betrag (€)"
              value={amount}
              onChangeText={setAmount}
              mode="outlined"
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <TextInput
              label="Beschreibung"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Händler"
              value={merchant}
              onChangeText={setMerchant}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Datum (YYYY-MM-DD)"
              value={date}
              onChangeText={setDate}
              mode="outlined"
              style={styles.input}
            />

            <Text style={[styles.rowLabel, { color: theme.colors.onSurface, marginBottom: 8 }]}>Kategorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {categories.map(cat => (
                <Chip
                  key={cat.id}
                  selected={categoryId === cat.id}
                  onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)}
                  style={{ marginRight: 8 }}
                  selectedColor={theme.colors.primary}
                >
                  {cat.icon} {cat.nameDE || cat.name}
                </Chip>
              ))}
            </ScrollView>

            <Button
              mode="contained"
              onPress={handleSave}
              disabled={saving}
              buttonColor={theme.colors.primary}
              icon="content-save"
            >
              {saving ? <ActivityIndicator size={16} color="#fff" /> : 'Speichern'}
            </Button>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 8, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  card: { borderRadius: 16, padding: 20, elevation: 2 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  categoryIcon: { fontSize: 40 },
  amount: { fontSize: 36, fontWeight: 'bold' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.08)' },
  rowLabel: { opacity: 0.6, fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  deleteButton: { marginTop: 20 },
  input: { marginBottom: 12 },
  receiptThumb: { width: '100%', height: 200, borderRadius: 12 },
  fullscreenHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, paddingVertical: 5 },
  fullscreenModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', margin: 0 },
  fullscreenImg: { width: Dimensions.get('window').width, height: Dimensions.get('window').height },
  paperlessModal: { margin: 20, padding: 20, borderRadius: 16 },
  modalTitle: { fontSize: 17, fontWeight: '600', marginBottom: 14 },
  chipLabel: { fontSize: 12, opacity: 0.6, marginBottom: 6, fontWeight: '500' },
});
