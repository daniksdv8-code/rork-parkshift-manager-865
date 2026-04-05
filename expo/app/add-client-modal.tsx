import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useParking } from '@/providers/ParkingProvider';
import { formatPlateNumber } from '@/utils/helpers';

export default function AddClientModal() {
  const router = useRouter();
  const { addClient } = useParking();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+7');
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [notes, setNotes] = useState('');

  const handleAdd = useCallback(() => {
    if (!name.trim()) { Alert.alert('Ошибка', 'Введите ФИО'); return; }
    if (!phone.trim() || phone.length < 5) { Alert.alert('Ошибка', 'Введите телефон'); return; }
    if (!plate.trim()) { Alert.alert('Ошибка', 'Введите номер авто'); return; }

    addClient(name.trim(), phone.trim(), formatPlateNumber(plate), model.trim(), notes.trim() || undefined);
    Alert.alert('Готово', 'Клиент добавлен');
    router.back();
  }, [name, phone, plate, model, notes, addClient, router]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <UserPlus size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>Новый клиент</Text>

        <TextInput
          style={styles.input}
          placeholder="ФИО *"
          placeholderTextColor={colors.textTertiary}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Телефон *"
          placeholderTextColor={colors.textTertiary}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <TextInput
          style={styles.input}
          placeholder="Номер авто *"
          placeholderTextColor={colors.textTertiary}
          value={plate}
          onChangeText={setPlate}
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input}
          placeholder="Марка/модель"
          placeholderTextColor={colors.textTertiary}
          value={model}
          onChangeText={setModel}
        />
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Заметки"
          placeholderTextColor={colors.textTertiary}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>Добавить клиента</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 24 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 12,
  },
  title: {
    fontSize: 20, fontWeight: '700' as const, color: colors.text,
    textAlign: 'center' as const, marginBottom: 24,
  },
  input: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    fontSize: 15, color: colors.text, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' as const },
  addBtn: {
    backgroundColor: colors.primary, borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 12,
  },
  addBtnText: { fontSize: 16, fontWeight: '700' as const, color: colors.white },
});
