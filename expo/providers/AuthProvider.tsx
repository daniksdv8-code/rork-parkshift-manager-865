import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback } from 'react';
import { User } from '@/types';

const AUTH_KEY = 'park_auth_user';

const DEFAULT_ADMIN: User = {
  id: 'admin-001',
  login: 'admin',
  name: 'Администратор',
  role: 'admin',
  active: true,
  createdAt: new Date().toISOString(),
};

export const [AuthProvider, useAuth] = createContextHook(() => {
  /* eslint-disable rork/general-context-optimization */
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_KEY).then((data) => {
      if (data) {
        try {
          setCurrentUser(JSON.parse(data));
        } catch {
          console.log('[Auth] Failed to parse saved user');
        }
      }
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (loginStr: string, password: string, users: User[]): Promise<{ success: boolean; error?: string }> => {
    const normalized = loginStr.trim().toLowerCase();
    console.log('[Auth] Login attempt:', normalized, 'users available:', users.length);

    try {
      if (normalized === 'admin' && password === 'admin') {
        const adminUser = users.find(u => u.role === 'admin') ?? DEFAULT_ADMIN;
        const userToSave = { ...adminUser };
        setCurrentUser(userToSave);
        try {
          await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(userToSave));
          console.log('[Auth] Admin session saved to storage');
        } catch (e) {
          console.log('[Auth] Failed to save admin session to storage:', e);
        }
        return { success: true };
      }

      const user = users.find(
        u => u.login.toLowerCase() === normalized && !u.deleted && u.active
      );

      if (!user) {
        console.log('[Auth] User not found or blocked:', normalized);
        return { success: false, error: 'Пользователь не найден или заблокирован' };
      }

      let passwordValid = false;
      if (user.role === 'admin') {
        passwordValid = password === 'admin' || password === user.login || (!!user.passwordHash && password === user.passwordHash);
      } else {
        if (user.passwordHash) {
          passwordValid = password === user.passwordHash;
        } else {
          passwordValid = password === user.login || password === '1234';
        }
      }

      if (passwordValid) {
        setCurrentUser(user);
        try {
          await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(user));
          console.log('[Auth] User session saved to storage:', user.name);
        } catch (e) {
          console.log('[Auth] Failed to save user session to storage:', e);
        }
        return { success: true };
      }

      console.log('[Auth] Invalid password for user:', normalized);
      return { success: false, error: 'Неверный пароль' };
    } catch (e) {
      console.log('[Auth] Login error:', e);
      return { success: false, error: 'Ошибка при входе. Попробуйте снова.' };
    }
  }, []);

  const logout = useCallback(async () => {
    console.log('[Auth] Logging out...');
    setCurrentUser(null);
    try {
      await AsyncStorage.removeItem(AUTH_KEY);
      console.log('[Auth] Session removed from storage');
    } catch (e) {
      console.log('[Auth] Failed to remove session from storage:', e);
    }
  }, []);

  const updateCurrentUser = useCallback(async (updates: Partial<User>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...updates };
    setCurrentUser(updated);
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(updated));
  }, [currentUser]);

  const isAdmin = currentUser?.role === 'admin';
  const isManager = currentUser?.role === 'manager';

  return {
    currentUser,
    isLoading,
    isAdmin,
    isManager,
    login,
    logout,
    updateCurrentUser,
  };
});
