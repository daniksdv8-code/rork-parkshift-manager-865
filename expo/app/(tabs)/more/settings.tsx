import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { Save, UserPlus, Trash2, Lock, Shield, Download, Upload, User, Key, FileText } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { File as ExpoFile } from 'expo-file-system';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { shareJson } from '@/utils/file-save';

export default function SettingsScreen() {
  const { isAdmin, currentUser, updateCurrentUser } = useAuth();
  const colors = useColors();
  const {
    tariffs, updateTariffs, users, addUser, toggleUserActive, removeUser,
    resetAllData, createBackup, restoreBackup, updateManagedUserPassword,
  } = useParking();

  const [editTariffs, setEditTariffs] = useState({ ...tariffs });
  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [resetWord, setResetWord] = useState('');

  const [profileName, setProfileName] = useState(currentUser?.name ?? '');
  const [profileLogin, setProfileLogin] = useState(currentUser?.login ?? '');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileConfirm, setProfileConfirm] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);

  const [managerPasswords, setManagerPasswords] = useState<Record<string, string>>({});
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleSaveTariffs = useCallback(() => {
    updateTariffs(editTariffs);
    Alert.alert('Готово', 'Тарифы сохранены');
  }, [editTariffs, updateTariffs]);

  const handleAddUser = useCallback(() => {
    if (newLogin.length < 3) { Alert.alert('Ошибка', 'Логин минимум 3 символа'); return; }
    if (newPassword.length < 4) { Alert.alert('Ошибка', 'Пароль минимум 4 символа'); return; }
    if (!newName.trim()) { Alert.alert('Ошибка', 'Введите ФИО'); return; }
    const result = addUser(newLogin, newPassword, newName.trim());
    if (result.success) {
      Alert.alert('Готово', 'Менеджер добавлен');
      setNewLogin(''); setNewPassword(''); setNewName('');
    } else {
      Alert.alert('Ошибка', result.error ?? 'Не удалось добавить');
    }
  }, [newLogin, newPassword, newName, addUser]);

  const handleSaveProfile = useCallback(async () => {
    if (!profileName.trim()) { Alert.alert('Ошибка', 'Введите имя'); return; }
    if (profilePassword && profilePassword.length < 4) {
      Alert.alert('Ошибка', 'Пароль минимум 4 символа');
      return;
    }
    if (profilePassword && profilePassword !== profileConfirm) {
      Alert.alert('Ошибка', 'Пароли не совпадают');
      return;
    }
    await updateCurrentUser({ name: profileName.trim(), login: profileLogin.trim() || currentUser?.login });
    setEditingProfile(false);
    setProfilePassword('');
    setProfileConfirm('');
    Alert.alert('Готово', 'Профиль обновлён');
  }, [profileName, profileLogin, profilePassword, profileConfirm, currentUser, updateCurrentUser]);

  const handleExportBackup = useCallback(async () => {
    try {
      const backupJson = createBackup();
      const filename = `parking_backup_${new Date().toISOString().split('T')[0]}.json`;
      const result = await shareJson(backupJson, filename);
      if (result.success) {
        if (result.fallback) {
          Alert.alert('Готово', 'Данные скопированы в буфер. Сохраните в файл .json');
        } else {
          Alert.alert('Готово', 'Бэкап сохранён');
        }
      } else {
        Alert.alert('Ошибка', 'Не удалось создать бэкап');
      }
    } catch (e) {
      console.log('[Settings] Backup error:', e);
      Alert.alert('Ошибка', 'Не удалось создать бэкап');
    }
  }, [createBackup]);

  const handleImportFromFile = useCallback(async () => {
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      console.log('[Settings] Picker result:', JSON.stringify(pickerResult));
      if (pickerResult.canceled || !pickerResult.assets?.length) return;
      const asset = pickerResult.assets[0];
      console.log('[Settings] Picked file:', asset.name, asset.uri, asset.mimeType, asset.size);

      let text = '';

      if (Platform.OS === 'web') {
        if ((asset as any).file) {
          text = await (asset as any).file.text();
          console.log('[Settings] Read via web File object, length:', text?.length);
        } else if (asset.uri) {
          const response = await fetch(asset.uri);
          text = await response.text();
          console.log('[Settings] Read via web fetch, length:', text?.length);
        }
      } else {
        try {
          const file = new ExpoFile(asset.uri);
          console.log('[Settings] ExpoFile created, exists:', file.exists, 'size:', file.size, 'uri:', file.uri);
          text = await file.text();
          console.log('[Settings] Read via ExpoFile(uri), length:', text?.length);
        } catch (err1: any) {
          console.log('[Settings] ExpoFile(uri) failed:', err1?.message);
            try {
              const FileSystemLegacy = require('expo-file-system/legacy');
              text = await FileSystemLegacy.readAsStringAsync(asset.uri, {
                encoding: FileSystemLegacy.EncodingType.UTF8,
              });
              console.log('[Settings] Read via legacy API, length:', text?.length);
            } catch (err2: any) {
              console.log('[Settings] Legacy API failed:', err2?.message);
              try {
                const response = await fetch(asset.uri);
                text = await response.text();
                console.log('[Settings] Read via fetch fallback, length:', text?.length);
              } catch (err3: any) {
                console.log('[Settings] All read methods failed:', err3?.message);
              }
            }
        }
      }

      console.log('[Settings] Final read text length:', text?.length);

      if (!text || text.length < 10) {
        Alert.alert('Ошибка', 'Файл пуст или содержит недопустимые данные');
        return;
      }
      const result = restoreBackup(text);
      if (result.success) {
        Alert.alert('Готово', 'Данные восстановлены из бэкапа');
      } else {
        Alert.alert('Ошибка', result.error ?? 'Не удалось восстановить');
      }
    } catch (e: any) {
      console.log('[Settings] File import error:', e, e?.message);
      Alert.alert('Ошибка', `Не удалось прочитать файл: ${e?.message ?? 'неизвестная ошибка'}`);
    }
  }, [restoreBackup]);

  const handleImportFromClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text || text.length < 10) {
        Alert.alert('Ошибка', 'Буфер обмена пуст или содержит недопустимые данные');
        return;
      }
      const result = restoreBackup(text);
      if (result.success) {
        Alert.alert('Готово', 'Данные восстановлены из бэкапа');
      } else {
        Alert.alert('Ошибка', result.error ?? 'Не удалось восстановить');
      }
    } catch (e) {
      console.log('[Settings] Clipboard import error:', e);
      Alert.alert('Ошибка', 'Не удалось прочитать буфер обмена');
    }
  }, [restoreBackup]);

  const handleImportBackup = useCallback(async () => {
    Alert.alert(
      'Восстановление',
      'Выберите способ загрузки бэкапа. Текущие данные будут перезаписаны.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Из файла (.json)', onPress: handleImportFromFile },
        { text: 'Из буфера обмена', onPress: handleImportFromClipboard },
      ]
    );
  }, [handleImportFromFile, handleImportFromClipboard]);

  const handleReset = useCallback(() => {
    if (resetWord !== 'СБРОС') {
      Alert.alert('Ошибка', 'Введите слово СБРОС для подтверждения');
      return;
    }
    Alert.alert('Сброс данных', 'Все данные будут удалены. Продолжить?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить всё', style: 'destructive', onPress: () => {
        resetAllData();
        setResetWord('');
        Alert.alert('Готово', 'Данные сброшены');
      }},
    ]);
  }, [resetWord, resetAllData]);

  if (!isAdmin) {
    return (
      <View style={styles.noAccess}>
        <Shield size={48} color={colors.textTertiary} />
        <Text style={styles.noAccessText}>Доступно только администратору</Text>
      </View>
    );
  }

  const admins = users.filter(u => u.role === 'admin' && !u.deleted);
  const managers = users.filter(u => u.role === 'manager' && !u.deleted);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Мой профиль</Text>
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{currentUser?.name?.charAt(0) ?? 'A'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {editingProfile ? (
              <View style={styles.profileEditForm}>
                <TextInput style={styles.formInput} value={profileName} onChangeText={setProfileName} placeholder="Имя" placeholderTextColor={colors.textTertiary} />
                <TextInput style={styles.formInput} value={profileLogin} onChangeText={setProfileLogin} placeholder="Логин" placeholderTextColor={colors.textTertiary} autoCapitalize="none" />
                <TextInput style={styles.formInput} value={profilePassword} onChangeText={setProfilePassword} placeholder="Новый пароль (необязательно)" placeholderTextColor={colors.textTertiary} secureTextEntry />
                {profilePassword.length > 0 && (
                  <TextInput style={styles.formInput} value={profileConfirm} onChangeText={setProfileConfirm} placeholder="Подтвердите пароль" placeholderTextColor={colors.textTertiary} secureTextEntry />
                )}
                <View style={styles.profileEditActions}>
                  <TouchableOpacity style={styles.profileSaveBtn} onPress={handleSaveProfile}>
                    <Save size={14} color={colors.white} />
                    <Text style={styles.profileSaveText}>Сохранить</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.profileCancelBtn} onPress={() => setEditingProfile(false)}>
                    <Text style={styles.profileCancelText}>Отмена</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.profileName}>{currentUser?.name ?? 'Администратор'}</Text>
                <Text style={styles.profileRole}>Администратор · {currentUser?.login}</Text>
                <TouchableOpacity style={styles.profileEditBtn} onPress={() => setEditingProfile(true)}>
                  <User size={14} color={colors.primary} />
                  <Text style={styles.profileEditText}>Редактировать профиль</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Тарифы</Text>
        {([
          { key: 'monthlyCash' as const, label: 'Месячный (нал), ₽/день' },
          { key: 'monthlyCard' as const, label: 'Месячный (безнал), ₽/день' },
          { key: 'onetimeCash' as const, label: 'Разовый (нал), ₽' },
          { key: 'onetimeCard' as const, label: 'Разовый (безнал), ₽' },
          { key: 'lombardRate' as const, label: 'Ломбард, ₽/сутки' },
        ]).map(t => (
          <View key={t.key} style={styles.tariffRow}>
            <Text style={styles.tariffLabel}>{t.label}</Text>
            <TextInput
              style={styles.tariffInput}
              value={String(editTariffs[t.key])}
              onChangeText={v => setEditTariffs(prev => ({ ...prev, [t.key]: parseInt(v) || 0 }))}
              keyboardType="numeric"
            />
          </View>
        ))}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTariffs}>
          <Save size={16} color={colors.white} />
          <Text style={styles.saveBtnText}>Сохранить тарифы</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Менеджеры</Text>
        {admins.map(user => (
          <View key={user.id} style={styles.userCard}>
            <View style={[styles.userAvatar, { backgroundColor: colors.primarySurface }]}>
              <Text style={styles.userAvatarText}>{user.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userLogin}>{user.login} · Администратор</Text>
            </View>
          </View>
        ))}

        {managers.map(user => (
          <View key={user.id} style={[styles.userCard, !user.active && styles.userCardBlocked]}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{user.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userLogin}>{user.login}</Text>
              {managerPasswords[user.id] !== undefined && (
                <View style={styles.changePassRow}>
                  <TextInput
                    style={styles.changePassInput}
                    value={managerPasswords[user.id]}
                    onChangeText={v => setManagerPasswords(p => ({ ...p, [user.id]: v }))}
                    placeholder="Новый пароль"
                    placeholderTextColor={colors.textTertiary}
                    secureTextEntry
                  />
                  <TouchableOpacity
                    style={styles.changePassSave}
                    onPress={() => {
                      const pw = managerPasswords[user.id] ?? '';
                      if (pw.length < 4) {
                        Alert.alert('Ошибка', 'Пароль минимум 4 символа');
                        return;
                      }
                      updateManagedUserPassword(user.id, pw);
                      Alert.alert('Готово', 'Пароль изменён');
                      setManagerPasswords(p => { const n = { ...p }; delete n[user.id]; return n; });
                    }}
                  >
                    <Save size={12} color={colors.white} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {!user.active && (
              <View style={styles.blockedBadge}>
                <Text style={styles.blockedText}>Блок</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => setManagerPasswords(p => p[user.id] !== undefined ? (() => { const n = { ...p }; delete n[user.id]; return n; })() : { ...p, [user.id]: '' })}
              style={styles.userBtn}
            >
              <Key size={14} color={colors.info} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => toggleUserActive(user.id)} style={styles.userBtn}>
              <Lock size={14} color={user.active ? colors.warning : colors.success} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert('Удалить', `Удалить ${user.name}?`, [
                { text: 'Отмена' },
                { text: 'Удалить', style: 'destructive', onPress: () => removeUser(user.id) },
              ])}
              style={styles.userBtn}
            >
              <Trash2 size={14} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.addUserForm}>
          <Text style={styles.formLabel}>Добавить менеджера</Text>
          <TextInput style={styles.formInput} placeholder="ФИО" placeholderTextColor={colors.textTertiary} value={newName} onChangeText={setNewName} />
          <TextInput style={styles.formInput} placeholder="Логин" placeholderTextColor={colors.textTertiary} value={newLogin} onChangeText={setNewLogin} autoCapitalize="none" />
          <TextInput style={styles.formInput} placeholder="Пароль" placeholderTextColor={colors.textTertiary} value={newPassword} onChangeText={setNewPassword} secureTextEntry />
          <TouchableOpacity style={styles.addUserBtn} onPress={handleAddUser}>
            <UserPlus size={16} color={colors.white} />
            <Text style={styles.addUserBtnText}>Добавить</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Резервное копирование</Text>
        <TouchableOpacity style={styles.backupBtn} onPress={handleExportBackup}>
          <Download size={18} color={colors.primary} />
          <Text style={styles.backupBtnText}>Создать бэкап</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.restoreBtn} onPress={handleImportFromFile}>
          <FileText size={18} color={colors.warning} />
          <Text style={styles.restoreBtnText}>Загрузить из файла</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.restoreClipboardBtn} onPress={handleImportBackup}>
          <Upload size={18} color={colors.textSecondary} />
          <Text style={styles.restoreClipboardBtnText}>Другие способы восстановления</Text>
        </TouchableOpacity>
        <Text style={styles.backupHint}>
          Экспорт сохраняет данные в файл. Импорт — из .json файла или буфера обмена.
        </Text>
      </View>

      <View style={[styles.section, styles.dangerSection]}>
        <Text style={[styles.sectionTitle, { color: colors.danger }]}>Опасная зона</Text>
        <Text style={styles.dangerDesc}>
          Введите СБРОС для очистки операционных данных. Сохранятся: клиенты, авто, менеджеры, тарифы и настройки. Будут удалены: история касс, смены, отчёты, долги, оплаты, сессии.
        </Text>
        <TextInput
          style={[styles.formInput, { borderColor: colors.danger + '30' }]}
          placeholder="Введите СБРОС"
          placeholderTextColor={colors.textTertiary}
          value={resetWord}
          onChangeText={setResetWord}
        />
        <TouchableOpacity style={styles.resetDataBtn} onPress={handleReset}>
          <Trash2 size={16} color={colors.white} />
          <Text style={styles.resetBtnText}>Сбросить данные</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  noAccessText: { fontSize: 16, color: colors.textTertiary },
  section: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700' as const, color: colors.text, marginBottom: 14 },
  profileCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  profileAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarText: { fontSize: 20, fontWeight: '800' as const, color: colors.primary },
  profileName: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  profileRole: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  profileEditBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
  },
  profileEditText: { fontSize: 13, color: colors.primary, fontWeight: '500' as const },
  profileEditForm: { gap: 8 },
  profileEditActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  profileSaveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8,
  },
  profileSaveText: { fontSize: 13, fontWeight: '600' as const, color: colors.white },
  profileCancelBtn: {
    backgroundColor: colors.surfaceLight, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  profileCancelText: { fontSize: 13, color: colors.textSecondary },
  tariffRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  tariffLabel: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  tariffInput: {
    backgroundColor: colors.surfaceLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 15, color: colors.text, width: 80, textAlign: 'right' as const,
    borderWidth: 1, borderColor: colors.border,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 10, padding: 12, marginTop: 8,
  },
  saveBtnText: { fontSize: 14, fontWeight: '600' as const, color: colors.white },
  userCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceLight, borderRadius: 10, padding: 10, marginBottom: 8,
  },
  userCardBlocked: { opacity: 0.5 },
  userAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceHighlight,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  userAvatarText: { fontSize: 14, fontWeight: '700' as const, color: colors.primary },
  userName: { fontSize: 14, fontWeight: '500' as const, color: colors.text },
  userLogin: { fontSize: 12, color: colors.textTertiary },
  blockedBadge: {
    backgroundColor: colors.dangerSurface, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6,
  },
  blockedText: { fontSize: 10, fontWeight: '600' as const, color: colors.danger },
  userBtn: { padding: 6 },
  changePassRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  changePassInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 6, padding: 6,
    fontSize: 13, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  changePassSave: {
    backgroundColor: colors.primary, borderRadius: 6, padding: 6,
  },
  addUserForm: { marginTop: 8 },
  formLabel: { fontSize: 14, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 8 },
  formInput: {
    backgroundColor: colors.surfaceLight, borderRadius: 10, padding: 12,
    fontSize: 15, color: colors.text, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  addUserBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 10, padding: 12,
  },
  addUserBtnText: { fontSize: 14, fontWeight: '600' as const, color: colors.white },
  backupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colors.primarySurface, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: colors.primary + '20',
  },
  backupBtnText: { fontSize: 14, fontWeight: '600' as const, color: colors.primary },
  restoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colors.warningSurface, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: colors.warning + '20',
  },
  restoreBtnText: { fontSize: 14, fontWeight: '600' as const, color: colors.warning },
  restoreClipboardBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10,
    backgroundColor: colors.surfaceLight, borderRadius: 12, padding: 12,
    marginBottom: 10, borderWidth: 1, borderColor: colors.border,
  },
  restoreClipboardBtnText: { fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary },
  backupHint: { fontSize: 12, color: colors.textTertiary, textAlign: 'center' as const, marginTop: 4 },
  dangerSection: { borderColor: colors.danger + '20' },
  dangerDesc: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
  resetDataBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.danger, borderRadius: 10, padding: 12,
  },
  resetBtnText: { fontSize: 14, fontWeight: '600' as const, color: colors.white },
});
