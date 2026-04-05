import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';

const VIOLATION_TYPES = [
  'Опоздание на смену',
  'Некорректное обращение с клиентом',
  'Ошибка в кассе',
  'Невыполнение регламента',
  'Оставление рабочего места',
  'Нарушение дисциплины',
  'Другое',
];

export default function AddViolationModal() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { users, addViolation } = useParking();

  const [selectedManager, setSelectedManager] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [comment, setComment] = useState('');

  const managers = useMemo(() =>
    users.filter(u => u.role === 'manager' && !u.deleted && u.active),
  [users]);

  const handleAdd = useCallback(() => {
    if (!selectedManager) {
      Alert.alert('Ошибка', 'Выберите менеджера');
      return;
    }
    if (!selectedType) {
      Alert.alert('Ошибка', 'Выберите тип нарушения');
      return;
    }
    const manager = managers.find(m => m.id === selectedManager);
    if (!manager) return;

    addViolation(selectedManager, manager.name, selectedType, comment);
    Alert.alert('Готово', 'Нарушение зафиксировано');
    router.back();
  }, [selectedManager, selectedType, comment, managers, addViolation, router]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.iconWrap}>
        <AlertTriangle size={32} color={colors.warning} />
      </View>
      <Text style={styles.title}>Новое нарушение</Text>

      <Text style={styles.label}>Менеджер</Text>
      {managers.map(m => (
        <TouchableOpacity
          key={m.id}
          style={[styles.optionBtn, selectedManager === m.id && styles.optionBtnActive]}
          onPress={() => setSelectedManager(m.id)}
        >
          <View style={styles.optionDot}>
            {selectedManager === m.id && <View style={styles.optionDotInner} />}
          </View>
          <Text style={[styles.optionText, selectedManager === m.id && styles.optionTextActive]}>
            {m.name}
          </Text>
        </TouchableOpacity>
      ))}
      {managers.length === 0 && (
        <Text style={styles.emptyText}>Нет активных менеджеров</Text>
      )}

      <Text style={[styles.label, { marginTop: 20 }]}>Тип нарушения</Text>
      {VIOLATION_TYPES.map(type => (
        <TouchableOpacity
          key={type}
          style={[styles.optionBtn, selectedType === type && styles.optionBtnActive]}
          onPress={() => setSelectedType(type)}
        >
          <View style={styles.optionDot}>
            {selectedType === type && <View style={styles.optionDotInner} />}
          </View>
          <Text style={[styles.optionText, selectedType === type && styles.optionTextActive]}>
            {type}
          </Text>
        </TouchableOpacity>
      ))}

      <Text style={[styles.label, { marginTop: 20 }]}>Комментарий</Text>
      <TextInput
        style={styles.input}
        placeholder="Описание нарушения..."
        placeholderTextColor={colors.textTertiary}
        value={comment}
        onChangeText={setComment}
        multiline
      />

      <TouchableOpacity style={styles.submitBtn} onPress={handleAdd} activeOpacity={0.8}>
        <Text style={styles.submitBtnText}>Зафиксировать нарушение</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.warningSurface,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 12,
  },
  title: {
    fontSize: 20, fontWeight: '700' as const, color: colors.text,
    textAlign: 'center' as const, marginBottom: 24,
  },
  label: { fontSize: 14, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 8 },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  optionBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
  optionDot: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  optionDotInner: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary,
  },
  optionText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' as const },
  optionTextActive: { color: colors.primary },
  emptyText: { fontSize: 13, color: colors.textTertiary, paddingVertical: 8 },
  input: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    fontSize: 15, color: colors.text, minHeight: 80,
    textAlignVertical: 'top' as const, borderWidth: 1, borderColor: colors.border,
  },
  submitBtn: {
    backgroundColor: colors.warning, borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 24,
  },
  submitBtnText: { fontSize: 16, fontWeight: '700' as const, color: colors.black },
});
