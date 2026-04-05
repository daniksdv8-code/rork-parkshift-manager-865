import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Sparkles, CheckCircle } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';

interface CleaningReminderProps {
  onOpenChecklist?: () => void;
}

export default function CleaningReminder({ onOpenChecklist }: CleaningReminderProps) {
  const colors = useColors();
  const { getTodayCleaningShift, currentShift } = useParking();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!getTodayCleaningShift || !currentShift) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.iconWrap}>
        <Sparkles size={20} color={colors.success} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>Сегодня генеральная уборка!</Text>
        <Text style={styles.subtitle}>Не забудьте выполнить чек-лист</Text>
      </View>
      {onOpenChecklist && (
        <TouchableOpacity style={styles.button} onPress={onOpenChecklist}>
          <CheckCircle size={16} color={colors.success} />
          <Text style={styles.buttonText}>Чек-лист</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successSurface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.success + '25',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.success + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.success,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success + '20',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.success,
  },
});
