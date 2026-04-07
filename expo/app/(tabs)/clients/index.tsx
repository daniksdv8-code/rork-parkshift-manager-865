import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Search, UserPlus, Car, AlertTriangle, X } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, normalizeForSearch, normalizePhone } from '@/utils/helpers';

type Filter = 'all' | 'paid' | 'debtors';

export default function ClientsScreen() {
  const router = useRouter();
  const { activeClients, activeCars, activeSessions, getClientDebtTotal } = useParking();
  const colors = useColors();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  const clients = useMemo(() => {
    return activeClients
      .map(client => {
        const cars = activeCars.filter(c => c.clientId === client.id);
        const debt = getClientDebtTotal(client.id);
        const isParked = activeSessions.some(s => s.clientId === client.id);
        return { client, cars, debt, isParked };
      })
      .filter(item => {
        if (filter === 'paid' && item.debt > 0) return false;
        if (filter === 'debtors' && item.debt <= 0) return false;
        if (!search) return true;
        const q = normalizeForSearch(search);
        const rawQ = search.trim();
        return (
          normalizeForSearch(item.client.name).includes(q) ||
          normalizePhone(item.client.phone).includes(normalizePhone(rawQ)) ||
          (item.client.phone2 && normalizePhone(item.client.phone2).includes(normalizePhone(rawQ))) ||
          item.cars.some(c => normalizeForSearch(c.plateNumber).includes(q))
        );
      })
      .sort((a, b) => a.client.name.localeCompare(b.client.name));
  }, [activeClients, activeCars, activeSessions, search, filter, getClientDebtTotal]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderItem = ({ item }: { item: typeof clients[0] }) => {
    const { client, cars, debt, isParked } = item;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push({ pathname: '/client-card', params: { clientId: client.id } })}
        activeOpacity={0.7}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.avatar, debt > 0 ? styles.avatarDebt : styles.avatarOk]}>
            <Text style={styles.avatarText}>{client.name.charAt(0).toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{client.name}</Text>
            {isParked && (
              <View style={styles.parkedBadge}>
                <Car size={10} color={colors.primary} />
                <Text style={styles.parkedText}>П</Text>
              </View>
            )}
          </View>
          {cars.length > 0 && (
            <Text style={styles.carsText} numberOfLines={1}>
              {cars.map(c => `${c.plateNumber}${c.carModel ? ` ${c.carModel}` : ''}`).join(', ')}
            </Text>
          )}
          {debt > 0 && (
            <View style={styles.debtRow}>
              <AlertTriangle size={12} color={colors.danger} />
              <Text style={styles.debtText}>Долг: {formatMoney(debt)}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.searchBox}>
          <Search size={18} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Имя, телефон, номер авто..."
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/add-client-modal')}
        >
          <UserPlus size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        {([
          { key: 'all', label: 'Все' },
          { key: 'paid', label: 'Оплачено' },
          { key: 'debtors', label: 'Должники' },
        ] as { key: Filter; label: string }[]).map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.countLabel}>{clients.length} клиентов</Text>

      <FlatList
        data={clients}
        keyExtractor={item => item.client.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Клиенты не найдены</Text>
          </View>
        }
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 8,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12,
    paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, paddingVertical: 12, paddingLeft: 10,
    fontSize: 15, color: colors.text,
  },
  addBtn: {
    backgroundColor: colors.primary, borderRadius: 12,
    width: 48, alignItems: 'center', justifyContent: 'center',
  },
  filters: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8,
  },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary },
  filterTextActive: { color: colors.white },
  countLabel: {
    fontSize: 12, color: colors.textTertiary, paddingHorizontal: 16, paddingBottom: 6,
  },
  list: { padding: 16, paddingTop: 0, paddingBottom: 32 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12,
    padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  cardLeft: { marginRight: 12 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarOk: { backgroundColor: colors.primarySurface },
  avatarDebt: { backgroundColor: colors.dangerSurface },
  avatarText: { fontSize: 16, fontWeight: '700' as const, color: colors.primary },
  cardBody: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '600' as const, color: colors.text, flex: 1 },
  parkedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: colors.primarySurface, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  parkedText: { fontSize: 10, color: colors.primary, fontWeight: '700' as const },
  carsText: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  debtRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  debtText: { fontSize: 12, color: colors.danger, fontWeight: '500' as const },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: colors.textTertiary },
});
