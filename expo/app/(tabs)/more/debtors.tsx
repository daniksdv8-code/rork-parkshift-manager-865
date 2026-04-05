import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, ChevronRight, ChevronDown, ChevronUp, Wallet, Car, Clock } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatDate, calculateDays } from '@/utils/helpers';
import { calculateActiveSessionDebt } from '@/utils/financeCalculations';

export default function DebtorsScreen() {
  const router = useRouter();
  const colors = useColors();
  const {
    debtors, activeCars, activeDebts, clientDebts, dailyDebtAccruals,
    activeSessions, tariffs, subscriptions, debts,
  } = useParking();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const totalDebt = useMemo(() =>
    debtors.reduce((sum, d) => sum + d.amount, 0),
  [debtors]);

  const sortedDebtors = useMemo(() =>
    [...debtors].sort((a, b) => b.amount - a.amount),
  [debtors]);

  const getDebtBreakdown = (clientId: string) => {
    const clientActiveSessions = activeSessions.filter(s => s.clientId === clientId);
    const activeSessionIds = new Set(clientActiveSessions.map(s => s.id));

    const oldDebts = activeDebts.filter(d => d.clientId === clientId && !activeSessionIds.has(d.parkingEntryId ?? ''));
    const oldDebtsTotal = oldDebts.reduce((s, d) => s + d.remainingAmount, 0);

    let lombardDebtTotal = 0;
    for (const s of clientActiveSessions) {
      if (s.serviceType === 'lombard' || s.status === 'active_debt') {
        lombardDebtTotal += calculateActiveSessionDebt(s, tariffs, subscriptions, debts);
      }
    }

    const cd = clientDebts.find(c => c.clientId === clientId);
    const frozenAmount = cd?.frozenAmount ?? 0;

    const accruals = dailyDebtAccruals.filter(a => a.clientId === clientId);

    return { oldDebts, oldDebtsTotal, lombardDebtTotal, frozenAmount, accruals, sessions: clientActiveSessions };
  };

  const renderItem = ({ item }: { item: typeof sortedDebtors[number] }) => {
    const cars = activeCars.filter(c => c.clientId === item.clientId);
    const isExpanded = expandedId === item.clientId;
    const breakdown = isExpanded ? getDebtBreakdown(item.clientId) : null;
    const isParked = activeSessions.some(s => s.clientId === item.clientId);

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => setExpandedId(isExpanded ? null : item.clientId)}
          activeOpacity={0.7}
        >
          <View style={styles.cardLeft}>
            <View style={styles.avatar}>
              <AlertTriangle size={16} color={colors.danger} />
            </View>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{item.client?.name ?? 'Неизвестный'}</Text>
              {isParked && (
                <View style={styles.parkedBadge}>
                  <Text style={styles.parkedBadgeText}>🅿️</Text>
                </View>
              )}
            </View>
            {cars.length > 0 && (
              <Text style={styles.carsText} numberOfLines={1}>
                {cars.map(c => c.plateNumber).join(', ')}
              </Text>
            )}
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.debtAmount} numberOfLines={1}>{formatMoney(item.amount)}</Text>
            {isExpanded ? <ChevronUp size={16} color={colors.textTertiary} /> : <ChevronDown size={16} color={colors.textTertiary} />}
          </View>
        </TouchableOpacity>

        {isExpanded && breakdown && (
          <View style={styles.expandedContent}>
            {breakdown.oldDebts.length > 0 && (
              <View style={styles.breakdownSection}>
                <Text style={styles.breakdownTitle}>Разовые долги</Text>
                {breakdown.oldDebts.map(d => (
                  <View key={d.id} style={styles.breakdownRow}>
                    <Text style={styles.breakdownDesc} numberOfLines={1}>{d.description}</Text>
                    <Text style={styles.breakdownDate} numberOfLines={1}>{formatDate(d.createdAt)}</Text>
                    <Text style={styles.breakdownAmount} numberOfLines={1}>{formatMoney(d.remainingAmount)}</Text>
                  </View>
                ))}
              </View>
            )}

            {breakdown.lombardDebtTotal > 0 && (
              <View style={styles.breakdownSection}>
                <Text style={styles.breakdownTitle}>Начисленный долг (ломбард)</Text>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownDesc}>Активный</Text>
                  <Text style={styles.breakdownAmount}>{formatMoney(breakdown.lombardDebtTotal)}</Text>
                </View>
                {breakdown.frozenAmount > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownDesc}>Замороженный</Text>
                    <Text style={[styles.breakdownAmount, { color: colors.info }]}>{formatMoney(breakdown.frozenAmount)}</Text>
                  </View>
                )}
              </View>
            )}

            {breakdown.sessions.length > 0 && (
              <View style={styles.breakdownSection}>
                <Text style={styles.breakdownTitle}>Активные сессии</Text>
                {breakdown.sessions.map(s => {
                  const car = activeCars.find(c => c.id === s.carId);
                  const days = calculateDays(s.entryTime);
                  return (
                    <View key={s.id} style={styles.sessionRow}>
                      <Car size={12} color={colors.textTertiary} />
                      <Text style={styles.sessionPlate}>{car?.plateNumber ?? '???'}</Text>
                      <Clock size={10} color={colors.textTertiary} />
                      <Text style={styles.sessionDays}>{days} сут.</Text>
                      {s.status === 'active_debt' && (
                        <View style={styles.debtStatusBadge}>
                          <Text style={styles.debtStatusText}>Ломбард</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.expandedActions}>
              <TouchableOpacity
                style={styles.payDebtBtn}
                onPress={() => router.push({ pathname: '/pay-debt-modal', params: { clientId: item.clientId } })}
              >
                <Wallet size={14} color={colors.white} />
                <Text style={styles.payDebtText}>Погасить долг</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.openCardBtn}
                onPress={() => router.push({ pathname: '/client-card', params: { clientId: item.clientId } })}
              >
                <Text style={styles.openCardText}>Карточка</Text>
                <ChevronRight size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Wallet size={20} color={colors.danger} />
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>Общий долг</Text>
          <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totalDebt)}</Text>
        </View>
        <Text style={styles.summaryCount}>{debtors.length} должн.</Text>
      </View>

      <FlatList
        data={sortedDebtors}
        keyExtractor={item => item.clientId}
        contentContainerStyle={styles.list}
        renderItem={renderItem}
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
  summaryValue: { fontSize: 22, fontWeight: '800' as const, color: colors.danger, minWidth: 0, flexShrink: 1 },
  summaryCount: { fontSize: 13, color: colors.textSecondary },
  list: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  card: {
    backgroundColor: colors.surface, borderRadius: 12,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
  },
  cardLeft: { marginRight: 12 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.dangerSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '600' as const, color: colors.text, flex: 1 },
  parkedBadge: {
    backgroundColor: colors.primarySurface, borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  parkedBadgeText: { fontSize: 10 },
  carsText: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  debtAmount: { fontSize: 15, fontWeight: '700' as const, color: colors.danger },
  expandedContent: {
    paddingHorizontal: 14, paddingBottom: 14,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  breakdownSection: { marginTop: 12 },
  breakdownTitle: { fontSize: 12, fontWeight: '600' as const, color: colors.textTertiary, marginBottom: 6 },
  breakdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 4,
  },
  breakdownDesc: { flex: 1, fontSize: 13, color: colors.text },
  breakdownDate: { fontSize: 11, color: colors.textTertiary },
  breakdownAmount: { fontSize: 13, fontWeight: '600' as const, color: colors.danger },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4,
  },
  sessionPlate: { fontSize: 13, fontWeight: '600' as const, color: colors.text },
  sessionDays: { fontSize: 12, color: colors.textSecondary },
  debtStatusBadge: {
    backgroundColor: colors.warningSurface, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  debtStatusText: { fontSize: 10, fontWeight: '600' as const, color: colors.warning },
  expandedActions: {
    flexDirection: 'row', gap: 8, marginTop: 14,
  },
  payDebtBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.danger, borderRadius: 8, paddingVertical: 10,
  },
  payDebtText: { fontSize: 13, fontWeight: '600' as const, color: colors.white },
  openCardBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: colors.primarySurface, borderRadius: 8, paddingVertical: 10,
  },
  openCardText: { fontSize: 13, fontWeight: '600' as const, color: colors.primary },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: colors.textTertiary },
});
