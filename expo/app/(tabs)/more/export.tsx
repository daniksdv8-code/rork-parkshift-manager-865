import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, TextInput,
} from 'react-native';
import { Download, Users, FileText, Check, Shield, Upload, Save, FolderInput } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { formatDateTime } from '@/utils/helpers';
import { shareCsv, shareJson } from '@/utils/file-save';

type Period = '7d' | '30d' | '90d' | '1y' | 'all';

function buildClientsCsv(clients: { name: string; phone: string; plates: string; debt: number; notes: string; createdAt: string }[]): string {
  const BOM = '\uFEFF';
  const header = 'ФИО;Телефон;Авто;Долг (руб.);Заметки;Дата регистрации';
  const rows = clients.map(c =>
    `"${c.name}";"${c.phone}";"${c.plates}";"${c.debt}";"${c.notes}";"${formatDateTime(c.createdAt)}"`
  );
  return BOM + [header, ...rows].join('\n');
}

function buildPaymentsCsv(txs: { date: string; type: string; client: string; plate: string; amount: number; method: string; description: string; operator: string }[]): string {
  const BOM = '\uFEFF';
  const header = 'Дата;Тип;Клиент;Номер;Сумма;Способ;Описание;Оператор';
  const rows = txs.map(t =>
    `"${formatDateTime(t.date)}";"${t.type}";"${t.client}";"${t.plate}";"${t.amount}";"${t.method}";"${t.description}";"${t.operator}"`
  );
  return BOM + [header, ...rows].join('\n');
}

