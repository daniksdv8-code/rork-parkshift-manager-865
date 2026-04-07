import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { CreditCard, ArrowUpRight, X as XIcon } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatDateTime, isToday } from '@/utils/helpers';
import { Transaction } from '@/types';
import { useRouter } from 'expo-router';

export default function CardTodayScreen() {
  const router = useRouter();
  const { transactions } = useParking();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const cardTx = useMemo(() =>
    transactions
      .filter(t => isToday(t.date) && t.method === 'card' && t.amount > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  [transactions]);

  const totals = useMemo(() => {
    let income = 0;
    let cancelled = 0;
    for (const t of cardTx) {
      if (['payment', 'debt_payment'].includes(t.type)) income += t.amount;
      if (['cancel_payment', 'refund'].includes(t.type)) cancelled += t.amount;
    }
    return { income, cancelled, net: income - cancelled };
  }, [cardTx]);

  const renderItem = ({ item }: { item: Transaction }) => {
    const isIncome = ['payment', 'debt_payment'].includes(item.type);
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => { if (item.clientId) router.push({ pathname: '/client-card', params: { clientId: item.clientId } }); }}
        activeOpacity={item.clientId ? 0.7 : 1}
      >
        <View style={[styles.iconWrap, { backgroundColor: isIncome ? colors.infoSurface : colors.dangerSurface }]}>
          {isIncome ? <ArrowUpRight size={14} color={colors.info} /> : <XIcon size={14} color={colors.danger} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
          <Text style={styles.meta}>{formatDateTime(item.date)} · {item.operatorName}</Text>
        </View>
        <Text style={[styles.amount, isIncome ? styles.amountBlue : styles.amountRed]}>
          {isIncome ? '+' : '-'}{formatMoney(item.amount)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <CreditCard size={22} color={colors.card} />
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>Безнал сегодня</Text>
          <Text style={styles.summaryValue}>{formatMoney(totals.net)}</Text>
        </View>
      </View>

      <View style={styles.breakdownRow}>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Приход</Text>
          <Text style={[styles.breakdownValue, { color: colors.info }]}>{formatMoney(totals.income)}</Text>
        </View>
        {totals.cancelled > 0 && (
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>Отмены/Возвраты</Text>
            <Text style={[styles.breakdownValue, { color: colors.danger }]}>-{formatMoney(totals.cancelled)}</Text>
          </View>
        )}
      </View>

      <Text style={styles.listTitle}>{cardTx.length} операций</Text>
      <FlatList
        data={cardTx}
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
  summaryValue: { fontSize: 26, fontWeight: '800' as const, color: colors.card, marginTop: 2 },
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
  amountBlue: { color: colors.info },
  amountRed: { color: colors.danger },
  empty: { fontSize: 14, color: colors.textTertiary, textAlign: 'center' as const, paddingVertical: 40 },
});
