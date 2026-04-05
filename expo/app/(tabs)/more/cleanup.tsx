import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import {
  Sparkles, Plus, Trash2, Check, Shield,
} from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { CleanupTemplateItem } from '@/types';
import { generateId } from '@/utils/helpers';

const DEFAULT_TEMPLATE: CleanupTemplateItem[] = [
  { id: '1', label: 'Уборка приёмной зоны', order: 0 },
  { id: '2', label: 'Уборка парковочной зоны', order: 1 },
  { id: '3', label: 'Уборка санузла', order: 2 },
  { id: '4', label: 'Уборка кухни/зоны отдыха', order: 3 },
  { id: '5', label: 'Мытьё окон и дверей', order: 4 },
  { id: '6', label: 'Вынос мусора', order: 5 },
  { id: '7', label: 'Финальная проверка', order: 6 },
];

export default function CleanupScreen() {
  const { isAdmin } = useAuth();
  const colors = useColors();
  const { cleanupChecklistTemplate, updateCleanupTemplate } = useParking();

  const template = useMemo(() =>
    cleanupChecklistTemplate.length > 0
      ? [...cleanupChecklistTemplate].sort((a, b) => a.order - b.order)
      : DEFAULT_TEMPLATE,
  [cleanupChecklistTemplate]);

  const [items, setItems] = useState<CleanupTemplateItem[]>(template);
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleAdd = useCallback(() => {
    if (!newLabel.trim()) return;
    const newItem: CleanupTemplateItem = {
      id: generateId(),
      label: newLabel.trim(),
      order: items.length,
    };
    setItems(prev => [...prev, newItem]);
    setNewLabel('');
  }, [newLabel, items.length]);

  const handleDelete = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id).map((i, idx) => ({ ...i, order: idx })));
  }, []);

  const handleEdit = useCallback((id: string) => {
    const item = items.find(i => i.id === id);
    if (item) {
      setEditingId(id);
      setEditLabel(item.label);
    }
  }, [items]);

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editLabel.trim()) return;
    setItems(prev => prev.map(i => i.id === editingId ? { ...i, label: editLabel.trim() } : i));
    setEditingId(null);
    setEditLabel('');
  }, [editingId, editLabel]);

  const moveUp = useCallback((idx: number) => {
    if (idx <= 0) return;
    setItems(prev => {
      const arr = [...prev];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr.map((i, index) => ({ ...i, order: index }));
    });
  }, []);

  const moveDown = useCallback((idx: number) => {
    setItems(prev => {
      if (idx >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr.map((i, index) => ({ ...i, order: index }));
    });
  }, []);

  const handleSave = useCallback(() => {
    updateCleanupTemplate(items);
    Alert.alert('Готово', 'Шаблон сохранён');
  }, [items, updateCleanupTemplate]);

  if (!isAdmin) {
    return (
      <View style={styles.noAccess}>
        <Shield size={48} color={colors.textTertiary} />
        <Text style={styles.noAccessText}>Доступно только администратору</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <Sparkles size={24} color={colors.success} />
        <Text style={styles.headerTitle}>Шаблон чек-листа уборки</Text>
        <Text style={styles.headerDesc}>
          Этот шаблон применяется к сменам с генеральной уборкой
        </Text>
      </View>

      {items.map((item, idx) => (
        <View key={item.id} style={styles.itemCard}>
          <TouchableOpacity onPress={() => moveUp(idx)} style={styles.moveBtn}>
            <Text style={styles.moveBtnText}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => moveDown(idx)} style={styles.moveBtn}>
            <Text style={styles.moveBtnText}>↓</Text>
          </TouchableOpacity>
          <View style={styles.itemNumber}>
            <Text style={styles.itemNumberText}>{idx + 1}</Text>
          </View>
          {editingId === item.id ? (
            <View style={styles.editRow}>
              <TextInput
                style={styles.editInput}
                value={editLabel}
                onChangeText={setEditLabel}
                autoFocus
              />
              <TouchableOpacity onPress={handleSaveEdit} style={styles.editSaveBtn}>
                <Check size={16} color={colors.success} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.itemLabel} onPress={() => handleEdit(item.id)}>
              <Text style={styles.itemLabelText}>{item.label}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
            <Trash2 size={14} color={colors.danger} />
          </TouchableOpacity>
        </View>
      ))}

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Новый пункт..."
          placeholderTextColor={colors.textTertiary}
          value={newLabel}
          onChangeText={setNewLabel}
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
          <Plus size={18} color={colors.white} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
        <Check size={18} color={colors.white} />
        <Text style={styles.saveBtnText}>Сохранить шаблон</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  noAccessText: { fontSize: 16, color: colors.textTertiary },
  headerCard: {
    backgroundColor: colors.successSurface, borderRadius: 16, padding: 20,
    marginBottom: 20, borderWidth: 1, borderColor: colors.success + '20',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700' as const, color: colors.success, marginTop: 8 },
  headerDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 6, textAlign: 'center' as const },
  itemCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10, padding: 10,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border, gap: 6,
  },
  moveBtn: { padding: 4 },
  moveBtnText: { fontSize: 14, color: colors.textTertiary },
  itemNumber: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },
  itemNumberText: { fontSize: 11, fontWeight: '700' as const, color: colors.primary },
  itemLabel: { flex: 1 },
  itemLabelText: { fontSize: 14, color: colors.text },
  editRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  editInput: {
    flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 8,
    padding: 8, fontSize: 14, color: colors.text,
  },
  editSaveBtn: { padding: 4 },
  deleteBtn: { padding: 6 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 20 },
  addInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  addBtn: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, padding: 16,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700' as const, color: colors.white },
});
