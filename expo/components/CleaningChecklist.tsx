import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { Check, Sparkles, X } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { CleanupChecklistItem, CleanupTemplateItem } from '@/types';

const DEFAULT_TEMPLATE: CleanupTemplateItem[] = [
  { id: '1', label: 'Уборка приёмной зоны', order: 0 },
  { id: '2', label: 'Уборка парковочной зоны', order: 1 },
  { id: '3', label: 'Уборка санузла', order: 2 },
  { id: '4', label: 'Уборка кухни/зоны отдыха', order: 3 },
  { id: '5', label: 'Мытьё окон и дверей', order: 4 },
  { id: '6', label: 'Вынос мусора', order: 5 },
  { id: '7', label: 'Финальная проверка', order: 6 },
];

interface Props {
  shiftId: string;
  onClose: () => void;
}

export default function CleaningChecklist({ shiftId, onClose }: Props) {
  const colors = useColors();
  const { cleanupChecklistTemplate, saveCleanupChecklist, completeCleanup } = useParking();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const template = useMemo(() => {
    const items = cleanupChecklistTemplate.length > 0
      ? [...cleanupChecklistTemplate].sort((a, b) => a.order - b.order)
      : DEFAULT_TEMPLATE;
    return items;
  }, [cleanupChecklistTemplate]);

  const [checklist, setChecklist] = useState<CleanupChecklistItem[]>(() =>
    template.map(t => ({ id: t.id, label: t.label, completed: false }))
  );

  const completedCount = useMemo(() => checklist.filter(c => c.completed).length, [checklist]);
  const totalCount = checklist.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  const toggleItem = useCallback((id: string) => {
    setChecklist(prev => prev.map(c => c.id === id ? { ...c, completed: !c.completed } : c));
  }, []);

  const handleSave = useCallback(() => {
    saveCleanupChecklist(shiftId, checklist);
    Alert.alert('Сохранено', 'Прогресс чек-листа сохранён');
  }, [shiftId, checklist, saveCleanupChecklist]);

  const handleComplete = useCallback(() => {
    const uncompleted = checklist.filter(c => !c.completed);
    if (uncompleted.length > 0) {
      Alert.alert(
        'Не все пункты выполнены',
        `Осталось ${uncompleted.length} пунктов. Завершить всё равно?`,
        [
          { text: 'Нет', style: 'cancel' },
          { text: 'Завершить', onPress: () => {
            completeCleanup(shiftId, checklist);
            Alert.alert('Готово', 'Уборка отмечена как завершённая');
            onClose();
          }},
        ]
      );
    } else {
      completeCleanup(shiftId, checklist);
      Alert.alert('Готово', 'Уборка завершена!');
      onClose();
    }
  }, [shiftId, checklist, completeCleanup, onClose]);

  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <View style={styles.header}>
          <Sparkles size={20} color={colors.success} />
          <Text style={styles.title}>Чек-лист уборки</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` as unknown as number }]} />
        </View>
        <Text style={styles.progressText}>{completedCount} / {totalCount} выполнено</Text>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {checklist.map((item, idx) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.item, item.completed && styles.itemDone]}
              onPress={() => toggleItem(item.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, item.completed && styles.checkboxDone]}>
                {item.completed && <Check size={14} color={colors.white} />}
              </View>
              <Text style={styles.itemNumber}>{idx + 1}.</Text>
              <Text style={[styles.itemLabel, item.completed && styles.itemLabelDone]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Сохранить</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
            <Check size={16} color={colors.white} />
            <Text style={styles.completeBtnText}>Завершить уборку</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
    padding: 20, zIndex: 100,
  },
  modal: {
    backgroundColor: colors.surface, borderRadius: 20, width: '100%',
    maxHeight: '85%', overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700' as const, color: colors.text },
  closeBtn: { padding: 4 },
  progressBar: {
    height: 6, backgroundColor: colors.surfaceLight, marginHorizontal: 18, marginTop: 14,
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.success, borderRadius: 3 },
  progressText: {
    fontSize: 12, color: colors.textSecondary, textAlign: 'center' as const,
    marginTop: 6, marginBottom: 8,
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingBottom: 8 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surfaceLight, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  itemDone: { backgroundColor: colors.successSurface, borderColor: colors.success + '30' },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.textTertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: colors.success, borderColor: colors.success },
  itemNumber: { fontSize: 13, color: colors.textTertiary, fontWeight: '600' as const },
  itemLabel: { flex: 1, fontSize: 14, color: colors.text },
  itemLabelDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  actions: {
    flexDirection: 'row', gap: 10, padding: 18,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  saveBtn: {
    flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '600' as const, color: colors.textSecondary },
  completeBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.success, borderRadius: 12, padding: 14,
  },
  completeBtnText: { fontSize: 14, fontWeight: '700' as const, color: colors.white },
});
