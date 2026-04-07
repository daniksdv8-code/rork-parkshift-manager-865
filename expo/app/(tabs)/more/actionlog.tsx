import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import {
  Search, User, Users, Car, CreditCard, Clock, Settings,
  ChevronDown, ChevronUp, X,
} from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatDateTime, normalizeForSearch } from '@/utils/helpers';
import { ActionLog } from '@/types';

type Category = 'all' | 'clients' | 'parking' | 'payments' | 'shifts' | 'system';

const CATEGORIES: { key: Category; label: string; icon: typeof Users }[] = [
  { key: 'all', label: 'Все', icon: Clock },
  { key: 'clients', label: 'Клиенты', icon: Users },
  { key: 'parking', label: 'Парковка', icon: Car },
  { key: 'payments', label: 'Оплаты', icon: CreditCard },
  { key: 'shifts', label: 'Смены', icon: Clock },
  { key: 'system', label: 'Система', icon: Settings },
];

const CLIENT_ACTIONS = ['client_add', 'client_edit', 'client_delete', 'car_add', 'car_edit', 'car_delete', 'admin_edit'];
const PARKING_ACTIONS = ['checkin', 'checkout', 'cancel_checkin', 'cancel_checkout', 'early_exit'];
const PAYMENT_ACTIONS = ['payment', 'cancel_payment', 'debt_add', 'debt_delete', 'debt_payment', 'monthly_payment', 'expense', 'withdrawal', 'admin_expense', 'salary_advance', 'salary_payment'];
const SHIFT_ACTIONS = ['shift_open', 'shift_close', 'schedule_add', 'schedule_edit', 'schedule_delete', 'cleanup_complete'];
const SYSTEM_ACTIONS = ['tariff_update', 'user_add', 'user_remove', 'user_toggle', 'user_password', 'data_reset', 'backup_restore', 'violation_add', 'violation_delete'];

function getCategoryForAction(action: string): Category {
  if (CLIENT_ACTIONS.includes(action)) return 'clients';
  if (PARKING_ACTIONS.includes(action)) return 'parking';
  if (PAYMENT_ACTIONS.includes(action)) return 'payments';
  if (SHIFT_ACTIONS.includes(action)) return 'shifts';
  if (SYSTEM_ACTIONS.includes(action)) return 'system';
  return 'system';
}

function getActionColor(action: string, c: ThemeColors): string {
  const cat = getCategoryForAction(action);
  switch (cat) {
    case 'clients': return c.info;
    case 'parking': return c.primary;
    case 'payments': return c.cash;
    case 'shifts': return c.warning;
    case 'system': return c.adjustment;
    default: return c.textSecondary;
  }
}

function groupByDate(items: ActionLog[]): { title: string; data: ActionLog[] }[] {
  const groups = new Map<string, ActionLog[]>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const item of items) {
    const d = new Date(item.timestamp).toDateString();
    let label: string;
    if (d === today) label = 'Сегодня';
    else if (d === yesterday) label = 'Вчера';
    else label = new Date(item.timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }

  return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
}

export default function ActionLogScreen() {
  const { actionLogs } = useParking();
  const colors = useColors();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let items = actionLogs;

    if (category !== 'all') {
      items = items.filter(l => getCategoryForAction(l.action) === category);
    }

    if (search) {
      const q = normalizeForSearch(search);
      items = items.filter(l =>
        normalizeForSearch(l.label).includes(q) ||
        normalizeForSearch(l.details).includes(q) ||
        normalizeForSearch(l.operatorName).includes(q)
      );
    }

    return items.slice(0, 300);
  }, [actionLogs, search, category]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => prev === id ? null : id);
  }, []);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderItem = ({ item }: { item: ActionLog }) => {
    const isOpen = expanded === item.id;
    const color = getActionColor(item.action, colors);

    return (
      <TouchableOpacity
        style={styles.logCard}
        onPress={() => toggleExpand(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.logRow}>
          <View style={[styles.colorDot, { backgroundColor: color }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.logLabel} numberOfLines={isOpen ? undefined : 1}>{item.label}</Text>
            <View style={styles.logMeta}>
              <Text style={styles.logTime}>{formatDateTime(item.timestamp)}</Text>
              <View style={styles.operatorBadge}>
                <User size={10} color={colors.textTertiary} />
                <Text style={styles.logOperator}>{item.operatorName}</Text>
              </View>
            </View>
          </View>
          {item.details ? (
            isOpen ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />
          ) : null}
        </View>
        {isOpen && item.details && (
          <View style={styles.detailsWrap}>
            <Text style={styles.logDetails}>{item.details}</Text>
            {item.entityType && (
              <Text style={styles.entityInfo}>{item.entityType} · {item.entityId?.slice(0, 12)}</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <Search size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll} contentContainerStyle={styles.categoriesContent}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.key}
            style={[styles.catChip, category === cat.key && styles.catChipActive]}
            onPress={() => setCategory(cat.key)}
          >
            <cat.icon size={13} color={category === cat.key ? colors.white : colors.textSecondary} />
            <Text style={[styles.catChipText, category === cat.key && styles.catChipTextActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.countText}>{filtered.length} записей</Text>

      <FlatList
        data={grouped}
        keyExtractor={item => item.title}
        contentContainerStyle={styles.list}
        renderItem={({ item: group }) => (
          <View>
            <Text style={styles.dateHeader}>{group.title}</Text>
            {group.data.map(log => (
              <View key={log.id}>{renderItem({ item: log })}</View>
            ))}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Нет записей</Text>
          </View>
        }
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: 10,
    paddingHorizontal: 12, marginHorizontal: 16, marginTop: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, paddingVertical: 10, fontSize: 14, color: colors.text,
  },
  categoriesScroll: { maxHeight: 44, marginTop: 10 },
  categoriesContent: { paddingHorizontal: 16, gap: 6 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.surface, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: colors.border,
  },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catChipText: { fontSize: 12, fontWeight: '500' as const, color: colors.textSecondary },
  catChipTextActive: { color: colors.white },
  countText: { fontSize: 12, color: colors.textTertiary, marginHorizontal: 16, marginTop: 10, marginBottom: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  dateHeader: {
    fontSize: 13, fontWeight: '700' as const, color: colors.textSecondary,
    marginTop: 14, marginBottom: 6, paddingLeft: 4,
  },
  logCard: {
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 4, borderWidth: 1, borderColor: colors.border,
  },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  colorDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  logLabel: { fontSize: 13, fontWeight: '600' as const, color: colors.text },
  logMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  logTime: { fontSize: 11, color: colors.textTertiary },
  operatorBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.surfaceLight, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  logOperator: { fontSize: 10, color: colors.textTertiary },
  detailsWrap: {
    marginTop: 8, backgroundColor: colors.surfaceLight,
    borderRadius: 6, padding: 8,
  },
  logDetails: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  entityInfo: { fontSize: 10, color: colors.textTertiary, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: colors.textTertiary },
});
