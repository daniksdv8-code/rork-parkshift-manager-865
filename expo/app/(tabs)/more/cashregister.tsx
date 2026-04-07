import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import {
  PlayCircle, StopCircle, Wallet, TrendingUp, TrendingDown,
  Plus,
} from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatDateTime } from '@/utils/helpers';
import { calculateShiftCashBalance } from '@/utils/financeCalculations';
import { AlertTriangle } from 'lucide-react-native';
import { hapticSuccess, hapticMedium } from '@/utils/haptics';

export default function CashRegisterScreen() {
  const { currentUser, isManager } = useAuth();
  const colors = useColors();
  const {
    currentShift, shifts, openShift, closeShift, addExpense,
    transactions, expenses, withdrawals,
  } = useParking();

  const [actualCash, setActualCash] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [acceptedCashInput, setAcceptedCashInput] = useState('');
  const styles = useMemo(() => createStyles(colors), [colors]);

  const lastClosedShift = useMemo(() => {
    return [...shifts]
      .filter(s => s.status === 'closed')
      .sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime())[0] ?? null;
  }, [shifts]);

  const previousCash = lastClosedShift?.actualCash ?? 0;

  const isBlockedByOther = isManager && currentShift && currentUser && currentShift.operatorId !== currentUser.id;

  const handleOpenShift = useCallback(() => {
    hapticMedium();
    const cash = acceptedCashInput.trim() === '' ? undefined : parseFloat(acceptedCashInput.replace(',', '.'));
    if (cash !== undefined && (isNaN(cash) || cash < 0)) {
      Alert.alert('Ошибка', 'Введите корректную сумму');
      return;
    }
    const result = openShift(cash);
    if (result && 'blocked' in result) {
      Alert.alert('Смена занята', `Сейчас работает ${result.operatorName}. Дождитесь закрытия смены.`);
      return;
    }
    if (result) {
      setAcceptedCashInput('');
      hapticSuccess();
      Alert.alert('Готово', `Смена открыта. Принято: ${formatMoney(cash ?? previousCash)}`);
    }
  }, [openShift, acceptedCashInput, previousCash]);

  const expectedCash = useMemo(() => {
    if (!currentShift) return 0;
    return calculateShiftCashBalance(currentShift, transactions, expenses, withdrawals);
  }, [currentShift, transactions, expenses, withdrawals]);

  const handleCloseShift = useCallback(() => {
    const cash = parseFloat(actualCash);
    if (isNaN(cash) || cash < 0) {
      Alert.alert('Ошибка', 'Введите фактическую сумму в кассе');
      return;
    }

    const discrepancy = cash - expectedCash;
    const absDiscrepancy = Math.abs(discrepancy);

    const doClose = () => {
      closeShift(cash, closeNote || undefined);
      setActualCash('');
      setCloseNote('');
      hapticSuccess();
      Alert.alert('Готово', 'Смена закрыта');
    };

    if (absDiscrepancy > 0.01) {
      const type = discrepancy < 0 ? 'Недостача' : 'Излишек';
      Alert.alert(
        '⚠️ Расхождение в кассе',
        `Ожидаемая сумма: ${formatMoney(expectedCash)}\nФактическая сумма: ${formatMoney(cash)}\n\n${type}: ${formatMoney(absDiscrepancy)}\n\nВы уверены, что хотите закрыть смену с расхождением?`,
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Закрыть всё равно', style: 'destructive', onPress: doClose },
        ]
      );
    } else {
      Alert.alert('Закрытие смены', `Фактическая сумма: ${formatMoney(cash)}`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Закрыть', onPress: doClose },
      ]);
    }
  }, [actualCash, closeNote, closeShift, expectedCash]);

  const handleAddExpense = useCallback(() => {
    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Ошибка', 'Введите сумму расхода');
      return;
    }
    const result = addExpense(amt, expenseCategory || 'Хоз. расходы', expenseDesc || 'Расход');
    if (!result?.success) {
      Alert.alert('Ошибка', result?.error ?? 'Недостаточно средств в кассе');
      return;
    }
    setExpenseAmount('');
    setExpenseCategory('');
    setExpenseDesc('');
    setShowExpenseForm(false);
    hapticSuccess();
    Alert.alert('Готово', 'Расход добавлен');
  }, [expenseAmount, expenseCategory, expenseDesc, addExpense]);

  const shiftStats = useMemo(() => {
    if (!currentShift) return null;
    const shiftTx = transactions.filter(t => {
      if (t.shiftId === currentShift.id) return true;
      const tDate = new Date(t.date).getTime();
      return tDate >= new Date(currentShift.openedAt).getTime();
    });
    const cashIncome = shiftTx.filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'cash').reduce((s, t) => s + t.amount, 0);
    const cardIncome = shiftTx.filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'card').reduce((s, t) => s + t.amount, 0);
    const shiftExpenses = expenses.filter(e => e.shiftId === currentShift.id).reduce((s, e) => s + e.amount, 0);
    const shiftWithdrawals = withdrawals.filter(w => w.shiftId === currentShift.id).reduce((s, w) => s + w.amount, 0);
    return { cashIncome, cardIncome, expenses: shiftExpenses, withdrawals: shiftWithdrawals };
  }, [currentShift, transactions, expenses, withdrawals]);

  const recentShifts = useMemo(() =>
    [...shifts].filter(s => s.status === 'closed').sort((a, b) =>
      new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime()
    ).slice(0, 5),
  [shifts]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!currentShift || isBlockedByOther ? (
        <View style={styles.noShift}>
          <View style={styles.noShiftIcon}>
            {isBlockedByOther ? (
              <StopCircle size={48} color={colors.danger} />
            ) : (
              <PlayCircle size={48} color={colors.warning} />
            )}
          </View>
          {isBlockedByOther ? (
            <>
              <Text style={styles.noShiftTitle}>Смена занята</Text>
              <Text style={styles.noShiftSub}>
                Сейчас работает: {currentShift?.operatorName}
              </Text>
              <Text style={[styles.noShiftSub, { marginTop: 4 }]}>
                Дождитесь закрытия текущей смены
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.noShiftTitle}>Смена не открыта</Text>
              <Text style={styles.noShiftSub}>Укажите сумму, которую принимаете</Text>
              <View style={styles.acceptCashWrap}>
                <View style={styles.prevCashRow}>
                  <Wallet size={16} color={colors.textSecondary} />
                  <Text style={styles.prevCashLabel}>Общая касса (с прошлой смены):</Text>
                </View>
                <Text style={styles.prevCashValue}>{formatMoney(previousCash)}</Text>
                <Text style={styles.acceptInputLabel}>Принимаю в кассу, ₽</Text>
                <TextInput
                  style={styles.formInput}
                  value={acceptedCashInput}
                  onChangeText={setAcceptedCashInput}
                  placeholder={String(previousCash)}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  testID="accepted-cash-register-input"
                />
                <Text style={styles.acceptHint}>
                  Оставьте пустым, чтобы принять {formatMoney(previousCash)}
                </Text>
              </View>
              <TouchableOpacity style={styles.openBtn} onPress={handleOpenShift}>
                <PlayCircle size={20} color={colors.white} />
                <Text style={styles.openBtnText}>Открыть смену</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : (
        <>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Баланс кассы</Text>
            <Text style={styles.balanceValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(currentShift.expectedCash)}</Text>
            <Text style={styles.balanceSub} numberOfLines={1}>
              Открыта: {formatDateTime(currentShift.openedAt)} · {currentShift.operatorName}
            </Text>
          </View>

          {shiftStats && (
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <TrendingUp size={16} color={colors.cash} />
                <Text style={styles.statLabel} numberOfLines={1}>Наличные</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(shiftStats.cashIncome)}</Text>
              </View>
              <View style={styles.statCard}>
                <TrendingUp size={16} color={colors.card} />
                <Text style={styles.statLabel} numberOfLines={1}>Безнал</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(shiftStats.cardIncome)}</Text>
              </View>
              <View style={styles.statCard}>
                <TrendingDown size={16} color={colors.danger} />
                <Text style={styles.statLabel} numberOfLines={1}>Расходы</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(shiftStats.expenses)}</Text>
              </View>
            </View>
          )}

          <View style={styles.carryOverCard}>
            <Wallet size={16} color={colors.textSecondary} />
            <Text style={styles.carryOverText} numberOfLines={1}>
              Принято при открытии: {formatMoney(currentShift.acceptedCash ?? currentShift.carryOver)}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.expenseBtn}
            onPress={() => setShowExpenseForm(!showExpenseForm)}
          >
            <Plus size={16} color={colors.warning} />
            <Text style={styles.expenseBtnText}>Добавить расход</Text>
          </TouchableOpacity>

          {showExpenseForm && (
            <View style={styles.expenseForm}>
              <TextInput
                style={styles.formInput}
                placeholder="Сумма"
                placeholderTextColor={colors.textTertiary}
                value={expenseAmount}
                onChangeText={setExpenseAmount}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.formInput}
                placeholder="Категория (напр. Хоз. расходы)"
                placeholderTextColor={colors.textTertiary}
                value={expenseCategory}
                onChangeText={setExpenseCategory}
              />
              <TextInput
                style={styles.formInput}
                placeholder="Описание"
                placeholderTextColor={colors.textTertiary}
                value={expenseDesc}
                onChangeText={setExpenseDesc}
              />
              <TouchableOpacity style={styles.expenseSubmit} onPress={handleAddExpense}>
                <Text style={styles.expenseSubmitText}>Добавить</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.closeSection}>
            <Text style={styles.closeSectionTitle}>Закрытие смены</Text>
            <View style={styles.expectedRow}>
              <Text style={styles.expectedLabel}>Ожидаемая сумма:</Text>
              <Text style={styles.expectedValue}>{formatMoney(expectedCash)}</Text>
            </View>
            <TextInput
              style={styles.formInput}
              placeholder="Фактическая сумма в кассе"
              placeholderTextColor={colors.textTertiary}
              value={actualCash}
              onChangeText={setActualCash}
              keyboardType="numeric"
            />
            {actualCash !== '' && !isNaN(parseFloat(actualCash)) && Math.abs(parseFloat(actualCash) - expectedCash) > 0.01 && (
              <View style={styles.varianceBanner}>
                <AlertTriangle size={16} color={colors.danger} />
                <Text style={styles.varianceText} numberOfLines={1}>
                  {parseFloat(actualCash) < expectedCash ? 'Недостача' : 'Излишек'}:{' '}
                  {formatMoney(Math.abs(parseFloat(actualCash) - expectedCash))}
                </Text>
              </View>
            )}
            <TextInput
              style={styles.formInput}
              placeholder="Комментарий (необязательно)"
              placeholderTextColor={colors.textTertiary}
              value={closeNote}
              onChangeText={setCloseNote}
            />
            <TouchableOpacity style={styles.closeBtn} onPress={handleCloseShift}>
              <StopCircle size={18} color={colors.white} />
              <Text style={styles.closeBtnText}>Закрыть смену</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {recentShifts.length > 0 && (
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Последние смены</Text>
          {recentShifts.map(shift => (
            <View key={shift.id} style={styles.shiftCard}>
              <View style={styles.shiftHeader}>
                <Text style={styles.shiftOperator} numberOfLines={1}>{shift.operatorName}</Text>
                <Text style={styles.shiftDate} numberOfLines={1}>{formatDateTime(shift.openedAt)}</Text>
              </View>
              {shift.closingSummary && (
                <View style={styles.shiftDetails}>
                  <Text style={styles.shiftDetail} numberOfLines={1}>Наличные: {formatMoney(shift.closingSummary.cashIncome)}</Text>
                  <Text style={styles.shiftDetail} numberOfLines={1}>Безнал: {formatMoney(shift.closingSummary.cardIncome)}</Text>
                  <Text style={styles.shiftDetail} numberOfLines={1}>Расходы: {formatMoney(shift.closingSummary.totalExpenses)}</Text>
                  {shift.cashVarianceType !== 'none' && (
                    <Text style={[styles.shiftDetail, { color: colors.danger }]}>
                      {shift.cashVarianceType === 'short' ? 'Недостача' : 'Излишек'}: {formatMoney(shift.cashVariance)}
                    </Text>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  noShift: { alignItems: 'center', paddingTop: 60 },
  noShiftIcon: { marginBottom: 16 },
  noShiftTitle: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  noShiftSub: { fontSize: 14, color: colors.textSecondary, marginTop: 4, marginBottom: 16 },
  acceptCashWrap: {
    width: '100%', alignItems: 'center' as const, marginBottom: 16, paddingHorizontal: 20,
  },
  prevCashRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 4,
  },
  prevCashLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' as const },
  prevCashValue: {
    fontSize: 24, fontWeight: '800' as const, color: colors.primary,
    marginBottom: 16, letterSpacing: -0.5,
  },
  acceptInputLabel: {
    fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary,
    marginBottom: 6, alignSelf: 'flex-start' as const,
  },
  acceptHint: {
    fontSize: 11, color: colors.textTertiary, marginTop: 4, textAlign: 'center' as const,
  },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14,
  },
  openBtnText: { fontSize: 16, fontWeight: '700' as const, color: colors.white },
  balanceCard: {
    backgroundColor: colors.primarySurface, borderRadius: 16,
    padding: 20, marginBottom: 16, borderWidth: 1, borderColor: colors.primary + '20',
  },
  balanceLabel: { fontSize: 13, color: colors.textSecondary },
  balanceValue: { fontSize: 32, fontWeight: '800' as const, color: colors.primary, marginTop: 4 },
  balanceSub: { fontSize: 12, color: colors.textTertiary, marginTop: 6 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  statLabel: { fontSize: 11, color: colors.textSecondary },
  statValue: { fontSize: 15, fontWeight: '700' as const, color: colors.text },
  carryOverCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
  },
  carryOverText: { fontSize: 13, color: colors.textSecondary },
  expenseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.warningSurface, borderRadius: 10,
    padding: 12, marginBottom: 8,
  },
  expenseBtnText: { fontSize: 14, fontWeight: '500' as const, color: colors.warning },
  expenseForm: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: colors.border,
  },
  formInput: {
    backgroundColor: colors.surfaceLight, borderRadius: 10, padding: 12,
    fontSize: 15, color: colors.text, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  expenseSubmit: {
    backgroundColor: colors.warning, borderRadius: 10, padding: 12, alignItems: 'center',
  },
  expenseSubmitText: { fontSize: 14, fontWeight: '600' as const, color: colors.black },
  closeSection: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginTop: 8, borderWidth: 1, borderColor: colors.border,
  },
  closeSectionTitle: { fontSize: 16, fontWeight: '600' as const, color: colors.text, marginBottom: 12 },
  expectedRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.primarySurface, borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.primary + '30',
  },
  expectedLabel: { fontSize: 13, color: colors.textSecondary, flexShrink: 1 },
  expectedValue: { fontSize: 16, fontWeight: '700' as const, color: colors.primary, flexShrink: 0 },
  varianceBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.danger + '15', borderRadius: 10, padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: colors.danger + '30',
  },
  varianceText: { fontSize: 13, fontWeight: '600' as const, color: colors.danger, flex: 1 },
  closeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.danger, borderRadius: 12, padding: 14,
  },
  closeBtnText: { fontSize: 15, fontWeight: '600' as const, color: colors.white },
  historySection: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600' as const, color: colors.text, marginBottom: 12 },
  shiftCard: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  shiftHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  shiftOperator: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  shiftDate: { fontSize: 12, color: colors.textTertiary },
  shiftDetails: { gap: 2 },
  shiftDetail: { fontSize: 13, color: colors.textSecondary },
});
