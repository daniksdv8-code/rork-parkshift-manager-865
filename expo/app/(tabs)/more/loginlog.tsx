import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { LogIn, User, Shield } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatDateTime } from '@/utils/helpers';
import { LoginLogEntry } from '@/types';

export default function LoginLogScreen() {
  const { loginLogs } = useParking();
  const colors = useColors();
  const [filterUser, setFilterUser] = useState<string | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const uniqueUsers = useMemo(() => {
    const map = new Map<string, string>();
    (loginLogs ?? []).forEach(l => map.set(l.userId, l.userName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [loginLogs]);

  const filtered = useMemo(() => {
    const logs = loginLogs ?? [];
    if (!filterUser) return logs;
    return logs.filter(l => l.userId === filterUser);
  }, [loginLogs, filterUser]);

  const renderItem = ({ item }: { item: LoginLogEntry }) => {
    const isAdmin = item.userRole === 'admin';
    return (
      <View style={styles.logItem}>
        <View style={[styles.iconWrap, { backgroundColor: isAdmin ? colors.primarySurface : colors.infoSurface }]}>
          {isAdmin ? <Shield size={16} color={colors.primary} /> : <User size={16} color={colors.info} />}
        </View>
        <View style={styles.logBody}>
          <Text style={styles.logName}>{item.userName}</Text>
          <Text style={styles.logRole}>{isAdmin ? 'Администратор' : 'Менеджер'}</Text>
        </View>
        <Text style={styles.logDate}>{formatDateTime(item.timestamp)}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {uniqueUsers.length > 1 && (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: null as string | null, name: 'Все' }, ...uniqueUsers]}
          keyExtractor={item => item.id ?? 'all'}
          style={styles.filterBar}
          contentContainerStyle={styles.filterContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterBtn, filterUser === item.id && styles.filterBtnActive]}
              onPress={() => setFilterUser(item.id)}
            >
              <Text style={[styles.filterText, filterUser === item.id && styles.filterTextActive]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Text style={styles.countText}>{filtered.length} входов</Text>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <LogIn size={40} color={colors.textTertiary} />
            <Text style={styles.emptyText}>Нет записей о входах</Text>
            <Text style={styles.emptyHint}>Записи появятся после первого входа</Text>
          </View>
        }
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterBar: { maxHeight: 50, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterContent: { paddingHorizontal: 12, alignItems: 'center', gap: 6 },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary },
  filterTextActive: { color: colors.white },
  countText: { fontSize: 12, color: colors.textTertiary, paddingHorizontal: 16, paddingVertical: 8 },
  list: { padding: 16, paddingTop: 0, paddingBottom: 32 },
  logItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10,
    padding: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  logBody: { flex: 1 },
  logName: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  logRole: { fontSize: 12, color: colors.textTertiary, marginTop: 1 },
  logDate: { fontSize: 12, color: colors.textSecondary },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600' as const, color: colors.textTertiary },
  emptyHint: { fontSize: 13, color: colors.textTertiary },
});
