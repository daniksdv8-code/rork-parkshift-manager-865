import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, TextInput, Animated, Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Banknote, CreditCard, Car, AlertTriangle, Clock,
  PlayCircle, LogOut, ChevronRight, Shield, Wallet,
  Sparkles, Search, FileEdit, X, CheckCircle, RefreshCw,
  AlertCircle, UserPlus, ArrowRightLeft, TrendingUp,
} from 'lucide-react-native';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { formatMoney, daysUntil, normalizeForSearch, normalizePhone } from '@/utils/helpers';
import CleaningChecklist from '@/components/CleaningChecklist';
import { hapticSuccess, hapticMedium } from '@/utils/haptics';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export default function DashboardScreen() {
  const router = useRouter();
  const { currentUser, isAdmin, logout } = useAuth();
  const {
    todayStats, currentShift, shifts,
    expiringSubscriptions, openShift, needsShiftCheck,
    getCurrentViolationMonth, getTodayCleaningShift,
    activeClients, activeCars,
    transactions, expenses, withdrawals,
    syncStatus,
  } = useParking();
  const colors = useColors();

  const [refreshing, setRefreshing] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);


  const fadeAnimsRef = useRef([0, 1, 2, 3].map(() => new Animated.Value(0)));
  const slideAnimsRef = useRef([0, 1, 2, 3].map(() => new Animated.Value(20)));
  const shiftProgressAnimRef = useRef(new Animated.Value(0));
  const cleaningPulseRef = useRef(new Animated.Value(1));
  const cleaningGlowRef = useRef(new Animated.Value(0));
  const fadeAnims = fadeAnimsRef.current;
  const slideAnims = slideAnimsRef.current;
  const shiftProgressAnim = shiftProgressAnimRef.current;
  const cleaningPulse = cleaningPulseRef.current;
  const cleaningGlow = cleaningGlowRef.current;

  useEffect(() => {
    const animations = fadeAnims.map((anim, i) =>
      Animated.parallel([
        Animated.timing(anim, {
          toValue: 1,
          duration: 350,
          delay: i * 80,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnims[i], {
          toValue: 0,
          duration: 350,
          delay: i * 80,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
    Animated.stagger(60, animations).start();
  }, [fadeAnims, slideAnims]);

  useEffect(() => {
    if (getTodayCleaningShift) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(cleaningPulse, {
            toValue: 1.03, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
          Animated.timing(cleaningPulse, {
            toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
        ])
      );
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(cleaningGlow, {
            toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: false,
          }),
          Animated.timing(cleaningGlow, {
            toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: false,
          }),
        ])
      );
      pulse.start();
      glow.start();
      return () => { pulse.stop(); glow.stop(); };
    }
  }, [getTodayCleaningShift, cleaningPulse, cleaningGlow]);

  useEffect(() => {
    if (currentShift) {
      const startTime = new Date(currentShift.openedAt).getTime();
      const now = Date.now();
      const elapsed = now - startTime;
      const maxDuration = 24 * 60 * 60 * 1000;
      const progress = Math.min(elapsed / maxDuration, 1);
      Animated.timing(shiftProgressAnim, {
        toValue: progress, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false,
      }).start();
    } else {
      shiftProgressAnim.setValue(0);
    }
  }, [currentShift, shiftProgressAnim]);



  const totalCashData = useMemo(() => {
    if (!currentShift) return null;
    const shiftTx = transactions.filter(t => {
      if (t.shiftId === currentShift.id) return true;
      const tDate = new Date(t.date).getTime();
      return tDate >= new Date(currentShift.openedAt).getTime();
    });
    const cashIncome = shiftTx.filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'cash').reduce((s, t) => s + t.amount, 0);
    const refunds = shiftTx.filter(t => t.type === 'refund' && t.method === 'cash').reduce((s, t) => s + t.amount, 0);
    const shiftExpenses = expenses.filter(e => e.shiftId === currentShift.id).reduce((s, e) => s + e.amount, 0);
    const shiftWithdrawals = withdrawals.filter(w => w.shiftId === currentShift.id).reduce((s, w) => s + w.amount, 0);
    const netCash = cashIncome - shiftExpenses - shiftWithdrawals - refunds;
    const carryOver = currentShift.carryOver ?? 0;
    const totalCash = carryOver + netCash;
    return { totalCash, carryOver, netCash };
  }, [currentShift, transactions, expenses, withdrawals]);

  const searchResults = useMemo(() => {
    if (searchQuery.length < 1) return [];
    const q = normalizeForSearch(searchQuery);
    const rawQ = searchQuery.trim();
    const phoneQ = normalizePhone(rawQ);
    const partial = activeClients.filter(c => {
      if (normalizeForSearch(c.name).includes(q)) return true;
      if (phoneQ.length > 0 && normalizePhone(c.phone).includes(phoneQ)) return true;
      if (phoneQ.length > 0 && c.phone2 && normalizePhone(c.phone2).includes(phoneQ)) return true;
      const clientCars = activeCars.filter(car => car.clientId === c.id);
      return clientCars.some(car => normalizeForSearch(car.plateNumber).includes(q));
    });
    const exact = partial.filter(c => {
      if (normalizeForSearch(c.name) === q) return true;
      if (phoneQ.length > 0 && normalizePhone(c.phone) === phoneQ) return true;
      if (phoneQ.length > 0 && c.phone2 && normalizePhone(c.phone2) === phoneQ) return true;
      const clientCars = activeCars.filter(car => car.clientId === c.id);
      return clientCars.some(car => normalizeForSearch(car.plateNumber) === q);
    });
    return (exact.length > 0 ? exact : partial).slice(0, 8);
  }, [searchQuery, activeClients, activeCars]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const previousCash = useMemo(() => {
    const lastClosed = [...shifts]
      .filter(s => s.status === 'closed')
      .sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime())[0];
    return lastClosed?.actualCash ?? 0;
  }, [shifts]);

  const handleOpenShift = useCallback(() => {
    hapticMedium();
    Alert.prompt(
      'Открытие смены',
      `Общая касса с прошлой смены: ${formatMoney(previousCash)}\n\nУкажите сумму, которую принимаете (пусто = ${previousCash}):`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Открыть',
          onPress: (value?: string) => {
            const cash = value?.trim() ? parseFloat(value.replace(',', '.')) : undefined;
            if (cash !== undefined && (isNaN(cash) || cash < 0)) {
              Alert.alert('Ошибка', 'Введите корректную сумму');
              return;
            }
            const result = openShift(cash);
            if (result && 'blocked' in result) {
              Alert.alert('Смена занята', `Сейчас работает ${result.operatorName}.`);
              return;
            }
            if (result) {
              hapticSuccess();
              Alert.alert('Готово', `Смена открыта. Принято: ${formatMoney(cash ?? previousCash)}`);
            }
          },
        },
      ],
      'plain-text',
      String(previousCash),
      'numeric'
    );
  }, [openShift, previousCash]);

  const handleLogout = useCallback(() => {
    hapticMedium();
    Alert.alert('Выход', 'Выйти из аккаунта?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: async () => {
        console.log('[Dashboard] Initiating logout');
        await logout();
        router.replace('/login');
      }},
    ]);
  }, [logout, router]);

  const stats = useMemo(() => [
    { label: 'На парковке', value: `${todayStats.parkedNow}`, icon: Car, color: colors.primary, route: '/parked-now' },
    { label: 'Наличные', value: formatMoney(todayStats.cashToday), icon: Banknote, color: colors.cash, route: '/cash-today' },
    { label: 'Безнал', value: formatMoney(todayStats.cardToday), icon: CreditCard, color: colors.card, route: '/card-today' },
    { label: 'Должники', value: `${todayStats.debtorsCount}`, icon: AlertTriangle, color: colors.danger, route: '/debtors-screen' },
  ], [todayStats, colors]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
          <Search size={16} color={searchFocused ? colors.primary : colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Номер, имя или телефон..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
          />
          <TouchableOpacity onPress={() => router.push('/global-search')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.globalSearchBtn}>
            <Text style={styles.globalSearchText}>Расш.</Text>
          </TouchableOpacity>
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        {searchQuery.length >= 1 && (
          <View style={styles.searchResults}>
            {searchResults.length === 0 ? (
              <View>
                <Text style={styles.searchEmpty}>Ничего не найдено</Text>
                <TouchableOpacity style={styles.searchAddClient} onPress={() => { setSearchQuery(''); router.push('/add-client-modal'); }}>
                  <UserPlus size={16} color={colors.primary} />
                  <Text style={styles.searchAddClientText}>Создать нового клиента</Text>
                </TouchableOpacity>
              </View>
            ) : (
              searchResults.map(client => {
                const clientCars = activeCars.filter(car => car.clientId === client.id);
                return (
                  <TouchableOpacity key={client.id} style={styles.searchItem} onPress={() => { setSearchQuery(''); router.push({ pathname: '/client-card', params: { clientId: client.id } }); }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.searchName} numberOfLines={1}>{client.name}</Text>
                      <Text style={styles.searchMeta} numberOfLines={1}>{client.phone}{clientCars.length > 0 ? ` · ${clientCars.map(c => c.plateNumber).join(', ')}` : ''}</Text>
                    </View>
                    <ChevronRight size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </View>

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greetingTime} numberOfLines={1}>{getGreeting()},</Text>
          <Text style={styles.greeting} numberOfLines={1}>{currentUser?.name ?? 'Добро пожаловать'}</Text>
          <Text style={styles.role}>{isAdmin ? 'Администратор' : 'Менеджер'}</Text>
        </View>
        <View style={styles.syncBadge}>
          {syncStatus === 'connected' && <CheckCircle size={14} color={colors.success} />}
          {syncStatus === 'connecting' && <RefreshCw size={14} color={colors.warning} />}
          {syncStatus === 'offline' && <AlertCircle size={14} color={colors.textTertiary} />}
          {syncStatus === 'error' && <AlertCircle size={14} color={colors.danger} />}
          <Text style={[styles.syncText, syncStatus === 'connected' && { color: colors.success }, syncStatus === 'connecting' && { color: colors.warning }, (syncStatus === 'offline' || syncStatus === 'error') && { color: colors.danger }]} numberOfLines={1}>
            {syncStatus === 'connected' ? 'Онлайн' : syncStatus === 'connecting' ? 'Синх...' : syncStatus === 'error' ? 'Ошибка' : 'Локально'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <LogOut size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {needsShiftCheck() && (
        <TouchableOpacity style={styles.shiftBanner} onPress={handleOpenShift} activeOpacity={0.8}>
          <PlayCircle size={22} color={colors.warning} />
          <View style={styles.shiftBannerText}>
            <Text style={styles.shiftBannerTitle}>Смена не открыта</Text>
            <Text style={styles.shiftBannerSub}>Нажмите, чтобы открыть смену</Text>
          </View>
          <ChevronRight size={18} color={colors.warning} />
        </TouchableOpacity>
      )}

      {currentShift && (
        <View style={styles.shiftActiveCard}>
          <View style={styles.shiftActiveTop}>
            <Shield size={16} color={colors.primary} />
            <Text style={styles.shiftActiveText} numberOfLines={1}>Смена открыта · {currentShift.operatorName}</Text>
            <TouchableOpacity onPress={() => router.push('/cashregister-screen')}>
              <Text style={styles.shiftActiveLink}>Касса</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.shiftProgressTrack}>
            <Animated.View style={[styles.shiftProgressBar, { width: shiftProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          </View>
          <Text style={styles.shiftProgressLabel}>
            {(() => { const elapsed = Date.now() - new Date(currentShift.openedAt).getTime(); const hours = Math.floor(elapsed / 3600000); const mins = Math.floor((elapsed % 3600000) / 60000); return `${hours}ч ${mins}мин / 24ч`; })()}
          </Text>
        </View>
      )}

      {totalCashData && (
        <TouchableOpacity style={styles.totalCashCard} onPress={() => router.push('/totalcash-screen' as never)} activeOpacity={0.7}>
          <View style={styles.totalCashHeader}>
            <View style={styles.totalCashIconWrap}><Wallet size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.totalCashLabel}>Общая касса</Text>
              <Text style={styles.totalCashValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totalCashData.totalCash)}</Text>
            </View>
            <ChevronRight size={18} color={colors.textTertiary} />
          </View>
          <View style={styles.totalCashBreakdown}>
            <View style={styles.totalCashPart}>
              <ArrowRightLeft size={13} color={colors.warning} />
              <Text style={styles.totalCashPartLabel} numberOfLines={1}>Пред. смена</Text>
              <Text style={[styles.totalCashPartValue, { color: colors.warning }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totalCashData.carryOver)}</Text>
            </View>
            <View style={styles.totalCashDivider} />
            <View style={styles.totalCashPart}>
              <TrendingUp size={13} color={colors.success} />
              <Text style={styles.totalCashPartLabel} numberOfLines={1}>Текущая</Text>
              <Text style={[styles.totalCashPartValue, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totalCashData.netCash)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.statsGrid}>
        {stats.map((stat, i) => (
          <Animated.View key={i} style={{ opacity: fadeAnims[i] ?? 1, transform: [{ translateY: slideAnims[i] ?? 0 }], flex: 1, minWidth: '45%' as unknown as number }}>
            <TouchableOpacity style={styles.statCard} onPress={() => stat.route && router.push(stat.route as never)} activeOpacity={stat.route ? 0.7 : 1}>
              <View style={[styles.statIconWrap, { backgroundColor: stat.color + '15' }]}>
                <stat.icon size={20} color={stat.color} />
              </View>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{stat.label}</Text>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </View>

      {todayStats.adjustmentToday > 0 && (
        <View style={styles.adjustmentCard}>
          <FileEdit size={16} color={colors.adjustment} />
          <Text style={styles.adjustmentLabel}>Корректировки сегодня</Text>
          <Text style={styles.adjustmentValue}>{formatMoney(todayStats.adjustmentToday)}</Text>
        </View>
      )}

      {todayStats.totalDebt > 0 && (
        <TouchableOpacity style={styles.debtSummaryCard} onPress={() => router.push('/debtors-screen')} activeOpacity={0.7}>
          <View style={styles.debtSummaryRow}>
            <Wallet size={18} color={colors.danger} />
            <Text style={styles.debtSummaryLabel}>Общий долг</Text>
          </View>
          <Text style={styles.debtSummaryValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(todayStats.totalDebt)}</Text>
          {todayStats.debtPaymentsToday > 0 && (
            <TouchableOpacity onPress={() => router.push('/debt-payments' as never)}>
              <Text style={styles.debtPaymentsToday} numberOfLines={1}>Погашено сегодня: {formatMoney(todayStats.debtPaymentsToday)} →</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.quickLinks}>
        <Text style={styles.sectionTitle}>Быстрый доступ</Text>
        <View style={styles.quickGrid}>
          {[
            { label: 'Новый клиент', icon: UserPlus, route: '/add-client-modal' },
            { label: 'Касса', icon: Wallet, route: '/cashregister-screen' },
            { label: 'Должники', icon: AlertTriangle, route: '/debtors-screen' },
            { label: 'История', icon: Clock, route: '/history-screen' },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={styles.quickBtn} onPress={() => router.push(item.route as never)}>
              <item.icon size={20} color={colors.primary} />
              <Text style={styles.quickLabel} numberOfLines={1}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {getCurrentViolationMonth && (() => {
        const vm = getCurrentViolationMonth;
        const vColor = vm.status === 'bonus_denied' ? colors.danger : vm.status === 'warning' ? colors.warning : colors.success;
        return (
          <TouchableOpacity style={[styles.violationCard, { borderColor: vColor + '30' }]} onPress={() => router.push('/violations-screen' as never)} activeOpacity={0.7}>
            <Shield size={20} color={vColor} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.violationTitle, { color: vColor }]} numberOfLines={1}>
                {vm.status === 'bonus_denied' ? 'Премия отменена' : vm.status === 'warning' ? 'Есть нарушения' : 'Премия в силе'}
              </Text>
              <View style={styles.violationDots}>
                {[0, 1, 2].map(i => (
                  <View key={i} style={[styles.violationDot, i < vm.violationCount ? { backgroundColor: vColor } : { backgroundColor: colors.surfaceLight }]} />
                ))}
                <Text style={styles.violationCount}>{vm.violationCount}/3</Text>
              </View>
            </View>
            <ChevronRight size={16} color={vColor} />
          </TouchableOpacity>
        );
      })()}

      {getTodayCleaningShift && (
        <Animated.View style={{ transform: [{ scale: cleaningPulse }] }}>
          <TouchableOpacity style={styles.cleaningBannerNew} onPress={() => setShowChecklist(true)} activeOpacity={0.7}>
            <Animated.View style={[styles.cleaningGlowBorder, { borderColor: cleaningGlow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(251, 191, 36, 0.3)', 'rgba(251, 191, 36, 0.7)'] }) }]} />
            <View style={styles.cleaningIconWrap}><Sparkles size={22} color="#FBBF24" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cleaningTitleNew} numberOfLines={1}>{getTodayCleaningShift.cleanupCompleted ? 'Уборка выполнена ✓' : 'Генеральная уборка!'}</Text>
              <Text style={styles.cleaningSubNew} numberOfLines={1}>{getTodayCleaningShift.cleanupCompleted ? 'Сегодня по графику · Завершена' : 'Сегодня по графику · Нажмите для чек-листа'}</Text>
            </View>
            <View style={styles.cleaningArrow}><ChevronRight size={18} color="#FBBF24" /></View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {showChecklist && getTodayCleaningShift && (
        <CleaningChecklist shiftId={getTodayCleaningShift.id} onClose={() => setShowChecklist(false)} />
      )}

      {expiringSubscriptions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Истекают оплаты</Text>
          {expiringSubscriptions.slice(0, 5).map((sub) => {
            const days = daysUntil(sub.paidUntil);
            return (
              <TouchableOpacity key={sub.id} style={styles.expiringCard} onPress={() => router.push({ pathname: '/client-card', params: { clientId: sub.clientId } })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.expiringName} numberOfLines={1}>{sub.client?.name ?? 'Клиент'}</Text>
                  <Text style={styles.expiringPlate} numberOfLines={1}>{sub.car?.plateNumber ?? ''}</Text>
                </View>
                <View style={[styles.expiringBadge, days <= 0 && styles.expiringBadgeUrgent]}>
                  <Text style={[styles.expiringBadgeText, days <= 0 && styles.expiringBadgeTextUrgent]}>{days <= 0 ? 'Сегодня' : `${days} дн.`}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greetingTime: { fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
  greeting: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  role: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  logoutBtn: { padding: 8 },
  shiftBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.warningSurface, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.warning + '30' },
  shiftBannerText: { flex: 1, marginLeft: 12 },
  shiftBannerTitle: { fontSize: 15, fontWeight: '600' as const, color: colors.warning },
  shiftBannerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  shiftActiveCard: { backgroundColor: colors.primarySurface, borderRadius: 10, padding: 12, marginBottom: 16 },
  shiftActiveTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  shiftActiveText: { flex: 1, fontSize: 13, color: colors.primary, fontWeight: '500' as const },
  shiftActiveLink: { fontSize: 13, color: colors.primary, fontWeight: '600' as const },
  shiftProgressTrack: { height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 10, overflow: 'hidden' as const },
  shiftProgressBar: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  shiftProgressLabel: { fontSize: 11, color: colors.textTertiary, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
  statIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  debtSummaryCard: { backgroundColor: colors.dangerSurface, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.danger + '20' },
  debtSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  debtSummaryLabel: { fontSize: 14, color: colors.danger, fontWeight: '500' as const },
  debtSummaryValue: { fontSize: 24, fontWeight: '700' as const, color: colors.danger },
  debtPaymentsToday: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  quickLinks: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600' as const, color: colors.text, marginBottom: 12 },
  quickGrid: { flexDirection: 'row', gap: 10 },
  quickBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 10, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border },
  quickLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' as const, textAlign: 'center' as const },
  section: { marginBottom: 20 },
  expiringCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  expiringName: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  expiringPlate: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  expiringBadge: { backgroundColor: colors.warningSurface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  expiringBadgeUrgent: { backgroundColor: colors.dangerSurface },
  expiringBadgeText: { fontSize: 12, fontWeight: '600' as const, color: colors.warning },
  expiringBadgeTextUrgent: { color: colors.danger },
  violationCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  violationTitle: { fontSize: 14, fontWeight: '600' as const },
  violationDots: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  violationDot: { width: 8, height: 8, borderRadius: 4 },
  violationCount: { fontSize: 11, color: colors.textTertiary, marginLeft: 4 },
  cleaningBannerNew: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: 'rgba(251, 191, 36, 0.12)', borderRadius: 16, padding: 16, marginBottom: 16, overflow: 'hidden' as const, position: 'relative' as const },
  cleaningGlowBorder: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 2 },
  cleaningIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(251, 191, 36, 0.2)', alignItems: 'center' as const, justifyContent: 'center' as const },
  cleaningTitleNew: { fontSize: 16, fontWeight: '700' as const, color: '#FBBF24', letterSpacing: -0.3 },
  cleaningSubNew: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  cleaningArrow: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(251, 191, 36, 0.15)', alignItems: 'center' as const, justifyContent: 'center' as const },
  searchContainer: { marginBottom: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  searchBarFocused: { borderColor: colors.primary + '60' },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },
  searchResults: { backgroundColor: colors.surface, borderRadius: 12, marginTop: 6, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' as const },
  searchEmpty: { fontSize: 13, color: colors.textTertiary, textAlign: 'center' as const, paddingVertical: 12 },
  searchAddClient: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  searchAddClientText: { fontSize: 14, fontWeight: '600' as const, color: colors.primary },
  searchItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchName: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  searchMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  totalCashCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.primary + '25' },
  totalCashHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginBottom: 12 },
  totalCashIconWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
  totalCashLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' as const },
  totalCashValue: { fontSize: 24, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
  totalCashBreakdown: { flexDirection: 'row' as const, backgroundColor: colors.surfaceLight, borderRadius: 10, overflow: 'hidden' as const },
  totalCashPart: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingVertical: 10, paddingHorizontal: 12 },
  totalCashDivider: { width: 1, backgroundColor: colors.border, marginVertical: 6 },
  totalCashPartLabel: { fontSize: 11, color: colors.textTertiary, flex: 1 },
  totalCashPartValue: { fontSize: 13, fontWeight: '700' as const },
  adjustmentCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.adjustment + '20' },
  adjustmentLabel: { flex: 1, fontSize: 13, color: colors.textSecondary },
  adjustmentValue: { fontSize: 14, fontWeight: '700' as const, color: colors.adjustment },
  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  syncText: { fontSize: 11, fontWeight: '600' as const },
  globalSearchBtn: { backgroundColor: colors.primarySurface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  globalSearchText: { fontSize: 11, fontWeight: '600' as const, color: colors.primary },
});
