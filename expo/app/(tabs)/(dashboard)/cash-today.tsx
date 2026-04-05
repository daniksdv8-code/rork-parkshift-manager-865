import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Banknote, ArrowUpRight, ArrowDownRight, X as XIcon } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatDateTime, isToday } from '@/utils/helpers';
import { Transaction } from '@/types';

export default function CashTodayScreen() {
  const { transactions } = useParking();
  const colors = useColors();

  const cashTx = useMemo(() =>
    transactions
      .filter(t => isToday(t.date) && t.method === 'cash' && t.amount > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  [transactions]);

  const totals = useMemo(() => {
    let income = 0;
    let cancelled = 0;
    let refunded = 0;
    for (const t of cashTx) {
      if (['payment', 'debt_payment'].includes(t.type)) income += t.amount;
      if (t.type === 'cancel_payment') cancelled += t.amount;
      if (t.type === 'refund') refunded += t.amount;
    }
    return { income, cancelled, refunded, net: income - cancelled - refunded };
  }, [cashTx]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderItem = ({ item }: { item: Transaction }) => {
    const isIncome = ['payment', 'debt_payment'].includes(item.type);
    const isCancel = item.type === 'cancel_payment';
    return (
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: isCancel ? colors.dangerSurface : isIncome ? colors.successSurface : colors.warningSurface }]}>
          {isCancel ? <XIcon size={14} color={colors.danger} /> : isIncome ? <ArrowUpRight size={14} color={colors.success} /> : <ArrowDownRight size={14} color={colors.warning} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
          <Text style={styles.meta}>{formatDateTime(item.date)} · {item.operatorName}</Text>
        </View>
        <Text style={[styles.amount, isIncome ? styles.amountGreen : styles.amountRed]}>
          {isIncome ? '+' : '-'}{formatMoney(item.amount)}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Banknote size={22} color={colors.cash} />
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>Наличные сегодня</Text>
          <Text style={styles.summaryValue}>{formatMoney(totals.net)}</Text>
        </View>
      </View>

      <View style={styles.breakdownRow}>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Приход</Text>
          <Text style={[styles.breakdownValue, { color: colors.success }]}>{formatMoney(totals.income)}</Text>
        </View>
        {totals.cancelled > 0 && (
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>Отмены</Text>
            <Text style={[styles.breakdownValue, { color: colors.danger }]}>-{formatMoney(totals.cancelled)}</Text>
          </View>
        )}
        {totals.refunded > 0 && (
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>Возвраты</Text>
            <Text style={[styles.breakdownValue, { color: colors.warning }]}>-{formatMoney(totals.refunded)}</Text>
          </View>
        )}
      </View>

      <Text style={styles.listTitle}>{cashTx.length} операций</Text>
      <FlatList
        data={cashTx}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Нет операций за сегодня</Text>}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.surface, margin: 16, marginBottom: 0,
    borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border,
  },
  summaryLabel: { fontSize: 13, color: colors.textSecondary },
  summaryValue: { fontSize: 26, fontWeight: '800' as const, color: colors.cash, marginTop: 2 },
  breakdownRow: {
    flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 10, marginBottom: 12,
  },
  breakdownItem: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  breakdownLabel: { fontSize: 11, color: colors.textTertiary },
  breakdownValue: { fontSize: 14, fontWeight: '700' as const, marginTop: 4 },
  listTitle: { fontSize: 13, color: colors.textTertiary, marginHorizontal: 16, marginBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  desc: { fontSize: 13, color: colors.text },
  meta: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '700' as const },
  amountGreen: { color: colors.success },
  amountRed: { color: colors.danger },
  empty: { fontSize: 14, color: colors.textTertiary, textAlign: 'center' as const, paddingVertical: 40 },
});
