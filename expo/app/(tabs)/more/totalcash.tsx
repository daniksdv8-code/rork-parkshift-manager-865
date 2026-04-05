import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
} from 'react-native';
import {
  Wallet, ArrowDownRight, ArrowUpRight, TrendingUp,
  Banknote, CreditCard, Minus, ArrowRightLeft,
} from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatDateTime } from '@/utils/helpers';

export default function TotalCashScreen() {
  const { currentShift, shifts, transactions, expenses, withdrawals } = useParking();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const previousShift = useMemo(() => {
    const closed = [...shifts]
      .filter(s => s.status === 'closed')
      .sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime());
    return closed[0] ?? null;
  }, [shifts]);

  const currentShiftStats = useMemo(() => {
    if (!currentShift) return null;

    const shiftTx = transactions.filter(t => {
      if (t.shiftId === currentShift.id) return true;
      const tDate = new Date(t.date).getTime();
      return tDate >= new Date(currentShift.openedAt).getTime();
    });

    const cashIncome = shiftTx
      .filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'cash')
      .reduce((s, t) => s + t.amount, 0);

    const cardIncome = shiftTx
      .filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'card')
      .reduce((s, t) => s + t.amount, 0);

    const refunds = shiftTx
      .filter(t => t.type === 'refund' && t.method === 'cash')
      .reduce((s, t) => s + t.amount, 0);

    const shiftExpenses = expenses
      .filter(e => e.shiftId === currentShift.id)
      .reduce((s, e) => s + e.amount, 0);

    const shiftWithdrawals = withdrawals
      .filter(w => w.shiftId === currentShift.id)
      .reduce((s, w) => s + w.amount, 0);

    return {
      cashIncome,
      cardIncome,
      refunds,
      expenses: shiftExpenses,
      withdrawals: shiftWithdrawals,
      totalIncome: cashIncome + cardIncome,
      totalOutgoing: shiftExpenses + shiftWithdrawals + refunds,
      netCash: cashIncome - shiftExpenses - shiftWithdrawals - refunds,
    };
  }, [currentShift, transactions, expenses, withdrawals]);

  const carryOver = currentShift?.carryOver ?? 0;
  const accepted = currentShift?.acceptedCash ?? carryOver;
  const currentCashIncome = currentShiftStats?.netCash ?? 0;
  const totalCash = accepted + currentCashIncome;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.totalCard}>
        <View style={styles.totalIconRow}>
          <View style={styles.totalIconWrap}>
            <Wallet size={28} color={colors.primary} />
          </View>
        </View>
        <Text style={styles.totalLabel}>Общая касса</Text>
        <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totalCash)}</Text>
        {currentShift && (
          <Text style={styles.totalSub}>
            Обновлено на {formatDateTime(new Date().toISOString())}
          </Text>
        )}
      </View>

      <View style={styles.breakdownRow}>
        <View style={[styles.breakdownCard, styles.carryOverBg]}>
          <ArrowRightLeft size={18} color={colors.warning} />
          <Text style={styles.breakdownLabel}>Принято при открытии</Text>
          <Text style={[styles.breakdownValue, { color: colors.warning }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(currentShift?.acceptedCash ?? carryOver)}
          </Text>
        </View>
        <View style={[styles.breakdownCard, styles.currentBg]}>
          <TrendingUp size={18} color={colors.success} />
          <Text style={styles.breakdownLabel}>Текущая смена</Text>
          <Text style={[styles.breakdownValue, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(currentCashIncome)}
          </Text>
        </View>
      </View>

      {previousShift && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Предыдущая смена</Text>
          <View style={styles.prevShiftCard}>
            <View style={styles.prevShiftRow}>
              <Text style={styles.prevLabel}>Оператор</Text>
              <Text style={styles.prevValue} numberOfLines={1}>{previousShift.operatorName}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.prevShiftRow}>
              <Text style={styles.prevLabel}>Открыта</Text>
              <Text style={styles.prevValue} numberOfLines={1}>{formatDateTime(previousShift.openedAt)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.prevShiftRow}>
              <Text style={styles.prevLabel}>Закрыта</Text>
              <Text style={styles.prevValue} numberOfLines={1}>{previousShift.closedAt ? formatDateTime(previousShift.closedAt) : '—'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.prevShiftRow}>
              <Text style={styles.prevLabel}>Факт. сумма при закрытии</Text>
              <Text style={[styles.prevValue, { color: colors.primary }]} numberOfLines={1}>{formatMoney(previousShift.actualCash)}</Text>
            </View>
            {previousShift.closingSummary && (
              <>
                <View style={styles.divider} />
                <View style={styles.prevShiftRow}>
                  <Text style={styles.prevLabel}>Наличные за смену</Text>
                  <Text style={styles.prevValue} numberOfLines={1}>{formatMoney(previousShift.closingSummary.cashIncome)}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.prevShiftRow}>
                  <Text style={styles.prevLabel}>Безнал за смену</Text>
                  <Text style={styles.prevValue} numberOfLines={1}>{formatMoney(previousShift.closingSummary.cardIncome)}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.prevShiftRow}>
                  <Text style={styles.prevLabel}>Расходы за смену</Text>
                  <Text style={[styles.prevValue, { color: colors.danger }]} numberOfLines={1}>
                    {formatMoney(previousShift.closingSummary.totalExpenses)}
                  </Text>
                </View>
              </>
            )}
            {previousShift.cashVarianceType !== 'none' && (
              <>
                <View style={styles.divider} />
                <View style={styles.prevShiftRow}>
                  <Text style={styles.prevLabel}>
                    {previousShift.cashVarianceType === 'short' ? 'Недостача' : 'Излишек'}
                  </Text>
                  <Text style={[styles.prevValue, { color: colors.danger }]}>
                    {formatMoney(previousShift.cashVariance)}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      )}

      {currentShift && currentShiftStats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Текущая смена — детали</Text>

          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <View style={styles.detailIconWrap}>
                <Banknote size={16} color={colors.cash} />
              </View>
              <Text style={styles.detailLabel} numberOfLines={1}>Наличные поступления</Text>
              <Text style={[styles.detailValue, { color: colors.cash }]}>
                +{formatMoney(currentShiftStats.cashIncome)}
              </Text>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={styles.detailIconWrap}>
                <CreditCard size={16} color={colors.card} />
              </View>
              <Text style={styles.detailLabel} numberOfLines={1}>Безналичные поступления</Text>
              <Text style={[styles.detailValue, { color: colors.card }]}>
                +{formatMoney(currentShiftStats.cardIncome)}
              </Text>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={styles.detailIconWrap}>
                <ArrowDownRight size={16} color={colors.danger} />
              </View>
              <Text style={styles.detailLabel}>Расходы</Text>
              <Text style={[styles.detailValue, { color: colors.danger }]}>
                -{formatMoney(currentShiftStats.expenses)}
              </Text>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={styles.detailIconWrap}>
                <ArrowUpRight size={16} color={colors.danger} />
              </View>
              <Text style={styles.detailLabel}>Снятия</Text>
              <Text style={[styles.detailValue, { color: colors.danger }]}>
                -{formatMoney(currentShiftStats.withdrawals)}
              </Text>
            </View>

            {currentShiftStats.refunds > 0 && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <View style={styles.detailIconWrap}>
                    <Minus size={16} color={colors.warning} />
                  </View>
                  <Text style={styles.detailLabel}>Возвраты</Text>
                  <Text style={[styles.detailValue, { color: colors.warning }]}>
                    -{formatMoney(currentShiftStats.refunds)}
                  </Text>
                </View>
              </>
            )}
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Ожидаемый баланс кассы</Text>
            <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(currentShift.expectedCash)}</Text>
          </View>
        </View>
      )}

      {!currentShift && (
        <View style={styles.noShiftWrap}>
          <Text style={styles.noShiftText}>Смена не открыта</Text>
          <Text style={styles.noShiftSub}>
            Откройте смену в разделе «Касса» для начала работы
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },

  totalCard: {
    backgroundColor: colors.primarySurface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center' as const,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary + '25',
  },
  totalIconRow: { marginBottom: 12 },
  totalIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: colors.primary + '18',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  totalLabel: {
    fontSize: 14, color: colors.textSecondary, fontWeight: '500' as const,
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 36, fontWeight: '800' as const, color: colors.primary,
    letterSpacing: -1,
  },
  totalSub: {
    fontSize: 11, color: colors.textTertiary, marginTop: 8,
  },

  breakdownRow: {
    flexDirection: 'row' as const, gap: 10, marginBottom: 20,
  },
  breakdownCard: {
    flex: 1, borderRadius: 14, padding: 16, gap: 6,
    borderWidth: 1,
  },
  carryOverBg: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warning + '20',
  },
  currentBg: {
    backgroundColor: colors.successSurface,
    borderColor: colors.success + '20',
  },
  breakdownLabel: {
    fontSize: 12, color: colors.textSecondary, fontWeight: '500' as const,
  },
  breakdownValue: {
    fontSize: 20, fontWeight: '700' as const,
  },

  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 15, fontWeight: '600' as const, color: colors.text,
    marginBottom: 10,
  },

  prevShiftCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: colors.border,
  },
  prevShiftRow: {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const,
    alignItems: 'center' as const, paddingVertical: 6,
  },
  prevLabel: {
    fontSize: 13, color: colors.textSecondary, flex: 1, flexShrink: 1,
  },
  prevValue: {
    fontSize: 14, fontWeight: '600' as const, color: colors.text, flexShrink: 0, maxWidth: '50%' as unknown as number, textAlign: 'right' as const,
  },
  divider: {
    height: 1, backgroundColor: colors.border, marginVertical: 2,
  },

  detailCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    paddingVertical: 8,
  },
  detailIconWrap: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    marginRight: 10,
  },
  detailLabel: {
    flex: 1, fontSize: 13, color: colors.textSecondary,
  },
  detailValue: {
    fontSize: 14, fontWeight: '700' as const,
  },
  detailDivider: {
    height: 1, backgroundColor: colors.border, marginLeft: 40,
  },

  summaryCard: {
    backgroundColor: colors.primary + '12',
    borderRadius: 12, padding: 16,
    flexDirection: 'row' as const, justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    borderWidth: 1, borderColor: colors.primary + '25',
  },
  summaryLabel: {
    fontSize: 14, fontWeight: '500' as const, color: colors.textSecondary, flex: 1, flexShrink: 1,
  },
  summaryValue: {
    fontSize: 20, fontWeight: '800' as const, color: colors.primary, flexShrink: 0,
  },

  noShiftWrap: {
    alignItems: 'center' as const, paddingTop: 40,
  },
  noShiftText: {
    fontSize: 17, fontWeight: '600' as const, color: colors.textSecondary,
  },
  noShiftSub: {
    fontSize: 13, color: colors.textTertiary, marginTop: 6, textAlign: 'center' as const,
  },
});
