import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, ScrollView, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowUpRight, ArrowDownRight, CreditCard, X, RotateCcw,
  ChevronLeft, ChevronRight, Filter, Check, ChevronRight as ChevronRightSmall, Search,
} from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatDateTime, getMethodLabel, normalizeForSearch, normalizePhone } from '@/utils/helpers';
import { Transaction, TransactionType } from '@/types';

type Period = 'day' | 'month' | 'year';

const TX_TYPE_OPTIONS: { key: TransactionType | 'all'; label: string }[] = [
  { key: 'all', label: 'Все типы' },
  { key: 'payment', label: 'Оплата' },
  { key: 'debt', label: 'Долг' },
  { key: 'debt_payment', label: 'Погашение' },
  { key: 'entry', label: 'Заезд' },
  { key: 'exit', label: 'Выезд' },
  { key: 'cancel_entry', label: 'Отмена заезда' },
  { key: 'cancel_exit', label: 'Отмена выезда' },
  { key: 'cancel_payment', label: 'Отмена оплаты' },
  { key: 'withdrawal', label: 'Снятие' },
  { key: 'refund', label: 'Возврат' },
];

function getTransactionIcon(type: TransactionType, c: ThemeColors) {
  switch (type) {
    case 'payment': return { Icon: ArrowUpRight, color: c.success };
    case 'debt': return { Icon: ArrowDownRight, color: c.danger };
    case 'debt_payment': return { Icon: CreditCard, color: c.info };
    case 'cancel_entry':
    case 'cancel_exit':
    case 'cancel_payment': return { Icon: X, color: c.danger };
    case 'refund': return { Icon: RotateCcw, color: c.warning };
    case 'withdrawal': return { Icon: ArrowDownRight, color: c.warning };
    default: return { Icon: ArrowUpRight, color: c.textSecondary };
  }
}

function getTransactionLabel(type: TransactionType): string {
  switch (type) {
    case 'payment': return 'Оплата';
    case 'debt': return 'Долг';
    case 'debt_payment': return 'Погашение';
    case 'entry': return 'Заезд';
    case 'exit': return 'Выезд';
    case 'cancel_entry': return 'Отмена заезда';
    case 'cancel_exit': return 'Отмена выезда';
    case 'cancel_payment': return 'Отмена оплаты';
    case 'withdrawal': return 'Снятие';
    case 'refund': return 'Возврат';
    case 'debt_accrual': return 'Начисление';
    case 'client_deleted': return 'Удаление';
    default: return type;
  }
}

