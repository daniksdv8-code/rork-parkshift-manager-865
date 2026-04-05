import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Wallet, CreditCard, Banknote } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatDateTime, isToday } from '@/utils/helpers';
import { Transaction } from '@/types';

export default function DebtPaymentsTodayScreen() {
  const { transactions, activeClients, activeCars } = useParking();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const debtPayments = useMemo(() =>
    transactions
      .filter(t => isToday(t.date) && t.type === 'debt_payment')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  [transactions]);

  const totalToday = useMemo(() =>
    debtPayments.reduce((sum, t) => sum + t.amount, 0),
  [debtPayments]);

  const renderItem = ({ item }: { item: Transaction }) => {
    const client = activeClients.find(c => c.id === item.clientId);
    const car = activeCars.find(c => c.id === item.carId);
    const isCash = item.method === 'cash';
    return (
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: isCash ? colors.successSurface : colors.infoSurface }]}>
          {isCash ? <Banknote size={14} color={colors.cash} /> : <CreditCard size={14} color={colors.card} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.clientName}>{client?.name ?? 'Клиент'}</Text>
          {car && <Text style={styles.carInfo}>{car.plateNumber}</Text>}
          <Text style={styles.meta}>{formatDateTime(item.date)} · {item.operatorName}</Text>
        </View>
        <Text style={styles.amount}>+{formatMoney(item.amount)}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Wallet size={22} color={colors.info} />
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>Погашено долгов сегодня</Text>
          <Text style={styles.summaryValue}>{formatMoney(totalToday)}</Text>
        </View>
        <Text style={styles.summaryCount}>{debtPayments.length} оплат</Text>
      </View>

      <FlatList
        data={debtPayments}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Нет погашений за сегодня</Text>}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.surface, margin: 16, marginBottom: 12,
    borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border,
  },
  summaryLabel: { fontSize: 13, color: colors.textSecondary },
  summaryValue: { fontSize: 22, fontWeight: '800' as const, color: colors.info, marginTop: 2 },
  summaryCount: { fontSize: 12, color: colors.textTertiary },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  clientName: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  carInfo: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  meta: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700' as const, color: colors.success },
  empty: { fontSize: 14, color: colors.textTertiary, textAlign: 'center' as const, paddingVertical: 40 },
});
