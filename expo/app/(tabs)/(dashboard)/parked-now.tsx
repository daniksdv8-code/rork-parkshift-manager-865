import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Car, Clock, Search, ChevronRight, X } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatDateTime, calculateDays, getServiceTypeLabel, normalizeForSearch, normalizePhone } from '@/utils/helpers';
import { ParkingSession } from '@/types';

export default function ParkedNowScreen() {
  const router = useRouter();
  const { activeSessions, activeCars, activeClients } = useParking();
  const colors = useColors();
  const [search, setSearch] = useState('');
  const styles = useMemo(() => createStyles(colors), [colors]);

  const filtered = useMemo(() => {
    let list = activeSessions;
    if (search.trim()) {
      const q = normalizeForSearch(search);
      const rawQ = search.trim();
      const phoneQ = normalizePhone(rawQ);
      list = list.filter(s => {
        const car = activeCars.find(c => c.id === s.carId);
        const client = activeClients.find(c => c.id === s.clientId);
        return (
          (car ? normalizeForSearch(car.plateNumber).includes(q) : false) ||
          (car?.carModel ? normalizeForSearch(car.carModel).includes(q) : false) ||
          (client ? normalizeForSearch(client.name).includes(q) : false) ||
          (client ? normalizePhone(client.phone).includes(phoneQ) : false) ||
          (client?.phone2 ? normalizePhone(client.phone2).includes(phoneQ) : false)
        );
      });
    }
    return list.sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());
  }, [activeSessions, activeCars, activeClients, search]);

  const renderItem = ({ item }: { item: ParkingSession }) => {
    const car = activeCars.find(c => c.id === item.carId);
    const client = activeClients.find(c => c.id === item.clientId);
    const days = calculateDays(item.entryTime);
    const typeColors: Record<string, string> = {
      onetime: colors.textSecondary,
      monthly: colors.info,
      lombard: colors.warning,
    };

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push({ pathname: '/exit-modal', params: { sessionId: item.id } })}
        activeOpacity={0.7}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.plate}>{car?.plateNumber ?? '???'}</Text>
          {car?.carModel && <Text style={styles.model}>{car.carModel}</Text>}
          <Text style={styles.clientName}>{client?.name ?? 'Клиент'}</Text>
        </View>
        <View style={styles.cardRight}>
          <View style={[styles.typeBadge, { backgroundColor: (typeColors[item.serviceType] ?? colors.textSecondary) + '15' }]}>
            <Text style={[styles.typeText, { color: typeColors[item.serviceType] ?? colors.textSecondary }]}>
              {getServiceTypeLabel(item.serviceType)}
            </Text>
          </View>
          <View style={styles.timeRow}>
            <Clock size={10} color={colors.textTertiary} />
            <Text style={styles.timeText}>{days} сут.</Text>
          </View>
          <Text style={styles.entryTime}>{formatDateTime(item.entryTime)}</Text>
        </View>
        <ChevronRight size={16} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Search size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Номер авто, ФИО, телефон..."
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

      <View style={styles.countCard}>
        <Car size={20} color={colors.primary} />
        <Text style={styles.countValue}>{filtered.length}</Text>
        <Text style={styles.countLabel}>на парковке</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Нет припаркованных авто</Text>}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, margin: 16, marginBottom: 10,
    borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },
  countCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.primarySurface, marginHorizontal: 16,
    borderRadius: 10, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: colors.primary + '20',
  },
  countValue: { fontSize: 22, fontWeight: '800' as const, color: colors.primary },
  countLabel: { fontSize: 14, color: colors.textSecondary },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  cardLeft: { flex: 1 },
  plate: { fontSize: 17, fontWeight: '800' as const, color: colors.text, letterSpacing: 0.5 },
  model: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  clientName: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  typeBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  typeText: { fontSize: 10, fontWeight: '600' as const },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  timeText: { fontSize: 12, fontWeight: '600' as const, color: colors.text },
  entryTime: { fontSize: 10, color: colors.textTertiary },
  empty: { fontSize: 14, color: colors.textTertiary, textAlign: 'center' as const, paddingVertical: 40 },
});