export default function HistoryScreen() {
  const { transactions, clients, cars, activeCars, activeClients } = useParking();
  const router = useRouter();
  const colors = useColors();
  const [period, setPeriod] = useState<Period>('day');
  const [offset, setOffset] = useState(0);
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');
  const [filterOperator, setFilterOperator] = useState<string>('all');
  const [filterMethod, setFilterMethod] = useState<'all' | 'cash' | 'card'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');

  const operators = useMemo(() => {
    const map = new Map<string, string>();
    transactions.forEach(t => map.set(t.operatorId, t.operatorName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [transactions]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterType !== 'all') count++;
    if (filterOperator !== 'all') count++;
    if (filterMethod !== 'all') count++;
    return count;
  }, [filterType, filterOperator, filterMethod]);

  const allClientsMap = useMemo(() => {
    const map = new Map<string, { name: string; phone?: string; phone2?: string }>();
    clients.forEach(c => map.set(c.id, { name: c.name, phone: c.phone, phone2: c.phone2 }));
    activeClients.forEach(c => { if (!map.has(c.id)) map.set(c.id, { name: c.name, phone: c.phone, phone2: c.phone2 }); });
    return map;
  }, [clients, activeClients]);

  const allCarsMap = useMemo(() => {
    const map = new Map<string, { plateNumber: string; carModel?: string }>();
    cars.forEach(c => map.set(c.id, { plateNumber: c.plateNumber, carModel: c.carModel }));
    activeCars.forEach(c => { if (!map.has(c.id)) map.set(c.id, { plateNumber: c.plateNumber, carModel: c.carModel }); });
    return map;
  }, [cars, activeCars]);

  const filteredTx = useMemo(() => {
    const now = new Date();
    if (period === 'day') {
      now.setDate(now.getDate() - offset);
    }

    return transactions.filter(t => {
      const d = new Date(t.date);
      if (period === 'day') {
        if (d.getFullYear() !== now.getFullYear() ||
          d.getMonth() !== now.getMonth() ||
          d.getDate() !== now.getDate()) return false;
      }
      if (period === 'month') {
        if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
      }
      if (period === 'year') {
        if (d.getFullYear() !== now.getFullYear()) return false;
      }

      if (filterType !== 'all' && t.type !== filterType) return false;
      if (filterOperator !== 'all' && t.operatorId !== filterOperator) return false;
      if (filterMethod !== 'all' && t.method !== filterMethod) return false;

      if (search.trim()) {
        const q = normalizeForSearch(search);
        const phoneQ = normalizePhone(search.trim());
        const car = t.carId ? allCarsMap.get(t.carId) : null;
        const client = t.clientId ? allClientsMap.get(t.clientId) : null;
        const matchPlate = car ? normalizeForSearch(car.plateNumber).includes(q) : false;
        const matchName = client ? normalizeForSearch(client.name).includes(q) : false;
        const matchPhone = client ? normalizePhone(client.phone ?? '').includes(phoneQ) : false;
        const matchPhone2 = client?.phone2 ? normalizePhone(client.phone2).includes(phoneQ) : false;
        if (!matchPlate && !matchName && !matchPhone && !matchPhone2) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, period, offset, filterType, filterOperator, filterMethod, search, allCarsMap, allClientsMap]);

  const summary = useMemo(() => {
    const income = filteredTx
      .filter(t => ['payment', 'debt_payment'].includes(t.type))
      .reduce((s, t) => s + t.amount, 0);
    const expenses = filteredTx
      .filter(t => ['withdrawal', 'refund', 'cancel_payment'].includes(t.type))
      .reduce((s, t) => s + t.amount, 0);
    return { income, expenses };
  }, [filteredTx]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleOpenClient = useCallback((clientId: string) => {
    router.push({ pathname: '/client-card', params: { clientId } });
  }, [router]);

  const renderItem = useCallback(({ item }: { item: Transaction }) => {
    const { Icon, color } = getTransactionIcon(item.type, colors);
    const client = item.clientId ? allClientsMap.get(item.clientId) : null;
    const car = item.carId ? allCarsMap.get(item.carId) : null;
    const isIncome = ['payment', 'debt_payment'].includes(item.type);
    const hasClient = !!item.clientId && !!client;

    const cardContent = (
      <>
        <View style={[styles.txIcon, { backgroundColor: color + '15' }]}>
          <Icon size={16} color={color} />
        </View>
        <View style={styles.txBody}>
          <Text style={styles.txLabel} numberOfLines={1}>{getTransactionLabel(item.type)}</Text>
          <Text style={styles.txDesc} numberOfLines={1}>{item.description}</Text>
          {car && (
            <Text style={styles.txCar} numberOfLines={1}>
              {car.plateNumber}{car.carModel ? ` · ${car.carModel}` : ''}
            </Text>
          )}
          {client && (
            <Text style={styles.txClient} numberOfLines={1}>
              {client.name}
            </Text>
          )}
          <Text style={styles.txDate} numberOfLines={1}>
            {formatDateTime(item.date)}
            {item.method ? ` · ${getMethodLabel(item.method)}` : ''}
            {item.operatorName ? ` · ${item.operatorName}` : ''}
          </Text>
        </View>
        <View style={styles.txRight}>
          {item.amount > 0 && (
            <Text style={[styles.txAmount, isIncome ? styles.txAmountGreen : styles.txAmountRed]}>
              {isIncome ? '+' : '-'}{formatMoney(item.amount)}
            </Text>
          )}
          {hasClient && (
            <ChevronRightSmall size={14} color={colors.textTertiary} style={styles.txChevron} />
          )}
        </View>
      </>
    );

    if (hasClient) {
      return (
        <TouchableOpacity
          style={styles.txCard}
          activeOpacity={0.7}
          onPress={() => handleOpenClient(item.clientId!)}
        >
          {cardContent}
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.txCard}>
        {cardContent}
      </View>
    );
  }, [allClientsMap, allCarsMap, colors, styles, handleOpenClient]);

  const resetFilters = useCallback(() => {
    setFilterType('all');
    setFilterOperator('all');
    setFilterMethod('all');
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <Search size={18} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Номер авто, ФИО, телефон..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.topBar}>
        <View style={styles.periodRow}>
          {(['day', 'month', 'year'] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => { setPeriod(p); setOffset(0); }}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {p === 'day' ? 'День' : p === 'month' ? 'Месяц' : 'Год'}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.filterToggle, activeFilterCount > 0 && styles.filterToggleActive]}
            onPress={() => setShowFilters(true)}
          >
            <Filter size={16} color={activeFilterCount > 0 ? colors.primary : colors.textSecondary} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {period === 'day' && (
          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => setOffset(o => o + 1)}>
              <ChevronLeft size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.navText}>
              {offset === 0 ? 'Сегодня' : `${offset} дн. назад`}
            </Text>
            <TouchableOpacity onPress={() => setOffset(o => Math.max(0, o - 1))} disabled={offset === 0}>
              <ChevronRight size={22} color={offset === 0 ? colors.textTertiary : colors.textSecondary} />
            </TouchableOpacity>
            {offset > 0 && (
              <TouchableOpacity onPress={() => setOffset(0)}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.summaryRow}>
          <Text style={styles.countText}>{filteredTx.length} операций</Text>
          {summary.income > 0 && (
            <Text style={styles.summaryIncome}>+{formatMoney(summary.income)}</Text>
          )}
          {summary.expenses > 0 && (
            <Text style={styles.summaryExpense}>-{formatMoney(summary.expenses)}</Text>
          )}
        </View>
      </View>

      <FlatList
        data={filteredTx}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Нет операций</Text>
          </View>
        }
      />

      <Modal visible={showFilters} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Фильтры</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.filterSectionTitle}>Тип операции</Text>
              <View style={styles.filterChips}>
                {TX_TYPE_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.filterChip, filterType === opt.key && styles.filterChipActive]}
                    onPress={() => setFilterType(opt.key)}
                  >
                    {filterType === opt.key && <Check size={12} color={colors.white} />}
                    <Text style={[styles.filterChipText, filterType === opt.key && styles.filterChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterSectionTitle}>Оператор</Text>
              <View style={styles.filterChips}>
                <TouchableOpacity
                  style={[styles.filterChip, filterOperator === 'all' && styles.filterChipActive]}
                  onPress={() => setFilterOperator('all')}
                >
                  {filterOperator === 'all' && <Check size={12} color={colors.white} />}
                  <Text style={[styles.filterChipText, filterOperator === 'all' && styles.filterChipTextActive]}>Все</Text>
                </TouchableOpacity>
                {operators.map(op => (
                  <TouchableOpacity
                    key={op.id}
                    style={[styles.filterChip, filterOperator === op.id && styles.filterChipActive]}
                    onPress={() => setFilterOperator(op.id)}
                  >
                    {filterOperator === op.id && <Check size={12} color={colors.white} />}
                    <Text style={[styles.filterChipText, filterOperator === op.id && styles.filterChipTextActive]}>
                      {op.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterSectionTitle}>Способ оплаты</Text>
              <View style={styles.filterChips}>
                {[
                  { key: 'all' as const, label: 'Все' },
                  { key: 'cash' as const, label: 'Наличные' },
                  { key: 'card' as const, label: 'Безнал' },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.filterChip, filterMethod === opt.key && styles.filterChipActive]}
                    onPress={() => setFilterMethod(opt.key)}
                  >
                    {filterMethod === opt.key && <Check size={12} color={colors.white} />}
                    <Text style={[styles.filterChipText, filterMethod === opt.key && styles.filterChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
                <Text style={styles.resetBtnText}>Сбросить</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={() => setShowFilters(false)}>
                <Text style={styles.applyBtnText}>Применить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12,
    paddingHorizontal: 14, marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, paddingVertical: 12, paddingLeft: 10,
    fontSize: 15, color: colors.text,
  },
  topBar: { paddingBottom: 4 },
  periodRow: {
    flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8, alignItems: 'center',
  },
  periodBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  periodBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodText: { fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary },
  periodTextActive: { color: colors.white },
  filterToggle: {
    marginLeft: 'auto' as const, width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  filterToggleActive: { borderColor: colors.primary + '60', backgroundColor: colors.primarySurface },
  filterBadge: {
    position: 'absolute', top: -4, right: -4,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  filterBadgeText: { fontSize: 10, fontWeight: '700' as const, color: colors.white },
  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 8,
  },
  navText: { fontSize: 14, color: colors.text, fontWeight: '500' as const },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 6,
  },
  countText: { fontSize: 12, color: colors.textTertiary },
  summaryIncome: { fontSize: 12, fontWeight: '600' as const, color: colors.success },
  summaryExpense: { fontSize: 12, fontWeight: '600' as const, color: colors.danger },
  list: { padding: 16, paddingTop: 0, paddingBottom: 32 },
  txCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10,
    padding: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  txIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  txBody: { flex: 1 },
  txLabel: { fontSize: 13, fontWeight: '600' as const, color: colors.text },
  txDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  txCar: { fontSize: 12, color: colors.text, marginTop: 2, fontWeight: '500' as const },
  txClient: { fontSize: 11, color: colors.primary, marginTop: 1 },
  txDate: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  txRight: { alignItems: 'flex-end' as const, marginLeft: 6, flexShrink: 0 },
  txChevron: { marginTop: 4 },
  txAmount: { fontSize: 14, fontWeight: '700' as const },
  txAmountGreen: { color: colors.success },
  txAmountRed: { color: colors.danger },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: colors.textTertiary },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  modalBody: { padding: 16, paddingBottom: 8 },
  filterSectionTitle: {
    fontSize: 14, fontWeight: '600' as const, color: colors.textSecondary,
    marginBottom: 10, marginTop: 12,
  },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary },
  filterChipTextActive: { color: colors.white },
  modalFooter: {
    flexDirection: 'row', gap: 12, padding: 16, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  resetBtn: {
    flex: 1, padding: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border,
  },
  resetBtnText: { fontSize: 15, fontWeight: '600' as const, color: colors.textSecondary },
  applyBtn: {
    flex: 1, padding: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: colors.primary,
  },
  applyBtnText: { fontSize: 15, fontWeight: '700' as const, color: colors.white },
});
