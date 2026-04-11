import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import {
  Banknote, CreditCard, TrendingUp, Car, AlertTriangle, Clock, Users, ParkingSquare,
} from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatDateTime, formatDate, daysUntil, getServiceTypeLabel } from '@/utils/helpers';
import BarChart from '@/components/BarChart';

type Tab = 'revenue' | 'shifts' | 'auto' | 'operators' | 'debts' | 'expiring' | 'occupancy';
type Period = 'day' | 'week' | 'halfmonth' | 'month' | 'quarter' | 'year' | 'all';

export default function ReportsScreen() {
  const router = useRouter();
  const colors = useColors();
  const {
    transactions, expenses, shifts, sessions, payments,
    activeCars, activeClients, debtors, expiringSubscriptions,
    dailyOccupancySnapshots,
  } = useParking();

  const [tab, setTab] = useState<Tab>('revenue');
  const [period, setPeriod] = useState<Period>('month');
  const styles = useMemo(() => createStyles(colors), [colors]);

  const periodFilter = useCallback((dateStr: string) => {
    const now = new Date();
    const d = new Date(dateStr);
    switch (period) {
      case 'day': return d.toDateString() === now.toDateString();
      case 'week': return d.getTime() > now.getTime() - 7 * 86400000;
      case 'halfmonth': return d.getTime() > now.getTime() - 15 * 86400000;
      case 'month': return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      case 'quarter': return d.getTime() > now.getTime() - 90 * 86400000;
      case 'year': return d.getFullYear() === now.getFullYear();
      default: return true;
    }
  }, [period]);

  const revenueByDay = useMemo(() => {
    const days = new Map<string, { cash: number; card: number; total: number }>(); 
    const now = new Date();
    let daysCount = 7;
    if (period === 'month') daysCount = 30;
    else if (period === 'quarter') daysCount = 90;
    else if (period === 'halfmonth') daysCount = 15;
    else if (period === 'week') daysCount = 7;
    else if (period === 'day') daysCount = 1;
    else if (period === 'year') daysCount = 12;
    else daysCount = 30;

    if (period === 'year') {
      for (let i = 0; i < 12; i++) {
        const monthKey = `${String(i + 1).padStart(2, '0')}`;
        days.set(monthKey, { cash: 0, card: 0, total: 0 });
      }
      transactions.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() === now.getFullYear() && ['payment', 'debt_payment'].includes(t.type);
      }).forEach(t => {
        const d = new Date(t.date);
        const key = `${String(d.getMonth() + 1).padStart(2, '0')}`;
        const existing = days.get(key) ?? { cash: 0, card: 0, total: 0 };
        if (t.method === 'cash') existing.cash += t.amount;
        else if (t.method === 'card') existing.card += t.amount;
        existing.total += t.amount;
        days.set(key, existing);
      });
    } else {
      const actualDays = Math.min(daysCount, 14);
      for (let i = actualDays - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${d.getDate()}.${d.getMonth() + 1}`;
        days.set(key, { cash: 0, card: 0, total: 0 });
      }
      transactions.filter(t => {
        const d = new Date(t.date);
        const diff = (now.getTime() - d.getTime()) / 86400000;
        return diff <= actualDays && ['payment', 'debt_payment'].includes(t.type);
      }).forEach(t => {
        const d = new Date(t.date);
        const key = `${d.getDate()}.${d.getMonth() + 1}`;
        const existing = days.get(key);
        if (!existing) return;
        if (t.method === 'cash') existing.cash += t.amount;
        else if (t.method === 'card') existing.card += t.amount;
        existing.total += t.amount;
      });
    }
    return Array.from(days.entries()).map(([label, data]) => ({ label, ...data }));
  }, [transactions, period]);

  const shiftRevenueList = useMemo(() => {
    const closedShifts = shifts.filter(s => s.status === 'closed' && s.closingSummary && s.closedAt && periodFilter(s.closedAt));
    const list = closedShifts
      .sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime())
      .map(s => {
        const ci = s.closingSummary?.cashIncome ?? 0;
        const cdi = s.closingSummary?.cardIncome ?? 0;
        const shiftSess = sessions.filter(sess => sess.shiftId === s.id);
        return { id: s.id, operator: s.operatorName, openedAt: s.openedAt, closedAt: s.closedAt!, cash: ci, card: cdi, total: ci + cdi, cars: shiftSess.length, expenses: s.closingSummary?.totalExpenses ?? 0 };
      });
    const totalRev = list.reduce((s, d) => s + d.total, 0);
    const totalCars = list.reduce((s, d) => s + d.cars, 0);
    return { list, totalRev, totalCars, count: list.length };
  }, [shifts, sessions, periodFilter]);

  const carsPerPeriod = useMemo(() => {
    const now = new Date();
    const currentOnParking = sessions.filter(s => ['active', 'active_debt'].includes(s.status) && !s.cancelled && !s.exitTime).length;
    const openShift = shifts.find(s => s.status === 'open');
    const perShift = openShift ? sessions.filter(s => s.shiftId === openShift.id).length : 0;
    const perHalfMonth = sessions.filter(s => new Date(s.entryTime).getTime() > now.getTime() - 15 * 86400000).length;
    const perMonth = sessions.filter(s => { const d = new Date(s.entryTime); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
    return { currentOnParking, perShift, perHalfMonth, perMonth };
  }, [sessions, shifts]);

  const occupancyByDay = useMemo(() => {
    const now = new Date();
    const days = new Map<string, number>();
    const daysCount = period === 'year' ? 12 : Math.min(period === 'month' ? 30 : period === 'halfmonth' ? 15 : period === 'quarter' ? 90 : 14, 14);

    if (period === 'year') {
      for (let i = 0; i < 12; i++) {
        days.set(`${String(i + 1).padStart(2, '0')}`, 0);
      }
      sessions.filter(s => {
        const d = new Date(s.entryTime);
        return d.getFullYear() === now.getFullYear();
      }).forEach(s => {
        const d = new Date(s.entryTime);
        const key = `${String(d.getMonth() + 1).padStart(2, '0')}`;
        days.set(key, (days.get(key) ?? 0) + 1);
      });
    } else {
      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${d.getDate()}.${d.getMonth() + 1}`;
        days.set(key, 0);
      }
      sessions.forEach(s => {
        const d = new Date(s.entryTime);
        const key = `${d.getDate()}.${d.getMonth() + 1}`;
        if (days.has(key)) {
          days.set(key, (days.get(key) ?? 0) + 1);
        }
      });
    }
    return Array.from(days.entries()).map(([label, count]) => ({ label, value: count }));
  }, [sessions, period]);

  const revenueStats = useMemo(() => {
    const filtered = transactions.filter(t => periodFilter(t.date));
    const payments = filtered.filter(t => ['payment', 'debt_payment'].includes(t.type));
    const cancels = filtered.filter(t => t.type === 'cancel_payment');
    const refunds = filtered.filter(t => t.type === 'refund');

    const cash = payments.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0);
    const card = payments.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0);
    const adjustment = payments.filter(t => t.method === 'adjustment').reduce((s, t) => s + t.amount, 0);
    const cancelTotal = cancels.reduce((s, t) => s + t.amount, 0);
    const refundTotal = refunds.reduce((s, t) => s + t.amount, 0);
    const total = cash + card + adjustment;

    const periodExp = expenses.filter(e => periodFilter(e.date)).reduce((s, e) => s + e.amount, 0);

    const expByCategory = new Map<string, { amount: number; count: number }>();
    expenses.filter(e => periodFilter(e.date)).forEach(e => {
      const cat = e.category || 'Прочее';
      const existing = expByCategory.get(cat) ?? { amount: 0, count: 0 };
      existing.amount += e.amount;
      existing.count += 1;
      expByCategory.set(cat, existing);
    });

    return { cash, card, adjustment, total, cancelTotal, refundTotal, expenses: periodExp, net: total - periodExp - cancelTotal - refundTotal, expByCategory: Array.from(expByCategory.entries()) };
  }, [transactions, expenses, periodFilter]);

  const shiftStats = useMemo(() => {
    const filtered = shifts.filter(s => s.closedAt ? periodFilter(s.closedAt) : periodFilter(s.openedAt));
    const closed = filtered.filter(s => s.status === 'closed');
    const open = filtered.filter(s => s.status === 'open');
    const totalCash = closed.reduce((s, sh) => s + (sh.closingSummary?.cashIncome ?? 0), 0);
    const totalCard = closed.reduce((s, sh) => s + (sh.closingSummary?.cardIncome ?? 0), 0);
    const totalExp = closed.reduce((s, sh) => s + (sh.closingSummary?.totalExpenses ?? 0), 0);
    const totalWith = closed.reduce((s, sh) => s + (sh.closingSummary?.totalWithdrawals ?? 0), 0);
    return { closed: closed.length, open: open.length, totalCash, totalCard, totalExp, totalWith, shifts: closed };
  }, [shifts, periodFilter]);

  const autoStats = useMemo(() => {
    const filtered = sessions.filter(s => periodFilter(s.entryTime));
    const unique = new Set(filtered.map(s => s.carId));
    const monthly = filtered.filter(s => s.serviceType === 'monthly').length;
    const onetime = filtered.filter(s => s.serviceType === 'onetime').length;

    const carCounts = new Map<string, number>();
    filtered.forEach(s => carCounts.set(s.carId, (carCounts.get(s.carId) ?? 0) + 1));
    const topCars = Array.from(carCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([carId, count]) => {
        const car = activeCars.find(c => c.id === carId);
        const client = car ? activeClients.find(c => c.id === car.clientId) : null;
        return { carId, count, plate: car?.plateNumber ?? '???', client: client?.name ?? '' };
      });

    return { total: filtered.length, unique: unique.size, monthly, onetime, topCars };
  }, [sessions, activeCars, activeClients, periodFilter]);

  const operatorStats = useMemo(() => {
    const filtered = sessions.filter(s => periodFilter(s.entryTime));
    const filteredPayments = payments.filter(p => !p.cancelled && periodFilter(p.date));

    const opMap = new Map<string, {
      id: string;
      name: string;
      checkins: number;
      checkouts: number;
      cashCollected: number;
      cardCollected: number;
      totalCollected: number;
      monthly: number;
      onetime: number;
      lombard: number;
    }>();

    const getOp = (id: string, name: string) => {
      if (!opMap.has(id)) {
        opMap.set(id, {
          id, name, checkins: 0, checkouts: 0,
          cashCollected: 0, cardCollected: 0, totalCollected: 0,
          monthly: 0, onetime: 0, lombard: 0,
        });
      }
      return opMap.get(id)!;
    };

    filtered.forEach(s => {
      const op = getOp(s.managerId, s.managerName);
      op.checkins += 1;
      if (s.serviceType === 'monthly') op.monthly += 1;
      else if (s.serviceType === 'onetime') op.onetime += 1;
      else if (s.serviceType === 'lombard') op.lombard += 1;
    });

    const filteredExitTx = transactions.filter(t => t.type === 'exit' && periodFilter(t.date));
    filteredExitTx.forEach(t => {
      const op = getOp(t.operatorId, t.operatorName);
      op.checkouts += 1;
    });

    filteredPayments.forEach(p => {
      const op = getOp(p.operatorId, p.operatorName);
      if (p.method === 'cash') op.cashCollected += p.amount;
      else if (p.method === 'card') op.cardCollected += p.amount;
      op.totalCollected += p.amount;
    });

    return Array.from(opMap.values()).sort((a, b) => b.checkins - a.checkins);
  }, [sessions, transactions, payments, periodFilter]);

  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);

  const occupancySnapshots = useMemo(() => {
    return [...dailyOccupancySnapshots].sort((a, b) => b.date.localeCompare(a.date));
  }, [dailyOccupancySnapshots]);

  const occupancyChartData = useMemo(() => {
    const last14 = [...dailyOccupancySnapshots]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
    return last14.map(s => {
      const d = new Date(s.date);
      return {
        label: `${d.getDate()}.${d.getMonth() + 1}`,
        value: s.totalCars,
        color: colors.info,
      };
    });
  }, [dailyOccupancySnapshots, colors.info]);

  const avgOccupancy = useMemo(() => {
    if (occupancySnapshots.length === 0) return 0;
    const total = occupancySnapshots.reduce((s, snap) => s + snap.totalCars, 0);
    return Math.round(total / occupancySnapshots.length * 10) / 10;
  }, [occupancySnapshots]);

  const maxOccupancy = useMemo(() => {
    if (occupancySnapshots.length === 0) return 0;
    return Math.max(...occupancySnapshots.map(s => s.totalCars));
  }, [occupancySnapshots]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'revenue', label: 'Выручка' },
    { key: 'shifts', label: 'Смены' },
    { key: 'auto', label: 'Авто' },
    { key: 'operators', label: 'Операторы' },
    { key: 'occupancy', label: '04:00' },
    { key: 'debts', label: 'Долги' },
    { key: 'expiring', label: 'Истекают' },
  ];

  const periods: { key: Period; label: string }[] = [
    { key: 'day', label: 'День' },
    { key: 'week', label: 'Неделя' },
    { key: 'halfmonth', label: '15 дн.' },
    { key: 'month', label: 'Месяц' },
    { key: 'quarter', label: 'Квартал' },
    { key: 'year', label: 'Год' },
    { key: 'all', label: 'Всё' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {['revenue', 'shifts', 'auto', 'operators'].includes(tab) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodBar} contentContainerStyle={styles.periodBarContent}>
          {periods.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'revenue' && (
          <>
            {revenueByDay.length > 1 && (
              <BarChart
                title="Выручка по дням"
                data={revenueByDay.map(d => ({ label: d.label, value: d.total, color: colors.primary }))}
                formatValue={(v) => v >= 1000 ? `${Math.round(v / 1000)}к` : String(v)}
              />
            )}

            <View style={styles.totalCard}>
              <TrendingUp size={24} color={colors.primary} />
              <Text style={styles.totalLabel}>Общая выручка</Text>
              <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(revenueStats.total)}</Text>
            </View>

            <View style={styles.splitRow}>
              <View style={[styles.splitCard, { borderLeftColor: colors.cash }]}>
                <Banknote size={16} color={colors.cash} />
                <Text style={styles.splitLabel} numberOfLines={1}>Наличные</Text>
                <Text style={styles.splitValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(revenueStats.cash)}</Text>
              </View>
              <View style={[styles.splitCard, { borderLeftColor: colors.card }]}>
                <CreditCard size={16} color={colors.card} />
                <Text style={styles.splitLabel} numberOfLines={1}>Безнал</Text>
                <Text style={styles.splitValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(revenueStats.card)}</Text>
              </View>
            </View>

            {revenueStats.adjustment > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Корректировки</Text>
                <Text style={styles.infoValue}>{formatMoney(revenueStats.adjustment)}</Text>
              </View>
            )}
            {revenueStats.cancelTotal > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Отмены</Text>
                <Text style={[styles.infoValue, { color: colors.danger }]}>-{formatMoney(revenueStats.cancelTotal)}</Text>
              </View>
            )}
            {revenueStats.refundTotal > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Возвраты</Text>
                <Text style={[styles.infoValue, { color: colors.warning }]}>-{formatMoney(revenueStats.refundTotal)}</Text>
              </View>
            )}

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Расходы</Text>
                <Text style={[styles.summaryValue, { color: colors.danger }]}>-{formatMoney(revenueStats.expenses)}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Чистая выручка</Text>
                <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatMoney(revenueStats.net)}</Text>
              </View>
            </View>

            {revenueStats.expByCategory.length > 0 && (
              <View style={styles.categorySection}>
                <Text style={styles.sectionTitle}>Расходы по категориям</Text>
                {revenueStats.expByCategory.map(([cat, data]) => (
                  <View key={cat} style={styles.categoryRow}>
                    <Text style={styles.categoryName}>{cat}</Text>
                    <Text style={styles.categoryCount}>{data.count} оп.</Text>
                    <Text style={styles.categoryAmount}>{formatMoney(data.amount)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {tab === 'shifts' && (
          <>
            <View style={styles.carsPerPeriodCard}>
              <Text style={styles.carsPerPeriodTitle}>Авто за период</Text>
              <View style={styles.carsPerPeriodGrid}>
                <View style={styles.carsPerPeriodItem}>
                  <Text style={styles.carsPerPeriodValue}>{carsPerPeriod.currentOnParking}</Text>
                  <Text style={styles.carsPerPeriodLabel}>Сейчас</Text>
                </View>
                <View style={styles.carsPerPeriodItem}>
                  <Text style={styles.carsPerPeriodValue}>{carsPerPeriod.perShift}</Text>
                  <Text style={styles.carsPerPeriodLabel}>За смену</Text>
                </View>
                <View style={styles.carsPerPeriodItem}>
                  <Text style={styles.carsPerPeriodValue}>{carsPerPeriod.perHalfMonth}</Text>
                  <Text style={styles.carsPerPeriodLabel}>15 дней</Text>
                </View>
                <View style={styles.carsPerPeriodItem}>
                  <Text style={styles.carsPerPeriodValue}>{carsPerPeriod.perMonth}</Text>
                  <Text style={styles.carsPerPeriodLabel}>Месяц</Text>
                </View>
              </View>
            </View>

            {shiftRevenueList.count > 0 && (
              <View style={styles.shiftRevSummaryCard}>
                <Text style={styles.shiftRevSummaryTitle}>Выручка по сменам</Text>
                <View style={styles.shiftRevSummaryRow}>
                  <Text style={styles.shiftRevSummaryLabel}>Всего за {shiftRevenueList.count} смен:</Text>
                  <Text style={styles.shiftRevSummaryVal}>{formatMoney(shiftRevenueList.totalRev)}</Text>
                </View>
                <View style={styles.shiftRevSummaryRow}>
                  <Text style={styles.shiftRevSummaryLabel}>Заездов:</Text>
                  <Text style={styles.shiftRevSummaryVal}>{shiftRevenueList.totalCars}</Text>
                </View>
                {shiftRevenueList.count > 0 && (
                  <View style={styles.shiftRevSummaryRow}>
                    <Text style={styles.shiftRevSummaryLabel}>Средняя за смену:</Text>
                    <Text style={[styles.shiftRevSummaryVal, { color: colors.primary }]}>
                      {formatMoney(Math.round(shiftRevenueList.totalRev / shiftRevenueList.count))}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.shiftSummary}>
              <Text style={styles.shiftSummaryText} numberOfLines={1}>Закрыто: {shiftStats.closed} · Открыто: {shiftStats.open}</Text>
              <View style={styles.shiftTotals}>
                <Text style={styles.shiftTotal}>Нал: {formatMoney(shiftStats.totalCash)}</Text>
                <Text style={styles.shiftTotal}>Безнал: {formatMoney(shiftStats.totalCard)}</Text>
                <Text style={styles.shiftTotal}>Расходы: {formatMoney(shiftStats.totalExp)}</Text>
              </View>
            </View>
            {shiftStats.shifts.sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime()).map(shift => (
              <View key={shift.id} style={styles.shiftCard}>
                <View style={styles.shiftHeader}>
                  <Text style={styles.shiftOperator} numberOfLines={1}>{shift.operatorName}</Text>
                  <Text style={styles.shiftDate} numberOfLines={1}>{formatDateTime(shift.openedAt)}</Text>
                </View>
                {shift.closingSummary && (
                  <View style={styles.shiftDetails}>
                    <Text style={styles.shiftDetail} numberOfLines={1}>Нал: {formatMoney(shift.closingSummary.cashIncome)} · Безнал: {formatMoney(shift.closingSummary.cardIncome)}</Text>
                    <Text style={styles.shiftDetail} numberOfLines={1}>Расходы: {formatMoney(shift.closingSummary.totalExpenses)} · Снятия: {formatMoney(shift.closingSummary.totalWithdrawals)}</Text>
                    <Text style={styles.shiftDetail} numberOfLines={1}>Расчёт: {formatMoney(shift.closingSummary.calculatedBalance)} · Факт: {formatMoney(shift.actualCash)}</Text>
                    {shift.cashVarianceType !== 'none' && (
                      <Text style={[styles.shiftDetail, { color: colors.danger, fontWeight: '600' as const }]}>
                        {shift.cashVarianceType === 'short' ? 'Недостача' : 'Излишек'}: {formatMoney(shift.cashVariance)}
                      </Text>
                    )}
                  </View>
                )}
                {shift.note ? <Text style={styles.shiftNote}>{shift.note}</Text> : null}
              </View>
            ))}
            {shiftStats.shifts.length === 0 && <Text style={styles.emptyText}>Нет смен за период</Text>}
          </>
        )}

        {tab === 'auto' && (
          <>
            {occupancyByDay.length > 1 && (
              <BarChart
                title="Загруженность по дням"
                data={occupancyByDay.map(d => ({ ...d, color: colors.info }))}
                formatValue={(v) => String(v)}
              />
            )}

            <View style={styles.autoSummary}>
              <View style={styles.autoStat}>
                <Car size={18} color={colors.primary} />
                <Text style={styles.autoStatLabel}>Всего заездов</Text>
                <Text style={styles.autoStatValue}>{autoStats.total}</Text>
              </View>
              <View style={styles.autoStat}>
                <Text style={styles.autoStatLabel}>Уникальных авто</Text>
                <Text style={styles.autoStatValue}>{autoStats.unique}</Text>
              </View>
              <View style={styles.autoStatRow}>
                <View style={styles.autoStatSmall}>
                  <Text style={styles.autoStatSmallLabel}>Месячных</Text>
                  <Text style={styles.autoStatSmallValue}>{autoStats.monthly}</Text>
                </View>
                <View style={styles.autoStatSmall}>
                  <Text style={styles.autoStatSmallLabel}>Разовых</Text>
                  <Text style={styles.autoStatSmallValue}>{autoStats.onetime}</Text>
                </View>
              </View>
            </View>

            {autoStats.topCars.length > 0 && (
              <View style={styles.topSection}>
                <Text style={styles.sectionTitle}>Топ-10 авто по заездам</Text>
                {autoStats.topCars.map((car, idx) => (
                  <View key={car.carId} style={styles.topCarRow}>
                    <Text style={styles.topCarRank}>#{idx + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.topCarPlate}>{car.plate}</Text>
                      <Text style={styles.topCarClient}>{car.client}</Text>
                    </View>
                    <Text style={styles.topCarCount}>{car.count}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {tab === 'operators' && (
          <>
            <View style={styles.operatorSummary}>
              <Users size={22} color={colors.primary} />
              <Text style={styles.operatorSummaryText} numberOfLines={1}>
                Операторов за период: {operatorStats.length}
              </Text>
              <Text style={styles.operatorSummaryTotal} numberOfLines={1} adjustsFontSizeToFit>
                Всего заездов: {operatorStats.reduce((s, o) => s + o.checkins, 0)}
              </Text>
            </View>

            {operatorStats.map((op, idx) => (
              <View key={op.id} style={styles.operatorCard}>
                <View style={styles.operatorHeader}>
                  <View style={styles.operatorAvatar}>
                    <Text style={styles.operatorAvatarText}>{op.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.operatorName} numberOfLines={1}>{op.name}</Text>
                    <Text style={styles.operatorRank} numberOfLines={1}>#{idx + 1} по заездам</Text>
                  </View>
                  <View style={styles.operatorBadge}>
                    <Text style={styles.operatorBadgeText}>{op.checkins}</Text>
                    <Text style={styles.operatorBadgeLabel}>заездов</Text>
                  </View>
                </View>

                <View style={styles.operatorStats}>
                  <View style={styles.operatorStatItem}>
                    <Text style={styles.operatorStatValue}>{op.checkouts}</Text>
                    <Text style={styles.operatorStatLabel}>выездов</Text>
                  </View>
                  <View style={styles.operatorStatDivider} />
                  <View style={styles.operatorStatItem}>
                    <Text style={styles.operatorStatValue}>{op.onetime}</Text>
                    <Text style={styles.operatorStatLabel}>разовых</Text>
                  </View>
                  <View style={styles.operatorStatDivider} />
                  <View style={styles.operatorStatItem}>
                    <Text style={styles.operatorStatValue}>{op.monthly}</Text>
                    <Text style={styles.operatorStatLabel}>месячных</Text>
                  </View>
                  <View style={styles.operatorStatDivider} />
                  <View style={styles.operatorStatItem}>
                    <Text style={styles.operatorStatValue}>{op.lombard}</Text>
                    <Text style={styles.operatorStatLabel}>ломбард</Text>
                  </View>
                </View>

                <View style={styles.operatorMoney}>
                  <View style={styles.operatorMoneyRow}>
                    <Banknote size={14} color={colors.cash} />
                    <Text style={styles.operatorMoneyLabel} numberOfLines={1}>Наличные</Text>
                    <Text style={styles.operatorMoneyValue} numberOfLines={1}>{formatMoney(op.cashCollected)}</Text>
                  </View>
                  <View style={styles.operatorMoneyRow}>
                    <CreditCard size={14} color={colors.card} />
                    <Text style={styles.operatorMoneyLabel} numberOfLines={1}>Безнал</Text>
                    <Text style={styles.operatorMoneyValue} numberOfLines={1}>{formatMoney(op.cardCollected)}</Text>
                  </View>
                  <View style={[styles.operatorMoneyRow, styles.operatorMoneyTotal]}>
                    <TrendingUp size={14} color={colors.primary} />
                    <Text style={[styles.operatorMoneyLabel, { fontWeight: '600' as const }]} numberOfLines={1}>Итого</Text>
                    <Text style={[styles.operatorMoneyValue, { color: colors.primary }]} numberOfLines={1}>{formatMoney(op.totalCollected)}</Text>
                  </View>
                </View>
              </View>
            ))}
            {operatorStats.length === 0 && <Text style={styles.emptyText}>Нет данных за период</Text>}
          </>
        )}

        {tab === 'occupancy' && (
          <>
            <View style={styles.occupancyHeader}>
              <ParkingSquare size={22} color={colors.info} />
              <View style={{ flex: 1 }}>
                <Text style={styles.occupancyTitle}>Фактическая загрузка (04:00)</Text>
                <Text style={styles.occupancySubtitle}>Снимок всех авто на парковке в 04:00</Text>
              </View>
            </View>

            {occupancyChartData.length > 1 && (
              <BarChart
                title="Авто на парковке (04:00)"
                data={occupancyChartData}
                formatValue={(v) => String(v)}
              />
            )}

            <View style={styles.occupancyStatsRow}>
              <View style={styles.occupancyStatCard}>
                <Text style={styles.occupancyStatValue}>{occupancySnapshots.length}</Text>
                <Text style={styles.occupancyStatLabel}>дней</Text>
              </View>
              <View style={styles.occupancyStatCard}>
                <Text style={styles.occupancyStatValue}>{avgOccupancy}</Text>
                <Text style={styles.occupancyStatLabel}>среднее</Text>
              </View>
              <View style={styles.occupancyStatCard}>
                <Text style={styles.occupancyStatValue}>{maxOccupancy}</Text>
                <Text style={styles.occupancyStatLabel}>макс.</Text>
              </View>
            </View>

            {occupancySnapshots.map(snap => {
              const isExpanded = expandedSnapshotId === snap.id;
              return (
                <TouchableOpacity
                  key={snap.id}
                  style={styles.snapshotCard}
                  onPress={() => setExpandedSnapshotId(isExpanded ? null : snap.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.snapshotHeader}>
                    <View style={styles.snapshotDateBlock}>
                      <Text style={styles.snapshotDate}>{formatDate(snap.date)}</Text>
                      <Text style={styles.snapshotTime}>04:00</Text>
                    </View>
                    <View style={styles.snapshotCountBadge}>
                      <Car size={14} color={colors.white} />
                      <Text style={styles.snapshotCountText}>{snap.totalCars}</Text>
                    </View>
                  </View>

                  {isExpanded && snap.cars.length > 0 && (
                    <View style={styles.snapshotCarsContainer}>
                      <View style={styles.snapshotDivider} />
                      {snap.cars
                        .sort((a, b) => b.daysParked - a.daysParked)
                        .map((car, idx) => (
                        <View key={`${car.carId}-${idx}`} style={styles.snapshotCarRow}>
                          <View style={styles.snapshotCarInfo}>
                            <Text style={styles.snapshotCarPlate}>{car.plateNumber}</Text>
                            <Text style={styles.snapshotCarClient} numberOfLines={1}>{car.clientName}</Text>
                          </View>
                          <View style={styles.snapshotCarMeta}>
                            <Text style={styles.snapshotCarType}>{getServiceTypeLabel(car.serviceType)}</Text>
                            <Text style={styles.snapshotCarDays}>{car.daysParked} сут.</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {isExpanded && snap.cars.length === 0 && (
                    <View style={styles.snapshotCarsContainer}>
                      <View style={styles.snapshotDivider} />
                      <Text style={styles.snapshotEmpty}>Парковка была пуста</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            {occupancySnapshots.length === 0 && (
              <Text style={styles.emptyText}>Нет данных. Отчёт формируется ежедневно в 04:00</Text>
            )}
          </>
        )}

        {tab === 'debts' && (
          <>
            <View style={styles.debtSummary}>
              <AlertTriangle size={24} color={colors.danger} />
              <Text style={styles.debtSummaryLabel}>Должников: {debtors.length}</Text>
              <Text style={styles.debtSummaryValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(debtors.reduce((s, d) => s + d.amount, 0))}
              </Text>
            </View>
            {debtors.sort((a, b) => b.amount - a.amount).map(d => {
              const cars = activeCars.filter(c => c.clientId === d.clientId);
              return (
                <TouchableOpacity
                  key={d.clientId}
                  style={styles.debtorRow}
                  onPress={() => router.push({ pathname: '/client-card', params: { clientId: d.clientId } })}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.debtorName} numberOfLines={1}>{d.client?.name ?? 'Неизвестный'}</Text>
                    <Text style={styles.debtorCars} numberOfLines={1}>{cars.map(c => c.plateNumber).join(', ')}</Text>
                  </View>
                  <Text style={styles.debtorAmount}>{formatMoney(d.amount)}</Text>
                </TouchableOpacity>
              );
            })}
            {debtors.length === 0 && <Text style={styles.emptyText}>Должников нет</Text>}
          </>
        )}

        {tab === 'expiring' && (
          <>
            <View style={styles.expiringHeader}>
              <Clock size={20} color={colors.warning} />
              <Text style={styles.expiringHeaderText}>Подписки, истекающие в ближайшие 3 дня</Text>
            </View>
            {expiringSubscriptions.map(sub => {
              const days = daysUntil(sub.paidUntil);
              return (
                <TouchableOpacity
                  key={sub.id}
                  style={styles.expiringRow}
                  onPress={() => router.push({ pathname: '/client-card', params: { clientId: sub.clientId } })}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expiringName} numberOfLines={1}>{sub.client?.name ?? 'Клиент'}</Text>
                    <Text style={styles.expiringPlate} numberOfLines={1}>{sub.car?.plateNumber ?? ''}</Text>
                    <Text style={styles.expiringDate} numberOfLines={1}>до {formatDate(sub.paidUntil)}</Text>
                  </View>
                  <View style={[styles.expiringBadge, days <= 0 && styles.expiringBadgeUrgent]}>
                    <Text style={[styles.expiringBadgeText, days <= 0 && styles.expiringBadgeTextUrgent]}>
                      {days <= 0 ? 'Сегодня' : `${days} дн.`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {expiringSubscriptions.length === 0 && <Text style={styles.emptyText}>Нет истекающих подписок</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBar: { maxHeight: 50, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBarContent: { paddingHorizontal: 12, alignItems: 'center', gap: 4 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  tabBtnActive: { backgroundColor: colors.primarySurface },
  tabText: { fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary },
  tabTextActive: { color: colors.primary, fontWeight: '600' as const },
  periodBar: { maxHeight: 44 },
  periodBarContent: { paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', gap: 4 },
  periodBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  periodBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodText: { fontSize: 12, fontWeight: '500' as const, color: colors.textSecondary },
  periodTextActive: { color: colors.white },
  content: { padding: 16, paddingBottom: 40 },
  totalCard: {
    backgroundColor: colors.primarySurface, borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.primary + '20',
  },
  totalLabel: { fontSize: 14, color: colors.textSecondary, marginTop: 8 },
  totalValue: { fontSize: 36, fontWeight: '800' as const, color: colors.primary, marginTop: 4 },
  splitRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  splitCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, gap: 4,
  },
  splitLabel: { fontSize: 12, color: colors.textSecondary },
  splitValue: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: 8, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  infoLabel: { fontSize: 13, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  summaryCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginTop: 8, borderWidth: 1, borderColor: colors.border,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  summaryLabel: { fontSize: 15, color: colors.textSecondary },
  summaryValue: { fontSize: 16, fontWeight: '700' as const },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  categorySection: { marginTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '600' as const, color: colors.text, marginBottom: 10 },
  categoryRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 8, padding: 10,
    marginBottom: 4, borderWidth: 1, borderColor: colors.border,
  },
  categoryName: { flex: 1, fontSize: 13, color: colors.text, flexShrink: 1 },
  categoryCount: { fontSize: 12, color: colors.textTertiary, marginRight: 10, flexShrink: 0 },
  categoryAmount: { fontSize: 13, fontWeight: '600' as const, color: colors.danger, flexShrink: 0 },
  shiftSummary: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: colors.border,
  },
  shiftSummaryText: { fontSize: 14, fontWeight: '600' as const, color: colors.text, marginBottom: 8 },
  shiftTotals: { gap: 2 },
  shiftTotal: { fontSize: 13, color: colors.textSecondary },
  shiftCard: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  shiftHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  shiftOperator: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  shiftDate: { fontSize: 12, color: colors.textTertiary },
  shiftDetails: { gap: 3 },
  shiftDetail: { fontSize: 12, color: colors.textSecondary },
  shiftNote: { fontSize: 11, color: colors.textTertiary, marginTop: 6, fontStyle: 'italic' as const },
  autoSummary: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: colors.border, gap: 10,
  },
  autoStat: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  autoStatLabel: { flex: 1, fontSize: 13, color: colors.textSecondary },
  autoStatValue: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  autoStatRow: { flexDirection: 'row', gap: 10 },
  autoStatSmall: {
    flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 8, padding: 10, alignItems: 'center',
  },
  autoStatSmallLabel: { fontSize: 11, color: colors.textTertiary },
  autoStatSmallValue: { fontSize: 16, fontWeight: '700' as const, color: colors.text, marginTop: 2 },
  topSection: { marginTop: 4 },
  topCarRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 8, padding: 10,
    marginBottom: 4, borderWidth: 1, borderColor: colors.border, gap: 10,
  },
  topCarRank: { fontSize: 13, fontWeight: '700' as const, color: colors.textTertiary, width: 28 },
  topCarPlate: { fontSize: 14, fontWeight: '700' as const, color: colors.text },
  topCarClient: { fontSize: 12, color: colors.textSecondary },
  topCarCount: { fontSize: 16, fontWeight: '700' as const, color: colors.primary },
  debtSummary: {
    backgroundColor: colors.dangerSurface, borderRadius: 16, padding: 20,
    alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.danger + '20', gap: 6,
  },
  debtSummaryLabel: { fontSize: 14, color: colors.textSecondary },
  debtSummaryValue: { fontSize: 28, fontWeight: '800' as const, color: colors.danger },
  debtorRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  debtorName: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  debtorCars: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  debtorAmount: { fontSize: 15, fontWeight: '700' as const, color: colors.danger },
  expiringHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 16,
  },
  expiringHeaderText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
  expiringRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  expiringName: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  expiringPlate: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  expiringDate: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  expiringBadge: {
    backgroundColor: colors.warningSurface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  expiringBadgeUrgent: { backgroundColor: colors.dangerSurface },
  expiringBadgeText: { fontSize: 12, fontWeight: '600' as const, color: colors.warning },
  expiringBadgeTextUrgent: { color: colors.danger },
  emptyText: { fontSize: 14, color: colors.textTertiary, textAlign: 'center' as const, paddingTop: 30 },
  operatorSummary: {
    backgroundColor: colors.primarySurface, borderRadius: 16, padding: 20,
    alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.primary + '20', gap: 4,
  },
  operatorSummaryText: { fontSize: 14, color: colors.textSecondary, marginTop: 6 },
  operatorSummaryTotal: { fontSize: 24, fontWeight: '800' as const, color: colors.primary },
  operatorCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: colors.border,
  },
  operatorHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  operatorAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  operatorAvatarText: { fontSize: 18, fontWeight: '800' as const, color: colors.primary },
  operatorName: { fontSize: 15, fontWeight: '700' as const, color: colors.text },
  operatorRank: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  operatorBadge: { alignItems: 'center' },
  operatorBadgeText: { fontSize: 22, fontWeight: '800' as const, color: colors.primary },
  operatorBadgeLabel: { fontSize: 10, color: colors.textTertiary, marginTop: -2 },
  operatorStats: {
    flexDirection: 'row', backgroundColor: colors.surfaceLight,
    borderRadius: 10, padding: 10, marginBottom: 12, alignItems: 'center',
  },
  operatorStatItem: { flex: 1, alignItems: 'center' },
  operatorStatValue: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  operatorStatLabel: { fontSize: 10, color: colors.textTertiary, marginTop: 1 },
  operatorStatDivider: { width: 1, height: 24, backgroundColor: colors.border },
  operatorMoney: { gap: 6 },
  operatorMoneyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  operatorMoneyLabel: { flex: 1, fontSize: 13, color: colors.textSecondary },
  operatorMoneyValue: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  operatorMoneyTotal: {
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 2,
  },
  occupancyHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 16,
  },
  occupancyTitle: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  occupancySubtitle: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  occupancyStatsRow: {
    flexDirection: 'row', gap: 8, marginBottom: 16,
  },
  occupancyStatCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  occupancyStatValue: { fontSize: 22, fontWeight: '800' as const, color: colors.info },
  occupancyStatLabel: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  snapshotCard: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  snapshotHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  snapshotDateBlock: { gap: 2 },
  snapshotDate: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  snapshotTime: { fontSize: 11, color: colors.textTertiary },
  snapshotCountBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.info, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  snapshotCountText: { fontSize: 15, fontWeight: '700' as const, color: colors.white },
  snapshotCarsContainer: { marginTop: 10 },
  snapshotDivider: { height: 1, backgroundColor: colors.border, marginBottom: 10 },
  snapshotCarRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border + '40',
  },
  snapshotCarInfo: { flex: 1 },
  snapshotCarPlate: { fontSize: 13, fontWeight: '700' as const, color: colors.text },
  snapshotCarClient: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  snapshotCarMeta: { alignItems: 'flex-end' },
  snapshotCarType: { fontSize: 11, color: colors.textTertiary },
  snapshotCarDays: { fontSize: 13, fontWeight: '700' as const, color: colors.primary, marginTop: 1 },
  snapshotEmpty: { fontSize: 12, color: colors.textTertiary, textAlign: 'center' as const, paddingVertical: 8 },
  carsPerPeriodCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: colors.border,
  },
  carsPerPeriodTitle: { fontSize: 15, fontWeight: '700' as const, color: colors.text, marginBottom: 12 },
  carsPerPeriodGrid: { flexDirection: 'row', gap: 8 },
  carsPerPeriodItem: {
    flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  carsPerPeriodValue: { fontSize: 20, fontWeight: '800' as const, color: colors.primary },
  carsPerPeriodLabel: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  shiftRevSummaryCard: {
    backgroundColor: colors.primarySurface, borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: colors.primary + '20', gap: 6,
  },
  shiftRevSummaryTitle: { fontSize: 15, fontWeight: '700' as const, color: colors.primary, marginBottom: 4 },
  shiftRevSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftRevSummaryLabel: { fontSize: 13, color: colors.textSecondary },
  shiftRevSummaryVal: { fontSize: 15, fontWeight: '700' as const, color: colors.text },
});
