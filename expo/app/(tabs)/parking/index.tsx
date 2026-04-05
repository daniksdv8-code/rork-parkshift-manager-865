import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Search, Clock, Car, X, LogOut as ExitIcon, UserPlus } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { hapticMedium } from '@/utils/haptics';
import { formatMoney, formatDateTime, calculateDays, getServiceTypeLabel, normalizeForSearch, normalizePhone } from '@/utils/helpers';
import { ParkingSession } from '@/types';

export default function ParkingScreen() {
  const router = useRouter();
  const { activeSessions, activeCars, activeClients, tariffs, cancelCheckIn } = useParking();
  const colors = useColors();
  const [search, setSearch] = useState('');

  const sessions = useMemo(() => {
    return activeSessions
      .map(session => {
        const car = activeCars.find(c => c.id === session.carId);
        const client = activeClients.find(c => c.id === session.clientId);
        const days = calculateDays(session.entryTime);
        let cost = 0;
        if (session.serviceType === 'onetime') {
          cost = days * (session.prepaidMethod === 'card' ? tariffs.onetimeCard : tariffs.onetimeCash);
        } else if (session.serviceType === 'lombard') {
          cost = days * (session.lombardRateApplied || tariffs.lombardRate);
        }
        return { session, car, client, days, cost };
      })
      .filter(item => {
        if (!search) return true;
        const q = normalizeForSearch(search);
        const rawQ = search.trim();
        const phoneQ = normalizePhone(rawQ);
        return (
          (item.car ? normalizeForSearch(item.car.plateNumber).includes(q) : false) ||
          (item.car?.carModel ? normalizeForSearch(item.car.carModel).includes(q) : false) ||
          (item.client ? normalizeForSearch(item.client.name).includes(q) : false) ||
          (item.client ? normalizePhone(item.client.phone).includes(phoneQ) : false) ||
          (item.client?.phone2 ? normalizePhone(item.client.phone2).includes(phoneQ) : false)
        );
      })
      .filter((item, _i, arr) => {
        if (!search) return true;
        const q = normalizeForSearch(search);
        const rawQ = search.trim();
        const phoneQ = normalizePhone(rawQ);
        const hasExactInArr = arr.some(it => {
          return (
            (it.car ? normalizeForSearch(it.car.plateNumber) === q : false) ||
            (it.car?.carModel ? normalizeForSearch(it.car.carModel) === q : false) ||
            (it.client ? normalizeForSearch(it.client.name) === q : false) ||
            (it.client ? normalizePhone(it.client.phone) === phoneQ : false) ||
            (it.client?.phone2 ? normalizePhone(it.client.phone2) === phoneQ : false)
          );
        });
        if (!hasExactInArr) return true;
        return (
          (item.car ? normalizeForSearch(item.car.plateNumber) === q : false) ||
          (item.car?.carModel ? normalizeForSearch(item.car.carModel) === q : false) ||
          (item.client ? normalizeForSearch(item.client.name) === q : false) ||
          (item.client ? normalizePhone(item.client.phone) === phoneQ : false) ||
          (item.client?.phone2 ? normalizePhone(item.client.phone2) === phoneQ : false)
        );
      })
      .sort((a, b) => new Date(b.session.entryTime).getTime() - new Date(a.session.entryTime).getTime());
  }, [activeSessions, activeCars, activeClients, tariffs, search]);

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  const handleCancel = useCallback((session: ParkingSession) => {
    hapticMedium();
    Alert.alert('Отмена заезда', `Отменить заезд ${activeCars.find(c => c.id === session.carId)?.plateNumber ?? ''}?`, [
      { text: 'Нет', style: 'cancel' },
      { text: 'Да, отменить', style: 'destructive', onPress: () => {
        cancelCheckIn(session.id);
        Alert.alert('Готово', 'Заезд отменён');
      }},
    ]);
  }, [cancelCheckIn, activeCars]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderItem = useCallback(({ item }: { item: typeof sessions[0] }) => {
    const { session, car, client, days, cost } = item;
    const isDebt = session.status === 'active_debt';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.plateWrap}>
            <Text style={styles.plate} numberOfLines={1}>{car?.plateNumber ?? '???'}</Text>
            {car?.carModel && <Text style={styles.model} numberOfLines={1}>{car.carModel}</Text>}
          </View>
          <View style={[
            styles.typeBadge,
            session.serviceType === 'monthly' && styles.typeBadgeMonthly,
            session.serviceType === 'lombard' && styles.typeBadgeLombard,
            isDebt && styles.typeBadgeDebt,
          ]}>
            <Text style={[
              styles.typeBadgeText,
              session.serviceType === 'monthly' && styles.typeBadgeTextMonthly,
              session.serviceType === 'lombard' && styles.typeBadgeTextLombard,
              isDebt && styles.typeBadgeTextDebt,
            ]}>
              {isDebt ? 'В долг' : getServiceTypeLabel(session.serviceType)}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.clientName} numberOfLines={1}>{client?.name ?? 'Неизвестный'}</Text>
          <View style={styles.infoRow}>
            <Clock size={13} color={colors.textTertiary} />
            <Text style={styles.infoText} numberOfLines={1}>{formatDateTime(session.entryTime)} · {days} сут.</Text>
          </View>
          {cost > 0 && (
            <Text style={styles.costText}>{formatMoney(cost)}</Text>
          )}
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.exitBtn}
            onPress={() => router.push({ pathname: '/exit-modal', params: { sessionId: session.id } })}
          >
            <ExitIcon size={16} color={colors.white} />
            <Text style={styles.exitBtnText}>Выезд</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => handleCancel(session)}
          >
            <X size={16} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [router, handleCancel, styles, colors]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <Search size={18} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск по номеру, имени..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.countBar}>
        <Car size={16} color={colors.primary} />
        <Text style={styles.countText}>На парковке: {sessions.length}</Text>
        <TouchableOpacity
          style={styles.addClientMini}
          onPress={() => router.push('/add-client-modal')}
          activeOpacity={0.7}
        >
          <UserPlus size={14} color={colors.primary} />
          <Text style={styles.addClientMiniText}>Новый клиент</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={item => item.session.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Car size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>Парковка пуста</Text>
          </View>
        }
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12,
    paddingHorizontal: 14, margin: 16, marginBottom: 0,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, paddingVertical: 12, paddingLeft: 10,
    fontSize: 15, color: colors.text,
  },
  countBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  countText: { flex: 1, fontSize: 13, color: colors.primary, fontWeight: '600' as const, flexShrink: 1 },
  addClientMini: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5,
    backgroundColor: colors.primarySurface, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  addClientMiniText: { fontSize: 12, fontWeight: '600' as const, color: colors.primary },
  list: { padding: 16, paddingTop: 0, paddingBottom: 32 },
  card: {
    backgroundColor: colors.surface, borderRadius: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  plateWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1, marginRight: 8 },
  plate: { fontSize: 18, fontWeight: '800' as const, color: colors.text, letterSpacing: 1 },
  model: { fontSize: 13, color: colors.textSecondary },
  typeBadge: {
    backgroundColor: colors.surfaceLight, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  typeBadgeMonthly: { backgroundColor: colors.infoSurface },
  typeBadgeLombard: { backgroundColor: colors.warningSurface },
  typeBadgeDebt: { backgroundColor: colors.dangerSurface },
  typeBadgeText: { fontSize: 11, fontWeight: '600' as const, color: colors.textSecondary },
  typeBadgeTextMonthly: { color: colors.info },
  typeBadgeTextLombard: { color: colors.warning },
  typeBadgeTextDebt: { color: colors.danger },
  cardBody: { marginBottom: 12 },
  clientName: { fontSize: 14, fontWeight: '500' as const, color: colors.text, marginBottom: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText: { fontSize: 12, color: colors.textTertiary },
  costText: { fontSize: 16, fontWeight: '700' as const, color: colors.primary, marginTop: 6 },
  cardActions: { flexDirection: 'row', gap: 8 },
  exitBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10,
  },
  exitBtnText: { fontSize: 14, fontWeight: '600' as const, color: colors.white },
  cancelBtn: {
    backgroundColor: colors.dangerSurface, borderRadius: 10,
    width: 40, alignItems: 'center', justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: colors.textTertiary },
});
