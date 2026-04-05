import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
} from 'react-native';
import {
  ShieldCheck, ShieldAlert, Shield, Trash2, RefreshCw,
} from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { AnomalyLogEntry } from '@/types';
import { formatDateTime } from '@/utils/helpers';
import { loadAnomalyLog, getAnomalyLog, clearAnomalyLog } from '@/utils/anomaly-logger';
import { useSelfDiagnosis } from '@/hooks/useSelfDiagnosis';

type Severity = 'all' | 'critical' | 'error' | 'warning' | 'info';

export default function AnomalyLogScreen() {
  const { isAdmin } = useAuth();
  const colors = useColors();
  const { runDiagnosis } = useSelfDiagnosis();
  const [entries, setEntries] = useState<AnomalyLogEntry[]>([]);
  const [severity, setSeverity] = useState<Severity>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const refreshEntries = useCallback(() => {
    setEntries([...getAnomalyLog()]);
  }, []);

  useEffect(() => {
    void loadAnomalyLog().then(() => refreshEntries());
  }, [refreshEntries]);

  const filtered = useMemo(() => {
    if (severity === 'all') return entries;
    return entries.filter(e => e.severity === severity);
  }, [entries, severity]);

  const stats = useMemo(() => ({
    critical: entries.filter(e => e.severity === 'critical').length,
    error: entries.filter(e => e.severity === 'error').length,
    warning: entries.filter(e => e.severity === 'warning').length,
    info: entries.filter(e => e.severity === 'info').length,
  }), [entries]);

  const overallStatus = stats.critical > 0 || stats.error > 0 ? 'error'
    : stats.warning > 0 ? 'warning' : 'ok';

  const handleRunDiagnosis = useCallback(() => {
    runDiagnosis();
    setTimeout(() => {
      refreshEntries();
      const fresh = getAnomalyLog();
      if (fresh.length === 0) {
        Alert.alert('Диагностика', 'Проверка завершена. Аномалий не обнаружено.');
      } else {
        Alert.alert('Диагностика', `Проверка завершена. Записей в журнале: ${fresh.length}`);
      }
    }, 500);
  }, [runDiagnosis, refreshEntries]);

  const handleClear = useCallback(() => {
    Alert.alert('Очистить журнал', 'Удалить все записи?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Очистить', style: 'destructive',
        onPress: async () => {
          await clearAnomalyLog();
          setEntries([]);
        },
      },
    ]);
  }, []);

  if (!isAdmin) {
    return (
      <View style={styles.noAccess}>
        <Shield size={48} color={colors.textTertiary} />
        <Text style={styles.noAccessText}>Доступно только администратору</Text>
      </View>
    );
  }

  const StatusIcon = overallStatus === 'ok' ? ShieldCheck
    : overallStatus === 'warning' ? Shield : ShieldAlert;
  const statusColor = overallStatus === 'ok' ? colors.success
    : overallStatus === 'warning' ? colors.warning : colors.danger;

  const severityFilters: { key: Severity; label: string; count: number; color: string }[] = [
    { key: 'all', label: 'Все', count: entries.length, color: colors.textSecondary },
    { key: 'critical', label: 'Крит.', count: stats.critical, color: colors.danger },
    { key: 'error', label: 'Ошибки', count: stats.error, color: '#F97316' },
    { key: 'warning', label: 'Внимание', count: stats.warning, color: colors.warning },
    { key: 'info', label: 'Инфо', count: stats.info, color: colors.info },
  ];

  const getSeverityColor = (s: string) => {
    switch (s) {
      case 'critical': return colors.danger;
      case 'error': return '#F97316';
      case 'warning': return colors.warning;
      case 'info': return colors.info;
      default: return colors.textSecondary;
    }
  };

  const renderItem = ({ item }: { item: AnomalyLogEntry }) => {
    const color = getSeverityColor(item.severity);
    const isExpanded = expanded === item.id;

    return (
      <TouchableOpacity
        style={styles.logCard}
        onPress={() => setExpanded(isExpanded ? null : item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.logHeader}>
          <View style={[styles.severityBadge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.severityText, { color }]}>{item.severity}</Text>
          </View>
          <View style={[styles.categoryBadge]}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
          <Text style={styles.logTime}>{formatDateTime(item.timestamp)}</Text>
        </View>
        <Text style={styles.logMessage}>{item.message}</Text>
        {isExpanded && (
          <View style={styles.logDetails}>
            {item.expected && (
              <Text style={styles.logDetail}>Ожидалось: {item.expected}</Text>
            )}
            {item.actual && (
              <Text style={styles.logDetail}>Фактически: {item.actual}</Text>
            )}
            <Text style={styles.logDetail}>Действие: {item.action}</Text>
            {item.actionDetail && (
              <Text style={styles.logDetail}>{item.actionDetail}</Text>
            )}
            {item.entityId && (
              <Text style={styles.logDetail}>ID: {item.entityId} ({item.entityType})</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusCard}>
        <StatusIcon size={32} color={statusColor} />
        <Text style={[styles.statusText, { color: statusColor }]}>
          {overallStatus === 'ok' ? 'Всё в порядке' : overallStatus === 'warning' ? 'Есть предупреждения' : 'Есть ошибки'}
        </Text>
        <View style={styles.statsRow}>
          {severityFilters.slice(1).map(f => (
            <View key={f.key} style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: f.color }]} />
              <Text style={styles.statCount}>{f.count}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.diagBtn} onPress={handleRunDiagnosis}>
          <RefreshCw size={16} color={colors.primary} />
          <Text style={styles.diagBtnText}>Проверить</Text>
        </TouchableOpacity>
        {entries.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
            <Trash2 size={16} color={colors.danger} />
            <Text style={styles.clearBtnText}>Очистить</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {severityFilters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, severity === f.key && styles.filterBtnActive]}
            onPress={() => setSeverity(f.key)}
          >
            <Text style={[styles.filterText, severity === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ShieldCheck size={48} color={colors.success + '60'} />
            <Text style={styles.emptyText}>Журнал пуст</Text>
          </View>
        }
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  noAccessText: { fontSize: 16, color: colors.textTertiary },
  statusCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 20,
    margin: 16, marginBottom: 8, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  statusText: { fontSize: 16, fontWeight: '700' as const, marginTop: 8 },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statCount: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary },
  actionsRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8,
  },
  diagBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primarySurface, borderRadius: 10, padding: 10,
  },
  diagBtnText: { fontSize: 13, fontWeight: '600' as const, color: colors.primary },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.dangerSurface, borderRadius: 10, padding: 10, paddingHorizontal: 16,
  },
  clearBtnText: { fontSize: 13, fontWeight: '600' as const, color: colors.danger },
  filterRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 8,
  },
  filterBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  filterBtnActive: { backgroundColor: colors.primarySurface, borderColor: colors.primary },
  filterText: { fontSize: 11, fontWeight: '500' as const, color: colors.textSecondary },
  filterTextActive: { color: colors.primary },
  list: { padding: 16, paddingTop: 0, paddingBottom: 32 },
  logCard: {
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  logHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  severityBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  severityText: { fontSize: 10, fontWeight: '700' as const, textTransform: 'uppercase' as const },
  categoryBadge: {
    backgroundColor: colors.surfaceLight, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  categoryText: { fontSize: 10, color: colors.textTertiary },
  logTime: { fontSize: 10, color: colors.textTertiary, marginLeft: 'auto' },
  logMessage: { fontSize: 13, color: colors.text },
  logDetails: {
    marginTop: 8, backgroundColor: colors.surfaceLight, borderRadius: 8, padding: 10, gap: 3,
  },
  logDetail: { fontSize: 12, color: colors.textSecondary },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: colors.textTertiary },
});
