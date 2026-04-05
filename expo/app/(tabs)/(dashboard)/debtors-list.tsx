import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, ChevronRight, Wallet } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney } from '@/utils/helpers';

export default function DebtorsListScreen() {
  const router = useRouter();
  const { debtors, activeCars, activeSessions } = useParking();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const totalDebt = useMemo(() =>
    debtors.reduce((sum, d) => sum + d.amount, 0),
  [debtors]);

  const sortedDebtors = useMemo(() =>
    [...debtors].sort((a, b) => b.amount - a.amount),
  [debtors]);

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Wallet size={20} color={colors.danger} />
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>Общий долг</Text>
          <Text style={styles.summaryValue}>{formatMoney(totalDebt)}</Text>
        </View>
        <Text style={styles.summaryCount}>{debtors.length} должн.</Text>
      </View>

      <FlatList
        data={sortedDebtors}
        keyExtractor={item => item.clientId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const cars = activeCars.filter(c => c.clientId === item.clientId);
          const isParked = activeSessions.some(s => s.clientId === item.clientId);

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: '/client-card', params: { clientId: item.clientId } })}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                <AlertTriangle size={16} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.client?.name ?? 'Неизвестный'}</Text>
                  {isParked && (
                    <View style={styles.parkedBadge}>
                      <Text style={styles.parkedBadgeText}>🅿️</Text>
                    </View>
                  )}
                </View>
                {cars.length > 0 && (
                  <Text style={styles.carsText}>
                    {cars.map(c => c.plateNumber).join(', ')}
                  </Text>
                )}
              </View>
              <Text style={styles.debtAmount}>{formatMoney(item.amount)}</Text>
              <ChevronRight size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Должников нет</Text>
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
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.dangerSurface,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
  parkedBadge: {
    backgroundColor: colors.primarySurface, borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  parkedBadgeText: { fontSize: 10 },
  carsText: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  debtAmount: { fontSize: 15, fontWeight: '700' as const, color: colors.danger, marginRight: 6 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: colors.textTertiary },
});
