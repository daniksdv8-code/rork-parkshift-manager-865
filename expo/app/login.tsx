import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Lock, User, ParkingCircle } from 'lucide-react-native';
import { useAuth } from '@/providers/AuthProvider';
import { useParking } from '@/providers/ParkingProvider';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { hapticSuccess, hapticError } from '@/utils/haptics';
import { useMemo } from 'react';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { users, logLogin } = useParking();
  const colors = useColors();
  const [loginStr, setLoginStr] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [shakeAnim] = useState(() => new Animated.Value(0));

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleLogin = useCallback(async () => {
    if (!loginStr.trim() || !password.trim()) {
      Alert.alert('Ошибка', 'Введите логин и пароль');
      return;
    }
    setLoading(true);
    try {
      const result = await login(loginStr.trim(), password, users);
      if (result.success) {
        const loggedUser = users.find(u => u.login.toLowerCase() === loginStr.trim().toLowerCase()) ?? users.find(u => u.role === 'admin');
        if (loggedUser) logLogin(loggedUser);
        hapticSuccess();
        router.replace('/(tabs)/(dashboard)');
      } else {
        hapticError();
        shake();
        Alert.alert('Ошибка', result.error ?? 'Неверные данные');
      }
    } finally {
      setLoading(false);
    }
  }, [loginStr, password, login, users, logLogin, router, shake]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <ParkingCircle size={48} color={colors.primary} />
          </View>
          <Text style={styles.title}>ParkManager</Text>
          <Text style={styles.subtitle}>Система управления парковкой</Text>
        </View>
        <Animated.View style={[styles.form, { transform: [{ translateX: shakeAnim }] }]}>
          <View style={styles.inputWrap}>
            <User size={18} color={colors.textTertiary} />
            <TextInput style={styles.input} placeholder="Логин" placeholderTextColor={colors.textTertiary} value={loginStr} onChangeText={setLoginStr} autoCapitalize="none" autoCorrect={false} />
          </View>
          <View style={styles.inputWrap}>
            <Lock size={18} color={colors.textTertiary} />
            <TextInput style={styles.input} placeholder="Пароль" placeholderTextColor={colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry />
          </View>
          <TouchableOpacity style={[styles.loginBtn, loading && styles.loginBtnDisabled]} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
            <Text style={styles.loginBtnText}>{loading ? 'Вход...' : 'Войти'}</Text>
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.hint}>По умолчанию: admin / admin</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 48 },
  logoCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySurface, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 2, borderColor: colors.primary + '30' },
  title: { fontSize: 28, fontWeight: '800' as const, color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  form: { width: '100%', maxWidth: 340 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, paddingVertical: 14, paddingLeft: 10, fontSize: 16, color: colors.text },
  loginBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { fontSize: 16, fontWeight: '700' as const, color: colors.white },
  hint: { fontSize: 12, color: colors.textTertiary, marginTop: 32 },
});
