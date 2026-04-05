import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banknote, CreditCard, Calendar, AlertTriangle } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatDate, daysUntil } from '@/utils/helpers';
import { PaymentMethod } from '@/types';
import { hapticSuccess } from '@/utils/haptics';

const QUICK_PERIODS = [
  { label: 'Месяц', days: 0 },
  { label: '15 дн.', days: 15 },
  { label: '30 дн.', days: 30 },
  { label: '60 дн.', days: 60 },
  { label: '90 дн.', days: 90 },
];

export default function PayMonthlyModal() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { clientId, carId } = useLocalSearchParams<{ clientId: string; carId: string }>();
  const router = useRouter();
  const _auth = useAuth();
  const {
    activeClients, activeCars, subscriptions, tariffs,
    payMonthly, needsShiftCheck, getClientDebtTotal,
  } = useParking();

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [customDays, setCustomDays] = useState('');
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(0);
  const [skipDebt, setSkipDebt] = useState(false);

  const client = useMemo(() => activeClients.find(c => c.id === clientId), [activeClients, clientId]);
  const car = useMemo(() => activeCars.find(c => c.id === carId), [activeCars, carId]);
  const sub = useMemo(() =>
    subscriptions.find(s => s.clientId === clientId && s.carId === carId),
  [subscriptions, clientId, carId]);

  const isExpired = useMemo(() => sub ? new Date(sub.paidUntil) < new Date() : true, [sub]);
  const overdueDays = useMemo(() => {
    if (!sub || !isExpired) return 0;
    return Math.abs(daysUntil(sub.paidUntil));
  }, [sub, isExpired]);

  const clientDebt = useMemo(() => getClientDebtTotal(clientId ?? ''), [getClientDebtTotal, clientId]);

  const dailyRate = method === 'card' ? tariffs.monthlyCard : tariffs.monthlyCash;

  const periodDays = useMemo(() => {
    if (customDays && parseInt(customDays) > 0) return parseInt(customDays);
    const p = QUICK_PERIODS[selectedPeriodIdx];
    if (p.days === 0) {
      const startD = isExpired && sub ? new Date(sub.paidUntil) : new Date();
      if (startD.getDate() === 1) {
        const y = startD.getFullYear();
        const m = startD.getMonth();
        return new Date(y, m + 1, 0).getDate();
      }
      return 30;
    }
    return p.days;
  }, [customDays, selectedPeriodIdx, isExpired, sub]);

  const startDate = useMemo(() => {
    if (isExpired && sub) return new Date(sub.paidUntil);
    if (!sub) return new Date();
    return new Date(sub.paidUntil);
  }, [sub, isExpired]);

  const endDate = useMemo(() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + periodDays);
    return d;
  }, [startDate, periodDays]);

  const subscriptionAmount = Math.round(dailyRate * periodDays);
  const debtAmount = !skipDebt && clientDebt > 0 ? clientDebt : 0;
  const totalAmount = subscriptionAmount + debtAmount;

  const handlePay = useCallback(() => {
    if (!clientId || !carId) return;
    if (needsShiftCheck()) {
      Alert.alert('Смена не открыта', 'Откройте смену в кассе для приёма оплаты');
      return;
    }
    if (periodDays <= 0) {
      Alert.alert('Ошибка', 'Период должен быть больше 0 дней');
      return;
    }

    payMonthly(clientId, carId, method, totalAmount, endDate.toISOString());
    hapticSuccess();
    Alert.alert('Готово', `Оплачено до ${formatDate(endDate.toISOString())}`);
    router.back();
  }, [clientId, carId, method, totalAmount, endDate, payMonthly, needsShiftCheck, router, periodDays]);

  if (!client || !car) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Данные не найдены</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.clientCard}>
        <Text style={styles.clientName} numberOfLines={1}>{client.name}</Text>
        <Text style={styles.carInfo} numberOfLines={1}>{car.plateNumber} {car.carModel ?? ''}</Text>
        {sub && (
          <View style={[styles.subBadge, isExpired && styles.subBadgeExpired]}>
            <Text style={[styles.subBadgeText, isExpired && styles.subBadgeTextExpired]} numberOfLines={1}>
              {isExpired ? `Истёк ${formatDate(sub.paidUntil)}` : `Активен до ${formatDate(sub.paidUntil)}`}
            </Text>
          </View>
        )}
      </View>

      {isExpired && overdueDays > 0 && (
        <View style={styles.overdueWarning}>
          <AlertTriangle size={16} color={colors.warning} />
          <Text style={styles.overdueText}>
            Просрочка {overdueDays} дн. — оплата начнётся с даты окончания предыдущего периода
          </Text>
        </View>
      )}

      {clientDebt > 0 && (
        <View style={styles.debtCard}>
          <View style={styles.debtHeader}>
            <AlertTriangle size={16} color={colors.danger} />
            <Text style={styles.debtTitle} numberOfLines={1}>Долг клиента: {formatMoney(clientDebt)}</Text>
          </View>
          {!skipDebt ? (
            <View>
              <Text style={styles.debtDesc}>
                Платёж будет направлен на погашение долга + оплату периода
              </Text>
              <TouchableOpacity style={styles.skipDebtBtn} onPress={() => setSkipDebt(true)}>
                <Text style={styles.skipDebtText}>Пропустить долг</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.includeDebtBtn} onPress={() => setSkipDebt(false)}>
              <Text style={styles.includeDebtText}>Включить долг в оплату</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={styles.sectionLabel}>Способ оплаты</Text>
      <View style={styles.methodRow}>
        <TouchableOpacity
          style={[styles.methodBtn, method === 'cash' && styles.methodBtnCash]}
          onPress={() => setMethod('cash')}
        >
          <Banknote size={18} color={method === 'cash' ? colors.white : colors.cash} />
          <Text style={[styles.methodText, method === 'cash' && styles.methodTextActive]}>Наличные</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.methodBtn, method === 'card' && styles.methodBtnCard]}
          onPress={() => setMethod('card')}
        >
          <CreditCard size={18} color={method === 'card' ? colors.white : colors.card} />
          <Text style={[styles.methodText, method === 'card' && styles.methodTextActive]}>Безнал</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Период</Text>
      <View style={styles.periodsWrap}>
        {QUICK_PERIODS.map((p, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.periodChip, selectedPeriodIdx === i && !customDays && styles.periodChipActive]}
            onPress={() => { setSelectedPeriodIdx(i); setCustomDays(''); }}
          >
            <Text style={[styles.periodChipText, selectedPeriodIdx === i && !customDays && styles.periodChipTextActive]}>
              {p.label === 'Месяц' ? `Месяц (${periodDays} дн.)` : p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.customDaysRow}>
        <Text style={styles.customDaysLabel}>Или кол-во дней:</Text>
        <TextInput
          style={[styles.customDaysInput, customDays ? styles.customDaysInputActive : null]}
          value={customDays}
          onChangeText={setCustomDays}
          keyboardType="numeric"
          placeholder="—"
          placeholderTextColor={colors.textTertiary}
        />
      </View>

      <View style={styles.periodCard}>
        <Calendar size={16} color={colors.textSecondary} />
        <Text style={styles.periodText}>
          {formatDate(startDate.toISOString())} — {formatDate(endDate.toISOString())}
        </Text>
        <Text style={styles.periodDays}>{periodDays} дн.</Text>
      </View>

      <View style={styles.rateInfo}>
        <Text style={styles.rateLabel} numberOfLines={2}>
          Тариф: {formatMoney(dailyRate)}/день × {periodDays} дн. = {formatMoney(subscriptionAmount)}
        </Text>
      </View>

      {debtAmount > 0 && (
        <View style={styles.debtLine}>
          <Text style={styles.debtLineLabel}>Погашение долга</Text>
          <Text style={styles.debtLineValue}>+ {formatMoney(debtAmount)}</Text>
        </View>
      )}

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Итого к оплате</Text>
        <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totalAmount)}</Text>
        {debtAmount > 0 && (
          <Text style={styles.totalBreakdown} numberOfLines={1}>
            {formatMoney(subscriptionAmount)} подписка + {formatMoney(debtAmount)} долг
          </Text>
        )}
      </View>

      <TouchableOpacity style={styles.payBtn} onPress={handlePay} activeOpacity={0.8}>
        <Text style={styles.payBtnText} numberOfLines={1} adjustsFontSizeToFit>Оплатить {formatMoney(totalAmount)}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  errorText: { fontSize: 16, color: colors.textTertiary, textAlign: 'center' as const, marginTop: 60 },
  clientCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
  },
  clientName: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  carInfo: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  subBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.successSurface,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 8,
  },
  subBadgeExpired: { backgroundColor: colors.dangerSurface },
  subBadgeText: { fontSize: 12, fontWeight: '600' as const, color: colors.success },
  subBadgeTextExpired: { color: colors.danger },
  overdueWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.warningSurface, borderRadius: 10, padding: 12,
    marginBottom: 12, borderWidth: 1, borderColor: colors.warning + '20',
  },
  overdueText: { flex: 1, fontSize: 12, color: colors.warning, fontWeight: '500' as const },
  debtCard: {
    backgroundColor: colors.dangerSurface, borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: colors.danger + '20',
  },
  debtHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  debtTitle: { fontSize: 14, fontWeight: '700' as const, color: colors.danger },
  debtDesc: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
  skipDebtBtn: {
    alignSelf: 'flex-start', backgroundColor: colors.surface,
    borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6,
  },
  skipDebtText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' as const },
  includeDebtBtn: {
    alignSelf: 'flex-start', backgroundColor: colors.danger,
    borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4,
  },
  includeDebtText: { fontSize: 12, color: colors.white, fontWeight: '500' as const },
  sectionLabel: { fontSize: 14, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 8 },
  methodRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  methodBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  methodBtnCash: { backgroundColor: colors.cash, borderColor: colors.cash },
  methodBtnCard: { backgroundColor: colors.card, borderColor: colors.card },
  methodText: { fontSize: 15, fontWeight: '600' as const, color: colors.textSecondary },
  methodTextActive: { color: colors.white },
  periodsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  periodChip: {
    backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  periodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodChipText: { fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary },
  periodChipTextActive: { color: colors.white },
  customDaysRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  customDaysLabel: { fontSize: 13, color: colors.textTertiary },
  customDaysInput: {
    backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 15, color: colors.text, width: 70, textAlign: 'center' as const,
    borderWidth: 1, borderColor: colors.border,
  },
  customDaysInputActive: { borderColor: colors.primary },
  periodCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  periodText: { flex: 1, fontSize: 14, color: colors.text },
  periodDays: { fontSize: 13, fontWeight: '600' as const, color: colors.primary },
  rateInfo: {
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
  },
  rateLabel: { fontSize: 13, color: colors.textSecondary },
  debtLine: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.dangerSurface, borderRadius: 10, padding: 12,
    marginBottom: 12, borderWidth: 1, borderColor: colors.danger + '15',
  },
  debtLineLabel: { fontSize: 13, color: colors.danger },
  debtLineValue: { fontSize: 14, fontWeight: '700' as const, color: colors.danger },
  totalCard: {
    backgroundColor: colors.primarySurface, borderRadius: 14, padding: 20,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: colors.primary + '20',
  },
  totalLabel: { fontSize: 13, color: colors.textSecondary },
  totalValue: { fontSize: 32, fontWeight: '800' as const, color: colors.primary, marginTop: 4 },
  totalBreakdown: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  payBtn: {
    backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center',
  },
  payBtnText: { fontSize: 16, fontWeight: '700' as const, color: colors.white },
});
