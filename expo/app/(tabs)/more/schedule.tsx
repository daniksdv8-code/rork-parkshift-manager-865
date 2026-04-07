import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal,
} from 'react-native';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Calendar, Clock,
  Sparkles, X, Edit2, Split, Users,
} from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';

export default function ScheduleScreen() {
  const { currentUser, isAdmin } = useAuth();
  const colors = useColors();
  const { activeScheduledShifts, users, addScheduledShift, updateScheduledShift, deleteScheduledShift } = useParking();

  const canEditSchedule = isAdmin || currentUser?.role === 'manager';

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedOperator, setSelectedOperator] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('08:00');
  const [isSplitShift, setIsSplitShift] = useState(false);
  const [comment, setComment] = useState('');
  const [isDeepCleaning, setIsDeepCleaning] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

  const allOperators = useMemo(() =>
    users.filter(u => !u.deleted && u.active),
  [users]);

  const monthDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7;

    const days: { date: string; day: number; isCurrentMonth: boolean }[] = [];

    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({
        date: d.toISOString().split('T')[0],
        day: d.getDate(),
        isCurrentMonth: false,
      });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({
        date: date.toISOString().split('T')[0],
        day: d,
        isCurrentMonth: true,
      });
    }

    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i);
        days.push({
          date: d.toISOString().split('T')[0],
          day: d.getDate(),
          isCurrentMonth: false,
        });
      }
    }

    return days;
  }, [currentMonth]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, typeof activeScheduledShifts>();
    activeScheduledShifts.forEach(s => {
      const existing = map.get(s.date) ?? [];
      existing.push(s);
      map.set(s.date, existing);
    });
    return map;
  }, [activeScheduledShifts]);

  const todayStr = new Date().toISOString().split('T')[0];
  const monthName = currentMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const prevMonth = useCallback(() => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const nextMonth = useCallback(() => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const openAddModal = useCallback((date: string) => {
    if (!canEditSchedule) {
      Alert.alert('Нет доступа', 'Редактирование календаря доступно только администраторам и менеджерам');
      return;
    }
    setSelectedDate(date);
    setSelectedOperator('');
    const existingShifts = shiftsByDate.get(date) ?? [];
    if (existingShifts.length === 1) {
      const first = existingShifts[0];
      if (first.endTime === '20:00' || first.endTime === '08:00') {
        setStartTime('20:00');
        setEndTime('08:00');
      } else {
        setStartTime('08:00');
        setEndTime('08:00');
      }
      setIsSplitShift(true);
    } else {
      setStartTime('08:00');
      setEndTime('08:00');
      setIsSplitShift(false);
    }
    setComment('');
    setIsDeepCleaning(false);
    setEditingShiftId(null);
    setShowAddModal(true);
  }, [shiftsByDate, canEditSchedule]);

  const openEditModal = useCallback((shift: typeof activeScheduledShifts[0]) => {
    if (!canEditSchedule) {
      Alert.alert('Нет доступа', 'Редактирование календаря доступно только администраторам и менеджерам');
      return;
    }
    setSelectedDate(shift.date);
    setSelectedOperator(shift.operatorId);
    setStartTime(shift.startTime);
    setEndTime(shift.endTime);
    setComment(shift.comment ?? '');
    setIsDeepCleaning(shift.isDeepCleaning);
    setIsSplitShift(shift.isSplitShift ?? false);
    setEditingShiftId(shift.id);
    setShowAddModal(true);
  }, [canEditSchedule]);

  const handleSave = useCallback(() => {
    if (!selectedOperator) {
      Alert.alert('Ошибка', 'Выберите оператора');
      return;
    }
    const operator = allOperators.find(u => u.id === selectedOperator);
    if (!operator) return;

    const existingShifts = shiftsByDate.get(selectedDate) ?? [];
    const willBeSplit = editingShiftId
      ? existingShifts.filter(s => s.id !== editingShiftId).length >= 1
      : existingShifts.length >= 1;

    if (editingShiftId) {
      updateScheduledShift(editingShiftId, {
        operatorId: selectedOperator,
        operatorName: operator.name,
        startTime,
        endTime,
        comment: comment || undefined,
        isDeepCleaning,
        isSplitShift: willBeSplit,
      });
      if (willBeSplit) {
        existingShifts.filter(s => s.id !== editingShiftId).forEach(s => {
          if (!s.isSplitShift) {
            updateScheduledShift(s.id, { isSplitShift: true });
          }
        });
      }
    } else {
      addScheduledShift({
        date: selectedDate,
        startTime,
        endTime,
        operatorId: selectedOperator,
        operatorName: operator.name,
        comment: comment || undefined,
        createdBy: currentUser?.id ?? '',
        isDeepCleaning,
        cleanupCompleted: false,
        isSplitShift: willBeSplit,
      });
      if (willBeSplit) {
        existingShifts.forEach(s => {
          if (!s.isSplitShift) {
            updateScheduledShift(s.id, { isSplitShift: true });
          }
        });
      }
    }
    setShowAddModal(false);
  }, [selectedOperator, selectedDate, startTime, endTime, comment, isDeepCleaning, editingShiftId, allOperators, currentUser, addScheduledShift, updateScheduledShift, shiftsByDate]);

  const handleDelete = useCallback((shiftId: string) => {
    if (!canEditSchedule) {
      Alert.alert('Нет доступа', 'Редактирование календаря доступно только администраторам и менеджерам');
      return;
    }
    Alert.alert('Удалить смену', 'Удалить эту смену?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteScheduledShift(shiftId) },
    ]);
  }, [deleteScheduledShift, canEditSchedule]);

  const operatorColors = useMemo(() => {
    const palette = ['#00BFA6', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
    const map = new Map<string, string>();
    allOperators.forEach((u, i) => {
      map.set(u.id, palette[i % palette.length]);
    });
    return map;
  }, [allOperators]);

  const monthShiftCounts = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const counts = new Map<string, { name: string; total: number; color: string }>();

    activeScheduledShifts.forEach(s => {
      if (!s.date.startsWith(prefix)) return;
      const existing = counts.get(s.operatorId);
      const value = s.isSplitShift ? 0.5 : 1;
      if (existing) {
        existing.total += value;
      } else {
        counts.set(s.operatorId, {
          name: s.operatorName,
          total: value,
          color: operatorColors.get(s.operatorId) ?? colors.primary,
        });
      }
    });

    return Array.from(counts.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [activeScheduledShifts, currentMonth, operatorColors, colors.primary]);

  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{monthName}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
          <ChevronRight size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekHeader}>
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
          <Text key={d} style={styles.weekDay}>{d}</Text>
        ))}
      </View>

      {monthShiftCounts.length > 0 && (
        <View style={styles.summarySection}>
          <Text style={styles.summaryTitle}>Смены за месяц</Text>
          <View style={styles.summaryList}>
            {monthShiftCounts.map(item => (
              <View key={item.id} style={styles.summaryItem}>
                <View style={[styles.summaryDot, { backgroundColor: item.color }]} />
                <Text style={styles.summaryName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.summaryCount}>{item.total % 1 === 0 ? item.total : item.total.toFixed(1)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        <View style={styles.calendarGrid}>
          {monthDays.map((day, idx) => {
            const shifts = shiftsByDate.get(day.date) ?? [];
            const isToday = day.date === todayStr;
            const hasCleaning = shifts.some(s => s.isDeepCleaning);
            const isSplit = shifts.length >= 2 || shifts.some(s => s.isSplitShift);

            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.dayCell,
                  !day.isCurrentMonth && styles.dayCellOutside,
                  isToday && styles.dayCellToday,
                  hasCleaning && day.isCurrentMonth && styles.dayCellCleaning,
                ]}
                onPress={() => {
                  if (shifts.length > 0) {
                    setExpandedDate(expandedDate === day.date ? null : day.date);
                  } else {
                    openAddModal(day.date);
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.dayNumber,
                  !day.isCurrentMonth && styles.dayNumberOutside,
                  isToday && styles.dayNumberToday,
                ]}>
                  {day.day}
                </Text>
                {shifts.length > 0 && (
                  <View style={styles.shiftDots}>
                    {shifts.slice(0, 3).map((s, i) => (
                      <View
                        key={i}
                        style={[styles.shiftDot, { backgroundColor: operatorColors.get(s.operatorId) ?? colors.primary }]}
                      />
                    ))}
                  </View>
                )}
                {isSplit && (
                  <View style={styles.splitMark}>
                    <Users size={7} color={colors.warning} />
                  </View>
                )}
                {hasCleaning && (
                  <View style={styles.cleaningMark}>
                    <Sparkles size={10} color="#FF6B00" />
                    <View style={styles.cleaningMarkDot} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {expandedDate && (
          <View style={styles.expandedSection}>
            <View style={styles.expandedHeader}>
              <Text style={styles.expandedTitle}>
                {new Date(expandedDate + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
              </Text>
              {canEditSchedule && (
                <TouchableOpacity onPress={() => openAddModal(expandedDate)} style={styles.addShiftBtn}>
                  <Plus size={16} color={colors.primary} />
                  <Text style={styles.addShiftText}>Добавить</Text>
                </TouchableOpacity>
              )}
            </View>
            {(shiftsByDate.get(expandedDate) ?? []).map(shift => (
              <View key={shift.id} style={styles.shiftCard}>
                <View style={[styles.shiftColorBar, { backgroundColor: operatorColors.get(shift.operatorId) ?? colors.primary }]} />
                <View style={styles.shiftInfo}>
                  <Text style={styles.shiftOperator} numberOfLines={1}>{shift.operatorName}</Text>
                  <View style={styles.shiftTimeRow}>
                    <Clock size={12} color={colors.textTertiary} />
                    <Text style={styles.shiftTime}>{shift.startTime} — {shift.endTime}</Text>
                  </View>
                  {shift.isSplitShift && (
                    <View style={styles.splitBadge}>
                      <Split size={10} color={colors.warning} />
                      <Text style={styles.splitBadgeText} numberOfLines={1}>Разделённая смена</Text>
                    </View>
                  )}
                  {shift.isDeepCleaning && (
                    <View style={[
                      styles.cleaningBadge,
                      shift.cleanupCompleted ? styles.cleaningBadgeDone : styles.cleaningBadgeActive,
                    ]}>
                      <Sparkles size={12} color={shift.cleanupCompleted ? colors.success : '#FF6B00'} />
                      <Text style={[
                        styles.cleaningText,
                        shift.cleanupCompleted ? styles.cleaningTextDone : styles.cleaningTextActive,
                      ]}>
                        {shift.cleanupCompleted ? '✓ Уборка выполнена' : '⚠ Генеральная уборка'}
                      </Text>
                    </View>
                  )}
                  {shift.comment ? <Text style={styles.shiftComment}>{shift.comment}</Text> : null}
                </View>
                <View style={styles.shiftActions}>
                  <TouchableOpacity onPress={() => openEditModal(shift)} style={[styles.shiftActionBtn, !canEditSchedule && styles.disabledBtn]}>
                    <Edit2 size={14} color={canEditSchedule ? colors.textSecondary : colors.textTertiary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(shift.id)} style={[styles.shiftActionBtn, !canEditSchedule && styles.disabledBtn]}>
                    <Trash2 size={14} color={canEditSchedule ? colors.danger : colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingShiftId ? 'Редактировать смену' : 'Новая смена'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDate}>
              <Calendar size={14} color={colors.primary} />{' '}
              {selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            </Text>

            <Text style={styles.fieldLabel}>Оператор</Text>
            <View style={styles.operatorListContainer}>
              <ScrollView
                style={styles.operatorList}
                nestedScrollEnabled
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {allOperators.map(u => (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.operatorChip, selectedOperator === u.id && styles.operatorChipActive]}
                    onPress={() => setSelectedOperator(u.id)}
                  >
                    <View style={[styles.operatorDot, { backgroundColor: operatorColors.get(u.id) ?? colors.primary }]} />
                    <Text style={[styles.operatorChipText, selectedOperator === u.id && styles.operatorChipTextActive]} numberOfLines={1}>
                      {u.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.fieldLabel}>Начало</Text>
                <TextInput
                  style={styles.timeInput}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="08:00"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.fieldLabel}>Конец</Text>
                <TextInput
                  style={styles.timeInput}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="20:00"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            </View>

            <TextInput
              style={styles.commentInput}
              placeholder="Комментарий (необязательно)"
              placeholderTextColor={colors.textTertiary}
              value={comment}
              onChangeText={setComment}
            />

            <TouchableOpacity
              style={[styles.cleaningToggle, isSplitShift && styles.splitToggleActive]}
              onPress={() => setIsSplitShift(!isSplitShift)}
            >
              <Split size={16} color={isSplitShift ? colors.warning : colors.textTertiary} />
              <Text style={[styles.cleaningToggleText, isSplitShift && styles.splitToggleTextActive]}>
                Разделённая смена (2 менеджера)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cleaningToggle, isDeepCleaning && styles.cleaningToggleActive]}
              onPress={() => setIsDeepCleaning(!isDeepCleaning)}
            >
              <Sparkles size={16} color={isDeepCleaning ? colors.success : colors.textTertiary} />
              <Text style={[styles.cleaningToggleText, isDeepCleaning && styles.cleaningToggleTextActive]}>
                Генеральная уборка
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>
                {editingShiftId ? 'Сохранить' : 'Добавить смену'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  navBtn: { padding: 8, borderRadius: 8, backgroundColor: colors.surface },
  monthTitle: { fontSize: 18, fontWeight: '700' as const, color: colors.text, textTransform: 'capitalize' as const },
  weekHeader: { flexDirection: 'row', paddingHorizontal: 8 },
  weekDay: {
    flex: 1, textAlign: 'center' as const, fontSize: 12,
    fontWeight: '600' as const, color: colors.textTertiary, paddingVertical: 6,
  },
  summarySection: {
    backgroundColor: colors.surface,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  summaryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryName: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500' as const,
    maxWidth: 100,
  },
  summaryCount: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: colors.primary,
  },
  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  dayCell: {
    width: '14.28%' as unknown as number,
    aspectRatio: 1,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dayCellOutside: { opacity: 0.3 },
  dayCellToday: { backgroundColor: colors.primarySurface },
  dayNumber: { fontSize: 14, fontWeight: '500' as const, color: colors.text },
  dayNumberOutside: { color: colors.textTertiary },
  dayNumberToday: { color: colors.primary, fontWeight: '700' as const },
  shiftDots: { flexDirection: 'row', gap: 2, marginTop: 2 },
  shiftDot: { width: 5, height: 5, borderRadius: 3 },
  splitMark: { position: 'absolute', top: 4, left: 4 },
  dayCellCleaning: {
    backgroundColor: '#FF6B00' + '18',
    borderWidth: 1.5,
    borderColor: '#FF6B00' + '40',
    borderStyle: 'solid' as const,
  },
  cleaningMark: {
    position: 'absolute',
    top: 2,
    right: 2,
    alignItems: 'center',
  },
  cleaningMarkDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FF6B00',
    marginTop: 1,
  },
  expandedSection: { padding: 16, paddingTop: 8 },
  expandedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  expandedTitle: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  addShiftBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  addShiftText: { fontSize: 13, color: colors.primary, fontWeight: '600' as const },
  shiftCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  shiftColorBar: { width: 3, height: 36, borderRadius: 2, marginRight: 10 },
  shiftInfo: { flex: 1 },
  shiftOperator: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  shiftTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  shiftTime: { fontSize: 12, color: colors.textTertiary },
  cleaningBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 5, alignSelf: 'flex-start',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1,
  },
  cleaningBadgeActive: {
    backgroundColor: '#FF6B00' + '15',
    borderColor: '#FF6B00' + '30',
  },
  cleaningBadgeDone: {
    backgroundColor: colors.successSurface,
    borderColor: colors.success + '30',
  },
  cleaningText: { fontSize: 11, fontWeight: '700' as const },
  cleaningTextActive: { color: '#FF6B00' },
  cleaningTextDone: { color: colors.success },
  splitBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 4, alignSelf: 'flex-start',
    backgroundColor: colors.warningSurface, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  splitBadgeText: { fontSize: 10, color: colors.warning, fontWeight: '600' as const },
  shiftComment: { fontSize: 11, color: colors.textSecondary, marginTop: 3 },
  shiftActions: { flexDirection: 'row', gap: 4 },
  shiftActionBtn: { padding: 6 },
  disabledBtn: { opacity: 0.4 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  modalDate: { fontSize: 14, color: colors.primary, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 6 },
  operatorListContainer: {
    maxHeight: 180,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surfaceLight,
    overflow: 'hidden' as const,
  },
  operatorList: { flexGrow: 0 },
  operatorChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceLight, borderRadius: 0,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  operatorChipActive: { backgroundColor: colors.primarySurface, borderColor: colors.primary },
  operatorDot: { width: 8, height: 8, borderRadius: 4 },
  operatorChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' as const },
  operatorChipTextActive: { color: colors.primary },
  timeRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  timeField: { flex: 1 },
  timeInput: {
    backgroundColor: colors.surfaceLight, borderRadius: 10, padding: 12,
    fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  commentInput: {
    backgroundColor: colors.surfaceLight, borderRadius: 10, padding: 12,
    fontSize: 15, color: colors.text, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  cleaningToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceLight, borderRadius: 10, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: colors.border,
  },
  cleaningToggleActive: { backgroundColor: colors.successSurface, borderColor: colors.success + '30' },
  splitToggleActive: { backgroundColor: colors.warningSurface, borderColor: colors.warning + '30' },
  splitToggleTextActive: { color: colors.warning },
  cleaningToggleText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' as const, flex: 1 },
  cleaningToggleTextActive: { color: colors.success },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '700' as const, color: colors.white },
});
