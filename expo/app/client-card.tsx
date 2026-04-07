import React, { useMemo, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Phone, Car, CreditCard, Edit3, Plus, X, Check,
  Clock, Trash2, Wallet, RotateCcw, History,
  LogOut as ExitIcon, ChevronDown, ChevronUp, ParkingCircle, CalendarCheck,
} from 'lucide-react-native';
import { hapticMedium } from '@/utils/haptics';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import {
  formatMoney, formatDate, formatDateTime, calculateDays,
  daysUntil, getServiceTypeLabel, getMethodLabel, roundMoney,
} from '@/utils/helpers';

export default function ClientCardScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const {
    activeClients, activeCars, activeSessions, clients, cars,
    subscriptions, activeDebts, getClientDebtTotal,
    transactions, payments, sessions, editHistory,
    deleteClient, cancelCheckIn, cancelCheckOut, cancelPayment,
    updateClient, updateCar, addCarToClient, deleteCar,
    addManualDebt, deleteDebt, tariffs,
  } = useParking();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPhone2, setEditPhone2] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [addingCar, setAddingCar] = useState(false);
  const [newCarPlate, setNewCarPlate] = useState('');
  const [newCarModel, setNewCarModel] = useState('');

  const [editingCarId, setEditingCarId] = useState<string | null>(null);
  const [editCarPlate, setEditCarPlate] = useState('');
  const [editCarModel, setEditCarModel] = useState('');

  const [addingDebt, setAddingDebt] = useState(false);
  const [debtAmount, setDebtAmount] = useState('');
  const [debtComment, setDebtComment] = useState('');
  const [debtCarId, setDebtCarId] = useState<string | null>(null);
  const [debtLombard, setDebtLombard] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);

  const client = useMemo(() => {
    const found = activeClients.find(c => c.id === clientId);
    if (found) return found;
    return clients.find(c => c.id === clientId);
  }, [activeClients, clients, clientId]);

  const clientCars = useMemo(() => {
    const active = activeCars.filter(c => c.clientId === clientId);
    if (active.length > 0) return active;
    return cars.filter(c => c.clientId === clientId && !c.deleted);
  }, [activeCars, cars, clientId]);

  const clientSessions = useMemo(() =>
    activeSessions.filter(s => s.clientId === clientId),
  [activeSessions, clientId]);

  const recentCompletedSessions = useMemo(() =>
    sessions
      .filter(s => s.clientId === clientId && s.status === 'completed' && !s.cancelled)
      .sort((a, b) => new Date(b.exitTime ?? b.entryTime).getTime() - new Date(a.exitTime ?? a.entryTime).getTime())
      .slice(0, 5),
  [sessions, clientId]);

  const clientSubs = useMemo(() =>
    subscriptions.filter(s => s.clientId === clientId),
  [subscriptions, clientId]);

  const activeSubscription = useMemo(() => {
    const now = new Date();
    return clientSubs.find(s => new Date(s.paidUntil) >= now) ?? null;
  }, [clientSubs]);

  const activeSubCar = useMemo(() => {
    if (!activeSubscription) return null;
    return clientCars.find(c => c.id === activeSubscription.carId) ?? null;
  }, [activeSubscription, clientCars]);

  const clientDebts = useMemo(() =>
    activeDebts.filter(d => d.clientId === clientId),
  [activeDebts, clientId]);

  const totalDebt = useMemo(() => getClientDebtTotal(clientId ?? ''), [getClientDebtTotal, clientId]);

  const recentTx = useMemo(() =>
    transactions.filter(t => t.clientId === clientId).slice(0, 20),
  [transactions, clientId]);

  const [showAllPayments, setShowAllPayments] = useState(false);

  const allClientPayments = useMemo(() =>
    payments
      .filter(p => p.clientId === clientId && !p.cancelled)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  [payments, clientId]);

  const visiblePayments = useMemo(() =>
    showAllPayments ? allClientPayments : allClientPayments.slice(0, 10),
  [allClientPayments, showAllPayments]);

  const clientEditHistory = useMemo(() =>
    editHistory
      .filter(h => h.clientId === clientId)
      .sort((a, b) => new Date(b.editedAt).getTime() - new Date(a.editedAt).getTime())
      .slice(0, 30),
  [editHistory, clientId]);

  const handleCall = useCallback((phoneNumber?: string) => {
    const num = phoneNumber || client?.phone;
    if (num) {
      void Linking.openURL(`tel:${num}`);
    }
  }, [client]);

  const handleDelete = useCallback(() => {
    if (!clientId) return;
    Alert.alert('Удалить клиента', `Удалить ${client?.name}?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        deleteClient(clientId);
        router.back();
      }},
    ]);
  }, [clientId, client, deleteClient, router]);

  const startEditing = useCallback(() => {
    if (!client) return;
    setEditName(client.name);
    setEditPhone(client.phone);
    setEditPhone2(client.phone2 ?? '');
    setEditNotes(client.notes);
    setEditing(true);
  }, [client]);

  const saveEditing = useCallback(() => {
    if (!clientId || !editName.trim()) return;
    updateClient(clientId, {
      name: editName.trim(),
      phone: editPhone.trim(),
      phone2: editPhone2.trim() || undefined,
      notes: editNotes.trim(),
    });
    setEditing(false);
    Alert.alert('Готово', 'Данные обновлены');
  }, [clientId, editName, editPhone, editPhone2, editNotes, updateClient]);

  const handleAddCar = useCallback(() => {
    if (!clientId || !newCarPlate.trim()) {
      Alert.alert('Ошибка', 'Введите номер авто');
      return;
    }
    addCarToClient(clientId, newCarPlate.trim(), newCarModel.trim());
    setNewCarPlate('');
    setNewCarModel('');
    setAddingCar(false);
    Alert.alert('Готово', 'Авто добавлено');
  }, [clientId, newCarPlate, newCarModel, addCarToClient]);

  const startEditCar = useCallback((carId: string) => {
    const car = clientCars.find(c => c.id === carId);
    if (!car) return;
    setEditingCarId(carId);
    setEditCarPlate(car.plateNumber);
    setEditCarModel(car.carModel ?? '');
  }, [clientCars]);

  const saveEditCar = useCallback(() => {
    if (!editingCarId || !editCarPlate.trim()) return;
    updateCar(editingCarId, {
      plateNumber: editCarPlate.trim().toUpperCase(),
      carModel: editCarModel.trim(),
    });
    setEditingCarId(null);
    Alert.alert('Готово', 'Авто обновлено');
  }, [editingCarId, editCarPlate, editCarModel, updateCar]);

  const handleDeleteCar = useCallback((carId: string) => {
    Alert.alert('Удалить авто', 'Удалить этот автомобиль?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteCar(carId) },
    ]);
  }, [deleteCar]);

  const handleAddDebt = useCallback(() => {
    const amt = parseFloat(debtAmount);
    if (!clientId || isNaN(amt) || amt <= 0) {
      Alert.alert('Ошибка', 'Введите сумму');
      return;
    }
    if (debtLombard && !debtCarId) {
      Alert.alert('Ошибка', 'Выберите авто для ломбардного долга');
      return;
    }
    addManualDebt(clientId, amt, debtComment.trim(), debtCarId ?? undefined, debtLombard);
    setDebtAmount('');
    setDebtComment('');
    setDebtCarId(null);
    setDebtLombard(false);
    setAddingDebt(false);
    Alert.alert('Готово', `Долг добавлен${debtLombard ? ' (ломбард, ежедневное начисление)' : ''}`);
  }, [clientId, debtAmount, debtComment, debtCarId, debtLombard, addManualDebt]);

  const handleCancelCheckOut = useCallback((sessionId: string) => {
    Alert.alert('Отмена выезда', 'Вернуть автомобиль на парковку?', [
      { text: 'Нет', style: 'cancel' },
      { text: 'Да', onPress: () => {
        cancelCheckOut(sessionId);
        Alert.alert('Готово', 'Выезд отменён');
      }},
    ]);
  }, [cancelCheckOut]);

  const handleCancelPayment = useCallback((paymentId: string, amount: number) => {
    Alert.alert('Отмена оплаты', `Отменить оплату ${formatMoney(amount)}? Будет создан долг.`, [
      { text: 'Нет', style: 'cancel' },
      { text: 'Отменить', style: 'destructive', onPress: () => {
        cancelPayment(paymentId);
        Alert.alert('Готово', 'Оплата отменена');
      }},
    ]);
  }, [cancelPayment]);

  const getFieldLabel = (field: string): string => {
    switch (field) {
      case 'name': return 'ФИО';
      case 'phone': return 'Телефон';
      case 'phone2': return 'Доп. телефон';
      case 'notes': return 'Заметки';
      case 'plateNumber': return 'Гос. номер';
      case 'carModel': return 'Модель';
      default: return field;
    }
  };

  if (!client) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Клиент не найден</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {client.deleted && (
        <View style={styles.deletedBanner}>
          <Text style={styles.deletedBannerText}>Клиент удалён</Text>
        </View>
      )}

      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, totalDebt > 0 ? styles.avatarDebt : styles.avatarOk]}>
            <Text style={styles.avatarText}>{client.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {editing ? (
              <View style={styles.editForm}>
                <TextInput style={styles.editInput} value={editName} onChangeText={setEditName} placeholder="ФИО" placeholderTextColor={colors.textTertiary} />
                <TextInput style={styles.editInput} value={editPhone} onChangeText={setEditPhone} placeholder="Телефон" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" />
                <TextInput style={styles.editInput} value={editPhone2} onChangeText={setEditPhone2} placeholder="Доп. телефон" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" />
                <TextInput style={styles.editInput} value={editNotes} onChangeText={setEditNotes} placeholder="Заметки" placeholderTextColor={colors.textTertiary} multiline />
                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.editSaveBtn} onPress={saveEditing}>
                    <Check size={16} color={colors.white} />
                    <Text style={styles.editSaveText}>Сохранить</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editCancelBtn} onPress={() => setEditing(false)}>
                    <X size={16} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.profileName}>{client.name}</Text>
                <TouchableOpacity onPress={() => handleCall(client.phone)} style={styles.phoneRow}>
                  <Phone size={14} color={colors.primary} />
                  <Text style={styles.phoneText}>{client.phone}</Text>
                </TouchableOpacity>
                {client.phone2 && (
                  <TouchableOpacity onPress={() => handleCall(client.phone2)} style={styles.phoneRow}>
                    <Phone size={12} color={colors.textTertiary} />
                    <Text style={styles.phone2Text}>доп. {client.phone2}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
          {!editing && !client.deleted && (
            <TouchableOpacity onPress={startEditing} style={styles.editBtn}>
              <Edit3 size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {client.notes && !editing ? (
          <Text style={styles.notes}>{client.notes}</Text>
        ) : null}
      </View>

      {activeSubscription && (
        <View style={styles.subscriptionBanner}>
          <View style={styles.subscriptionBannerIcon}>
            <CalendarCheck size={18} color={colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.subscriptionBannerTitle}>Абонемент активен</Text>
            <Text style={styles.subscriptionBannerSub}>
              до {formatDate(activeSubscription.paidUntil)} · осталось {daysUntil(activeSubscription.paidUntil)} дн.
              {activeSubCar ? ` · ${activeSubCar.plateNumber}` : ''}
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.debtBadge, totalDebt > 0 ? styles.debtBadgeRed : styles.debtBadgeGreen]}>
        <Text style={[styles.debtBadgeText, totalDebt > 0 ? styles.debtBadgeTextRed : styles.debtBadgeTextGreen]}>
          {totalDebt > 0 ? `Долг: ${formatMoney(totalDebt)}` : 'Нет задолженности'}
        </Text>
      </View>

      {totalDebt > 0 && (
        <TouchableOpacity
          style={styles.payDebtBtn}
          onPress={() => router.push({ pathname: '/pay-debt-modal', params: { clientId } })}
        >
          <Wallet size={18} color={colors.white} />
          <Text style={styles.payDebtBtnText}>Оплатить долг</Text>
        </TouchableOpacity>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push({ pathname: '/checkin-modal', params: { clientId } })}
        >
          <Car size={16} color={colors.primary} />
          <Text style={styles.actionBtnText}>Заезд</Text>
        </TouchableOpacity>
        {clientSessions.length > 0 && (
          <TouchableOpacity
            style={styles.actionBtnSecondary}
            onPress={() => router.push({ pathname: '/exit-modal', params: { sessionId: clientSessions[0].id } })}
          >
            <ExitIcon size={16} color={colors.warning} />
            <Text style={styles.actionBtnSecondaryText}>Выезд</Text>
          </TouchableOpacity>
        )}
      </View>

      {clientSubs.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Абонементы</Text>
          {clientSubs.map(sub => {
            const car = clientCars.find(c => c.id === sub.carId);
            const days = daysUntil(sub.paidUntil);
            const isActive = days >= 0;
            return (
              <View key={sub.id} style={styles.subCard}>
                <View style={styles.subHeader}>
                  <View style={[styles.subStatus, isActive ? styles.subStatusActive : styles.subStatusExpired]}>
                    <Text style={[styles.subStatusText, isActive ? styles.subStatusTextActive : styles.subStatusTextExpired]}>
                      {isActive ? 'Активен' : 'Истёк'}
                    </Text>
                  </View>
                  <Text style={styles.subDate}>до {formatDate(sub.paidUntil)}</Text>
                  {isActive && <Text style={styles.subDays}>{days} дн.</Text>}
                </View>
                {car && <Text style={styles.subCar}>{car.plateNumber} {car.carModel ?? ''}</Text>}
                <TouchableOpacity
                  style={styles.subPayBtn}
                  onPress={() => router.push({
                    pathname: '/pay-monthly-modal',
                    params: { clientId, carId: sub.carId },
                  })}
                >
                  <CreditCard size={14} color={colors.primary} />
                  <Text style={styles.subPayText}>Продлить</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {clientSessions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>На парковке сейчас</Text>
          {clientSessions.map(session => {
            const car = clientCars.find(c => c.id === session.carId);
            const days = calculateDays(session.entryTime, undefined, session.serviceType === 'lombard');
            return (
              <View key={session.id} style={styles.sessionCard}>
                <View style={styles.sessionHeader}>
                  <Text style={styles.sessionPlate}>{car?.plateNumber ?? '???'}</Text>
                  <View style={styles.sessionTypeBadge}>
                    <Text style={styles.sessionTypeText}>{getServiceTypeLabel(session.serviceType)}</Text>
                  </View>
                </View>
                <View style={styles.sessionInfo}>
                  <Clock size={12} color={colors.textTertiary} />
                  <Text style={styles.sessionInfoText}>
                    {formatDateTime(session.entryTime)} · {days} сут.
                  </Text>
                </View>
                {session.serviceType === 'lombard' && (() => {
                  const rate = session.lombardRateApplied || tariffs.lombardRate;
                  const lombardTotal = roundMoney(days * rate);
                  const lombardPaid = session.prepaidAmount;
                  const lombardOwed = Math.max(0, lombardTotal - lombardPaid);
                  return (
                    <View>
                      <View style={styles.lombardAccrualRow}>
                        <Text style={styles.lombardAccrualLabel}>Начислено ({days} сут. × {formatMoney(rate)}):</Text>
                        <Text style={styles.lombardAccrualValue}>{formatMoney(lombardTotal)}</Text>
                      </View>
                      {lombardPaid > 0 && (
                        <View style={styles.lombardAccrualRow}>
                          <Text style={styles.lombardAccrualLabel}>Оплачено:</Text>
                          <Text style={[styles.lombardAccrualValue, { color: colors.success }]}>−{formatMoney(lombardPaid)}</Text>
                        </View>
                      )}
                      {lombardOwed > 0 && (
                        <View style={styles.lombardAccrualRow}>
                          <Text style={[styles.lombardAccrualLabel, { fontWeight: '600' as const }]}>Долг:</Text>
                          <Text style={[styles.lombardAccrualValue, { color: colors.danger, fontWeight: '600' as const }]}>{formatMoney(lombardOwed)}</Text>
                        </View>
                      )}
                    </View>
                  );
                })()}
                {session.serviceType === 'onetime' && (() => {
                  const standardRate = session.prepaidMethod === 'card' ? tariffs.onetimeCard : tariffs.onetimeCash;
                  const rate = (session.customRate !== undefined && session.isDiscounted) ? session.customRate : standardRate;
                  const totalCost = roundMoney(days * rate);
                  const overstay = Math.max(0, totalCost - session.prepaidAmount);
                  if (overstay <= 0 && !session.isDiscounted) return null;
                  if (session.isDiscounted && overstay <= 0) {
                    return (
                      <View style={[styles.lombardAccrualRow, { backgroundColor: colors.successSurface }]}>
                        <Text style={[styles.lombardAccrualLabel, { color: colors.success }]}>
                          Договорная цена: {formatMoney(rate)}/сут.
                        </Text>
                        <Text style={[styles.lombardAccrualValue, { color: colors.success }]}>Скидка</Text>
                      </View>
                    );
                  }
                  return (
                    <View style={styles.lombardAccrualRow}>
                      <Text style={styles.lombardAccrualLabel}>
                        Долг ({days} сут. × {formatMoney(rate)}{session.prepaidAmount > 0 ? ` − ${formatMoney(session.prepaidAmount)}` : ''}):
                      </Text>
                      <Text style={styles.lombardAccrualValue}>{formatMoney(overstay)}</Text>
                    </View>
                  );
                })()}
                {session.serviceType === 'monthly' && (() => {
                  const sub = clientSubs.find(s => s.carId === session.carId);
                  if (!sub) return null;
                  const paidUntil = new Date(sub.paidUntil);
                  const now = new Date();
                  if (now <= paidUntil) return null;
                  const dailyRate = session.prepaidMethod === 'card' ? tariffs.monthlyCard : tariffs.monthlyCash;
                  const msOverdue = now.getTime() - paidUntil.getTime();
                  const daysOverdue = Math.max(1, Math.ceil(msOverdue / (24 * 60 * 60 * 1000)));
                  const overstayAmount = roundMoney(daysOverdue * dailyRate);
                  return (
                    <View style={styles.lombardAccrualRow}>
                      <Text style={styles.lombardAccrualLabel}>
                        Долг (просрочка {daysOverdue} сут. × {formatMoney(dailyRate)}):
                      </Text>
                      <Text style={styles.lombardAccrualValue}>{formatMoney(overstayAmount)}</Text>
                    </View>
                  );
                })()}
                <Text style={styles.sessionManager}>Оформил: {session.managerName}</Text>
                <View style={styles.sessionActions}>
                  {session.serviceType === 'monthly' && (
                    <TouchableOpacity
                      style={styles.sessionRefundBtn}
                      onPress={() => router.push({ pathname: '/exit-modal', params: { sessionId: session.id, earlyExit: '1' } })}
                    >
                      <Text style={styles.sessionRefundText}>Досрочный возврат</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.sessionExitBtn}
                    onPress={() => router.push({ pathname: '/exit-modal', params: { sessionId: session.id } })}
                  >
                    <ExitIcon size={14} color={colors.white} />
                    <Text style={styles.sessionExitText}>Выезд</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.sessionCancelBtn}
                    onPress={() => Alert.alert('Отмена', 'Отменить заезд?', [
                      { text: 'Нет' },
                      { text: 'Да', style: 'destructive', onPress: () => cancelCheckIn(session.id) },
                    ])}
                  >
                    <Text style={styles.sessionCancelText}>Отмена</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {isAdmin && recentCompletedSessions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Недавние выезды</Text>
          {recentCompletedSessions.map(session => {
            const car = cars.find(c => c.id === session.carId);
            return (
              <View key={session.id} style={styles.completedCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.completedPlate}>{car?.plateNumber ?? '???'}</Text>
                  <Text style={styles.completedDate}>
                    Выезд: {session.exitTime ? formatDateTime(session.exitTime) : '—'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.restoreBtn}
                  onPress={() => handleCancelCheckOut(session.id)}
                >
                  <RotateCcw size={14} color={colors.info} />
                  <Text style={styles.restoreText}>Вернуть</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Автомобили</Text>
          {!client.deleted && (
            <TouchableOpacity onPress={() => setAddingCar(!addingCar)} style={styles.addBtn}>
              <Plus size={16} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {addingCar && (
          <View style={styles.addCarForm}>
            <TextInput style={styles.editInput} value={newCarPlate} onChangeText={setNewCarPlate} placeholder="Гос. номер" placeholderTextColor={colors.textTertiary} autoCapitalize="characters" />
            <TextInput style={styles.editInput} value={newCarModel} onChangeText={setNewCarModel} placeholder="Модель" placeholderTextColor={colors.textTertiary} />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.editSaveBtn} onPress={handleAddCar}>
                <Check size={16} color={colors.white} />
                <Text style={styles.editSaveText}>Добавить</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editCancelBtn} onPress={() => setAddingCar(false)}>
                <X size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {clientCars.map(car => (
          <View key={car.id} style={styles.carCard}>
            {editingCarId === car.id ? (
              <View style={{ flex: 1 }}>
                <TextInput style={styles.editInput} value={editCarPlate} onChangeText={setEditCarPlate} placeholder="Гос. номер" placeholderTextColor={colors.textTertiary} autoCapitalize="characters" />
                <TextInput style={styles.editInput} value={editCarModel} onChangeText={setEditCarModel} placeholder="Модель" placeholderTextColor={colors.textTertiary} />
                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.editSaveBtn} onPress={saveEditCar}>
                    <Check size={14} color={colors.white} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editCancelBtn} onPress={() => setEditingCarId(null)}>
                    <X size={14} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <View style={styles.carCardTopRow}>
                  <Car size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.carPlate} numberOfLines={1}>{car.plateNumber}</Text>
                    {car.carModel && <Text style={styles.carModel} numberOfLines={1}>{car.carModel}</Text>}
                  </View>
                  {clientSessions.some(s => s.carId === car.id) && (
                    <View style={styles.carParkedBadge}>
                      <ParkingCircle size={10} color={colors.primary} />
                      <Text style={styles.carParkedText}>На парковке</Text>
                    </View>
                  )}
                </View>
                <View style={styles.carCardActions}>
                  {!clientSessions.some(s => s.carId === car.id) && !client.deleted && (
                    <TouchableOpacity
                      style={styles.carQuickCheckinBtn}
                      onPress={() => {
                        hapticMedium();
                        router.push({ pathname: '/checkin-modal', params: { clientId, carId: car.id } });
                      }}
                    >
                      <ParkingCircle size={12} color={colors.primary} />
                      <Text style={styles.carQuickCheckinText}>Заезд</Text>
                    </TouchableOpacity>
                  )}
                  {clientSubs.find(s => s.carId === car.id) && (
                    <TouchableOpacity
                      style={styles.carPayBtn}
                      onPress={() => router.push({
                        pathname: '/pay-monthly-modal',
                        params: { clientId, carId: car.id },
                      })}
                    >
                      <Text style={styles.carPayText}>Оплата</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => startEditCar(car.id)} style={styles.carEditBtn}>
                    <Edit3 size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                  {isAdmin && (
                    <TouchableOpacity onPress={() => handleDeleteCar(car.id)} style={styles.carDeleteBtn}>
                      <Trash2 size={14} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        ))}
      </View>

      {(clientDebts.length > 0 || isAdmin) && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Задолженности</Text>
            {isAdmin && !client.deleted && (
              <TouchableOpacity onPress={() => setAddingDebt(!addingDebt)} style={styles.addBtn}>
                <Plus size={16} color={colors.danger} />
              </TouchableOpacity>
            )}
          </View>

          {addingDebt && (
            <View style={styles.addCarForm}>
              <TextInput style={styles.editInput} value={debtAmount} onChangeText={setDebtAmount} placeholder="Сумма" placeholderTextColor={colors.textTertiary} keyboardType="numeric" />
              <TextInput style={styles.editInput} value={debtComment} onChangeText={setDebtComment} placeholder="Комментарий" placeholderTextColor={colors.textTertiary} />

              {clientCars.length > 0 && (
                <View>
                  <Text style={styles.debtFormLabel}>Авто (необязательно)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.debtCarScroll}>
                    <TouchableOpacity
                      style={[styles.debtCarChip, !debtCarId && styles.debtCarChipActive]}
                      onPress={() => setDebtCarId(null)}
                    >
                      <Text style={[styles.debtCarChipText, !debtCarId && styles.debtCarChipTextActive]}>Без авто</Text>
                    </TouchableOpacity>
                    {clientCars.map(car => (
                      <TouchableOpacity
                        key={car.id}
                        style={[styles.debtCarChip, debtCarId === car.id && styles.debtCarChipActive]}
                        onPress={() => setDebtCarId(car.id)}
                      >
                        <Text style={[styles.debtCarChipText, debtCarId === car.id && styles.debtCarChipTextActive]}>
                          {car.plateNumber}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <TouchableOpacity
                style={[styles.lombardToggle, debtLombard && styles.lombardToggleActive]}
                onPress={() => {
                  setDebtLombard(!debtLombard);
                  if (!debtLombard && clientCars.length > 0 && !debtCarId) {
                    setDebtCarId(clientCars[0].id);
                  }
                }}
              >
                <View style={[styles.lombardCheckbox, debtLombard && styles.lombardCheckboxActive]}>
                  {debtLombard && <Check size={12} color={colors.white} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lombardToggleText, debtLombard && styles.lombardToggleTextActive]}>Ломбард (ежедневное начисление)</Text>
                  <Text style={styles.lombardToggleSub}>{formatMoney(tariffs.lombardRate)}/сут.</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.editActions}>
                <TouchableOpacity style={[styles.editSaveBtn, { backgroundColor: colors.danger }]} onPress={handleAddDebt}>
                  <Check size={16} color={colors.white} />
                  <Text style={styles.editSaveText}>Добавить долг</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editCancelBtn} onPress={() => { setAddingDebt(false); setDebtCarId(null); setDebtLombard(false); }}>
                  <X size={16} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {clientDebts.map(debt => (
            <View key={debt.id} style={styles.debtCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.debtDesc} numberOfLines={1}>{debt.description}</Text>
                <Text style={styles.debtDate} numberOfLines={1}>{formatDate(debt.createdAt)}</Text>
              </View>
              <Text style={styles.debtAmount} numberOfLines={1}>{formatMoney(debt.remainingAmount)}</Text>
              <TouchableOpacity
                style={styles.debtPayBtn}
                onPress={() => router.push({
                  pathname: '/pay-debt-modal',
                  params: { clientId, debtId: debt.id },
                })}
              >
                <Text style={styles.debtPayText}>Погасить</Text>
              </TouchableOpacity>
              {isAdmin && (
                <TouchableOpacity
                  style={styles.debtDeleteBtn}
                  onPress={() => Alert.alert('Удалить долг', 'Удалить этот долг?', [
                    { text: 'Нет' },
                    { text: 'Удалить', style: 'destructive', onPress: () => deleteDebt(debt.id) },
                  ])}
                >
                  <Trash2 size={12} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {clientDebts.length > 1 && totalDebt > 0 && (
            <TouchableOpacity
              style={styles.payAllDebtsBtn}
              onPress={() => router.push({ pathname: '/pay-debt-modal', params: { clientId } })}
            >
              <Text style={styles.payAllDebtsText} numberOfLines={1} adjustsFontSizeToFit>Погасить всё ({formatMoney(totalDebt)})</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {allClientPayments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>История оплат</Text>
          {visiblePayments.map(p => (
            <View key={p.id} style={styles.paymentRow}>
              <View style={styles.paymentMethodBadge}>
                <CreditCard size={12} color={p.method === 'card' ? colors.info : colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentDesc} numberOfLines={1}>{p.description}</Text>
                <Text style={styles.paymentMeta} numberOfLines={1}>
                  {formatDateTime(p.date)} · {p.operatorName} · {getMethodLabel(p.method)}
                </Text>
              </View>
              <Text style={styles.paymentAmount}>+{formatMoney(p.amount)}</Text>
              {isAdmin && (
                <TouchableOpacity
                  style={styles.cancelPayBtn}
                  onPress={() => handleCancelPayment(p.id, p.amount)}
                >
                  <X size={12} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {allClientPayments.length > 10 && (
            <TouchableOpacity
              style={styles.showAllPaymentsBtn}
              onPress={() => setShowAllPayments(!showAllPayments)}
            >
              <Text style={styles.showAllPaymentsText}>
                {showAllPayments ? 'Скрыть' : `Показать все (${allClientPayments.length})`}
              </Text>
              {showAllPayments ? <ChevronUp size={14} color={colors.primary} /> : <ChevronDown size={14} color={colors.primary} />}
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.section}>
        <TouchableOpacity style={styles.toggleHeader} onPress={() => setShowHistory(!showHistory)}>
          <History size={16} color={colors.textSecondary} />
          <Text style={styles.sectionTitle}>История операций</Text>
          {showHistory ? <ChevronUp size={16} color={colors.textTertiary} /> : <ChevronDown size={16} color={colors.textTertiary} />}
        </TouchableOpacity>
        {showHistory && recentTx.map(tx => (
          <View key={tx.id} style={styles.txRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
              <Text style={styles.txDate} numberOfLines={1}>{formatDateTime(tx.date)} · {tx.operatorName}</Text>
            </View>
            {tx.amount > 0 && (
              <Text style={[
                styles.txAmount,
                ['payment', 'debt_payment'].includes(tx.type) ? styles.txAmountGreen : styles.txAmountRed,
              ]}>
                {['payment', 'debt_payment'].includes(tx.type) ? '+' : '-'}{formatMoney(tx.amount)}
              </Text>
            )}
          </View>
        ))}
        {showHistory && recentTx.length === 0 && (
          <Text style={styles.emptyText}>Нет операций</Text>
        )}
      </View>

      {clientEditHistory.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.toggleHeader} onPress={() => setShowEditHistory(!showEditHistory)}>
            <Edit3 size={16} color={colors.textSecondary} />
            <Text style={styles.sectionTitle}>История изменений</Text>
            {showEditHistory ? <ChevronUp size={16} color={colors.textTertiary} /> : <ChevronDown size={16} color={colors.textTertiary} />}
          </TouchableOpacity>
          {showEditHistory && clientEditHistory.map(h => (
            <View key={h.id} style={styles.editHistoryRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.editHistoryField}>{getFieldLabel(h.field)}</Text>
                <Text style={styles.editHistoryChange} numberOfLines={2}>
                  {h.oldValue || '—'} → {h.newValue || '—'}
                </Text>
                <Text style={styles.editHistoryMeta} numberOfLines={1}>
                  {formatDateTime(h.editedAt)} · {h.editorName}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {isAdmin && !client.deleted && (
        <TouchableOpacity style={styles.deleteClientBtn} onPress={handleDelete}>
          <Trash2 size={16} color={colors.danger} />
          <Text style={styles.deleteBtnText}>Удалить клиента</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  errorText: { fontSize: 16, color: colors.textTertiary, textAlign: 'center' as const, marginTop: 60 },
  deletedBanner: {
    backgroundColor: colors.dangerSurface, borderRadius: 10, padding: 12,
    marginBottom: 12, alignItems: 'center',
  },
  deletedBannerText: { fontSize: 14, fontWeight: '600' as const, color: colors.danger },
  profileCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
  },
  profileHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarOk: { backgroundColor: colors.primarySurface },
  avatarDebt: { backgroundColor: colors.dangerSurface },
  avatarText: { fontSize: 22, fontWeight: '800' as const, color: colors.primary },
  profileName: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  phoneText: { fontSize: 14, color: colors.primary, fontWeight: '500' as const },
  phone2Text: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  notes: {
    fontSize: 13, color: colors.textSecondary, marginTop: 12,
    backgroundColor: colors.surfaceLight, borderRadius: 8, padding: 10,
  },
  editBtn: { padding: 8, marginTop: 4 },
  editForm: { gap: 8, flex: 1 },
  editInput: {
    backgroundColor: colors.surfaceLight, borderRadius: 8, padding: 10,
    fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  editSaveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8,
  },
  editSaveText: { fontSize: 13, fontWeight: '600' as const, color: colors.white },
  editCancelBtn: {
    backgroundColor: colors.dangerSurface, borderRadius: 8, padding: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  debtBadge: {
    borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12,
  },
  debtBadgeRed: { backgroundColor: colors.dangerSurface },
  debtBadgeGreen: { backgroundColor: colors.successSurface },
  debtBadgeText: { fontSize: 15, fontWeight: '700' as const },
  debtBadgeTextRed: { color: colors.danger },
  debtBadgeTextGreen: { color: colors.success },
  payDebtBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.danger, borderRadius: 12, padding: 14, marginBottom: 12,
  },
  payDebtBtnText: { fontSize: 15, fontWeight: '700' as const, color: colors.white },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primarySurface, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.primary + '20',
  },
  actionBtnText: { fontSize: 14, fontWeight: '600' as const, color: colors.primary },
  actionBtnSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.warningSurface, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.warning + '20',
  },
  actionBtnSecondaryText: { fontSize: 14, fontWeight: '600' as const, color: colors.warning },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '600' as const, color: colors.text, marginBottom: 10, flex: 1 },
  addBtn: { padding: 6, marginBottom: 10 },
  addCarForm: {
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 10, borderWidth: 1, borderColor: colors.border, gap: 8,
  },
  subCard: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  subHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  subStatus: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  subStatusActive: { backgroundColor: colors.successSurface },
  subStatusExpired: { backgroundColor: colors.dangerSurface },
  subStatusText: { fontSize: 11, fontWeight: '600' as const },
  subStatusTextActive: { color: colors.success },
  subStatusTextExpired: { color: colors.danger },
  subDate: { fontSize: 12, color: colors.textSecondary },
  subDays: { fontSize: 12, color: colors.primary, fontWeight: '600' as const },
  subCar: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  subPayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
  },
  subPayText: { fontSize: 13, color: colors.primary, fontWeight: '600' as const },
  sessionCard: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sessionPlate: { fontSize: 18, fontWeight: '800' as const, color: colors.text, letterSpacing: 1 },
  sessionTypeBadge: { backgroundColor: colors.primarySurface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sessionTypeText: { fontSize: 11, fontWeight: '600' as const, color: colors.primary },
  sessionInfo: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  sessionInfoText: { fontSize: 12, color: colors.textTertiary },
  sessionManager: { fontSize: 11, color: colors.textTertiary, marginBottom: 10 },
  lombardAccrualRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
    backgroundColor: colors.dangerSurface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    marginVertical: 4,
  },
  lombardAccrualLabel: { fontSize: 12, color: colors.danger, fontWeight: '500' as const },
  lombardAccrualValue: { fontSize: 14, fontWeight: '700' as const, color: colors.danger },
  sessionActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sessionRefundBtn: {
    backgroundColor: colors.warningSurface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  sessionRefundText: { fontSize: 12, color: colors.warning, fontWeight: '500' as const },
  sessionExitBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8,
  },
  sessionExitText: { fontSize: 13, fontWeight: '600' as const, color: colors.white },
  sessionCancelBtn: {
    backgroundColor: colors.dangerSurface, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  sessionCancelText: { fontSize: 13, color: colors.danger, fontWeight: '500' as const },
  completedCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  completedPlate: { fontSize: 14, fontWeight: '700' as const, color: colors.text },
  completedDate: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  restoreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.infoSurface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
  },
  restoreText: { fontSize: 12, fontWeight: '500' as const, color: colors.info },
  carCard: {
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  carCardTopRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  carCardActions: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 8, paddingLeft: 26,
  },
  carPlate: { fontSize: 15, fontWeight: '700' as const, color: colors.text },
  carModel: { fontSize: 12, color: colors.textSecondary },
  carPayBtn: {
    backgroundColor: colors.primarySurface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
  },
  carPayText: { fontSize: 12, fontWeight: '600' as const, color: colors.primary },
  carEditBtn: { padding: 6 },
  carDeleteBtn: { padding: 6 },
  debtCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  debtDesc: { fontSize: 13, color: colors.text },
  debtDate: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  debtAmount: { fontSize: 15, fontWeight: '700' as const, color: colors.danger },
  debtPayBtn: {
    backgroundColor: colors.primarySurface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
  },
  debtPayText: { fontSize: 12, fontWeight: '600' as const, color: colors.primary },
  debtDeleteBtn: { padding: 4 },
  payAllDebtsBtn: {
    backgroundColor: colors.danger, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4,
  },
  payAllDebtsText: { fontSize: 14, fontWeight: '600' as const, color: colors.white },
  paymentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  paymentMethodBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center',
  },
  paymentDesc: { fontSize: 13, color: colors.text },
  paymentMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  paymentAmount: { fontSize: 14, fontWeight: '700' as const, color: colors.success, marginLeft: 4 },
  cancelPayBtn: {
    padding: 6, backgroundColor: colors.dangerSurface, borderRadius: 6, marginLeft: 4,
  },
  showAllPaymentsBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 6, paddingVertical: 10, marginTop: 4,
  },
  showAllPaymentsText: { fontSize: 13, fontWeight: '600' as const, color: colors.primary },
  toggleHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  txDesc: { fontSize: 13, color: colors.text },
  txDate: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  txAmount: { fontSize: 14, fontWeight: '700' as const },
  txAmountGreen: { color: colors.success },
  txAmountRed: { color: colors.danger },
  emptyText: { fontSize: 13, color: colors.textTertiary, textAlign: 'center' as const, paddingVertical: 12 },
  editHistoryRow: {
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  editHistoryField: { fontSize: 12, fontWeight: '600' as const, color: colors.primary },
  editHistoryChange: { fontSize: 13, color: colors.text, marginTop: 2 },
  editHistoryMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  deleteClientBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.dangerSurface, borderRadius: 12, padding: 14,
    marginTop: 12, borderWidth: 1, borderColor: colors.danger + '20',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600' as const, color: colors.danger },
  carParkedBadge: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 3,
  },
  carParkedText: { fontSize: 10, color: colors.primary, fontWeight: '500' as const },
  carQuickCheckinBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    backgroundColor: colors.primarySurface, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  carQuickCheckinText: { fontSize: 11, fontWeight: '600' as const, color: colors.primary },
  subscriptionBanner: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12,
    backgroundColor: colors.successSurface, borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: colors.success + '30',
  },
  subscriptionBannerIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.success + '20', alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  subscriptionBannerTitle: { fontSize: 14, fontWeight: '700' as const, color: colors.success },
  subscriptionBannerSub: { fontSize: 12, color: colors.success, marginTop: 2, opacity: 0.85 },
  debtFormLabel: { fontSize: 12, fontWeight: '500' as const, color: colors.textSecondary, marginBottom: 6 },
  debtCarScroll: { marginBottom: 8 },
  debtCarChip: {
    backgroundColor: colors.surfaceLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    marginRight: 8, borderWidth: 1, borderColor: colors.border,
  },
  debtCarChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  debtCarChipText: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary },
  debtCarChipTextActive: { color: colors.white },
  lombardToggle: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    backgroundColor: colors.surfaceLight, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.border, marginBottom: 8,
  },
  lombardToggleActive: { backgroundColor: colors.warningSurface, borderColor: colors.warning + '40' },
  lombardCheckbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  lombardCheckboxActive: { backgroundColor: colors.warning, borderColor: colors.warning },
  lombardToggleText: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary },
  lombardToggleTextActive: { color: colors.warning },
  lombardToggleSub: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
});
