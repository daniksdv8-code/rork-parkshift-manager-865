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

    if (normalized === 'admin' && password === 'admin') {
      const adminUser = users.find(u => u.role === 'admin') ?? DEFAULT_ADMIN;
      const userToSave = { ...adminUser };
      setCurrentUser(userToSave);
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(userToSave));
      return { success: true };
    }

    const user = users.find(
      u => u.login.toLowerCase() === normalized && !u.deleted && u.active
    );

    if (!user) {
      return { success: false, error: 'Пользователь не найден или заблокирован' };
    }

    if (user.role === 'admin') {
      if (password === 'admin' || password === user.login || (user.passwordHash && password === user.passwordHash)) {
        setCurrentUser(user);
        await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(user));
        return { success: true };
      }
    } else {
      if (user.passwordHash) {
        if (password === user.passwordHash) {
          setCurrentUser(user);
          await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(user));
          return { success: true };
        }
      } else {
        if (password === user.login || password === '1234') {
          setCurrentUser(user);
          await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(user));
          return { success: true };
        }
      }
    }

    return { success: false, error: 'Неверный пароль' };
  }, []);

  const logout = useCallback(async () => {
    setCurrentUser(null);
    await AsyncStorage.removeItem(AUTH_KEY);
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
