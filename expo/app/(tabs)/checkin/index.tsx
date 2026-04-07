import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert,
} from 'react-native';

import {
  Search, Car, UserPlus, Banknote, CreditCard, FileEdit,
  ChevronDown, ChevronUp, Check, AlertTriangle, LogOut as ExitIcon, X,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatPlateNumber, getServiceTypeLabel, getMonthlyAmount, normalizeForSearch, normalizePhone } from '@/utils/helpers';
import { ServiceType, PaymentMethod, Car as CarType, Client } from '@/types';
import { hapticSuccess, hapticError } from '@/utils/haptics';

export default function CheckinScreen() {
  const router = useRouter();
  const { currentUser, isAdmin } = useAuth();
  const colors = useColors();
  const {
    activeClients, activeCars, activeSessions, tariffs,
    addClient, checkIn, needsShiftCheck, addSessionNote,
  } = useParking();

  const [plateSearch, setPlateSearch] = useState('');
  const [selectedCar, setSelectedCar] = useState<CarType | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>('onetime');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [inDebt, setInDebt] = useState(false);
  const [days, setDays] = useState('1');
  const [showNewClient, setShowNewClient] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('+7');
  const [newModel, setNewModel] = useState('');
  const [customAmountEnabled, setCustomAmountEnabled] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [plannedDeparture, setPlannedDeparture] = useState('');
  const [sessionNote, setSessionNote] = useState('');

  const searchResults = useMemo(() => {
    if (plateSearch.trim().length < 1) return [];
    const q = normalizeForSearch(plateSearch);
    console.log('[CheckinSearch] query normalized:', JSON.stringify(q), 'activeClients:', activeClients.length, 'activeCars:', activeCars.length);
    const rawQ = plateSearch.trim();
    const byPlate = activeCars.filter(c =>
      normalizeForSearch(c.plateNumber).includes(q)
    );
    const byClient = activeClients.filter(cl =>
      normalizeForSearch(cl.name).includes(q) ||
      normalizePhone(cl.phone).includes(normalizePhone(rawQ)) ||
      (cl.phone2 && normalizePhone(cl.phone2).includes(normalizePhone(rawQ)))
    );
    const carResults = byPlate.map(car => ({
      car,
      client: activeClients.find(cl => cl.id === car.clientId),
      isParked: activeSessions.some(s => s.carId === car.id),
    }));
    const clientCars = byClient.flatMap(cl =>
      activeCars.filter(c => c.clientId === cl.id).map(car => ({
        car,
        client: cl,
        isParked: activeSessions.some(s => s.carId === car.id),
      }))
    );
    const seen = new Set(carResults.map(r => r.car.id));
    const merged = [...carResults];
    for (const cc of clientCars) {
      if (!seen.has(cc.car.id)) {
        merged.push(cc);
        seen.add(cc.car.id);
      }
    }
    return merged.slice(0, 10);
  }, [plateSearch, activeCars, activeClients, activeSessions]);

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

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleSelectCar = useCallback((car: CarType, client?: Client) => {
    setSelectedCar(car);
    setSelectedClient(client ?? null);
    setPlateSearch(car.plateNumber);
  }, []);

  const resetForm = useCallback(() => {
    setPlateSearch('');
    setSelectedCar(null);
    setSelectedClient(null);
    setShowNewClient(false);
    setNewName('');
    setNewPhone('+7');
    setNewModel('');
    setDays('1');
    setInDebt(false);
    setCustomAmountEnabled(false);
    setCustomAmount('');
    setAdjustmentReason('');
    setPlannedDeparture('');
    setSessionNote('');
  }, []);

  const handleCheckIn = useCallback(() => {
    if (!currentUser) return;
    if (needsShiftCheck() && !isAdmin) {
      Alert.alert('Смена не открыта', 'Откройте смену в кассе');
      return;
    }

    let carId = selectedCar?.id;
    let clientId = selectedClient?.id;

    if (!carId && showNewClient) {
      if (!newName.trim() || !newPhone.trim()) {
        Alert.alert('Ошибка', 'Заполните ФИО и телефон');
        return;
      }
      const plate = formatPlateNumber(plateSearch);
      if (!plate) {
        Alert.alert('Ошибка', 'Введите номер авто');
        return;
      }
      const result = addClient(newName.trim(), newPhone.trim(), plate, newModel.trim());
      clientId = result.id;
      carId = result.carId;
      if (!carId) {
        Alert.alert('Ошибка', 'Не удалось создать авто. Попробуйте снова.');
        return;
      }
    }

    if (!carId || !clientId) {
      Alert.alert('Ошибка', 'Выберите авто или создайте клиента');
      return;
    }

    const isParked = activeSessions.some(s => s.carId === carId);
    if (isParked) {
      Alert.alert('Ошибка', 'Авто уже на парковке');
      return;
    }

    const d = parseInt(days) || 1;
    const paidUntilDate = serviceType === 'monthly'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const result = checkIn({
      carId,
      clientId,
      serviceType,
      paymentMethod: inDebt ? undefined : paymentMethod,
      paymentAmount: inDebt ? 0 : finalAmount,
      inDebt,
      debtAmount: inDebt ? finalAmount : undefined,
      plannedDays: d,
      paidUntilDate,
      baseAmount: customAmountEnabled ? baseAmount : undefined,
      adjustmentReason: customAmountEnabled && adjustmentReason ? adjustmentReason : undefined,
    });

    if (result) {
      if (sessionNote.trim()) {
        addSessionNote(result.id, sessionNote.trim(), 'checkin');
      }
      hapticSuccess();
      Alert.alert('Готово', `Авто поставлено (${getServiceTypeLabel(serviceType)})`);
      resetForm();
    } else {
      hapticError();
    }
  }, [
    currentUser, needsShiftCheck, isAdmin, selectedCar, selectedClient,
    showNewClient, newName, newPhone, newModel, plateSearch, addClient,
    activeSessions, serviceType, paymentMethod, inDebt, finalAmount, baseAmount,
    days, checkIn, customAmountEnabled, adjustmentReason, resetForm, sessionNote, addSessionNote,
  ]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.searchBox}>
        <Search size={18} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Номер авто, ФИО или телефон..."
          placeholderTextColor={colors.textTertiary}
          value={plateSearch}
          onChangeText={(text) => {
            console.log('[CheckinSearch] input:', JSON.stringify(text), 'length:', text.length);
            setPlateSearch(text);
          }}
          autoCapitalize="none"
        />
        {plateSearch.length > 0 && !selectedCar && (
          <TouchableOpacity onPress={() => { setPlateSearch(''); setSelectedCar(null); setSelectedClient(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {searchResults.length > 0 && !selectedCar && (
        <View style={styles.resultsList}>
          {searchResults.map(({ car, client, isParked }) => (
            <TouchableOpacity
              key={car.id}
              style={[styles.resultItem, isParked && styles.resultItemParked]}
              onPress={() => {
                if (isParked) {
                  const session = activeSessions.find(s => s.carId === car.id);
                  if (session) {
                    router.push({ pathname: '/exit-modal', params: { sessionId: session.id } });
                  }
                } else {
                  handleSelectCar(car, client);
                }
              }}
            >
              <View style={styles.resultInfo}>
                <Text style={styles.resultPlate}>{car.plateNumber}</Text>
                <Text style={styles.resultModel}>{car.carModel} · {client?.name}</Text>
              </View>
              {isParked && (
                <TouchableOpacity
                  style={styles.parkedExitBadge}
                  onPress={() => {
                    const session = activeSessions.find(s => s.carId === car.id);
                    if (session) {
                      router.push({ pathname: '/exit-modal', params: { sessionId: session.id } });
                    }
                  }}
                >
                  <ExitIcon size={12} color={colors.warning} />
                  <Text style={styles.parkedExitText}>Выезд</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {plateSearch.length >= 2 && searchResults.length === 0 && !selectedCar && (
        <View style={styles.newClientOptions}>
          <TouchableOpacity
            style={styles.newClientBtn}
            onPress={() => setShowNewClient(true)}
          >
            <UserPlus size={18} color={colors.primary} />
            <Text style={styles.newClientBtnText}>Создать и оформить заезд</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.newClientBtnAlt}
            onPress={() => router.push('/add-client-modal')}
          >
            <UserPlus size={16} color={colors.textSecondary} />
            <Text style={styles.newClientBtnAltText}>Добавить клиента без заезда</Text>
          </TouchableOpacity>
        </View>
      )}

      {showNewClient && !selectedCar && (
        <View style={styles.newClientForm}>
          <Text style={styles.formTitle}>Новый клиент</Text>
          <TextInput
            style={styles.formInput}
            placeholder="ФИО"
            placeholderTextColor={colors.textTertiary}
            value={newName}
            onChangeText={setNewName}
          />
          <TextInput
            style={styles.formInput}
            placeholder="Телефон"
            placeholderTextColor={colors.textTertiary}
            value={newPhone}
            onChangeText={setNewPhone}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.formInput}
            placeholder="Марка/модель авто"
            placeholderTextColor={colors.textTertiary}
            value={newModel}
            onChangeText={setNewModel}
          />
        </View>
      )}

      {(selectedCar || showNewClient) && (
        <View style={styles.optionsSection}>
          {selectedCar && selectedClient && (
            <View style={styles.selectedCard}>
              <Car size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedPlate}>{selectedCar.plateNumber}</Text>
                <Text style={styles.selectedName}>{selectedClient.name}</Text>
              </View>
              <TouchableOpacity onPress={() => { setSelectedCar(null); setSelectedClient(null); }}>
                <Text style={styles.changeBtn}>Изменить</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.sectionLabel}>Тип заезда</Text>
          <View style={styles.segmentRow}>
            {(['onetime', 'monthly', 'lombard'] as ServiceType[]).map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.segmentBtn, serviceType === type && styles.segmentBtnActive]}
                onPress={() => { setServiceType(type); setCustomAmountEnabled(false); setCustomAmount(''); }}
              >
                <Text style={[styles.segmentText, serviceType === type && styles.segmentTextActive]} numberOfLines={1} adjustsFontSizeToFit>
                  {getServiceTypeLabel(type)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {serviceType === 'lombard' && (
            <View style={styles.lombardInfo}>
              <AlertTriangle size={14} color={colors.warning} />
              <Text style={styles.lombardInfoText}>
                Ломбард: {formatMoney(tariffs.lombardRate)}/сут. Долг начисляется ежедневно.
              </Text>
            </View>
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
            {serviceType !== 'lombard' && customAmountEnabled && adjustmentDiff !== 0 && (
              <Text style={styles.totalBase}>Базовая: {formatMoney(baseAmount)}</Text>
            )}
          </View>

          <TouchableOpacity style={styles.checkInBtn} onPress={handleCheckIn} activeOpacity={0.8}>
            <Text style={styles.checkInBtnText}>Оформить заезд</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12,
    paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, paddingVertical: 14, paddingLeft: 10,
    fontSize: 16, color: colors.text,
  },
  resultsList: { marginTop: 8 },
  resultItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10,
    padding: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  resultItemParked: { borderColor: colors.warning + '40', borderWidth: 1 },
  resultInfo: { flex: 1 },
  resultPlate: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  resultModel: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  parkedExitBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.warningSurface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
  },
  parkedExitText: { fontSize: 12, color: colors.warning, fontWeight: '600' as const },
  newClientOptions: { marginTop: 8, gap: 6 },
  newClientBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
    backgroundColor: colors.primarySurface, borderRadius: 10,
    padding: 14,
  },
  newClientBtnText: { fontSize: 14, fontWeight: '600' as const, color: colors.primary },
  newClientBtnAlt: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
    backgroundColor: colors.surface, borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  newClientBtnAltText: { fontSize: 14, fontWeight: '500' as const, color: colors.textSecondary },
  newClientForm: {
    backgroundColor: colors.surface, borderRadius: 12,
    padding: 16, marginTop: 12, borderWidth: 1, borderColor: colors.border,
  },
  formTitle: { fontSize: 16, fontWeight: '600' as const, color: colors.text, marginBottom: 12 },
  formInput: {
    backgroundColor: colors.surfaceLight, borderRadius: 10,
    padding: 12, fontSize: 15, color: colors.text, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  optionsSection: { marginTop: 16 },
  selectedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.primarySurface, borderRadius: 12,
    padding: 14, marginBottom: 16,
  },
  selectedPlate: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  selectedName: { fontSize: 13, color: colors.textSecondary },
  changeBtn: { fontSize: 13, color: colors.primary, fontWeight: '600' as const },
  sectionLabel: { fontSize: 14, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 8, marginTop: 12 },
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
    backgroundColor: colors.primary, borderRadius: 14,
    padding: 16, alignItems: 'center', marginTop: 16,
  },
  checkInBtnText: { fontSize: 16, fontWeight: '700' as const, color: colors.white },
});
