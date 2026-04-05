import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertTriangle, Clock, BarChart3, Wallet, Calendar,
  Settings, ChevronRight, DollarSign, Landmark,
  Download, Sparkles, ShieldAlert, Shield, PiggyBank,
  Sun, Moon, ArrowDownCircle, TrendingDown, Banknote, CreditCard,
} from 'lucide-react-native';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { useColors, useTheme } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { formatMoney } from '@/utils/helpers';

interface MenuItem {
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  route: string;
  badge?: number;
  color?: string;
  adminOnly?: boolean;
}

export default function MoreScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { debtors, getCurrentViolationMonth, currentShift, adminWithdrawFromManager, addAdminExpense, adminCashBalance } = useParking();
  const colors = useColors();
  const { isDark, toggleTheme } = useTheme();

  const [activePanel, setActivePanel] = useState<'none' | 'withdraw' | 'expense'>('none');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expMethod, setExpMethod] = useState<'cash' | 'card'>('cash');
  const [expCategory, setExpCategory] = useState('');
  const [expDesc, setExpDesc] = useState('');

  const handleWithdraw = useCallback(() => {
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Ошибка', 'Введите корректную сумму');
      return;
    }
    const result = adminWithdrawFromManager(amt, withdrawNote || undefined);
    if (!result?.success) {
      Alert.alert('Ошибка', result?.error ?? 'Не удалось выполнить операцию');
      return;
    }
    setWithdrawAmount('');
    setWithdrawNote('');
    setActivePanel('none');
    Alert.alert('Готово', `Снято ${formatMoney(amt)} из кассы менеджера`);
  }, [withdrawAmount, withdrawNote, adminWithdrawFromManager]);

  const handleAddExpense = useCallback(() => {
    const amt = parseFloat(expAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Ошибка', 'Введите корректную сумму');
      return;
    }
    const result = addAdminExpense(amt, expMethod, expCategory || 'Прочее', expDesc || 'Расход');
    if (!result?.success) {
      Alert.alert('Ошибка', result?.error ?? 'Не удалось выполнить операцию');
      return;
    }
    setExpAmount('');
    setExpCategory('');
    setExpDesc('');
    setActivePanel('none');
    Alert.alert('Готово', 'Расход добавлен');
  }, [expAmount, expMethod, expCategory, expDesc, addAdminExpense]);

  const violationCount = getCurrentViolationMonth.violationCount;

  const sections = useMemo(() => {
    const ops: MenuItem[] = [
      { label: 'Должники', icon: AlertTriangle, route: '/more/debtors', badge: debtors.length, color: colors.danger },
      { label: 'История', icon: Clock, route: '/more/history', color: colors.info },
      { label: 'Отчёты', icon: BarChart3, route: '/more/reports', color: colors.primary },
      { label: 'Касса', icon: Wallet, route: '/more/cashregister', color: colors.cash },
      { label: 'Общая касса', icon: PiggyBank, route: '/more/totalcash', color: colors.primary },
      { label: 'Календарь смен', icon: Calendar, route: '/more/schedule', color: colors.warning },
      { label: 'Нарушения', icon: Shield, route: '/more/violations', badge: violationCount, color: violationCount >= 3 ? colors.danger : violationCount > 0 ? colors.warning : colors.success },
    ];

    const admin: MenuItem[] = [
      { label: 'Зарплаты и авансы', icon: DollarSign, route: '/more/salaryadvances', adminOnly: true, color: colors.info },
      { label: 'Финансы', icon: Landmark, route: '/more/finance', adminOnly: true, color: colors.cash },
      { label: 'Экспорт данных', icon: Download, route: '/more/export', adminOnly: true, color: colors.primary },
      { label: 'Чек-лист уборки', icon: Sparkles, route: '/more/cleanup', adminOnly: true, color: colors.success },
      { label: 'Самодиагностика', icon: ShieldAlert, route: '/more/anomalylog', adminOnly: true, color: colors.warning },
      { label: 'Настройки', icon: Settings, route: '/more/settings', adminOnly: true },
    ];

    return [
      { title: 'Операции', items: ops },
      ...(isAdmin ? [{ title: 'Администрирование', items: admin }] : []),
    ];
  }, [isAdmin, debtors.length, violationCount, colors]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isAdmin && (
        <View style={styles.financeBlock}>
          <View style={styles.financeHeader}>
            <Wallet size={18} color={colors.primary} />
            <Text style={styles.financeTitle}>Быстрые операции</Text>
          </View>
          <View style={styles.financeBalanceRow}>
            <View style={styles.financeBalanceItem}>
              <Banknote size={14} color={colors.cash} />
              <Text style={styles.financeBalanceLabel} numberOfLines={1}>Наличные</Text>
              <Text style={[styles.financeBalanceValue, { color: colors.cash }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(adminCashBalance.cash)}</Text>
            </View>
            <View style={styles.financeBalanceDivider} />
            <View style={styles.financeBalanceItem}>
              <CreditCard size={14} color={colors.card} />
              <Text style={styles.financeBalanceLabel} numberOfLines={1}>Безнал</Text>
              <Text style={[styles.financeBalanceValue, { color: colors.card }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(adminCashBalance.card)}</Text>
            </View>
          </View>
          {currentShift && (
            <View style={styles.managerCashRow}>
              <Text style={styles.managerCashHint} numberOfLines={1}>Касса менеджера:</Text>
              <Text style={styles.managerCashAmount} numberOfLines={1}>{formatMoney(currentShift.expectedCash)}</Text>
            </View>
          )}
          <View style={styles.financeActions}>
            <TouchableOpacity
              style={[
                styles.financeActionBtn,
                { backgroundColor: colors.warning + '15', borderColor: colors.warning + '30' },
                activePanel === 'withdraw' && { backgroundColor: colors.warning + '25' },
              ]}
              onPress={() => setActivePanel(activePanel === 'withdraw' ? 'none' : 'withdraw')}
              activeOpacity={0.7}
            >
              <ArrowDownCircle size={18} color={colors.warning} />
              <Text style={[styles.financeActionText, { color: colors.warning }]}>Снятие</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.financeActionBtn,
                { backgroundColor: colors.danger + '15', borderColor: colors.danger + '30' },
                activePanel === 'expense' && { backgroundColor: colors.danger + '25' },
              ]}
              onPress={() => setActivePanel(activePanel === 'expense' ? 'none' : 'expense')}
              activeOpacity={0.7}
            >
              <TrendingDown size={18} color={colors.danger} />
              <Text style={[styles.financeActionText, { color: colors.danger }]}>Расход</Text>
            </TouchableOpacity>
          </View>

          {activePanel === 'withdraw' && (
            <View style={styles.panelForm}>
              <Text style={styles.panelHint}>
                {currentShift
                  ? 'Снятие наличных из кассы менеджера (смена открыта)'
                  : 'Снятие наличных из кассы менеджера (смена не открыта)'}
              </Text>
              <TextInput
                style={styles.panelInput}
                placeholder="Сумма"
                placeholderTextColor={colors.textTertiary}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.panelInput}
                placeholder="Примечание (необязательно)"
                placeholderTextColor={colors.textTertiary}
                value={withdrawNote}
                onChangeText={setWithdrawNote}
              />
              <TouchableOpacity style={[styles.panelSubmitBtn, { backgroundColor: colors.warning }]} onPress={handleWithdraw}>
                <ArrowDownCircle size={16} color={colors.white} />
                <Text style={styles.panelSubmitText}>Снять</Text>
              </TouchableOpacity>
            </View>
          )}

          {activePanel === 'expense' && (
            <View style={styles.panelForm}>
              <Text style={styles.panelHint}>Расход администратора</Text>
              <TextInput
                style={styles.panelInput}
                placeholder="Сумма"
                placeholderTextColor={colors.textTertiary}
                value={expAmount}
                onChangeText={setExpAmount}
                keyboardType="numeric"
              />
              <View style={styles.methodRow}>
                <TouchableOpacity
                  style={[styles.methodBtn, expMethod === 'cash' && { backgroundColor: colors.cash, borderColor: colors.cash }]}
                  onPress={() => setExpMethod('cash')}
                >
                  <Text style={[styles.methodText, expMethod === 'cash' && { color: colors.white }]}>Наличные</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodBtn, expMethod === 'card' && { backgroundColor: colors.card, borderColor: colors.card }]}
                  onPress={() => setExpMethod('card')}
                >
                  <Text style={[styles.methodText, expMethod === 'card' && { color: colors.white }]}>Безнал</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.panelInput}
                placeholder="Категория"
                placeholderTextColor={colors.textTertiary}
                value={expCategory}
                onChangeText={setExpCategory}
              />
              <TextInput
                style={styles.panelInput}
                placeholder="Описание"
                placeholderTextColor={colors.textTertiary}
                value={expDesc}
                onChangeText={setExpDesc}
              />
              <TouchableOpacity style={[styles.panelSubmitBtn, { backgroundColor: colors.danger }]} onPress={handleAddExpense}>
                <TrendingDown size={16} color={colors.white} />
                <Text style={styles.panelSubmitText}>Добавить расход</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        style={styles.themeToggle}
        onPress={toggleTheme}
        activeOpacity={0.7}
      >
        <View style={[styles.themeIconWrap, { backgroundColor: isDark ? 'rgba(251, 191, 36, 0.12)' : 'rgba(59, 130, 246, 0.1)' }]}>
          {isDark ? <Sun size={20} color={colors.warning} /> : <Moon size={20} color={colors.info} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.themeLabel} numberOfLines={1}>{isDark ? 'Тёмная тема' : 'Светлая тема'}</Text>
          <Text style={styles.themeSub} numberOfLines={1}>Нажмите для переключения</Text>
        </View>
        <View style={[styles.themeSwitch, isDark ? styles.themeSwitchDark : styles.themeSwitchLight]}>
          <View style={[styles.themeSwitchDot, isDark ? styles.themeSwitchDotDark : styles.themeSwitchDotLight]} />
        </View>
      </TouchableOpacity>

      {sections.map((section, si) => (
        <View key={si} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.items.map((item, ii) => (
            <TouchableOpacity
              key={ii}
              style={styles.menuItem}
              onPress={() => router.push(item.route as never)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, { backgroundColor: (item.color ?? colors.primary) + '15' }]}>
                <item.icon size={20} color={item.color ?? colors.primary} />
              </View>
              <Text style={styles.menuLabel} numberOfLines={1}>{item.label}</Text>
              {item.badge !== undefined && item.badge > 0 && (
                <View style={[styles.badge, { backgroundColor: item.color ?? colors.danger }]}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              )}
              <ChevronRight size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32 },
  themeToggle: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 14,
    padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  themeIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  themeLabel: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
  themeSub: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  themeSwitch: {
    width: 48, height: 28, borderRadius: 14,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  themeSwitchDark: { backgroundColor: colors.primary },
  themeSwitchLight: { backgroundColor: colors.border },
  themeSwitchDot: {
    width: 22, height: 22, borderRadius: 11,
  },
  themeSwitchDotDark: { backgroundColor: colors.white, alignSelf: 'flex-end' as const },
  themeSwitchDotLight: { backgroundColor: colors.white, alignSelf: 'flex-start' as const },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13, fontWeight: '600' as const, color: colors.textTertiary,
    textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12,
    padding: 14, marginBottom: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500' as const, color: colors.text },
  badge: {
    borderRadius: 10,
    minWidth: 20, paddingHorizontal: 6, paddingVertical: 2,
    alignItems: 'center', marginRight: 8,
  },
  badgeText: { fontSize: 11, fontWeight: '700' as const, color: colors.white },
  financeBlock: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary + '25',
  },
  financeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  financeTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
  },
  financeBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  financeBalanceItem: {
    flex: 1,
    alignItems: 'center' as const,
    gap: 2,
  },
  financeBalanceDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
  financeBalanceLabel: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  financeBalanceValue: {
    fontSize: 15,
    fontWeight: '700' as const,
    minWidth: 0,
  },
  managerCashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  managerCashHint: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  managerCashAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  financeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  financeActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  financeActionText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  panelForm: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  panelHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  panelInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  methodBtn: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.textSecondary,
  },
  panelSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  panelSubmitText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.white,
  },
});
