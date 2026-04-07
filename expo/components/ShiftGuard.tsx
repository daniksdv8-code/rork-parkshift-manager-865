import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { ShieldAlert, PlayCircle, UserCircle, Lock, Wallet } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { Alert } from 'react-native';
import { formatMoney } from '@/utils/helpers';

interface ShiftGuardProps {
  children: React.ReactNode;
}

export default function ShiftGuard({ children }: ShiftGuardProps) {
  const { isAdmin, currentUser } = useAuth();
  const { needsShiftCheck, openShift, currentShift, shifts } = useParking();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [acceptedCash, setAcceptedCash] = useState('');

  const lastClosedShift = useMemo(() => {
    return [...shifts]
      .filter(s => s.status === 'closed')
      .sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime())[0] ?? null;
  }, [shifts]);

  const previousCash = lastClosedShift?.actualCash ?? 0;

  const handleOpen = useCallback(() => {
    const cash = acceptedCash.trim() === '' ? undefined : parseFloat(acceptedCash.replace(',', '.'));
    if (cash !== undefined && (isNaN(cash) || cash < 0)) {
      Alert.alert('Ошибка', 'Введите корректную сумму');
      return;
    }
    const result = openShift(cash);
    if (result && 'blocked' in result) {
      Alert.alert(
        'Смена занята',
        `Сейчас работает ${result.operatorName}. Дождитесь закрытия смены.`
      );
    }
  }, [openShift, acceptedCash]);

  if (!needsShiftCheck()) {
    return <>{children}</>;
  }

  if (isAdmin) {
    return <>{children}</>;
  }

  const isBlockedByOther = currentShift && currentUser && currentShift.operatorId !== currentUser.id;

  if (isBlockedByOther) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Lock size={48} color={colors.danger} />
          <Text style={styles.title}>Смена занята</Text>
          <View style={styles.operatorRow}>
            <UserCircle size={18} color={colors.primary} />
            <Text style={styles.operatorName}>{currentShift.operatorName}</Text>
          </View>
          <Text style={styles.subtitle}>
            Другой менеджер уже работает. Дождитесь закрытия текущей смены, чтобы начать свою.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <ShieldAlert size={48} color={colors.warning} />
        <Text style={styles.title}>Смена не открыта</Text>
        <Text style={styles.subtitle}>
          Укажите сумму наличных, которую вы принимаете в кассу
        </Text>

        <View style={styles.previousCashRow}>
          <Wallet size={16} color={colors.textSecondary} />
          <Text style={styles.previousCashLabel}>Общая касса (с прошлой смены):</Text>
        </View>
        <Text style={styles.previousCashValue}>{formatMoney(previousCash)}</Text>

        <View style={styles.inputWrap}>
          <Text style={styles.inputLabel}>Принимаю в кассу, ₽</Text>
          <TextInput
            style={styles.input}
            value={acceptedCash}
            onChangeText={setAcceptedCash}
            placeholder={String(previousCash)}
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
            testID="accepted-cash-input"
          />
          <Text style={styles.inputHint}>
            Оставьте пустым, чтобы принять {formatMoney(previousCash)}
          </Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleOpen} activeOpacity={0.8}>
          <PlayCircle size={20} color={colors.white} />
          <Text style={styles.buttonText}>Открыть смену</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.warning + '30',
    width: '100%',
    maxWidth: 360,
  },
  title: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.text,
    marginTop: 16,
  },
  operatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  operatorName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    marginTop: 8,
    lineHeight: 20,
  },
  previousCashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
  },
  previousCashLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500' as const,
  },
  previousCashValue: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: colors.primary,
    marginTop: 4,
    letterSpacing: -0.5,
  },
  inputWrap: {
    width: '100%',
    marginTop: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center' as const,
  },
  inputHint: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 6,
    textAlign: 'center' as const,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 20,
    width: '100%',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.white,
  },
});
