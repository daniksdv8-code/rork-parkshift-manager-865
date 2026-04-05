import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Wallet, ChevronRight } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatDate } from '@/utils/helpers';
import { calculateActiveSessionDebt } from '@/utils/financeCalculations';


export default function DebtsListScreen() {
  const router = useRouter();
  const { activeDebts, activeClients, activeCars, activeSessions, tariffs, subscriptions, debts } = useParking();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const allDebts = useMemo(() => {
    const items: { id: string; clientId: string; clientName: string; plates: string; amount: number; description: string; date: string; type: 'old' | 'lombard' }[] = [];

    activeDebts.forEach(d => {
      const client = activeClients.find(c => c.id === d.clientId);
      const car = activeCars.find(c => c.id === d.carId);
      items.push({
        id: d.id,
        clientId: d.clientId,
        clientName: client?.name ?? 'Неизвестный',
        plates: car?.plateNumber ?? '',
        amount: d.remainingAmount,
        description: d.description,
        date: d.createdAt,
        type: 'old',
      });
    });

    const lombardClients = new Map<string, number>();
    activeSessions
      .filter(s => (s.serviceType === 'lombard' || s.status === 'active_debt') && !s.exitTime && !s.cancelled)
      .forEach(s => {
        const sDebt = calculateActiveSessionDebt(s, tariffs, subscriptions, debts);
        if (sDebt > 0) {
          lombardClients.set(s.clientId, (lombardClients.get(s.clientId) ?? 0) + sDebt);
        }
      });

    lombardClients.forEach((amount, clientId) => {
      const client = activeClients.find(c => c.id === clientId);
      const cars = activeCars.filter(c => c.clientId === clientId);
      items.push({
        id: `lombard-${clientId}`,
        clientId,
        clientName: client?.name ?? 'Неизвестный',
        plates: cars.map(c => c.plateNumber).join(', '),
        amount,
        description: 'Начисленный долг (ломбард)',
        date: new Date().toISOString(),
        type: 'lombard',
      });
    });

    return items.sort((a, b) => b.amount - a.amount);
  }, [activeDebts, activeClients, activeCars, activeSessions, tariffs, subscriptions, debts]);

  const totalDebt = useMemo(() =>
    allDebts.reduce((sum, d) => sum + d.amount, 0),
  [allDebts]);

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Wallet size={20} color={colors.danger} />
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>Все долги</Text>
          <Text style={styles.summaryValue}>{formatMoney(totalDebt)}</Text>
        </View>
        <Text style={styles.summaryCount}>{allDebts.length} записей</Text>
      </View>

      <FlatList
        data={allDebts}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push({ pathname: '/client-card', params: { clientId: item.clientId } })}
            activeOpacity={0.7}
          >
            <View style={[styles.typeDot, { backgroundColor: item.type === 'lombard' ? colors.warning : colors.danger }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.clientName}>{item.clientName}</Text>
              <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
              <View style={styles.metaRow}>
                {item.plates ? <Text style={styles.plate}>{item.plates}</Text> : null}
                <Text style={styles.date}>{formatDate(item.date)}</Text>
              </View>
            </View>
            <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
            <ChevronRight size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Долгов нет</Text>
          </View>
        }
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.dangerSurface, borderRadius: 14,
    padding: 16, margin: 16, marginBottom: 8,
    borderWidth: 1, borderColor: colors.danger + '20',
  },
  summaryLabel: { fontSize: 13, color: colors.textSecondary },
  summaryValue: { fontSize: 22, fontWeight: '800' as const, color: colors.danger },
  summaryCount: { fontSize: 13, color: colors.textSecondary },
  list: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12,
    padding: 14, marginBottom: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  typeDot: {
    width: 8, height: 8, borderRadius: 4, marginRight: 12,
  },
  clientName: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  description: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  plate: { fontSize: 11, fontWeight: '600' as const, color: colors.textTertiary },
  date: { fontSize: 11, color: colors.textTertiary },
  amount: { fontSize: 14, fontWeight: '700' as const, color: colors.danger, marginRight: 6 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: colors.textTertiary },
});
