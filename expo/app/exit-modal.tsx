import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banknote, CreditCard, Clock, Car, AlertTriangle, FileEdit, RotateCcw, MessageSquare } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, calculateDays, formatDateTime, getServiceTypeLabel } from '@/utils/helpers';
import { PaymentMethod } from '@/types';
import { hapticSuccess } from '@/utils/haptics';

export default function ExitModal() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { sessionId, earlyExit } = useLocalSearchParams<{ sessionId: string; earlyExit?: string }>();
  const router = useRouter();
  const _auth = useAuth();
  const {
    sessions, activeCars, activeClients, tariffs, subscriptions,
    checkOut, needsShiftCheck, payments,
    earlyExitWithRefund, getClientDebtTotal, addSessionNote, getSessionNotes,
  } = useParking();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [releaseInDebt, setReleaseInDebt] = useState(false);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('cash');
  const [exitNote, setExitNote] = useState('');

  const session = useMemo(() => sessions.find(s => s.id === sessionId), [sessions, sessionId]);
  const car = useMemo(() => session ? activeCars.find(c => c.id === session.carId) : null, [session, activeCars]);
  const client = useMemo(() => session ? activeClients.find(c => c.id === session.clientId) : null, [session, activeClients]);
  const clientDebt = useMemo(() => session ? getClientDebtTotal(session.clientId) : 0, [session, getClientDebtTotal]);

  const isEarlyExit = earlyExit === '1';

  const exitCalc = useMemo(() => {
    if (!session) return null;
    const isLombardSession = session.serviceType === 'lombard' || session.status === 'active_debt';
    const days = calculateDays(session.entryTime, undefined, isLombardSession);

    if (session.serviceType === 'onetime') {
      const standardRate = session.prepaidMethod === 'card' ? tariffs.onetimeCard : tariffs.onetimeCash;
      const rate = (session.customRate !== undefined && session.isDiscounted) ? session.customRate : standardRate;
      const total = days * rate;
      const remaining = Math.max(0, total - session.prepaidAmount);
      return { days, total, prepaid: session.prepaidAmount, remaining, rate, isDiscounted: session.isDiscounted, standardRate };
    }

    if (session.serviceType === 'monthly') {
      const sub = subscriptions.find(s => s.clientId === session.clientId && s.carId === session.carId);
      const isActive = sub && new Date(sub.paidUntil) > new Date();
      if (isActive) {
        return { days, total: 0, prepaid: 0, remaining: 0, rate: 0, subActive: true };
      }
      const monthlyAmount = tariffs.monthlyCash * 30;
      return { days, total: monthlyAmount, prepaid: 0, remaining: monthlyAmount, rate: tariffs.monthlyCash, subExpired: true };
    }

    if (session.status === 'active_debt') {
      const rate = session.lombardRateApplied || tariffs.lombardRate;
      const sessionAccrual = days * rate;
      const sessionPaid = session.prepaidAmount;
      const sessionOwed = Math.max(0, sessionAccrual - sessionPaid);
      return { days, total: sessionAccrual, prepaid: sessionPaid, remaining: sessionOwed, rate, isLombard: true };
    }

    return { days, total: 0, prepaid: 0, remaining: 0, rate: 0 };
  }, [session, tariffs, subscriptions]);

  const refundCalc = useMemo(() => {
    if (!session || session.serviceType !== 'monthly') return null;
    const sub = subscriptions.find(s => s.clientId === session.clientId && s.carId === session.carId);
    if (!sub || new Date(sub.paidUntil) <= new Date()) return null;

    const clientPayments = payments
      .filter(p => p.clientId === session.clientId && p.carId === session.carId && p.type === 'monthly' && !p.cancelled && p.amount > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastPayment = clientPayments[0];
    if (!lastPayment) return null;

    const dailyRate = lastPayment.method === 'card' ? tariffs.monthlyCard : tariffs.monthlyCash;
    const payDate = new Date(lastPayment.date);
    const today = new Date();
    payDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const daysUsed = Math.min(30, Math.max(1, Math.ceil((today.getTime() - payDate.getTime()) / (24 * 60 * 60 * 1000)) + 1));
    const usedAmount = Math.round(daysUsed * dailyRate);
    const refundAmount = Math.max(0, Math.round(lastPayment.amount - usedAmount));
    const unusedDays = Math.max(0, 30 - daysUsed);

    return { daysUsed, unusedDays, usedAmount, refundAmount, paidAmount: lastPayment.amount };
  }, [session, subscriptions, payments, tariffs]);

  const handleExit = useCallback(() => {
    if (!session || !exitCalc) return;
    if (needsShiftCheck()) {
      Alert.alert('Смена не открыта', 'Откройте смену в кассе для оформления выезда');
      return;
    }

    const payment = exitCalc.remaining > 0 && !releaseInDebt
      ? { method: paymentMethod, amount: exitCalc.remaining }
      : undefined;

    const result = checkOut(session.id, payment, releaseInDebt);
    if (result) {
      if (exitNote.trim()) {
        addSessionNote(session.id, exitNote.trim(), 'checkout');
      }
      hapticSuccess();
      Alert.alert('Готово', `Выезд оформлен (${result.days} сут.)`);
      router.back();
    }
  }, [session, exitCalc, releaseInDebt, paymentMethod, checkOut, needsShiftCheck, router, exitNote, addSessionNote]);

  const handleEarlyExit = useCallback(() => {
    if (!session || !refundCalc) return;
    if (needsShiftCheck()) {
      Alert.alert('Смена не открыта', 'Откройте смену в кассе для оформления выезда');
      return;
    }

    Alert.alert(
      'Досрочный выезд',
      `Возврат: ${formatMoney(refundCalc.refundAmount)} (${refundCalc.unusedDays} неисп. дн.)`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Оформить', onPress: () => {
          const result = earlyExitWithRefund(session.id, refundMethod);
          if (result) {
            hapticSuccess();
            Alert.alert('Готово', `Возврат: ${formatMoney(result.refundAmount)}`);
            router.back();
          } else {
            Alert.alert('Ошибка', 'Не удалось оформить возврат');
          }
        }},
      ]
    );
  }, [session, refundCalc, refundMethod, earlyExitWithRefund, needsShiftCheck, router]);

  if (!session || !exitCalc) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Сессия не найдена</Text>
      </View>
    );
  }

  const showEarlyExitSection = isEarlyExit && refundCalc && refundCalc.refundAmount > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.carCard}>
        <Car size={24} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.plate} numberOfLines={1}>{car?.plateNumber ?? '???'}</Text>
          <TouchableOpacity
            onPress={() => { if (session?.clientId) router.push({ pathname: '/client-card', params: { clientId: session.clientId } }); }}
            activeOpacity={0.6}
          >
            <Text style={styles.clientNameLink} numberOfLines={1}>{client?.name ?? 'Неизвестный'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{getServiceTypeLabel(session.serviceType)}</Text>
        </View>
      </View>

      {clientDebt > 0 && (
        <View style={styles.debtWarning}>
          <AlertTriangle size={16} color={colors.danger} />
          <Text style={styles.debtWarningText} numberOfLines={1}>Долг владельца: {formatMoney(clientDebt)}</Text>
        </View>
      )}

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Clock size={14} color={colors.textTertiary} />
          <Text style={styles.infoLabel}>Заезд:</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{formatDateTime(session.entryTime)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Дней:</Text>
          <Text style={styles.infoValue}>{exitCalc.days}</Text>
        </View>
        {exitCalc.rate > 0 && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Тариф:</Text>
            <Text style={styles.infoValue}>{formatMoney(exitCalc.rate)}/сут.</Text>
          </View>
        )}
        {exitCalc.prepaid > 0 && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Предоплата:</Text>
            <Text style={[styles.infoValue, { color: colors.success }]}>{formatMoney(exitCalc.prepaid)}</Text>
          </View>
        )}
      </View>

      {showEarlyExitSection && (
        <View style={styles.earlyExitCard}>
          <RotateCcw size={20} color={colors.warning} />
          <Text style={styles.earlyExitTitle}>Досрочный выезд с возвратом</Text>
          <View style={styles.earlyExitDetails}>
            <View style={styles.earlyExitRow}>
              <Text style={styles.earlyExitLabel}>Оплачено:</Text>
              <Text style={styles.earlyExitValue}>{formatMoney(refundCalc.paidAmount)}</Text>
            </View>
            <View style={styles.earlyExitRow}>
              <Text style={styles.earlyExitLabel}>Использовано:</Text>
              <Text style={styles.earlyExitValue}>{refundCalc.daysUsed} сут. = {formatMoney(refundCalc.usedAmount)}</Text>
            </View>
            <View style={styles.earlyExitRow}>
              <Text style={styles.earlyExitLabel}>Не использовано:</Text>
              <Text style={styles.earlyExitValue}>{refundCalc.unusedDays} сут.</Text>
            </View>
            <View style={[styles.earlyExitRow, styles.earlyExitTotal]}>
              <Text style={styles.earlyExitTotalLabel}>К возврату:</Text>
              <Text style={styles.earlyExitTotalValue}>{formatMoney(refundCalc.refundAmount)}</Text>
            </View>
          </View>

          <Text style={styles.methodLabel}>Способ возврата</Text>
          <View style={styles.methodRow}>
            <TouchableOpacity
              style={[styles.methodBtn, refundMethod === 'cash' && styles.methodBtnCash]}
              onPress={() => setRefundMethod('cash')}
            >
              <Banknote size={16} color={refundMethod === 'cash' ? colors.white : colors.cash} />
              <Text style={[styles.methodText, refundMethod === 'cash' && styles.methodTextActive]}>Наличные</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodBtn, refundMethod === 'card' && styles.methodBtnCard]}
              onPress={() => setRefundMethod('card')}
            >
              <CreditCard size={16} color={refundMethod === 'card' ? colors.white : colors.card} />
              <Text style={[styles.methodText, refundMethod === 'card' && styles.methodTextActive]}>Безнал</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.earlyExitBtn} onPress={handleEarlyExit} activeOpacity={0.8}>
            <Text style={styles.earlyExitBtnText} numberOfLines={1} adjustsFontSizeToFit>Оформить досрочный выезд</Text>
          </TouchableOpacity>
        </View>
      )}

      {(exitCalc as { subActive?: boolean }).subActive && !showEarlyExitSection && (
        <View style={styles.freeExitCard}>
          <Text style={styles.freeExitText}>Подписка активна — выезд бесплатный</Text>
        </View>
      )}

      {!showEarlyExitSection && exitCalc.remaining > 0 && (
        <>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>К оплате</Text>
            <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(exitCalc.remaining)}</Text>
          </View>

          <Text style={styles.sectionLabel}>Способ оплаты</Text>
          <View style={styles.methodRow}>
            <TouchableOpacity
              style={[styles.methodBtn, paymentMethod === 'cash' && styles.methodBtnCash]}
              onPress={() => { setPaymentMethod('cash'); setReleaseInDebt(false); }}
            >
              <Banknote size={18} color={paymentMethod === 'cash' ? colors.white : colors.cash} />
              <Text style={[styles.methodText, paymentMethod === 'cash' && styles.methodTextActive]}>Наличные</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodBtn, paymentMethod === 'card' && styles.methodBtnCard]}
              onPress={() => { setPaymentMethod('card'); setReleaseInDebt(false); }}
            >
              <CreditCard size={18} color={paymentMethod === 'card' ? colors.white : colors.card} />
              <Text style={[styles.methodText, paymentMethod === 'card' && styles.methodTextActive]}>Безнал</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodBtn, paymentMethod === 'adjustment' && styles.methodBtnAdj]}
              onPress={() => { setPaymentMethod('adjustment'); setReleaseInDebt(false); }}
            >
              <FileEdit size={18} color={paymentMethod === 'adjustment' ? colors.white : colors.adjustment} />
              <Text style={[styles.methodText, paymentMethod === 'adjustment' && styles.methodTextActive]}>Коррект.</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.debtOption, releaseInDebt && styles.debtOptionActive]}
            onPress={() => setReleaseInDebt(!releaseInDebt)}
          >
            <AlertTriangle size={16} color={releaseInDebt ? colors.danger : colors.textTertiary} />
            <Text style={[styles.debtOptionText, releaseInDebt && styles.debtOptionTextActive]} numberOfLines={1}>
              Выпустить в долг ({formatMoney(exitCalc.remaining)})
            </Text>
          </TouchableOpacity>
        </>
      )}

      {session && (() => {
        const notes = getSessionNotes(session.id);
        if (notes.length === 0) return null;
        return (
          <View style={styles.notesSection}>
            <View style={styles.notesSectionHeader}>
              <MessageSquare size={14} color={colors.textSecondary} />
              <Text style={styles.notesSectionTitle}>Заметки</Text>
            </View>
            {notes.map(n => (
              <View key={n.id} style={styles.noteItem}>
                <Text style={styles.noteText}>{n.text}</Text>
                <Text style={styles.noteMeta}>{n.authorName} · {n.type === 'checkin' ? 'Заезд' : n.type === 'checkout' ? 'Выезд' : ''}</Text>
              </View>
            ))}
          </View>
        );
      })()}

      <View style={styles.noteInputWrap}>
        <TextInput
          style={styles.noteInput}
          value={exitNote}
          onChangeText={setExitNote}
          placeholder="Заметка к выезду (необязательно)"
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={2}
        />
      </View>

      {!showEarlyExitSection && (
        <TouchableOpacity style={styles.exitBtn} onPress={handleExit} activeOpacity={0.8}>
          <Text style={styles.exitBtnText} numberOfLines={1} adjustsFontSizeToFit>
            {releaseInDebt ? 'Выпустить в долг' : exitCalc.remaining > 0 ? 'Оплатить и выпустить' : 'Выпустить'}
          </Text>
        </TouchableOpacity>
      )}

      {!showEarlyExitSection && refundCalc && refundCalc.refundAmount > 0 && session.serviceType === 'monthly' && !isEarlyExit && (
        <TouchableOpacity
          style={styles.earlyExitLink}
          onPress={() => router.setParams({ earlyExit: '1' })}
        >
          <RotateCcw size={14} color={colors.warning} />
          <Text style={styles.earlyExitLinkText}>Досрочный выезд с возвратом</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  errorText: { fontSize: 15, color: colors.textTertiary, textAlign: 'center' as const, marginTop: 80 },
  carCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
  },
  plate: { fontSize: 18, fontWeight: '700' as const, color: colors.text, letterSpacing: 0.8 },
  clientName: { fontSize: 14, color: colors.textSecondary, marginTop: 3 },
  clientNameLink: { fontSize: 14, color: colors.primary, marginTop: 3, textDecorationLine: 'underline' as const },
  typeBadge: {
    backgroundColor: colors.primarySurface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  typeBadgeText: { fontSize: 12, fontWeight: '600' as const, color: colors.primary },
  debtWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.dangerSurface, borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: colors.danger + '15',
  },
  debtWarningText: { fontSize: 13, fontWeight: '600' as const, color: colors.danger },
  infoCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 14, borderWidth: 1, borderColor: colors.border, gap: 8,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoLabel: { fontSize: 13, color: colors.textSecondary, width: 90 },
  infoValue: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  earlyExitCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: colors.warning + '20',
  },
  earlyExitTitle: { fontSize: 16, fontWeight: '700' as const, color: colors.warning, marginTop: 8, marginBottom: 14 },
  earlyExitDetails: { gap: 6, marginBottom: 16 },
  earlyExitRow: { flexDirection: 'row', justifyContent: 'space-between' },
  earlyExitLabel: { fontSize: 13, color: colors.textSecondary },
  earlyExitValue: { fontSize: 13, fontWeight: '600' as const, color: colors.text },
  earlyExitTotal: {
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4,
  },
  earlyExitTotalLabel: { fontSize: 15, fontWeight: '700' as const, color: colors.text },
  earlyExitTotalValue: { fontSize: 18, fontWeight: '800' as const, color: colors.warning },
  earlyExitBtn: {
    backgroundColor: colors.warning, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 4,
  },
  earlyExitBtnText: { fontSize: 15, fontWeight: '700' as const, color: colors.black },
  earlyExitLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, padding: 12,
  },
  earlyExitLinkText: { fontSize: 14, color: colors.warning, fontWeight: '500' as const },
  freeExitCard: {
    backgroundColor: colors.successSurface, borderRadius: 12, padding: 16,
    marginBottom: 12, alignItems: 'center',
  },
  freeExitText: { fontSize: 15, fontWeight: '600' as const, color: colors.success },
  totalCard: {
    backgroundColor: colors.primarySurface, borderRadius: 14, padding: 20,
    marginBottom: 16, alignItems: 'center',
    borderWidth: 1, borderColor: colors.primary + '15',
  },
  totalLabel: { fontSize: 13, color: colors.textSecondary },
  totalValue: { fontSize: 30, fontWeight: '800' as const, color: colors.primary, marginTop: 6, letterSpacing: -0.5 },
  sectionLabel: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 10, letterSpacing: 0.2, textTransform: 'uppercase' as const },
  methodLabel: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 10, letterSpacing: 0.2, textTransform: 'uppercase' as const },
  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  methodBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  methodBtnCash: { backgroundColor: colors.cash, borderColor: colors.cash },
  methodBtnCard: { backgroundColor: colors.card, borderColor: colors.card },
  methodBtnAdj: { backgroundColor: colors.adjustment, borderColor: colors.adjustment },
  methodText: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary },
  methodTextActive: { color: colors.white },
  debtOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    marginBottom: 20, borderWidth: 1, borderColor: colors.border,
  },
  debtOptionActive: { backgroundColor: colors.dangerSurface, borderColor: colors.danger + '25' },
  debtOptionText: { flex: 1, fontSize: 14, color: colors.textSecondary, fontWeight: '500' as const },
  debtOptionTextActive: { color: colors.danger },
  notesSection: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
  },
  notesSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8,
  },
  notesSectionTitle: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary },
  noteItem: {
    backgroundColor: colors.surfaceLight, borderRadius: 8, padding: 10, marginBottom: 4,
  },
  noteText: { fontSize: 13, color: colors.text },
  noteMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 4 },
  noteInputWrap: { marginBottom: 12 },
  noteInput: {
    backgroundColor: colors.surface, borderRadius: 12,
    padding: 14, fontSize: 14, color: colors.text,
    borderWidth: 1, borderColor: colors.border, minHeight: 56,
    textAlignVertical: 'top' as const,
  },
  exitBtn: {
    backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center',
  },
  exitBtnText: { fontSize: 16, fontWeight: '700' as const, color: colors.white },
});
