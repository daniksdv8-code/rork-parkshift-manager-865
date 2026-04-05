import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import {
  Banknote, CreditCard, Wallet, ArrowDownRight, ArrowUpRight,
} from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { formatMoney, formatDateTime } from '@/utils/helpers';

type Tab = 'debts' | 'advance' | 'salary' | 'history';

export default function SalaryAdvancesScreen() {
  const { isAdmin } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    users, employeeSalaryDebts, salaryAdvances, salaryPayments,
    adminCashBalance, issueSalaryAdvance, paySalary,
  } = useParking();

  const [tab, setTab] = useState<Tab>('debts');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [advAmount, setAdvAmount] = useState('');
  const [advMethod, setAdvMethod] = useState<'cash' | 'card'>('cash');
  const [advComment, setAdvComment] = useState('');
  const [salaryAmount, setSalaryAmount] = useState('');
  const [salaryMethod, setSalaryMethod] = useState<'cash' | 'card'>('cash');
  const [salaryComment, setSalaryComment] = useState('');

  const activeManagers = useMemo(() =>
    users.filter(u => u.role === 'manager' && !u.deleted),
  [users]);

  const history = useMemo(() => {
    const items: { id: string; type: 'advance' | 'payment'; date: string; name: string; amount: number; method: string; detail: string }[] = [];
    salaryAdvances.forEach(a => items.push({
      id: a.id, type: 'advance', date: a.issuedAt, name: a.employeeName,
      amount: a.amount, method: a.method, detail: a.comment,
    }));
    salaryPayments.forEach(p => items.push({
      id: p.id, type: 'payment', date: p.paidAt, name: p.employeeName,
      amount: p.grossAmount, method: p.method,
      detail: `Начислено ${formatMoney(p.grossAmount)}, удержано ${formatMoney(p.debtDeducted)}, на руки ${formatMoney(p.netPaid)}`,
    }));
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50);
  }, [salaryAdvances, salaryPayments]);

  const empDebt = useMemo(() => {
    if (!selectedEmployee) return 0;
    return employeeSalaryDebts.find(e => e.employeeId === selectedEmployee)?.remaining ?? 0;
  }, [selectedEmployee, employeeSalaryDebts]);

  const handleIssueAdvance = useCallback(() => {
    const amt = parseFloat(advAmount);
    if (!selectedEmployee || isNaN(amt) || amt <= 0) {
      Alert.alert('Ошибка', 'Выберите сотрудника и введите сумму');
      return;
    }
    const emp = activeManagers.find(m => m.id === selectedEmployee);
    if (!emp) return;
    const result = issueSalaryAdvance(selectedEmployee, emp.name, amt, advMethod, advComment || 'Аванс');
    if (!result?.success) {
      Alert.alert('Ошибка', result?.error ?? 'Недостаточно средств');
      return;
    }
    setAdvAmount('');
    setAdvComment('');
    Alert.alert('Готово', `Аванс выдан: ${formatMoney(amt)}`);
  }, [selectedEmployee, advAmount, advMethod, advComment, activeManagers, issueSalaryAdvance]);

  const handlePaySalary = useCallback(() => {
    const amt = parseFloat(salaryAmount);
    if (!selectedEmployee || isNaN(amt) || amt <= 0) {
      Alert.alert('Ошибка', 'Выберите сотрудника и введите сумму');
      return;
    }
    const emp = activeManagers.find(m => m.id === selectedEmployee);
    if (!emp) return;
    const result = paySalary(selectedEmployee, emp.name, amt, salaryMethod, salaryComment || 'Зарплата');
    if (!result?.success) {
      Alert.alert('Ошибка', result?.error ?? 'Недостаточно средств');
      return;
    }
    setSalaryAmount('');
    setSalaryComment('');
    Alert.alert('Готово', `ЗП начислена: ${formatMoney(amt)}`);
  }, [selectedEmployee, salaryAmount, salaryMethod, salaryComment, activeManagers, paySalary]);

  if (!isAdmin) {
    return (
      <View style={styles.noAccess}>
        <Wallet size={48} color={colors.textTertiary} />
        <Text style={styles.noAccessText}>Доступно только администратору</Text>
      </View>
    );
  }

  const tabItems: { key: Tab; label: string }[] = [
    { key: 'debts', label: 'Долги' },
    { key: 'advance', label: 'Выдать' },
    { key: 'salary', label: 'ЗП' },
    { key: 'history', label: 'История' },
  ];

  const netAfterDeduction = (() => {
    const amt = parseFloat(salaryAmount) || 0;
    const deducted = Math.min(empDebt, amt);
    return Math.max(0, amt - deducted);
  })();

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {tabItems.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'debts' && (
          <>
            <Text style={styles.sectionTitle}>Долги сотрудников по авансам</Text>
            {employeeSalaryDebts.length === 0 && <Text style={styles.emptyText}>Нет долгов</Text>}
            {employeeSalaryDebts.map(e => (
              <View key={e.employeeId} style={styles.debtCard}>
                <View style={styles.debtAvatar}>
                  <Text style={styles.debtAvatarText}>{e.employeeName.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.debtName}>{e.employeeName}</Text>
                  <Text style={styles.debtDetail}>Выдано: {formatMoney(e.total)}</Text>
                </View>
                <Text style={styles.debtAmount}>{formatMoney(e.remaining)}</Text>
              </View>
            ))}
          </>
        )}

        {tab === 'advance' && (
          <>
            <Text style={styles.sectionTitle}>Выдача аванса</Text>
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Сотрудник</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.empList}>
                {activeManagers.map(m => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.empChip, selectedEmployee === m.id && styles.empChipActive]}
                    onPress={() => setSelectedEmployee(m.id)}
                  >
                    <Text style={[styles.empChipText, selectedEmployee === m.id && styles.empChipTextActive]}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                style={styles.formInput}
                placeholder="Сумма"
                placeholderTextColor={colors.textTertiary}
                value={advAmount}
                onChangeText={setAdvAmount}
                keyboardType="numeric"
              />
              <View style={styles.methodRow}>
                <TouchableOpacity
                  style={[styles.methodBtn, advMethod === 'cash' && styles.methodBtnCash]}
                  onPress={() => setAdvMethod('cash')}
                >
                  <Banknote size={14} color={advMethod === 'cash' ? colors.white : colors.cash} />
                  <Text style={[styles.methodText, advMethod === 'cash' && styles.methodTextActive]}>Нал</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodBtn, advMethod === 'card' && styles.methodBtnCard]}
                  onPress={() => setAdvMethod('card')}
                >
                  <CreditCard size={14} color={advMethod === 'card' ? colors.white : colors.card} />
                  <Text style={[styles.methodText, advMethod === 'card' && styles.methodTextActive]}>Безнал</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.formInput}
                placeholder="Комментарий"
                placeholderTextColor={colors.textTertiary}
                value={advComment}
                onChangeText={setAdvComment}
              />
              <Text style={styles.balanceHint} numberOfLines={2}>
                Касса админа: нал {formatMoney(adminCashBalance.cash)}, безнал {formatMoney(adminCashBalance.card)}
              </Text>
              <TouchableOpacity style={styles.actionBtn} onPress={handleIssueAdvance}>
                <Text style={styles.actionBtnText}>Выдать аванс</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {tab === 'salary' && (
          <>
            <Text style={styles.sectionTitle}>Выплата зарплаты</Text>
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Сотрудник</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.empList}>
                {activeManagers.map(m => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.empChip, selectedEmployee === m.id && styles.empChipActive]}
                    onPress={() => setSelectedEmployee(m.id)}
                  >
                    <Text style={[styles.empChipText, selectedEmployee === m.id && styles.empChipTextActive]}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {empDebt > 0 && (
                <View style={styles.debtWarning}>
                  <Text style={styles.debtWarningText}>Долг по авансам: {formatMoney(empDebt)}</Text>
                </View>
              )}
              <TextInput
                style={styles.formInput}
                placeholder="Начисленная сумма (gross)"
                placeholderTextColor={colors.textTertiary}
                value={salaryAmount}
                onChangeText={setSalaryAmount}
                keyboardType="numeric"
              />
              {empDebt > 0 && parseFloat(salaryAmount) > 0 && (
                <View style={styles.deductionInfo}>
                  <Text style={styles.deductionText}>
                    Удержание: {formatMoney(Math.min(empDebt, parseFloat(salaryAmount) || 0))}
                  </Text>
                  <Text style={styles.deductionText}>
                    На руки: {formatMoney(netAfterDeduction)}
                  </Text>
                </View>
              )}
              <View style={styles.methodRow}>
                <TouchableOpacity
                  style={[styles.methodBtn, salaryMethod === 'cash' && styles.methodBtnCash]}
                  onPress={() => setSalaryMethod('cash')}
                >
                  <Text style={[styles.methodText, salaryMethod === 'cash' && styles.methodTextActive]}>Нал</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodBtn, salaryMethod === 'card' && styles.methodBtnCard]}
                  onPress={() => setSalaryMethod('card')}
                >
                  <Text style={[styles.methodText, salaryMethod === 'card' && styles.methodTextActive]}>Безнал</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.formInput}
                placeholder="Комментарий"
                placeholderTextColor={colors.textTertiary}
                value={salaryComment}
                onChangeText={setSalaryComment}
              />
              <TouchableOpacity style={styles.actionBtn} onPress={handlePaySalary}>
                <Text style={styles.actionBtnText}>Выплатить ЗП</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {tab === 'history' && (
          <>
            <Text style={styles.sectionTitle}>История выплат и авансов</Text>
            {history.length === 0 && <Text style={styles.emptyText}>Нет записей</Text>}
            {history.map(item => (
              <View key={item.id} style={styles.histCard}>
                <View style={[styles.histIcon, { backgroundColor: (item.type === 'advance' ? colors.warning : colors.info) + '15' }]}>
                  {item.type === 'advance'
                    ? <ArrowDownRight size={14} color={colors.warning} />
                    : <ArrowUpRight size={14} color={colors.info} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.histLabel}>
                    {item.type === 'advance' ? 'Аванс' : 'Зарплата'}: {item.name}
                  </Text>
                  <Text style={styles.histDetail}>{item.detail}</Text>
                  <Text style={styles.histDate}>{formatDateTime(item.date)}</Text>
                </View>
                <Text style={styles.histAmount}>{formatMoney(item.amount)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  noAccessText: { fontSize: 16, color: colors.textTertiary },
  tabRow: {
    flexDirection: 'row', gap: 4, padding: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: colors.surface },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: '600' as const, color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '600' as const, color: colors.text, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.textTertiary, textAlign: 'center' as const, paddingTop: 20 },
  debtCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  debtAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.warningSurface,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  debtAvatarText: { fontSize: 14, fontWeight: '700' as const, color: colors.warning },
  debtName: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  debtDetail: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  debtAmount: { fontSize: 16, fontWeight: '700' as const, color: colors.danger },
  formCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 8 },
  empList: { marginBottom: 12 },
  empChip: {
    backgroundColor: colors.surfaceLight, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  empChipActive: { backgroundColor: colors.primarySurface, borderColor: colors.primary },
  empChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' as const },
  empChipTextActive: { color: colors.primary },
  formInput: {
    backgroundColor: colors.surfaceLight, borderRadius: 10, padding: 12,
    fontSize: 15, color: colors.text, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  methodBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 8, backgroundColor: colors.surfaceLight,
    borderWidth: 1, borderColor: colors.border,
  },
  methodBtnCash: { backgroundColor: colors.cash, borderColor: colors.cash },
  methodBtnCard: { backgroundColor: colors.card, borderColor: colors.card },
  methodText: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary },
  methodTextActive: { color: colors.white },
  balanceHint: { fontSize: 12, color: colors.textTertiary, marginBottom: 12 },
  debtWarning: {
    backgroundColor: colors.dangerSurface, borderRadius: 8, padding: 10, marginBottom: 10,
  },
  debtWarningText: { fontSize: 13, color: colors.danger, fontWeight: '600' as const },
  deductionInfo: {
    backgroundColor: colors.warningSurface, borderRadius: 8, padding: 10, marginBottom: 10, gap: 2,
  },
  deductionText: { fontSize: 13, color: colors.warning, fontWeight: '500' as const },
  actionBtn: {
    backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: 'center',
  },
  actionBtnText: { fontSize: 15, fontWeight: '700' as const, color: colors.white },
  histCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: colors.border,
  },
  histIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  histLabel: { fontSize: 13, fontWeight: '600' as const, color: colors.text },
  histDetail: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  histDate: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  histAmount: { fontSize: 14, fontWeight: '700' as const, color: colors.text },
});
