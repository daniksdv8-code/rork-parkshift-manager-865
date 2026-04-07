import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banknote, CreditCard, Wallet } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney } from '@/utils/helpers';
import { PaymentMethod } from '@/types';
import { hapticSuccess } from '@/utils/haptics';

export default function PayDebtModal() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { clientId, debtId, mode } = useLocalSearchParams<{ clientId: string; debtId?: string; mode?: string }>();
  const router = useRouter();
  const { activeClients, activeDebts, clientDebts, payDebt, paySessionDebt, needsShiftCheck, getClientDebtTotal } = useParking();

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [customAmount, setCustomAmount] = useState('');

  const client = useMemo(() => activeClients.find(c => c.id === clientId), [activeClients, clientId]);
  const debts = useMemo(() => activeDebts.filter(d => d.clientId === clientId), [activeDebts, clientId]);
  const totalDebt = useMemo(() => getClientDebtTotal(clientId ?? ''), [getClientDebtTotal, clientId]);
  const clientDebt = useMemo(() => clientDebts.find(cd => cd.clientId === clientId), [clientDebts, clientId]);

  const isClientDebtMode = mode === 'client_debt';
  const specificDebt = useMemo(() => debtId ? debts.find(d => d.id === debtId) : null, [debts, debtId]);

  const maxAmount = specificDebt
    ? specificDebt.remainingAmount
    : isClientDebtMode
      ? (clientDebt?.totalAmount ?? 0)
      : totalDebt;
  const payAmount = customAmount ? Math.min(parseFloat(customAmount) || 0, maxAmount) : maxAmount;

  const handlePay = useCallback(() => {
    if (needsShiftCheck()) {
      Alert.alert('Смена не открыта', 'Откройте смену в кассе для приёма оплаты');
      return;
    }
    if (payAmount <= 0) {
      Alert.alert('Ошибка', 'Введите сумму');
      return;
    }

    let remaining = payAmount;

    if (specificDebt) {
      payDebt(specificDebt.id, payAmount, method);
      remaining = 0;
    } else {
      for (const debt of debts) {
        if (remaining <= 0) break;
        const amount = Math.min(remaining, debt.remainingAmount);
        payDebt(debt.id, amount, method);
        remaining -= amount;
      }
    }

    if (remaining > 0 && clientId) {
      paySessionDebt(clientId, remaining, method);
      console.log(`[PayDebtModal] Paid session debt: ${remaining}`);
    }

    hapticSuccess();
    Alert.alert('Готово', `Оплачено: ${formatMoney(payAmount)}`);
    router.back();
  }, [payAmount, method, specificDebt, debts, payDebt, paySessionDebt, clientId, needsShiftCheck, router]);

  if (!client) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Клиент не найден</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.clientCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{client.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.clientName} numberOfLines={1}>{client.name}</Text>
          <Text style={styles.clientDebt} numberOfLines={1}>Долг: {formatMoney(totalDebt)}</Text>
        </View>
      </View>

      {specificDebt && (
        <View style={styles.debtDetail}>
          <Text style={styles.debtDetailLabel}>Конкретный долг</Text>
          <Text style={styles.debtDetailDesc}>{specificDebt.description}</Text>
          <Text style={styles.debtDetailAmount}>{formatMoney(specificDebt.remainingAmount)}</Text>
        </View>
      )}

      <View style={styles.amountCard}>
        <Wallet size={20} color={colors.primary} />
        <Text style={styles.amountLabel}>Сумма к оплате</Text>
        <Text style={styles.amountValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(payAmount)}</Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder={`Произвольная сумма (макс. ${formatMoney(maxAmount)})`}
        placeholderTextColor={colors.textTertiary}
        value={customAmount}
        onChangeText={setCustomAmount}
        keyboardType="numeric"
      />

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

      <TouchableOpacity style={styles.payBtn} onPress={handlePay} activeOpacity={0.8}>
        <Text style={styles.payBtnText} numberOfLines={1} adjustsFontSizeToFit>Оплатить {formatMoney(payAmount)}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  errorText: { fontSize: 15, color: colors.textTertiary, textAlign: 'center' as const, marginTop: 80 },
  clientCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.dangerSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '700' as const, color: colors.danger },
  clientName: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  clientDebt: { fontSize: 13, color: colors.danger, fontWeight: '500' as const, marginTop: 3 },
  debtDetail: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 14, borderWidth: 1, borderColor: colors.border,
  },
  debtDetailLabel: { fontSize: 12, color: colors.textTertiary, letterSpacing: 0.2, textTransform: 'uppercase' as const },
  debtDetailDesc: { fontSize: 14, color: colors.text, marginTop: 6 },
  debtDetailAmount: { fontSize: 18, fontWeight: '700' as const, color: colors.danger, marginTop: 6, letterSpacing: -0.2 },
  amountCard: {
    backgroundColor: colors.primarySurface, borderRadius: 14, padding: 22,
    alignItems: 'center', marginBottom: 16, gap: 6,
    borderWidth: 1, borderColor: colors.primary + '15',
  },
  amountLabel: { fontSize: 13, color: colors.textSecondary },
  amountValue: { fontSize: 28, fontWeight: '800' as const, color: colors.primary, letterSpacing: -0.5 },
  input: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    fontSize: 14, color: colors.text, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionLabel: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 10, letterSpacing: 0.2, textTransform: 'uppercase' as const },
  methodRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  methodBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  methodBtnCash: { backgroundColor: colors.cash, borderColor: colors.cash },
  methodBtnCard: { backgroundColor: colors.card, borderColor: colors.card },
  methodText: { fontSize: 14, fontWeight: '600' as const, color: colors.textSecondary },
  methodTextActive: { color: colors.white },
  payBtn: {
    backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center',
  },
  payBtnText: { fontSize: 16, fontWeight: '700' as const, color: colors.white },
});
