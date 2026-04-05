import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, Plus, Trash2, AlertTriangle } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { formatDateTime } from '@/utils/helpers';

export default function ViolationsScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const colors = useColors();
  const { getCurrentViolationMonth, deleteViolation } = useParking();

  const month = getCurrentViolationMonth;
  const dots = [0, 1, 2];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const statusColor = month.status === 'bonus_denied' ? colors.danger
    : month.status === 'warning' ? colors.warning : colors.success;

  const statusLabel = month.status === 'bonus_denied' ? 'Премия отменена'
    : month.status === 'warning' ? 'Есть нарушения' : 'Нарушений нет';

  const handleDelete = (violationId: string) => {
    if (month.status === 'bonus_denied') {
      Alert.alert('Невозможно', 'Статус необратим до конца месяца');
      return;
    }
    Alert.alert('Удалить', 'Удалить нарушение?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteViolation(month.month, violationId) },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statusCard}>
        <Shield size={32} color={statusColor} />
        <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        <View style={styles.dotsRow}>
          {dots.map(i => (
            <View
              key={i}
              style={[
                styles.dot,
                i < month.violationCount ? { backgroundColor: statusColor } : styles.dotEmpty,
              ]}
            />
          ))}
        </View>
        <Text style={styles.countText}>{month.violationCount}/3 нарушений</Text>
        <Text style={styles.monthText}>
          {new Date(month.month + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
        </Text>
      </View>

      {isAdmin && month.status !== 'bonus_denied' && (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/add-violation-modal' as never)}
        >
          <Plus size={18} color={colors.white} />
          <Text style={styles.addBtnText}>Добавить нарушение</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Нарушения за месяц</Text>
      {month.violations.length === 0 && (
        <Text style={styles.emptyText}>Нарушений нет</Text>
      )}
      {month.violations.map(v => (
        <View key={v.id} style={styles.violationCard}>
          <View style={styles.violationIcon}>
            <AlertTriangle size={16} color={colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.violationType} numberOfLines={1}>{v.type}</Text>
            <Text style={styles.violationManager} numberOfLines={1}>{v.managerName}</Text>
            {v.comment ? <Text style={styles.violationComment}>{v.comment}</Text> : null}
            <Text style={styles.violationDate} numberOfLines={1}>
              {formatDateTime(v.date)} · {v.addedByName}
            </Text>
          </View>
          {isAdmin && month.status !== 'bonus_denied' && (
            <TouchableOpacity onPress={() => handleDelete(v.id)} style={styles.deleteBtn}>
              <Trash2 size={14} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  statusCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 28,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  statusLabel: { fontSize: 18, fontWeight: '700' as const, marginTop: 12 },
  dotsRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  dotEmpty: { backgroundColor: colors.surfaceLight, borderWidth: 2, borderColor: colors.border },
  countText: { fontSize: 14, color: colors.textSecondary, marginTop: 10, fontWeight: '600' as const },
  monthText: { fontSize: 12, color: colors.textTertiary, marginTop: 4, textTransform: 'capitalize' as const },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 12, padding: 14, marginBottom: 20,
  },
  addBtnText: { fontSize: 15, fontWeight: '700' as const, color: colors.white },
  sectionTitle: { fontSize: 16, fontWeight: '600' as const, color: colors.text, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.textTertiary, textAlign: 'center' as const, paddingTop: 20 },
  violationCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  violationIcon: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: colors.warningSurface,
    alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 2,
  },
  violationType: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  violationManager: { fontSize: 13, color: colors.primary, marginTop: 2, fontWeight: '500' as const },
  violationComment: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  violationDate: { fontSize: 11, color: colors.textTertiary, marginTop: 4 },
  deleteBtn: { padding: 6 },
});