export default function ExportScreen() {
  const { isAdmin } = useAuth();
  const colors = useColors();
  const {
    activeClients, activeCars, transactions, getClientDebtTotal,
    exportClientsJson, importClientsJson,
  } = useParking();

  const [period, setPeriod] = useState<Period>('30d');
  const [clientsExported, setClientsExported] = useState(false);
  const [clientsJsonExported, setClientsJsonExported] = useState(false);
  const [opsExported, setOpsExported] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const periodTxCount = useMemo(() => {
    const now = Date.now();
    const msMap: Record<Period, number> = {
      '7d': 7 * 86400000,
      '30d': 30 * 86400000,
      '90d': 90 * 86400000,
      '1y': 365 * 86400000,
      'all': Infinity,
    };
    const cutoff = msMap[period] === Infinity ? 0 : now - msMap[period];
    return transactions.filter(t => new Date(t.date).getTime() >= cutoff).length;
  }, [transactions, period]);

  const exportClients = useCallback(async () => {
    const rows = activeClients.map(c => {
      const cars = activeCars.filter(car => car.clientId === c.id);
      return {
        name: c.name,
        phone: c.phone,
        plates: cars.map(car => `${car.plateNumber} ${car.carModel ?? ''}`).join(', '),
        debt: getClientDebtTotal(c.id),
        notes: c.notes || '',
        createdAt: c.createdAt,
      };
    });
    const csv = buildClientsCsv(rows);
    const filename = `clients_${new Date().toISOString().split('T')[0]}.csv`;
    const result = await shareCsv(csv, filename);
    if (result.success) {
      setClientsExported(true);
      setTimeout(() => setClientsExported(false), 3000);
      if (result.fallback) {
        Alert.alert('Готово', 'Данные скопированы в буфер обмена. Вставьте в файл и сохраните как .csv');
      } else {
        Alert.alert('Готово', 'Данные клиентов экспортированы');
      }
    } else {
      Alert.alert('Ошибка', 'Не удалось экспортировать данные');
    }
  }, [activeClients, activeCars, getClientDebtTotal]);

  const handleExportClientsJson = useCallback(async () => {
    const json = exportClientsJson();
    const filename = `clients_backup_${new Date().toISOString().split('T')[0]}.json`;
    const result = await shareJson(json, filename);
    if (result.success) {
      setClientsJsonExported(true);
      setTimeout(() => setClientsJsonExported(false), 3000);
      if (result.fallback) {
        Alert.alert('Готово', 'Данные клиентов скопированы в буфер обмена (JSON)');
      } else {
        Alert.alert('Готово', 'Клиенты сохранены в JSON');
      }
    } else {
      Alert.alert('Ошибка', 'Не удалось сохранить данные');
    }
  }, [exportClientsJson]);

  const handleImportClients = useCallback(async () => {
    let jsonText = importText.trim();
    if (!jsonText) {
      try {
        const clipboardContent = await Clipboard.getStringAsync();
        if (clipboardContent) {
          jsonText = clipboardContent;
        }
      } catch {
        console.log('[Export] Clipboard read failed');
      }
    }
    if (!jsonText) {
      Alert.alert('Ошибка', 'Вставьте JSON данные клиентов в текстовое поле или скопируйте в буфер обмена');
      return;
    }

    Alert.alert(
      'Загрузка клиентов',
      'Будут добавлены только новые клиенты (дубликаты по телефону пропускаются). Продолжить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Загрузить',
          onPress: () => {
            setImporting(true);
            setTimeout(() => {
              const result = importClientsJson(jsonText);
              setImporting(false);
              if (result.success) {
                setImportText('');
                setShowImport(false);
                Alert.alert(
                  'Готово',
                  `Импортировано: ${result.imported ?? 0} клиентов\nПропущено (дубликаты): ${result.skipped ?? 0}`
                );
              } else {
                Alert.alert('Ошибка', result.error ?? 'Не удалось загрузить данные');
              }
            }, 100);
          },
        },
      ]
    );
  }, [importText, importClientsJson]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const content = await Clipboard.getStringAsync();
      if (content) {
        setImportText(content);
      } else {
        Alert.alert('Пусто', 'Буфер обмена пуст');
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось прочитать буфер обмена');
    }
  }, []);

  const exportOps = useCallback(async () => {
    const now = Date.now();
    const msMap: Record<Period, number> = {
      '7d': 7 * 86400000,
      '30d': 30 * 86400000,
      '90d': 90 * 86400000,
      '1y': 365 * 86400000,
      'all': Infinity,
    };
    const cutoff = msMap[period] === Infinity ? 0 : now - msMap[period];
    const filtered = transactions.filter(t => new Date(t.date).getTime() >= cutoff);

    const typeLabels: Record<string, string> = {
      payment: 'Оплата', debt: 'Долг', debt_payment: 'Погашение',
      entry: 'Заезд', exit: 'Выезд', cancel_entry: 'Отмена заезда',
      cancel_exit: 'Отмена выезда', cancel_payment: 'Отмена оплаты',
      withdrawal: 'Снятие', refund: 'Возврат',
    };

    const rows = filtered.map(t => ({
      date: t.date,
      type: typeLabels[t.type] ?? t.type,
      client: activeClients.find(c => c.id === t.clientId)?.name ?? '',
      plate: activeCars.find(c => c.id === t.carId)?.plateNumber ?? '',
      amount: t.amount,
      method: t.method === 'cash' ? 'Наличные' : t.method === 'card' ? 'Безнал' : '',
      description: t.description,
      operator: t.operatorName,
    }));

    const csv = buildPaymentsCsv(rows);
    const today = new Date().toISOString().split('T')[0];
    const filename = `operations_${today}.csv`;
    const result = await shareCsv(csv, filename);
    if (result.success) {
      setOpsExported(true);
      setTimeout(() => setOpsExported(false), 3000);
      if (result.fallback) {
        Alert.alert('Готово', 'Данные скопированы в буфер обмена. Вставьте в файл и сохраните как .csv');
      } else {
        Alert.alert('Готово', 'Операции экспортированы');
      }
    } else {
      Alert.alert('Ошибка', 'Не удалось экспортировать данные');
    }
  }, [transactions, period, activeClients, activeCars]);

  if (!isAdmin) {
    return (
      <View style={styles.noAccess}>
        <Shield size={48} color={colors.textTertiary} />
        <Text style={styles.noAccessText}>Доступно только администратору</Text>
      </View>
    );
  }

  const periods: { key: Period; label: string }[] = [
    { key: '7d', label: '7 дней' },
    { key: '30d', label: '30 дней' },
    { key: '90d', label: '3 мес.' },
    { key: '1y', label: 'Год' },
    { key: 'all', label: 'Всё' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.exportCard, { borderColor: colors.info + '40' }]}>
        <View style={styles.exportHeader}>
          <View style={[styles.iconCircle, { backgroundColor: colors.info + '15' }]}>
            <Users size={20} color={colors.info} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.exportTitle}>Клиенты</Text>
            <Text style={styles.exportSubtitle}>Сохранение и загрузка</Text>
          </View>
        </View>
        <Text style={styles.exportDesc}>
          {activeClients.length} клиентов · {activeCars.length} машин
        </Text>

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.exportBtn, styles.btnHalf, clientsJsonExported && styles.exportBtnDone]}
            onPress={handleExportClientsJson}
            activeOpacity={0.8}
          >
            {clientsJsonExported
              ? <><Check size={16} color={colors.white} /><Text style={styles.exportBtnText}>Сохранено!</Text></>
              : <><Save size={16} color={colors.white} /><Text style={styles.exportBtnText}>Сохранить</Text></>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.importBtn, styles.btnHalf, showImport && styles.importBtnActive]}
            onPress={() => setShowImport(!showImport)}
            activeOpacity={0.8}
          >
            <FolderInput size={16} color={showImport ? colors.white : colors.info} />
            <Text style={[styles.importBtnText, showImport && { color: colors.white }]}>Загрузить</Text>
          </TouchableOpacity>
        </View>

        {showImport && (
          <View style={styles.importSection}>
            <Text style={styles.importHint}>
              Вставьте JSON данные из ранее сохранённого файла клиентов:
            </Text>
            <TextInput
              style={styles.importInput}
              placeholder='{"formatId":"park_manager_clients",...}'
              placeholderTextColor={colors.textTertiary}
              value={importText}
              onChangeText={setImportText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.importActions}>
              <TouchableOpacity
                style={[styles.pasteBtn]}
                onPress={handlePasteFromClipboard}
                activeOpacity={0.7}
              >
                <Upload size={14} color={colors.info} />
                <Text style={[styles.pasteBtnText, { color: colors.info }]}>Вставить из буфера</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmImportBtn, importing && { opacity: 0.6 }]}
                onPress={handleImportClients}
                activeOpacity={0.8}
                disabled={importing}
              >
                <FolderInput size={16} color={colors.white} />
                <Text style={styles.confirmImportText}>
                  {importing ? 'Загрузка...' : 'Загрузить клиентов'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.divider} />

        <TouchableOpacity
          style={[styles.csvBtn, clientsExported && styles.exportBtnDone]}
          onPress={exportClients}
          activeOpacity={0.8}
        >
          {clientsExported
            ? <><Check size={16} color={colors.white} /><Text style={styles.exportBtnText}>Скопировано!</Text></>
            : <><Download size={16} color={colors.white} /><Text style={styles.exportBtnText}>Экспорт CSV</Text></>
          }
        </TouchableOpacity>
      </View>

      <View style={styles.exportCard}>
        <View style={styles.exportHeader}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
            <FileText size={20} color={colors.primary} />
          </View>
          <Text style={styles.exportTitle}>Операции и оплаты</Text>
        </View>
        <View style={styles.periodRow}>
          {periods.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodChip, period === p.key && styles.periodChipActive]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.exportDesc}>
          {periodTxCount} операций за период
        </Text>
        <TouchableOpacity
          style={[styles.exportBtn, opsExported && styles.exportBtnDone]}
          onPress={exportOps}
          activeOpacity={0.8}
        >
          {opsExported
            ? <><Check size={18} color={colors.white} /><Text style={styles.exportBtnText}>Скопировано!</Text></>
            : <><Download size={18} color={colors.white} /><Text style={styles.exportBtnText}>Экспорт CSV</Text></>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  noAccessText: { fontSize: 16, color: colors.textTertiary },
  exportCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 20,
    marginBottom: 16, borderWidth: 1, borderColor: colors.border,
  },
  exportHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconCircle: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  exportTitle: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  exportSubtitle: { fontSize: 12, color: colors.textTertiary, marginTop: 1 },
  exportDesc: { fontSize: 13, color: colors.textSecondary, marginBottom: 14 },
  btnRow: { flexDirection: 'row', gap: 10, marginBottom: 0 },
  btnHalf: { flex: 1 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 12, padding: 14,
  },
  exportBtnDone: { backgroundColor: colors.success },
  exportBtnText: { fontSize: 15, fontWeight: '600' as const, color: colors.white },
  importBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.info + '12', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.info + '30',
  },
  importBtnActive: {
    backgroundColor: colors.info, borderColor: colors.info,
  },
  importBtnText: { fontSize: 15, fontWeight: '600' as const, color: colors.info },
  importSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  importHint: {
    fontSize: 13, color: colors.textSecondary, marginBottom: 10, lineHeight: 18,
  },
  importInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: colors.text,
    minHeight: 100,
    maxHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  importActions: {
    marginTop: 10,
    gap: 8,
  },
  pasteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.info + '10',
    borderWidth: 1, borderColor: colors.info + '25',
  },
  pasteBtnText: { fontSize: 13, fontWeight: '600' as const },
  confirmImportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.info, borderRadius: 12, padding: 14,
  },
  confirmImportText: { fontSize: 15, fontWeight: '600' as const, color: colors.white },
  divider: {
    height: 1, backgroundColor: colors.border, marginVertical: 14,
  },
  csvBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.textTertiary, borderRadius: 12, padding: 12,
  },
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  periodChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border,
  },
  periodChipActive: { backgroundColor: colors.primarySurface, borderColor: colors.primary },
  periodText: { fontSize: 12, fontWeight: '500' as const, color: colors.textSecondary },
  periodTextActive: { color: colors.primary },
});
