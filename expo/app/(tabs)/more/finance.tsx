import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import {
  Banknote, CreditCard, TrendingDown, ArrowDownCircle,
  Plus, Wallet, TrendingUp,
} from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatDateTime } from '@/utils/helpers';
import {
  calculateAdminCashRegister,
  getDateRangeForPeriod,
  PeriodKey,
} from '@/utils/financeCalculations';

type Tab = 'overview' | 'admin_cash' | 'manager_cash' | 'withdraw' | 'expense';

export default function FinanceScreen() {
  const { isAdmin } = useAuth();
  const colors = useColors();
  const {
    adminCashBalance, currentShift, withdrawals, expenses,
    adminCashOperations, adminWithdrawFromManager, addAdminExpense,
    salaryAdvances, salaryPayments,
  } = useParking();

  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expMethod, setExpMethod] = useState<'cash' | 'card'>('cash');
  const [expCategory, setExpCategory] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expCategoryFilter, setExpCategoryFilter] = useState<string>('all');
  const styles = useMemo(() => createStyles(colors), [colors]);

  const adminRegister = useMemo(() => {
    const { from, to } = getDateRangeForPeriod(period);
    return calculateAdminCashRegister(
      adminCashOperations, withdrawals, salaryAdvances, salaryPayments, from, to
    );
  }, [adminCashOperations, withdrawals, salaryAdvances, salaryPayments, period]);

  const managerExpenses = useMemo(() =>
    expenses.filter(e => e.type === 'manager' || !e.type).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50),
  [expenses]);

  const expenseCategories = useMemo(() => {
    const cats = new Set<string>();
    managerExpenses.forEach(e => { if (e.category) cats.add(e.category); });
    return ['all', ...Array.from(cats)];
  }, [managerExpenses]);

  const filteredManagerExpenses = useMemo(() => {
    if (expCategoryFilter === 'all') return managerExpenses;
    return managerExpenses.filter(e => e.category === expCategoryFilter);
  }, [managerExpenses, expCategoryFilter]);

  const filteredExpensesTotal = useMemo(() =>
    filteredManagerExpenses.reduce((sum, e) => sum + e.amount, 0),
  [filteredManagerExpenses]);

  const handleWithdraw = () => {
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Ошибка', 'Введите сумму');
      return;
    }
    adminWithdrawFromManager(amt, withdrawNote || undefined);
    setWithdrawAmount('');
    setWithdrawNote('');
    Alert.alert('Готово', `Снято ${formatMoney(amt)} из кассы менеджера`);
  };

  const handleAddExpense = () => {
    const amt = parseFloat(expAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Ошибка', 'Введите сумму');
      return;
    }
    addAdminExpense(amt, expMethod, expCategory || 'Прочее', expDesc || 'Расход');
    setExpAmount('');
    setExpCategory('');
    setExpDesc('');
    Alert.alert('Готово', 'Расход добавлен');
  };

  if (!isAdmin) {
    return (
      <View style={styles.noAccess}>
        <Wallet size={48} color={colors.textTertiary} />
        <Text style={styles.noAccessText}>Доступно только администратору</Text>
      </View>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'admin_cash', label: 'Касса админа' },
    { key: 'manager_cash', label: 'Касса менедж.' },
    { key: 'withdraw', label: 'Снятие' },
    { key: 'expense', label: 'Расход' },
  ];

  const periods: { key: PeriodKey; label: string }[] = [
    { key: 'today', label: 'Сегодня' },
    { key: 'week', label: 'Неделя' },
    { key: 'month', label: 'Месяц' },
    { key: 'all', label: 'Всё' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {tab === 'overview' && (
          <>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Общий баланс администратора</Text>
              <Text style={styles.balanceValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(adminCashBalance.total)}</Text>
            </View>
            <View style={styles.splitRow}>
              <View style={[styles.splitCard, { borderLeftColor: colors.cash }]}>
                <Banknote size={18} color={colors.cash} />
                <Text style={styles.splitLabel} numberOfLines={1}>Наличные</Text>
                <Text style={styles.splitValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(adminCashBalance.cash)}</Text>
              </View>
              <View style={[styles.splitCard, { borderLeftColor: colors.card }]}>
                <CreditCard size={18} color={colors.card} />
                <Text style={styles.splitLabel} numberOfLines={1}>Безнал</Text>
                <Text style={styles.splitValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(adminCashBalance.card)}</Text>
              </View>
            </View>
            {currentShift && (
              <View style={styles.managerCashCard}>
                <Wallet size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.managerCashLabel} numberOfLines={1}>Касса менеджера</Text>
                  <Text style={styles.managerCashValue} numberOfLines={1}>{formatMoney(currentShift.expectedCash)}</Text>
                </View>
              </View>
            )}
          </>
        )}

        {tab === 'admin_cash' && (
          <>
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

            <View style={styles.registerSummary}>
              <View style={styles.registerRow}>
                <TrendingUp size={14} color={colors.card} />
                <Text style={styles.registerLabel}>Доход по карте</Text>
                <Text style={[styles.registerValue, { color: colors.card }]}>
                  +{formatMoney(adminRegister.cardIncome)}
                </Text>
              </View>
              <View style={styles.registerRow}>
                <TrendingUp size={14} color={colors.cash} />
                <Text style={styles.registerLabel}>Наличные от менеджера</Text>
                <Text style={[styles.registerValue, { color: colors.cash }]}>
                  +{formatMoney(adminRegister.cashFromManagers)}
                </Text>
              </View>
              <View style={styles.registerDivider} />
              <View style={styles.registerRow}>
                <TrendingDown size={14} color={colors.danger} />
                <Text style={styles.registerLabel}>Расходы админа</Text>
                <Text style={[styles.registerValue, { color: colors.danger }]}>
                  -{formatMoney(adminRegister.adminExpenses)}
                </Text>
              </View>
              <View style={styles.registerRow}>
                <TrendingDown size={14} color={colors.warning} />
                <Text style={styles.registerLabel}>Авансы ЗП</Text>
                <Text style={[styles.registerValue, { color: colors.warning }]}>
                  -{formatMoney(adminRegister.salaryAdvanceTotal)}
                </Text>
              </View>
              <View style={styles.registerRow}>
                <TrendingDown size={14} color={colors.warning} />
                <Text style={styles.registerLabel}>Выплаты ЗП</Text>
                <Text style={[styles.registerValue, { color: colors.warning }]}>
                  -{formatMoney(adminRegister.salaryPaymentTotal)}
                </Text>
              </View>
              <View style={styles.registerDivider} />
              <View style={styles.registerRow}>
                <Wallet size={14} color={colors.primary} />
                <Text style={[styles.registerLabel, { fontWeight: '700' as const }]}>Баланс за период</Text>
                <Text style={[styles.registerValue, { color: colors.primary, fontWeight: '800' as const }]}>
                  {formatMoney(adminRegister.balance)}
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
              Операции ({adminRegister.operations.length})
            </Text>
            {adminRegister.operations.length === 0 && <Text style={styles.emptyText}>Нет операций</Text>}
            {adminRegister.operations.slice(0, 50).map(op => {
              const isIncome = ['cash_withdrawal_from_manager', 'card_income'].includes(op.type);
              return (
                <View key={op.id} style={styles.opCard}>
                  <View style={[styles.opIcon, { backgroundColor: (isIncome ? colors.success : colors.danger) + '15' }]}>
                    {isIncome
                      ? <TrendingUp size={14} color={colors.success} />
                      : <TrendingDown size={14} color={colors.danger} />
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.opDesc} numberOfLines={1}>{op.description}</Text>
                    <Text style={styles.opDate} numberOfLines={1}>{formatDateTime(op.date)} · {op.method === 'cash' ? 'Нал' : 'Безнал'}</Text>
                  </View>
                  <Text style={[styles.opAmount, isIncome ? styles.opAmountGreen : styles.opAmountRed]}>
                    {isIncome ? '+' : '-'}{formatMoney(op.amount)}
                  </Text>
                </View>
              );
            })}
          </>
        )}

        {tab === 'manager_cash' && (
          <>
            {currentShift && (
              <View style={styles.managerCashCard}>
                <Wallet size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.managerCashLabel}>Текущий баланс кассы</Text>
                  <Text style={styles.managerCashValue}>{formatMoney(currentShift.expectedCash)}</Text>
                </View>
              </View>
            )}
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Расходы менеджера</Text>
            {expenseCategories.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
                {expenseCategories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.filterChip, expCategoryFilter === cat && styles.filterChipActive]}
                    onPress={() => setExpCategoryFilter(cat)}
                  >
                    <Text style={[styles.filterChipText, expCategoryFilter === cat && styles.filterChipTextActive]}>
                      {cat === 'all' ? 'Все' : cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {expCategoryFilter !== 'all' && (
              <View style={styles.filterSummary}>
                <Text style={styles.filterSummaryText}>
                  Итого по "{expCategoryFilter}": {formatMoney(filteredExpensesTotal)} ({filteredManagerExpenses.length})
                </Text>
              </View>
            )}
            {filteredManagerExpenses.length === 0 && <Text style={styles.emptyText}>Нет расходов</Text>}
            {filteredManagerExpenses.map(exp => (
              <View key={exp.id} style={styles.opCard}>
                <View style={[styles.opIcon, { backgroundColor: colors.danger + '15' }]}>
                  <TrendingDown size={14} color={colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.opDesc} numberOfLines={1}>{exp.category}: {exp.description}</Text>
                  <Text style={styles.opDate} numberOfLines={1}>{formatDateTime(exp.date)} · {exp.operatorName}</Text>
                </View>
                <Text style={[styles.opAmount, styles.opAmountRed]}>-{formatMoney(exp.amount)}</Text>
              </View>
            ))}
          </>
        )}

        {tab === 'withdraw' && (
          <>
            <Text style={styles.sectionTitle}>Снятие наличных из кассы менеджера</Text>
            {currentShift ? (
              <View style={styles.formCard}>
                <Text style={styles.formHint}>
                  В кассе менеджера: {formatMoney(currentShift.expectedCash)}
                </Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Сумма"
                  placeholderTextColor={colors.textTertiary}
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.formInput}
                  placeholder="Примечание"
                  placeholderTextColor={colors.textTertiary}
                  value={withdrawNote}
                  onChangeText={setWithdrawNote}
                />
                <TouchableOpacity style={styles.actionBtn} onPress={handleWithdraw}>
                  <ArrowDownCircle size={18} color={colors.white} />
                  <Text style={styles.actionBtnText}>Снять</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.emptyText}>Смена не открыта</Text>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>История снятий</Text>
            {[...withdrawals].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20).map(w => (
              <View key={w.id} style={styles.opCard}>
                <View style={[styles.opIcon, { backgroundColor: colors.warning + '15' }]}>
                  <ArrowDownCircle size={14} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.opDesc} numberOfLines={1}>{w.note ?? 'Снятие наличных'}</Text>
                  <Text style={styles.opDate} numberOfLines={1}>{formatDateTime(w.date)} · {w.operatorName}</Text>
                </View>
                <Text style={[styles.opAmount, styles.opAmountRed]}>{formatMoney(w.amount)}</Text>
              </View>
            ))}
          </>
        )}

        {tab === 'expense' && (
          <>
            <Text style={styles.sectionTitle}>Расход администратора</Text>
            <View style={styles.formCard}>
              <TextInput
                style={styles.formInput}
                placeholder="Сумма"
                placeholderTextColor={colors.textTertiary}
                value={expAmount}
                onChangeText={setExpAmount}
                keyboardType="numeric"
              />
              <View style={styles.methodRow}>
                <TouchableOpacity
                  style={[styles.methodBtn, expMethod === 'cash' && styles.methodBtnCash]}
                  onPress={() => setExpMethod('cash')}
                >
                  <Text style={[styles.methodText, expMethod === 'cash' && styles.methodTextActive]}>Наличные</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodBtn, expMethod === 'card' && styles.methodBtnCard]}
                  onPress={() => setExpMethod('card')}
                >
                  <Text style={[styles.methodText, expMethod === 'card' && styles.methodTextActive]}>Безнал</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.formInput}
                placeholder="Категория"
                placeholderTextColor={colors.textTertiary}
                value={expCategory}
                onChangeText={setExpCategory}
              />
              <TextInput
                style={styles.formInput}
                placeholder="Описание"
                placeholderTextColor={colors.textTertiary}
                value={expDesc}
                onChangeText={setExpDesc}
              />
              <TouchableOpacity style={styles.actionBtn} onPress={handleAddExpense}>
                <Plus size={18} color={colors.white} />
                <Text style={styles.actionBtnText}>Добавить расход</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  noAccessText: { fontSize: 16, color: colors.textTertiary },
  tabBar: { maxHeight: 50, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBarContent: { paddingHorizontal: 12, alignItems: 'center', gap: 4 },
  tabBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
  },
  tabBtnActive: { backgroundColor: colors.primarySurface },
  tabText: { fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary },
  tabTextActive: { color: colors.primary, fontWeight: '600' as const },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40 },
  balanceCard: {
    backgroundColor: colors.primarySurface, borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.primary + '20',
  },
  balanceLabel: { fontSize: 13, color: colors.textSecondary },
  balanceValue: { fontSize: 32, fontWeight: '800' as const, color: colors.primary, marginTop: 4 },
  splitRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  splitCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, gap: 4,
  },
  splitLabel: { fontSize: 12, color: colors.textSecondary },
  splitValue: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  managerCashCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  managerCashLabel: { fontSize: 12, color: colors.textSecondary },
  managerCashValue: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  sectionTitle: { fontSize: 16, fontWeight: '600' as const, color: colors.text, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.textTertiary, textAlign: 'center' as const, paddingTop: 20 },
  periodRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  periodChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  periodChipActive: { backgroundColor: colors.primarySurface, borderColor: colors.primary },
  periodText: { fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary },
  periodTextActive: { color: colors.primary, fontWeight: '600' as const },
  registerSummary: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, gap: 10,
  },
  registerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  registerLabel: { flex: 1, fontSize: 13, color: colors.textSecondary, flexShrink: 1 },
  registerValue: { fontSize: 14, fontWeight: '600' as const, flexShrink: 0 },
  registerDivider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  opCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  opIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  opDesc: { fontSize: 13, fontWeight: '500' as const, color: colors.text },
  opDate: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  opAmount: { fontSize: 14, fontWeight: '700' as const },
  opAmountGreen: { color: colors.success },
  opAmountRed: { color: colors.danger },
  formCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  formHint: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
  formInput: {
    backgroundColor: colors.surfaceLight, borderRadius: 10, padding: 12,
    fontSize: 15, color: colors.text, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  methodBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8,
    backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border,
  },
  methodBtnCash: { backgroundColor: colors.cash, borderColor: colors.cash },
  methodBtnCard: { backgroundColor: colors.card, borderColor: colors.card },
  methodText: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary },
  methodTextActive: { color: colors.white },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 12, padding: 14,
  },
  actionBtnText: { fontSize: 15, fontWeight: '600' as const, color: colors.white },
  filterRow: { marginBottom: 12 },
  filterRowContent: { gap: 6 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primarySurface, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '500' as const, color: colors.textSecondary },
  filterChipTextActive: { color: colors.primary, fontWeight: '600' as const },
  filterSummary: {
    backgroundColor: colors.surface, borderRadius: 8, padding: 10,
    marginBottom: 10, borderWidth: 1, borderColor: colors.border,
  },
  filterSummaryText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' as const },
});
