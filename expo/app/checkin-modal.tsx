import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Linking,
} from 'react-native';
import {
  Car, Banknote, CreditCard, FileEdit,
  ChevronDown, ChevronUp, Check, AlertTriangle,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, getServiceTypeLabel, getMonthlyAmount } from '@/utils/helpers';
import { ServiceType, PaymentMethod } from '@/types';
import { hapticSuccess, hapticError, hapticMedium } from '@/utils/haptics';

export default function CheckinModalScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { clientId, carId } = useLocalSearchParams<{ clientId: string; carId?: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();
  const {
    activeClients, activeCars, activeSessions, tariffs, clients, cars,
    checkIn, needsShiftCheck, addSessionNote,
  } = useParking();

  const client = useMemo(() => {
    return activeClients.find(c => c.id === clientId) ?? clients.find(c => c.id === clientId);
  }, [activeClients, clients, clientId]);

  const clientCars = useMemo(() => {
    const active = activeCars.filter(c => c.clientId === clientId);
    if (active.length > 0) return active;
    return cars.filter(c => c.clientId === clientId && !c.deleted);
  }, [activeCars, cars, clientId]);

  const availableCars = useMemo(() => {
    return clientCars.filter(c => !activeSessions.some(s => s.carId === c.id));
  }, [clientCars, activeSessions]);

  const [selectedCarId, setSelectedCarId] = useState<string>(carId ?? availableCars[0]?.id ?? '');
  const [serviceType, setServiceType] = useState<ServiceType>('onetime');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [inDebt, setInDebt] = useState(false);
  const [days, setDays] = useState('1');
  const [customAmountEnabled, setCustomAmountEnabled] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [plannedDeparture, setPlannedDeparture] = useState('');
  const [sessionNote, setSessionNote] = useState('');
  const [lombardPrepay, setLombardPrepay] = useState(false);
  const [lombardPrepayAmount, setLombardPrepayAmount] = useState('');
  const [lombardPrepayMethod, setLombardPrepayMethod] = useState<PaymentMethod>('cash');

  const baseAmount = useMemo(() => {
    const d = parseInt(days) || 1;
    if (serviceType === 'onetime') {
      return paymentMethod === 'card' ? tariffs.onetimeCard * d : tariffs.onetimeCash * d;
    }
    if (serviceType === 'monthly') {
      return paymentMethod === 'card' ? getMonthlyAmount(tariffs.monthlyCard) : getMonthlyAmount(tariffs.monthlyCash);
    }
    return tariffs.lombardRate;
  }, [serviceType, paymentMethod, days, tariffs]);

  const finalAmount = useMemo(() => {
    if (customAmountEnabled && customAmount) {
      const parsed = parseInt(customAmount);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
    return baseAmount;
  }, [customAmountEnabled, customAmount, baseAmount]);

  const adjustmentDiff = customAmountEnabled ? baseAmount - finalAmount : 0;

  const handleCheckIn = useCallback(() => {
    if (!currentUser) return;
    if (needsShiftCheck()) {
      Alert.alert('Смена не открыта', 'Откройте смену в кассе для оформления заезда');
      return;
    }
    if (!selectedCarId || !clientId) {
      Alert.alert('Ошибка', 'Выберите автомобиль');
      return;
    }

    const isParked = activeSessions.some(s => s.carId === selectedCarId);
    if (isParked) {
      Alert.alert('Ошибка', 'Этот автомобиль уже на парковке');
      return;
    }

    const d = parseInt(days) || 1;
    const paidUntilDate = serviceType === 'monthly'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const customRate = customAmountEnabled && d > 0 ? Math.round(finalAmount / d) : undefined;

    const result = checkIn({
      carId: selectedCarId,
      clientId,
      serviceType,
      paymentMethod: serviceType === 'lombard'
        ? (lombardPrepay ? lombardPrepayMethod : undefined)
        : (inDebt ? undefined : paymentMethod),
      paymentAmount: serviceType === 'lombard'
        ? (lombardPrepay ? (parseInt(lombardPrepayAmount) || 0) : 0)
        : (inDebt ? 0 : finalAmount),
      inDebt,
      debtAmount: inDebt ? finalAmount : undefined,
      lombardPrepayment: serviceType === 'lombard' && lombardPrepay ? (parseInt(lombardPrepayAmount) || 0) : undefined,
      plannedDays: d,
      paidUntilDate,
      baseAmount: customAmountEnabled ? baseAmount : undefined,
      adjustmentReason: customAmountEnabled && adjustmentReason ? adjustmentReason : undefined,
      customRate: customAmountEnabled ? customRate : undefined,
    });

    if (result) {
      if (sessionNote.trim()) {
        addSessionNote(result.id, sessionNote.trim(), 'checkin');
      }
      hapticSuccess();
      Alert.alert('Готово', `Авто поставлено (${getServiceTypeLabel(serviceType)})`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      hapticError();
    }
  }, [
    currentUser, needsShiftCheck, selectedCarId, clientId,
    activeSessions, serviceType, paymentMethod, inDebt, finalAmount, baseAmount,
    days, checkIn, customAmountEnabled, adjustmentReason, sessionNote, addSessionNote, router,
    lombardPrepay, lombardPrepayAmount, lombardPrepayMethod,
  ]);

  if (!client) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Клиент не найден</Text>
      </View>
    );
  }

  if (availableCars.length === 0) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.clientHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{client.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.clientName}>{client.name}</Text>
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${client.phone}`)}>
              <Text style={[styles.clientPhone, { color: colors.primary }]}>{client.phone}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.emptyState}>
          <Car size={40} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>Нет доступных авто</Text>
          <Text style={styles.emptyDesc}>Все автомобили клиента уже на парковке или нет зарегистрированных авто</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.clientHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{client.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.clientName} numberOfLines={1}>{client.name}</Text>
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${client.phone}`)}>
            <Text style={[styles.clientPhone, { color: colors.primary }]} numberOfLines={1}>{client.phone}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Автомобиль</Text>
      <View style={styles.carList}>
        {availableCars.map(car => {
          const isSelected = car.id === selectedCarId;
          return (
            <TouchableOpacity
              key={car.id}
              style={[styles.carOption, isSelected && styles.carOptionSelected]}
              onPress={() => {
                hapticMedium();
                setSelectedCarId(car.id);
              }}
            >
              <Car size={16} color={isSelected ? colors.primary : colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.carPlate, isSelected && styles.carPlateSelected]} numberOfLines={1}>{car.plateNumber}</Text>
                {car.carModel ? <Text style={styles.carModel}>{car.carModel}</Text> : null}
              </View>
              {isSelected && <Check size={18} color={colors.primary} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Тип заезда</Text>
      <View style={styles.segmentRow}>
        {(['onetime', 'monthly', 'lombard'] as ServiceType[]).map(type => (
          <TouchableOpacity
            key={type}
            style={[styles.segmentBtn, serviceType === type && styles.segmentBtnActive]}
            onPress={() => { setServiceType(type); setCustomAmountEnabled(false); setCustomAmount(''); if (type === 'lombard') { setInDebt(false); setLombardPrepay(false); setLombardPrepayAmount(''); } }}
          >
            <Text style={[styles.segmentText, serviceType === type && styles.segmentTextActive]} numberOfLines={1} adjustsFontSizeToFit>
              {getServiceTypeLabel(type)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {serviceType === 'lombard' && (
        <>
          <View style={styles.lombardInfo}>
            <AlertTriangle size={14} color={colors.warning} />
            <Text style={styles.lombardInfoText}>
              Ломбард: {formatMoney(tariffs.lombardRate)}/сут. Долг начисляется ежедневно.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.debtToggle, lombardPrepay && { backgroundColor: colors.primarySurface, borderColor: colors.primary + '30' }]}
            onPress={() => setLombardPrepay(!lombardPrepay)}
          >
            {lombardPrepay && <Check size={16} color={colors.primary} />}
            <Banknote size={16} color={lombardPrepay ? colors.primary : colors.textTertiary} />
            <Text style={[styles.debtToggleText, lombardPrepay && { color: colors.primary }]}>
              Предоплата
            </Text>
          </TouchableOpacity>

          {lombardPrepay && (
            <View style={styles.lombardPrepayForm}>
              <Text style={styles.sectionLabel}>Способ оплаты</Text>
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  style={[styles.segmentBtn, lombardPrepayMethod === 'cash' && styles.segmentBtnCash]}
                  onPress={() => setLombardPrepayMethod('cash')}
                >
                  <Banknote size={16} color={lombardPrepayMethod === 'cash' ? colors.white : colors.cash} />
                  <Text style={[styles.segmentText, lombardPrepayMethod === 'cash' && styles.segmentTextWhite]}>Наличные</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, lombardPrepayMethod === 'card' && styles.segmentBtnCard]}
                  onPress={() => setLombardPrepayMethod('card')}
                >
                  <CreditCard size={16} color={lombardPrepayMethod === 'card' ? colors.white : colors.card} />
                  <Text style={[styles.segmentText, lombardPrepayMethod === 'card' && styles.segmentTextWhite]}>Безнал</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.lombardPrepayRow}>
                <Text style={styles.customAmountLabel}>Сумма предоплаты:</Text>
                <TextInput
                  style={styles.customAmountInput}
                  value={lombardPrepayAmount}
                  onChangeText={setLombardPrepayAmount}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            </View>
          )}
        </>
      )}

      {serviceType === 'onetime' && (
        <View style={styles.daysRow}>
          <Text style={styles.sectionLabel}>Кол-во суток</Text>
          <View style={styles.daysInput}>
            <TouchableOpacity onPress={() => setDays(String(Math.max(1, (parseInt(days) || 1) - 1)))}>
              <ChevronDown size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TextInput
              style={styles.daysValue}
              value={days}
              onChangeText={setDays}
              keyboardType="numeric"
            />
            <TouchableOpacity onPress={() => setDays(String((parseInt(days) || 1) + 1))}>
              <ChevronUp size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {serviceType !== 'lombard' && (
        <>
          <Text style={styles.sectionLabel}>Способ оплаты</Text>
          <View style={styles.segmentRow}>
            <TouchableOpacity
              style={[styles.segmentBtn, paymentMethod === 'cash' && styles.segmentBtnCash]}
              onPress={() => setPaymentMethod('cash')}
            >
              <Banknote size={16} color={paymentMethod === 'cash' ? colors.white : colors.cash} />
              <Text style={[styles.segmentText, paymentMethod === 'cash' && styles.segmentTextWhite]}>Наличные</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, paymentMethod === 'card' && styles.segmentBtnCard]}
              onPress={() => setPaymentMethod('card')}
            >
              <CreditCard size={16} color={paymentMethod === 'card' ? colors.white : colors.card} />
              <Text style={[styles.segmentText, paymentMethod === 'card' && styles.segmentTextWhite]}>Безнал</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.debtToggle, inDebt && styles.debtToggleActive]}
            onPress={() => setInDebt(!inDebt)}
          >
            {inDebt && <Check size={16} color={colors.danger} />}
            <Text style={[styles.debtToggleText, inDebt && styles.debtToggleTextActive]}>
              В долг
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.customAmountToggle, customAmountEnabled && styles.customAmountToggleActive]}
            onPress={() => {
              setCustomAmountEnabled(!customAmountEnabled);
              if (!customAmountEnabled) setCustomAmount(String(baseAmount));
            }}
          >
            <FileEdit size={14} color={customAmountEnabled ? colors.adjustment : colors.textTertiary} />
            <Text style={[styles.customAmountToggleText, customAmountEnabled && styles.customAmountToggleTextActive]}>
              Произвольная сумма
            </Text>
          </TouchableOpacity>

          {customAmountEnabled && (
            <View style={styles.customAmountForm}>
              <View style={styles.customAmountRow}>
                <Text style={styles.customAmountLabel}>Сумма:</Text>
                <TextInput
                  style={styles.customAmountInput}
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  keyboardType="numeric"
                  placeholder={String(baseAmount)}
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
              {adjustmentDiff !== 0 && (
                <Text style={[styles.adjustmentText, adjustmentDiff > 0 ? styles.adjustmentDiscount : styles.adjustmentSurcharge]}>
                  {adjustmentDiff > 0 ? `Скидка: -${formatMoney(adjustmentDiff)}` : `Наценка: +${formatMoney(Math.abs(adjustmentDiff))}`}
                </Text>
              )}
              <TextInput
                style={styles.reasonInput}
                value={adjustmentReason}
                onChangeText={setAdjustmentReason}
                placeholder="Причина корректировки"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          )}
        </>
      )}

      <TextInput
        style={styles.departureInput}
        value={plannedDeparture}
        onChangeText={setPlannedDeparture}
        placeholder="Планируемый выезд (необязательно)"
        placeholderTextColor={colors.textTertiary}
      />

      <TextInput
        style={styles.noteInput}
        value={sessionNote}
        onChangeText={setSessionNote}
        placeholder="Заметка к заезду (необязательно)"
        placeholderTextColor={colors.textTertiary}
        multiline
        numberOfLines={2}
      />

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>
          {serviceType === 'lombard' ? 'Тариф' : 'Итого'}
        </Text>
        <Text style={[styles.totalAmount, inDebt && styles.totalAmountDebt]} numberOfLines={1} adjustsFontSizeToFit>
          {serviceType === 'lombard'
            ? `${formatMoney(tariffs.lombardRate)}/сут.`
            : inDebt ? `Долг: ${formatMoney(finalAmount)}` : formatMoney(finalAmount)
          }
        </Text>
        {serviceType === 'lombard' && lombardPrepay && parseInt(lombardPrepayAmount) > 0 && (
          <Text style={[styles.totalBase, { textDecorationLine: 'none' as const, color: colors.success, marginTop: 6 }]}>
            Предоплата: {formatMoney(parseInt(lombardPrepayAmount))}
          </Text>
        )}
        {serviceType !== 'lombard' && customAmountEnabled && adjustmentDiff !== 0 && (
          <Text style={styles.totalBase}>Базовая: {formatMoney(baseAmount)}</Text>
        )}
      </View>

      <TouchableOpacity style={styles.checkInBtn} onPress={handleCheckIn} activeOpacity={0.8}>
        <Car size={18} color={colors.white} />
        <Text style={styles.checkInBtnText}>Оформить заезд</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  errorText: { fontSize: 16, color: colors.textTertiary, textAlign: 'center' as const, marginTop: 60 },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800' as const, color: colors.primary },
  clientName: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  clientPhone: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  emptyDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' as const, paddingHorizontal: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 8, marginTop: 12 },
  carList: { gap: 6 },
  carOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  carOptionSelected: {
    borderColor: colors.primary + '50',
    backgroundColor: colors.primarySurface,
  },
  carPlate: { fontSize: 15, fontWeight: '700' as const, color: colors.text },
  carPlateSelected: { color: colors.primary },
  carModel: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segmentBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: colors.surface, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 6, borderWidth: 1, borderColor: colors.border,
  },
  segmentBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentBtnCash: { backgroundColor: colors.cash, borderColor: colors.cash },
  segmentBtnCard: { backgroundColor: colors.card, borderColor: colors.card },
  segmentText: { fontSize: 14, fontWeight: '600' as const, color: colors.textSecondary },
  segmentTextActive: { color: colors.white },
  segmentTextWhite: { color: colors.white },
  lombardInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.warningSurface, borderRadius: 8,
    padding: 10, marginTop: 10, borderWidth: 1, borderColor: colors.warning + '20',
  },
  lombardInfoText: { flex: 1, fontSize: 12, color: colors.warning, fontWeight: '500' as const },
  lombardPrepayForm: {
    backgroundColor: colors.surface, borderRadius: 10,
    padding: 12, marginTop: 8, borderWidth: 1, borderColor: colors.primary + '25', gap: 8,
  },
  lombardPrepayRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginTop: 4 },
  daysRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
  },
  daysInput: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  daysValue: { fontSize: 18, fontWeight: '700' as const, color: colors.text, minWidth: 30, textAlign: 'center' as const },
  debtToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: 10,
    padding: 12, marginTop: 12, borderWidth: 1, borderColor: colors.border,
  },
  debtToggleActive: { backgroundColor: colors.dangerSurface, borderColor: colors.danger + '30' },
  debtToggleText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' as const },
  debtToggleTextActive: { color: colors.danger },
  customAmountToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: 10,
    padding: 12, marginTop: 8, borderWidth: 1, borderColor: colors.border,
  },
  customAmountToggleActive: {
    backgroundColor: 'rgba(167, 139, 250, 0.08)', borderColor: colors.adjustment + '30',
  },
  customAmountToggleText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' as const },
  customAmountToggleTextActive: { color: colors.adjustment },
  customAmountForm: {
    backgroundColor: colors.surface, borderRadius: 10,
    padding: 12, marginTop: 8, borderWidth: 1, borderColor: colors.adjustment + '25',
  },
  customAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customAmountLabel: { fontSize: 13, color: colors.textSecondary },
  customAmountInput: {
    flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 8,
    padding: 8, fontSize: 16, fontWeight: '700' as const, color: colors.text,
    textAlign: 'right' as const, borderWidth: 1, borderColor: colors.border,
  },
  adjustmentText: { fontSize: 12, fontWeight: '600' as const, marginTop: 6 },
  adjustmentDiscount: { color: colors.success },
  adjustmentSurcharge: { color: colors.danger },
  reasonInput: {
    backgroundColor: colors.surfaceLight, borderRadius: 8,
    padding: 8, fontSize: 13, color: colors.text, marginTop: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  departureInput: {
    backgroundColor: colors.surface, borderRadius: 10,
    padding: 12, fontSize: 14, color: colors.text, marginTop: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  noteInput: {
    backgroundColor: colors.surface, borderRadius: 10,
    padding: 12, fontSize: 14, color: colors.text, marginTop: 8,
    borderWidth: 1, borderColor: colors.border, minHeight: 56,
    textAlignVertical: 'top' as const,
  },
  totalCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    padding: 20, marginTop: 16, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  totalLabel: { fontSize: 13, color: colors.textSecondary },
  totalAmount: { fontSize: 28, fontWeight: '800' as const, color: colors.primary, marginTop: 4 },
  totalAmountDebt: { color: colors.danger },
  totalBase: { fontSize: 12, color: colors.textTertiary, marginTop: 4, textDecorationLine: 'line-through' as const },
  checkInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary, borderRadius: 14,
    padding: 16, marginTop: 16,
  },
  checkInBtnText: { fontSize: 16, fontWeight: '700' as const, color: colors.white },
});
