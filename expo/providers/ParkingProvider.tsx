import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthProvider';
import { DEFAULT_TARIFFS } from '@/constants/tariffs';
import { generateId, roundMoney, calculateDays, isToday } from '@/utils/helpers';
import { calculateActiveSessionDebt } from '@/utils/financeCalculations';
import { MAX_ACCRUAL_DAYS } from '@/constants/tariffs';
import { initSupabaseTable, loadFromSupabase, saveToSupabase, subscribeToChanges } from '@/utils/supabase';
import {
  Client, Car, ParkingSession, Payment, Transaction, Debt,
  Tariffs, CashShift, Expense,
  CashWithdrawal, ActionLog, DailyDebtAccrual,
  AppData, ServiceType, PaymentMethod, User,
  SalaryAdvance, SalaryPayment, AdminCashOperation,
  CleanupTemplateItem, CleanupChecklistItem,
  ScheduledShift, TeamViolationMonth, ViolationEntry,
  ExpenseCategory, ClientEditHistoryEntry,
  LoginLogEntry, SessionNote, DailyOccupancySnapshot,
} from '@/types';

const STORAGE_KEY = 'park_data';

function createEmptyData(): AppData {
  return {
    users: [{
      id: 'admin-001',
      login: 'admin',
      name: 'Администратор',
      role: 'admin',
      active: true,
      createdAt: new Date().toISOString(),
    }],
    clients: [],
    cars: [],
    sessions: [],
    payments: [],
    transactions: [],
    debts: [],
    clientDebts: [],
    subscriptions: [],
    shifts: [],
    expenses: [],
    withdrawals: [],
    cashOperations: [],
    actionLogs: [],
    dailyDebtAccruals: [],
    scheduledShifts: [],
    violations: [],
    tariffs: { ...DEFAULT_TARIFFS },
    salaryAdvances: [],
    salaryPayments: [],
    adminCashOperations: [],
    expenseCategories: [],
    cleanupChecklistTemplate: [],
    editHistory: [],
    loginLogs: [],
    sessionNotes: [],
    dailyOccupancySnapshots: [],
  };
}

export type SyncStatus = 'connecting' | 'connected' | 'offline' | 'error';

export const [ParkingProvider, useParking] = createContextHook(() => {
  const { currentUser, isAdmin } = useAuth();
  const [data, setData] = useState<AppData>(createEmptyData);
  const [isLoaded, setIsLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  const pendingSave = useRef<AppData | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabaseReady = useRef(false);

  function applyMigrations(parsed: Partial<AppData>): Partial<AppData> {
    if (parsed.sessions) {
      const defaultRate = parsed.tariffs?.lombardRate ?? DEFAULT_TARIFFS.lombardRate;
      parsed.sessions = parsed.sessions.map(s => ({
        ...s,
        lombardRateApplied: s.lombardRateApplied || defaultRate,
      }));
    }
    return parsed;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setSyncStatus('connecting');
      const tableOk = await initSupabaseTable();
      if (cancelled) return;

      if (tableOk) {
        supabaseReady.current = true;
        const remote = await loadFromSupabase();
        if (cancelled) return;

        if (remote && Object.keys(remote).length > 0) {
          const migrated = applyMigrations(remote);
          setData(prev => ({ ...prev, ...migrated }));
          void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...createEmptyData(), ...migrated }));
          setSyncStatus('connected');
          console.log('[Parking] Loaded from Supabase (centralized DB)');
        } else {
          const stored = await AsyncStorage.getItem(STORAGE_KEY);
          if (stored) {
            try {
              const parsed = applyMigrations(JSON.parse(stored) as Partial<AppData>);
              const merged = { ...createEmptyData(), ...parsed };
              setData(merged as AppData);
              await saveToSupabase(merged as AppData);
              console.log('[Parking] Migrated AsyncStorage data to Supabase');
            } catch {
              console.log('[Parking] Failed to parse local data');
            }
          }
          setSyncStatus('connected');
        }
      } else {
        console.log('[Parking] Supabase not available, using AsyncStorage');
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            const parsed = applyMigrations(JSON.parse(stored) as Partial<AppData>);
            setData(prev => ({ ...prev, ...parsed }));
          } catch {
            console.log('[Parking] Failed to parse stored data');
          }
        }
        setSyncStatus('offline');
      }
      if (!cancelled) setIsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!supabaseReady.current) return;
    const unsub = subscribeToChanges((newData) => {
      if (pendingSave.current) {
        console.log('[Parking] Skipping realtime update (pending local save)');
        return;
      }
      const migrated = applyMigrations(newData);
      setData(prev => ({ ...prev, ...migrated }));
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...createEmptyData(), ...migrated }));
      console.log('[Parking] Applied realtime update from other device');
    });
    return () => { if (unsub) unsub(); };
  }, []);

  const persist = useCallback((newData: AppData) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newData)).catch(e =>
      console.log('[Parking] Persist error:', e)
    );

    if (!supabaseReady.current) return;

    pendingSave.current = newData;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const toSave = pendingSave.current;
      pendingSave.current = null;
      if (!toSave) return;
      const ok = await saveToSupabase(toSave);
      if (ok) {
        setSyncStatus('connected');
        console.log('[Parking] Saved to Supabase');
      } else {
        setSyncStatus('error');
        console.log('[Parking] Failed to save to Supabase');
      }
    }, 600);
  }, []);

  const update = useCallback((updater: (prev: AppData) => AppData) => {
    setData(prev => {
      const next = updater(prev);
      persist(next);
      return next;
    });
  }, [persist]);

  const logAction = useCallback((action: string, label: string, details: string, entityId?: string, entityType?: string) => {
    if (!currentUser) return;
    const log: ActionLog = {
      id: generateId(),
      action,
      label,
      details,
      operatorId: currentUser.id,
      operatorName: currentUser.name,
      timestamp: new Date().toISOString(),
      entityId,
      entityType,
    };
    update(prev => ({ ...prev, actionLogs: [log, ...prev.actionLogs].slice(0, 5000) }));
  }, [currentUser, update]);

  const currentShift = useMemo(() => {
    return data.shifts.find(s => s.status === 'open') ?? null;
  }, [data.shifts]);

  const needsShiftCheck = useCallback((): boolean => {
    if (!currentUser) return true;
    return !currentShift;
  }, [currentUser, currentShift]);

  const addClient = useCallback((name: string, phone: string, plateNumber: string, carModel: string, notes?: string): Client & { carId: string } => {
    const clientId = generateId();
    const carId = generateId();
    const now = new Date().toISOString();

    const client: Client = {
      id: clientId, name, phone, notes: notes ?? '', createdAt: now, updatedAt: now,
    };
    const car: Car = {
      id: carId, plateNumber: plateNumber.toUpperCase().trim(), carModel, clientId,
    };

    update(prev => ({
      ...prev,
      clients: [...prev.clients, client],
      cars: [...prev.cars, car],
    }));

    logAction('client_add', 'Новый клиент', `${name}, ${phone}, ${plateNumber}`);
    return { ...client, carId };
  }, [update, logAction]);

  const addCarToClient = useCallback((clientId: string, plateNumber: string, carModel: string): Car => {
    const car: Car = {
      id: generateId(), plateNumber: plateNumber.toUpperCase().trim(), carModel, clientId,
    };
    update(prev => ({ ...prev, cars: [...prev.cars, car] }));
    logAction('car_add', 'Авто добавлено', `${plateNumber} ${carModel}`, clientId, 'client');
    return car;
  }, [update, logAction]);

  const updateClient = useCallback((clientId: string, updates: Partial<Pick<Client, 'name' | 'phone' | 'phone2' | 'notes'>>) => {
    if (!currentUser) return;
    const now = new Date().toISOString();
    const client = data.clients.find(c => c.id === clientId);
    if (!client) return;

    const historyEntries: ClientEditHistoryEntry[] = [];
    const getClientField = (c: Client, f: string): string => {
      if (f === 'name') return c.name;
      if (f === 'phone') return c.phone;
      if (f === 'phone2') return c.phone2 ?? '';
      if (f === 'notes') return c.notes;
      return '';
    };
    const fields: Array<{ key: keyof typeof updates; field: ClientEditHistoryEntry['field'] }> = [
      { key: 'name', field: 'name' },
      { key: 'phone', field: 'phone' },
      { key: 'phone2', field: 'phone2' },
      { key: 'notes', field: 'notes' },
    ];
    for (const { key, field } of fields) {
      const oldVal = getClientField(client, key);
      if (updates[key] !== undefined && updates[key] !== oldVal) {
        historyEntries.push({
          id: generateId(),
          clientId,
          editedBy: currentUser.id,
          editorName: currentUser.name,
          editedAt: now,
          field,
          oldValue: oldVal,
          newValue: String(updates[key] ?? ''),
        });
      }
    }

    update(prev => ({
      ...prev,
      clients: prev.clients.map(c =>
        c.id === clientId ? { ...c, ...updates, updatedAt: now } : c
      ),
      editHistory: [...historyEntries, ...prev.editHistory].slice(0, 5000),
    }));
    logAction('client_edit', 'Клиент изменён', JSON.stringify(updates), clientId, 'client');
  }, [currentUser, data.clients, update, logAction]);

  const deleteClient = useCallback((clientId: string) => {
    const now = new Date().toISOString();
    update(prev => ({
      ...prev,
      clients: prev.clients.map(c =>
        c.id === clientId ? { ...c, deleted: true, deletedAt: now } : c
      ),
      cars: prev.cars.map(c =>
        c.clientId === clientId ? { ...c, deleted: true, deletedAt: now } : c
      ),
      sessions: prev.sessions.map(s =>
        s.clientId === clientId && ['active', 'active_debt'].includes(s.status)
          ? { ...s, status: 'completed' as const, exitTime: now, cancelled: true }
          : s
      ),
    }));
    logAction('client_delete', 'Клиент удалён', '', clientId, 'client');
  }, [update, logAction]);

  const updateCar = useCallback((carId: string, updates: Partial<Pick<Car, 'plateNumber' | 'carModel'>>) => {
    if (!currentUser) return;
    const now = new Date().toISOString();
    const car = data.cars.find(c => c.id === carId);
    if (!car) return;

    const historyEntries: ClientEditHistoryEntry[] = [];
    if (updates.plateNumber !== undefined && updates.plateNumber !== car.plateNumber) {
      historyEntries.push({
        id: generateId(), clientId: car.clientId, editedBy: currentUser.id,
        editorName: currentUser.name, editedAt: now, field: 'plateNumber',
        oldValue: car.plateNumber, newValue: updates.plateNumber, carId,
      });
    }
    if (updates.carModel !== undefined && updates.carModel !== car.carModel) {
      historyEntries.push({
        id: generateId(), clientId: car.clientId, editedBy: currentUser.id,
        editorName: currentUser.name, editedAt: now, field: 'carModel',
        oldValue: car.carModel ?? '', newValue: updates.carModel ?? '', carId,
      });
    }

    update(prev => ({
      ...prev,
      cars: prev.cars.map(c =>
        c.id === carId ? { ...c, ...updates } : c
      ),
      editHistory: [...historyEntries, ...prev.editHistory].slice(0, 5000),
    }));
    logAction('car_edit', 'Авто изменено', JSON.stringify(updates), carId, 'car');
  }, [currentUser, data.cars, update, logAction]);

  const deleteCar = useCallback((carId: string) => {
    update(prev => ({
      ...prev,
      cars: prev.cars.map(c => c.id === carId ? { ...c, deleted: true, deletedAt: new Date().toISOString() } : c),
    }));
    logAction('car_delete', 'Авто удалено', '', carId, 'car');
  }, [update, logAction]);

  const checkIn = useCallback((params: {
    carId: string;
    clientId: string;
    serviceType: ServiceType;
    tariffType?: 'standard' | 'lombard';
    paymentMethod?: PaymentMethod;
    paymentAmount?: number;
    inDebt?: boolean;
    debtAmount?: number;
    plannedDays?: number;
    paidUntilDate?: string;
    adjustmentReason?: string;
    baseAmount?: number;
    customRate?: number;
    lombardPrepayment?: number;
  }) => {
    if (!currentUser) return null;
    if (!currentShift) {
      console.log('[CheckIn] Отказ: смена не открыта');
      return null;
    }

    const existingActive = data.sessions.find(
      s => s.carId === params.carId && ['active', 'active_debt'].includes(s.status) && !s.cancelled
    );
    if (existingActive) return null;

    const now = new Date().toISOString();
    const sessionId = generateId();
    const isLombard = params.serviceType === 'lombard';
    const tariffs = data.tariffs;

    const isDiscounted = params.customRate !== undefined && params.baseAmount !== undefined && params.customRate < (params.baseAmount / (params.plannedDays ?? 1));

    let debtDailyRate = tariffs.lombardRate;
    if (params.inDebt && !isLombard) {
      if (params.serviceType === 'onetime') {
        const stdRate = params.paymentMethod === 'card' ? tariffs.onetimeCard : tariffs.onetimeCash;
        debtDailyRate = (params.customRate !== undefined && params.customRate < stdRate) ? params.customRate : stdRate;
      } else if (params.serviceType === 'monthly') {
        debtDailyRate = params.paymentMethod === 'card' ? tariffs.monthlyCard : tariffs.monthlyCash;
      }
    }

    const session: ParkingSession = {
      id: sessionId,
      carId: params.carId,
      clientId: params.clientId,
      entryTime: now,
      exitTime: null,
      serviceType: params.serviceType,
      status: (isLombard || params.inDebt) ? 'active_debt' : 'active',
      prepaidAmount: params.inDebt ? 0 : (params.paymentAmount ?? 0),
      prepaidMethod: params.inDebt ? null : (params.paymentMethod ?? null),
      tariffType: params.tariffType ?? (isLombard ? 'lombard' : 'standard'),
      lombardRateApplied: (isLombard || params.inDebt) ? debtDailyRate : tariffs.lombardRate,
      managerId: currentUser.id,
      managerName: currentUser.name,
      shiftId: currentShift?.id ?? null,
      cancelled: false,
      customRate: params.customRate,
      isDiscounted,
    };

    const newTransactions: Transaction[] = [];
    const newPayments: Payment[] = [];
    const newDebts: Debt[] = [];
    const newAccruals: DailyDebtAccrual[] = [];
    const newAdminOps: AdminCashOperation[] = [];
    let updatedShifts = data.shifts;
    let updatedClientDebts = [...data.clientDebts];
    let updatedSubscriptions = [...data.subscriptions];

    newTransactions.push({
      id: generateId(), type: 'entry', amount: 0,
      description: `Заезд: ${params.serviceType}`,
      clientId: params.clientId, carId: params.carId, sessionId,
      operatorId: currentUser.id, operatorName: currentUser.name, date: now,
      shiftId: currentShift?.id,
    });

    if (params.paymentAmount && params.paymentAmount > 0 && !params.inDebt && !isLombard && params.paymentMethod) {
      const paymentId = generateId();
      newPayments.push({
        id: paymentId, clientId: params.clientId, carId: params.carId, sessionId,
        amount: roundMoney(params.paymentAmount), method: params.paymentMethod,
        type: params.serviceType === 'monthly' ? 'monthly' : 'onetime',
        description: `Оплата при заезде`,
        operatorId: currentUser.id, operatorName: currentUser.name,
        date: now, shiftId: currentShift?.id,
        baseAmount: params.baseAmount, adjustmentReason: params.adjustmentReason,
      });

      newTransactions.push({
        id: generateId(), type: 'payment', amount: roundMoney(params.paymentAmount),
        description: `Оплата при заезде`, method: params.paymentMethod,
        clientId: params.clientId, carId: params.carId, sessionId,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
        shiftId: currentShift?.id,
      });

      if (params.paymentMethod === 'cash' && currentShift) {
        updatedShifts = updatedShifts.map(s =>
          s.id === currentShift.id
            ? { ...s, expectedCash: s.expectedCash + roundMoney(params.paymentAmount!) }
            : s
        );
      }

      if (params.paymentMethod === 'card') {
        newAdminOps.push({
          id: generateId(), type: 'card_income', amount: roundMoney(params.paymentAmount!),
          method: 'card', description: `Безнал при заезде`,
          date: now, operatorId: currentUser.id, operatorName: currentUser.name,
        });
      }

      if (params.serviceType === 'monthly' && params.paidUntilDate) {
        const existingSub = updatedSubscriptions.find(
          s => s.clientId === params.clientId && s.carId === params.carId
        );
        if (existingSub) {
          updatedSubscriptions = updatedSubscriptions.map(s =>
            s.id === existingSub.id ? { ...s, paidUntil: params.paidUntilDate!, updatedAt: now } : s
          );
        } else {
          updatedSubscriptions.push({
            id: generateId(), clientId: params.clientId, carId: params.carId,
            paidUntil: params.paidUntilDate, createdAt: now,
          });
        }
      }
    }

    if (params.inDebt && !isLombard) {
      const rate = debtDailyRate;
      newAccruals.push({
        id: generateId(), parkingEntryId: sessionId,
        clientId: params.clientId, carId: params.carId,
        amount: rate, tariffRate: rate, accrualDate: now.split('T')[0],
      });

      newDebts.push({
        id: generateId(), clientId: params.clientId, carId: params.carId,
        parkingEntryId: sessionId, totalAmount: roundMoney(rate),
        remainingAmount: roundMoney(rate), status: 'active',
        description: 'Долг при заезде (начисление за 1-е сутки)', createdAt: now,
      });
      newTransactions.push({
        id: generateId(), type: 'debt', amount: roundMoney(rate),
        description: 'Долг при заезде (начисление за 1-е сутки)',
        clientId: params.clientId, carId: params.carId, sessionId,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
        shiftId: currentShift?.id,
      });

      const existingCd = updatedClientDebts.find(cd => cd.clientId === params.clientId);
      if (existingCd) {
        updatedClientDebts = updatedClientDebts.map(cd =>
          cd.clientId === params.clientId
            ? { ...cd, totalAmount: cd.totalAmount + rate, activeAmount: cd.activeAmount + rate, lastUpdate: now }
            : cd
        );
      } else {
        updatedClientDebts.push({
          id: generateId(), clientId: params.clientId,
          totalAmount: rate, frozenAmount: 0, activeAmount: rate, lastUpdate: now,
        });
      }

      if (params.serviceType === 'monthly' && params.paidUntilDate) {
        const existingSub = updatedSubscriptions.find(
          s => s.clientId === params.clientId && s.carId === params.carId
        );
        if (existingSub) {
          updatedSubscriptions = updatedSubscriptions.map(s =>
            s.id === existingSub.id ? { ...s, paidUntil: params.paidUntilDate!, updatedAt: now } : s
          );
        } else {
          updatedSubscriptions.push({
            id: generateId(), clientId: params.clientId, carId: params.carId,
            paidUntil: params.paidUntilDate, createdAt: now,
          });
        }
      }

      console.log(`[CheckIn] Debt placement: serviceType=${params.serviceType}, dailyRate=${rate}, status=active_debt`);
    }

    if (isLombard) {
      const rate = tariffs.lombardRate;
      newAccruals.push({
        id: generateId(), parkingEntryId: sessionId,
        clientId: params.clientId, carId: params.carId,
        amount: rate, tariffRate: rate, accrualDate: now.split('T')[0],
      });

      newDebts.push({
        id: generateId(), clientId: params.clientId, carId: params.carId,
        parkingEntryId: sessionId, totalAmount: roundMoney(rate),
        remainingAmount: roundMoney(rate), status: 'active',
        description: 'Долг ломбарда (начисление за 1-е сутки)', createdAt: now,
      });
      newTransactions.push({
        id: generateId(), type: 'debt', amount: roundMoney(rate),
        description: 'Долг ломбарда (начисление за 1-е сутки)',
        clientId: params.clientId, carId: params.carId, sessionId,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
        shiftId: currentShift?.id,
      });

      const existingCd = updatedClientDebts.find(cd => cd.clientId === params.clientId);
      if (existingCd) {
        updatedClientDebts = updatedClientDebts.map(cd =>
          cd.clientId === params.clientId
            ? { ...cd, totalAmount: cd.totalAmount + rate, activeAmount: cd.activeAmount + rate, lastUpdate: now }
            : cd
        );
      } else {
        updatedClientDebts.push({
          id: generateId(), clientId: params.clientId,
          totalAmount: rate, frozenAmount: 0, activeAmount: rate, lastUpdate: now,
        });
      }

      if (params.lombardPrepayment && params.lombardPrepayment > 0 && params.paymentMethod) {
        const prepayId = generateId();
        newPayments.push({
          id: prepayId, clientId: params.clientId, carId: params.carId, sessionId,
          amount: roundMoney(params.lombardPrepayment), method: params.paymentMethod,
          type: 'lombard',
          description: 'Предоплата ломбарда',
          operatorId: currentUser.id, operatorName: currentUser.name,
          date: now, shiftId: currentShift?.id,
        });
        newTransactions.push({
          id: generateId(), type: 'payment', amount: roundMoney(params.lombardPrepayment),
          description: 'Предоплата ломбарда', method: params.paymentMethod,
          clientId: params.clientId, carId: params.carId, sessionId,
          operatorId: currentUser.id, operatorName: currentUser.name, date: now,
          shiftId: currentShift?.id,
        });
        if (params.paymentMethod === 'cash' && currentShift) {
          updatedShifts = updatedShifts.map(s =>
            s.id === currentShift.id
              ? { ...s, expectedCash: s.expectedCash + roundMoney(params.lombardPrepayment!) }
              : s
          );
        }
        if (params.paymentMethod === 'card') {
          newAdminOps.push({
            id: generateId(), type: 'card_income', amount: roundMoney(params.lombardPrepayment),
            method: 'card', description: 'Безнал: предоплата ломбарда',
            date: now, operatorId: currentUser.id, operatorName: currentUser.name,
          });
        }
      }
    }

    update(prev => ({
      ...prev,
      sessions: [...prev.sessions, session],
      transactions: [...newTransactions, ...prev.transactions],
      payments: [...newPayments, ...prev.payments],
      debts: [...newDebts, ...prev.debts],
      dailyDebtAccruals: [...newAccruals, ...prev.dailyDebtAccruals],
      shifts: updatedShifts,
      clientDebts: updatedClientDebts,
      subscriptions: updatedSubscriptions,
      adminCashOperations: [...newAdminOps, ...prev.adminCashOperations],
    }));

    logAction('checkin', 'Заезд', `${params.serviceType}, авто: ${params.carId}`, sessionId, 'session');
    return session;
  }, [currentUser, data.sessions, data.tariffs, data.clientDebts, data.subscriptions, data.shifts, currentShift, update, logAction]);

  const checkOut = useCallback((sessionId: string, payment?: {
    method: PaymentMethod;
    amount: number;
  }, releaseInDebt?: boolean) => {
    if (!currentUser) return null;
    if (!currentShift) {
      console.log('[CheckOut] Отказ: смена не открыта');
      return null;
    }
    const session = data.sessions.find(s => s.id === sessionId);
    if (!session) return null;

    const now = new Date().toISOString();
    const tariffs = data.tariffs;
    const car = data.cars.find(c => c.id === session.carId);
    const isLombardExit = session.serviceType === 'lombard' || session.status === 'active_debt';
    const days = calculateDays(session.entryTime, now, isLombardExit);

    let newStatus: ParkingSession['status'] = 'completed';
    const newTransactions: Transaction[] = [];
    const newPayments: Payment[] = [];
    const newDebts: Debt[] = [];
    const newAdminOps: AdminCashOperation[] = [];
    let updatedShifts = data.shifts;
    let updatedClientDebts = [...data.clientDebts];

    if (session.serviceType === 'onetime') {
      const standardRate = session.prepaidMethod === 'card' ? tariffs.onetimeCard : tariffs.onetimeCash;
      const rate = (session.customRate !== undefined && session.isDiscounted) ? session.customRate : standardRate;
      const total = roundMoney(days * rate);
      const remaining = Math.max(0, total - session.prepaidAmount);

      if (payment && payment.amount > 0) {
        const paid = Math.min(payment.amount, remaining);
        newPayments.push({
          id: generateId(), clientId: session.clientId, carId: session.carId, sessionId,
          amount: roundMoney(paid), method: payment.method, type: 'onetime',
          description: `Оплата при выезде (${days} сут.)`,
          operatorId: currentUser.id, operatorName: currentUser.name,
          date: now, shiftId: currentShift?.id,
        });
        newTransactions.push({
          id: generateId(), type: 'payment', amount: roundMoney(paid),
          description: `Оплата при выезде`, method: payment.method,
          clientId: session.clientId, carId: session.carId, sessionId,
          operatorId: currentUser.id, operatorName: currentUser.name, date: now,
        });
        if (payment.method === 'cash' && currentShift) {
          updatedShifts = updatedShifts.map(s =>
            s.id === currentShift.id ? { ...s, expectedCash: s.expectedCash + roundMoney(paid) } : s
          );
        }
        if (payment.method === 'card') {
          newAdminOps.push({
            id: generateId(), type: 'card_income', amount: roundMoney(paid),
            method: 'card', description: 'Безнал при выезде (разово)',
            date: now, operatorId: currentUser.id, operatorName: currentUser.name,
          });
        }
        const debtRemaining = remaining - paid;
        if (debtRemaining > 0) {
          newDebts.push({
            id: generateId(), clientId: session.clientId, carId: session.carId,
            parkingEntryId: sessionId, totalAmount: roundMoney(debtRemaining),
            remainingAmount: roundMoney(debtRemaining), status: 'active',
            description: 'Долг при выезде', createdAt: now,
          });
        }
      } else if (remaining > 0 && releaseInDebt) {
        newDebts.push({
          id: generateId(), clientId: session.clientId, carId: session.carId,
          parkingEntryId: sessionId, totalAmount: roundMoney(remaining),
          remainingAmount: roundMoney(remaining), status: 'active',
          description: 'Выезд в долг', createdAt: now,
        });
        newStatus = 'released_debt';
      }
    } else if (session.serviceType === 'monthly') {
      const sub = data.subscriptions.find(
        s => s.clientId === session.clientId && s.carId === session.carId
      );
      const isSubActive = sub && new Date(sub.paidUntil) > new Date();

      if (!isSubActive) {
        const monthlyAmount = roundMoney(tariffs.monthlyCash * 30);
        if (payment && payment.amount > 0) {
          newPayments.push({
            id: generateId(), clientId: session.clientId, carId: session.carId, sessionId,
            amount: roundMoney(payment.amount), method: payment.method, type: 'monthly',
            description: 'Оплата при выезде (месяц)',
            operatorId: currentUser.id, operatorName: currentUser.name,
            date: now, shiftId: currentShift?.id,
          });
          newTransactions.push({
            id: generateId(), type: 'payment', amount: roundMoney(payment.amount),
            description: 'Оплата при выезде', method: payment.method,
            clientId: session.clientId, carId: session.carId,
            operatorId: currentUser.id, operatorName: currentUser.name, date: now,
          });
          if (payment.method === 'cash' && currentShift) {
            updatedShifts = updatedShifts.map(s =>
              s.id === currentShift.id ? { ...s, expectedCash: s.expectedCash + roundMoney(payment.amount) } : s
            );
          }
          if (payment.method === 'card') {
            newAdminOps.push({
              id: generateId(), type: 'card_income', amount: roundMoney(payment.amount),
              method: 'card', description: 'Безнал при выезде (месяц)',
              date: now, operatorId: currentUser.id, operatorName: currentUser.name,
            });
          }
        } else if (releaseInDebt) {
          newDebts.push({
            id: generateId(), clientId: session.clientId, carId: session.carId,
            parkingEntryId: sessionId, totalAmount: monthlyAmount,
            remainingAmount: monthlyAmount, status: 'active',
            description: 'Долг за месяц при выезде', createdAt: now,
          });
          newStatus = 'released_debt';
        }
      }
    } else if (session.status === 'active_debt') {
      const accruals = data.dailyDebtAccruals.filter(a => a.parkingEntryId === sessionId);
      const accrualTotal = accruals.reduce((sum, a) => sum + a.amount, 0);
      const cd = updatedClientDebts.find(cd => cd.clientId === session.clientId);
      const actualDebt = Math.min(accrualTotal, cd?.totalAmount ?? accrualTotal);

      if (payment && payment.amount > 0) {
        const paid = Math.min(payment.amount, actualDebt);
        newPayments.push({
          id: generateId(), clientId: session.clientId, carId: session.carId, sessionId,
          amount: roundMoney(paid), method: payment.method, type: 'lombard',
          description: `Оплата ломбарда (${days} сут.)`,
          operatorId: currentUser.id, operatorName: currentUser.name,
          date: now, shiftId: currentShift?.id,
        });
        newTransactions.push({
          id: generateId(), type: 'payment', amount: roundMoney(paid),
          description: 'Оплата ломбарда', method: payment.method,
          clientId: session.clientId, carId: session.carId,
          operatorId: currentUser.id, operatorName: currentUser.name, date: now,
        });
        if (payment.method === 'cash' && currentShift) {
          updatedShifts = updatedShifts.map(s =>
            s.id === currentShift.id ? { ...s, expectedCash: s.expectedCash + roundMoney(paid) } : s
          );
        }
        if (payment.method === 'card') {
          newAdminOps.push({
            id: generateId(), type: 'card_income', amount: roundMoney(paid),
            method: 'card', description: 'Безнал при выезде (ломбард)',
            date: now, operatorId: currentUser.id, operatorName: currentUser.name,
          });
        }
        const afterPay = actualDebt - paid;
        if (afterPay > 0) {
          newDebts.push({
            id: generateId(), clientId: session.clientId, carId: session.carId,
            parkingEntryId: sessionId, totalAmount: roundMoney(afterPay),
            remainingAmount: roundMoney(afterPay), status: 'active',
            description: 'Остаток долга ломбарда', createdAt: now,
          });
          newStatus = 'released_debt';
        }
      } else {
        newDebts.push({
          id: generateId(), clientId: session.clientId, carId: session.carId,
          parkingEntryId: sessionId, totalAmount: roundMoney(actualDebt),
          remainingAmount: roundMoney(actualDebt), status: 'active',
          description: 'Долг ломбарда при выезде', createdAt: now,
        });
        newStatus = 'released_debt';
      }

      if (cd) {
        updatedClientDebts = updatedClientDebts.map(c =>
          c.clientId === session.clientId
            ? { ...c, totalAmount: Math.max(0, c.totalAmount - accrualTotal), activeAmount: Math.max(0, c.activeAmount - accrualTotal), lastUpdate: now }
            : c
        );
      }
    }

    newTransactions.push({
      id: generateId(), type: 'exit', amount: 0,
      description: `Выезд: ${car?.plateNumber ?? session.carId}`,
      clientId: session.clientId, carId: session.carId, sessionId,
      operatorId: currentUser.id, operatorName: currentUser.name, date: now,
    });

    update(prev => ({
      ...prev,
      sessions: prev.sessions.map(s =>
        s.id === sessionId ? { ...s, status: newStatus, exitTime: now } : s
      ),
      transactions: [...newTransactions, ...prev.transactions],
      payments: [...newPayments, ...prev.payments],
      debts: [...newDebts, ...prev.debts],
      shifts: updatedShifts,
      clientDebts: updatedClientDebts,
      adminCashOperations: [...newAdminOps, ...prev.adminCashOperations],
    }));

    logAction('checkout', 'Выезд', `${car?.plateNumber ?? ''}, статус: ${newStatus}`, sessionId, 'session');
    return { status: newStatus, days };
  }, [currentUser, data, currentShift, update, logAction]);

  const cancelCheckIn = useCallback((sessionId: string) => {
    if (!currentUser) return;
    const now = new Date().toISOString();
    const session = data.sessions.find(s => s.id === sessionId);
    if (!session) return;

    let updatedClientDebts = [...data.clientDebts];
    if (session.status === 'active_debt') {
      const accruals = data.dailyDebtAccruals.filter(a => a.parkingEntryId === sessionId);
      const accrualTotal = accruals.reduce((sum, a) => sum + a.amount, 0);
      updatedClientDebts = updatedClientDebts.map(cd =>
        cd.clientId === session.clientId
          ? { ...cd, totalAmount: Math.max(0, cd.totalAmount - accrualTotal), activeAmount: Math.max(0, cd.activeAmount - accrualTotal) }
          : cd
      );
    }

    const cancelledDebts = data.debts.map(d =>
      d.parkingEntryId === sessionId ? { ...d, remainingAmount: 0, status: 'paid' as const } : d
    );

    const newTransactions: Transaction[] = [{
      id: generateId(), type: 'cancel_entry' as const, amount: 0,
      description: 'Отмена заезда',
      clientId: session.clientId, carId: session.carId, sessionId,
      operatorId: currentUser.id, operatorName: currentUser.name, date: now,
    }];
    const newAdminOps: AdminCashOperation[] = [];
    let updatedShifts = data.shifts;
    let updatedPayments = data.payments;
    let updatedSubs = data.subscriptions;
    let refundAmount = 0;

    if (session.prepaidAmount > 0) {
      const daysStayed = calculateDays(session.entryTime, now);
      const tariffs = data.tariffs;
      let dailyRate = 0;
      let totalPaidDays = 0;

      if (session.serviceType === 'monthly') {
        dailyRate = session.prepaidMethod === 'card' ? tariffs.monthlyCard : tariffs.monthlyCash;
        totalPaidDays = Math.max(1, Math.round(session.prepaidAmount / dailyRate));
      } else if (session.serviceType === 'onetime') {
        const standardRate = session.prepaidMethod === 'card' ? tariffs.onetimeCard : tariffs.onetimeCash;
        dailyRate = (session.customRate !== undefined && session.isDiscounted) ? session.customRate : standardRate;
        totalPaidDays = Math.max(1, Math.round(session.prepaidAmount / dailyRate));
      }

      if (totalPaidDays > 1 && daysStayed < totalPaidDays) {
        const unusedDays = totalPaidDays - daysStayed;
        refundAmount = roundMoney(unusedDays * dailyRate);
        refundAmount = Math.min(refundAmount, session.prepaidAmount);

        if (refundAmount > 0) {
          const refundMethod = session.prepaidMethod ?? 'cash';

          newTransactions.push({
            id: generateId(), type: 'refund' as const, amount: refundAmount,
            description: `Возврат при отмене заезда (${daysStayed} из ${totalPaidDays} сут. использовано)`,
            method: refundMethod,
            clientId: session.clientId, carId: session.carId, sessionId,
            operatorId: currentUser.id, operatorName: currentUser.name, date: now,
            shiftId: currentShift?.id,
          });

          if (refundMethod === 'cash' && currentShift) {
            updatedShifts = updatedShifts.map(s =>
              s.id === currentShift.id ? { ...s, expectedCash: s.expectedCash - refundAmount } : s
            );
          }

          const sessionPayment = data.payments.find(
            p => p.sessionId === sessionId && !p.cancelled && p.amount > 0
          );
          if (sessionPayment) {
            const keptAmount = roundMoney(session.prepaidAmount - refundAmount);
            updatedPayments = updatedPayments.map(p =>
              p.id === sessionPayment.id ? { ...p, amount: keptAmount, refundAmount, refundDate: now } : p
            );
          }

          if (session.serviceType === 'monthly') {
            updatedSubs = updatedSubs.map(s => {
              if (s.clientId === session.clientId && s.carId === session.carId) {
                return { ...s, paidUntil: now, updatedAt: now };
              }
              return s;
            });
          }

          console.log(`[CancelCheckIn] Refund: ${refundAmount} (${daysStayed}/${totalPaidDays} days used)`);
        }
      } else {
        console.log(`[CancelCheckIn] No refund: paid for ${totalPaidDays} day(s), money stays in cash`);
      }
    }

    update(prev => ({
      ...prev,
      sessions: prev.sessions.map(s =>
        s.id === sessionId ? { ...s, status: 'completed', exitTime: now, cancelled: true } : s
      ),
      debts: cancelledDebts,
      clientDebts: updatedClientDebts,
      dailyDebtAccruals: prev.dailyDebtAccruals.filter(a => a.parkingEntryId !== sessionId),
      transactions: [...newTransactions, ...prev.transactions],
      shifts: updatedShifts,
      payments: updatedPayments,
      subscriptions: updatedSubs,
      adminCashOperations: [...newAdminOps, ...prev.adminCashOperations],
    }));

    const refundInfo = refundAmount > 0 ? `, возврат: ${refundAmount}` : ', без возврата';
    logAction('cancel_checkin', 'Отмена заезда', `Предоплата: ${session.prepaidAmount}${refundInfo}`, sessionId, 'session');
  }, [currentUser, data, currentShift, update, logAction]);

  const openShift = useCallback((acceptedCash?: number): CashShift | null | { blocked: true; operatorName: string } => {
    if (!currentUser) return null;

    if (currentUser.role === 'manager' && currentShift && currentShift.operatorId !== currentUser.id) {
      console.log(`[OpenShift] Blocked: shift already open by ${currentShift.operatorName}`);
      return { blocked: true, operatorName: currentShift.operatorName };
    }

    const now = new Date().toISOString();

    const lastClosed = [...data.shifts]
      .filter(s => s.status === 'closed')
      .sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime())[0];

    const carryOver = lastClosed?.actualCash ?? 0;
    const accepted = acceptedCash ?? carryOver;

    const shift: CashShift = {
      id: generateId(),
      operatorId: currentUser.id,
      operatorName: currentUser.name,
      operatorRole: currentUser.role,
      openedAt: now,
      closedAt: null,
      status: 'open',
      carryOver,
      acceptedCash: accepted,
      expectedCash: accepted,
      actualCash: 0,
      cashVariance: 0,
      cashVarianceType: 'none',
    };

    update(prev => ({
      ...prev,
      shifts: [...prev.shifts.map(s =>
        s.status === 'open' ? { ...s, status: 'closed' as const, closedAt: now, note: 'Автоматически закрыта' } : s
      ), shift],
    }));

    logAction('shift_open', 'Смена открыта', `Принято: ${accepted}, Остаток предыдущей: ${carryOver}`, shift.id, 'shift');
    return shift;
  }, [currentUser, data.shifts, currentShift, update, logAction]);

  const closeShift = useCallback((actualCash: number, note?: string) => {
    if (!currentUser || !currentShift) return;
    const now = new Date().toISOString();

    const shiftTransactions = data.transactions.filter(t => {
      if (t.shiftId === currentShift.id) return true;
      const tDate = new Date(t.date).getTime();
      const openDate = new Date(currentShift.openedAt).getTime();
      return tDate >= openDate && tDate <= Date.now();
    });

    const cashIncome = shiftTransactions
      .filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'cash')
      .reduce((sum, t) => sum + t.amount, 0);

    const cardIncome = shiftTransactions
      .filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'card')
      .reduce((sum, t) => sum + t.amount, 0);

    const cancelled = shiftTransactions
      .filter(t => t.type === 'cancel_payment' && t.method === 'cash')
      .reduce((sum, t) => sum + t.amount, 0);

    const refunded = shiftTransactions
      .filter(t => t.type === 'refund' && t.method === 'cash')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = data.expenses
      .filter(e => e.shiftId === currentShift.id)
      .reduce((sum, e) => sum + e.amount, 0);

    const totalWithdrawals = data.withdrawals
      .filter(w => w.shiftId === currentShift.id)
      .reduce((sum, w) => sum + w.amount, 0);

    const startBalance = currentShift.acceptedCash ?? currentShift.carryOver;
    const calculatedBalance = startBalance + cashIncome - cancelled - refunded - totalExpenses - totalWithdrawals;
    const discrepancy = roundMoney(actualCash - calculatedBalance);

    const closingSummary = {
      cashIncome: roundMoney(cashIncome),
      cardIncome: roundMoney(cardIncome),
      totalExpenses: roundMoney(totalExpenses),
      totalWithdrawals: roundMoney(totalWithdrawals),
      calculatedBalance: roundMoney(calculatedBalance),
      discrepancy,
    };

    update(prev => ({
      ...prev,
      shifts: prev.shifts.map(s =>
        s.id === currentShift.id ? {
          ...s,
          status: 'closed' as const,
          closedAt: now,
          actualCash: roundMoney(actualCash),
          expectedCash: roundMoney(calculatedBalance),
          cashVariance: Math.abs(discrepancy),
          cashVarianceType: discrepancy === 0 ? 'none' as const : discrepancy < 0 ? 'short' as const : 'over' as const,
          closingSummary,
          note,
        } : s
      ),
    }));

    logAction('shift_close', 'Смена закрыта', `Факт: ${actualCash}, Расхождение: ${discrepancy}`, currentShift.id, 'shift');
  }, [currentUser, currentShift, data, update, logAction]);

  const addExpense = useCallback((amount: number, category: string, description: string): { success: boolean; error?: string } => {
    if (!currentUser || !currentShift) return { success: false, error: 'Нет открытой смены' };
    if (roundMoney(amount) > currentShift.expectedCash) {
      return { success: false, error: `Недостаточно средств в кассе. Доступно: ${currentShift.expectedCash.toFixed(0)} ₽` };
    }
    const now = new Date().toISOString();
    const expense: Expense = {
      id: generateId(), amount: roundMoney(amount), category, description,
      operatorId: currentUser.id, operatorName: currentUser.name,
      date: now, shiftId: currentShift.id, type: isAdmin ? 'admin' : 'manager',
    };

    update(prev => ({
      ...prev,
      expenses: [...prev.expenses, expense],
      shifts: prev.shifts.map(s =>
        s.id === currentShift.id ? { ...s, expectedCash: s.expectedCash - roundMoney(amount) } : s
      ),
      transactions: [{
        id: generateId(), type: 'withdrawal' as const, amount: roundMoney(amount),
        description: `Расход: ${category} - ${description}`, method: 'cash' as const,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
        shiftId: currentShift.id,
      }, ...prev.transactions],
    }));

    logAction('expense_add', 'Расход', `${category}: ${amount}`, expense.id, 'expense');
    return { success: true };
  }, [currentUser, currentShift, isAdmin, update, logAction]);

  const payDebt = useCallback((debtId: string, amount: number, method: PaymentMethod) => {
    if (!currentUser) return;
    if (!currentShift) {
      console.log('[PayDebt] Отказ: смена не открыта');
      return;
    }
    const now = new Date().toISOString();
    const debt = data.debts.find(d => d.id === debtId);
    if (!debt) return;

    const actualAmount = roundMoney(Math.min(amount, debt.remainingAmount));
    const newRemaining = roundMoney(debt.remainingAmount - actualAmount);

    let updatedShifts = data.shifts;
    const newAdminOps: AdminCashOperation[] = [];
    if (method === 'cash' && currentShift) {
      updatedShifts = updatedShifts.map(s =>
        s.id === currentShift.id ? { ...s, expectedCash: s.expectedCash + actualAmount } : s
      );
    }
    if (method === 'card') {
      newAdminOps.push({
        id: generateId(), type: 'card_income', amount: actualAmount,
        method: 'card', description: 'Безнал: погашение долга',
        date: now, operatorId: currentUser.id, operatorName: currentUser.name,
      });
    }

    let updatedClientDebts = data.clientDebts.map(cd =>
      cd.clientId === debt.clientId
        ? {
            ...cd,
            totalAmount: Math.max(0, cd.totalAmount - actualAmount),
            activeAmount: Math.max(0, cd.activeAmount - actualAmount),
            lastUpdate: now,
          }
        : cd
    );

    update(prev => ({
      ...prev,
      debts: prev.debts.map(d =>
        d.id === debtId
          ? { ...d, remainingAmount: newRemaining, status: newRemaining <= 0 ? 'paid' as const : d.status, updatedAt: now }
          : d
      ),
      shifts: updatedShifts,
      clientDebts: updatedClientDebts,
      transactions: [{
        id: generateId(), type: 'debt_payment' as const, amount: actualAmount,
        description: `Погашение долга`, method,
        clientId: debt.clientId, carId: debt.carId,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
        shiftId: currentShift?.id,
      }, ...prev.transactions],
      payments: [{
        id: generateId(), clientId: debt.clientId, carId: debt.carId,
        amount: actualAmount, method, type: 'debt_payment',
        description: 'Погашение долга',
        operatorId: currentUser.id, operatorName: currentUser.name,
        date: now, shiftId: currentShift?.id,
      }, ...prev.payments],
      adminCashOperations: [...newAdminOps, ...prev.adminCashOperations],
    }));

    logAction('debt_payment', 'Погашение долга', `${actualAmount} ${method}`, debtId, 'debt');
  }, [currentUser, data.debts, data.shifts, data.clientDebts, currentShift, update, logAction]);

  const payMonthly = useCallback((clientId: string, carId: string, method: PaymentMethod, amount: number, paidUntilDate: string) => {
    if (!currentUser) return;
    if (!currentShift) {
      console.log('[PayMonthly] Отказ: смена не открыта');
      return;
    }
    const now = new Date().toISOString();

    let updatedShifts = data.shifts;
    const newAdminOps: AdminCashOperation[] = [];
    if (method === 'cash' && currentShift) {
      updatedShifts = updatedShifts.map(s =>
        s.id === currentShift.id ? { ...s, expectedCash: s.expectedCash + roundMoney(amount) } : s
      );
    }
    if (method === 'card') {
      newAdminOps.push({
        id: generateId(), type: 'card_income', amount: roundMoney(amount),
        method: 'card', description: 'Безнал: оплата месяца',
        date: now, operatorId: currentUser.id, operatorName: currentUser.name,
      });
    }

    const existingSub = data.subscriptions.find(s => s.clientId === clientId && s.carId === carId);
    let updatedSubs = data.subscriptions;
    if (existingSub) {
      updatedSubs = updatedSubs.map(s =>
        s.id === existingSub.id ? { ...s, paidUntil: paidUntilDate, updatedAt: now } : s
      );
    } else {
      updatedSubs = [...updatedSubs, {
        id: generateId(), clientId, carId, paidUntil: paidUntilDate, createdAt: now,
      }];
    }

    update(prev => ({
      ...prev,
      subscriptions: updatedSubs,
      shifts: updatedShifts,
      payments: [{
        id: generateId(), clientId, carId, amount: roundMoney(amount), method,
        type: 'monthly', description: 'Оплата месяца',
        operatorId: currentUser.id, operatorName: currentUser.name,
        date: now, shiftId: currentShift?.id,
      }, ...prev.payments],
      transactions: [{
        id: generateId(), type: 'payment' as const, amount: roundMoney(amount),
        description: 'Оплата месяца', method, clientId, carId,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
        shiftId: currentShift?.id,
      }, ...prev.transactions],
      adminCashOperations: [...newAdminOps, ...prev.adminCashOperations],
    }));

    logAction('monthly_payment', 'Оплата месяца', `${amount} ${method}`, clientId, 'client');
  }, [currentUser, data.subscriptions, data.shifts, currentShift, update, logAction]);

  const withdrawCash = useCallback((amount: number, note?: string): { success: boolean; error?: string } => {
    if (!currentUser || !currentShift) return { success: false, error: 'Нет открытой смены' };
    if (roundMoney(amount) > currentShift.expectedCash) {
      return { success: false, error: `Недостаточно средств в кассе. Доступно: ${currentShift.expectedCash.toFixed(0)} ₽` };
    }
    const now = new Date().toISOString();
    const withdrawal: CashWithdrawal = {
      id: generateId(), amount: roundMoney(amount),
      operatorId: currentUser.id, operatorName: currentUser.name,
      date: now, shiftId: currentShift.id, note,
    };

    update(prev => ({
      ...prev,
      withdrawals: [...prev.withdrawals, withdrawal],
      shifts: prev.shifts.map(s =>
        s.id === currentShift.id ? { ...s, expectedCash: s.expectedCash - roundMoney(amount) } : s
      ),
      transactions: [{
        id: generateId(), type: 'withdrawal' as const, amount: roundMoney(amount),
        description: `Снятие: ${note ?? ''}`, method: 'cash' as const,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
        shiftId: currentShift.id,
      }, ...prev.transactions],
    }));

    logAction('withdrawal', 'Снятие из кассы', `${amount}`, withdrawal.id, 'withdrawal');
    return { success: true };
  }, [currentUser, currentShift, update, logAction]);

  const updateTariffs = useCallback((newTariffs: Tariffs) => {
    update(prev => ({ ...prev, tariffs: { ...newTariffs, updatedAt: new Date().toISOString() } }));
    logAction('tariffs_update', 'Тарифы обновлены', JSON.stringify(newTariffs));
  }, [update, logAction]);

  const addUser = useCallback((login: string, password: string, name: string): { success: boolean; error?: string } => {
    const exists = data.users.find(u => u.login.toLowerCase() === login.toLowerCase() && !u.deleted);
    if (exists) return { success: false, error: 'Логин занят' };

    const user: User = {
      id: generateId(), login, name, role: 'manager', active: true,
      passwordHash: password,
      createdAt: new Date().toISOString(),
    };
    update(prev => ({ ...prev, users: [...prev.users, user] }));
    logAction('user_add', 'Менеджер добавлен', name, user.id, 'user');
    return { success: true };
  }, [data.users, update, logAction]);

  const toggleUserActive = useCallback((userId: string) => {
    update(prev => ({
      ...prev,
      users: prev.users.map(u =>
        u.id === userId ? { ...u, active: !u.active, updatedAt: new Date().toISOString() } : u
      ),
    }));
  }, [update]);

  const removeUser = useCallback((userId: string) => {
    update(prev => ({
      ...prev,
      users: prev.users.map(u =>
        u.id === userId ? { ...u, deleted: true } : u
      ),
    }));
    logAction('user_remove', 'Менеджер удалён', '', userId, 'user');
  }, [update, logAction]);

  const updateManagedUserPassword = useCallback((userId: string, newPassword: string) => {
    update(prev => ({
      ...prev,
      users: prev.users.map(u =>
        u.id === userId ? { ...u, passwordHash: newPassword, updatedAt: new Date().toISOString() } : u
      ),
    }));
    logAction('user_password', 'Пароль менеджера изменён', '', userId, 'user');
  }, [update, logAction]);

  const activeClients = useMemo(() =>
    data.clients.filter(c => !c.deleted),
  [data.clients]);

  const activeCars = useMemo(() =>
    data.cars.filter(c => !c.deleted),
  [data.cars]);

  const activeSessions = useMemo(() =>
    data.sessions.filter(s => ['active', 'active_debt'].includes(s.status) && !s.cancelled),
  [data.sessions]);

  const activeDebts = useMemo(() =>
    data.debts.filter(d => d.status === 'active' && d.remainingAmount > 0),
  [data.debts]);

  const todayStats = useMemo(() => {
    const todayTx = data.transactions.filter(t => isToday(t.date));
    const cashToday = todayTx
      .filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'cash')
      .reduce((s, t) => s + t.amount, 0);
    const cardToday = todayTx
      .filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'card')
      .reduce((s, t) => s + t.amount, 0);
    const debtPaymentsToday = todayTx
      .filter(t => t.type === 'debt_payment')
      .reduce((s, t) => s + t.amount, 0);
    const adjustmentToday = todayTx
      .filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'adjustment')
      .reduce((s, t) => s + t.amount, 0);

    const allActiveSessionsForDebt = data.sessions.filter(
      s => ['active', 'active_debt'].includes(s.status) && !s.exitTime && !s.cancelled
    );
    const activeSessionIdsForDebt = new Set(allActiveSessionsForDebt.map(s => s.id));
    const debtorIds = new Set(
      activeDebts.filter(d => !activeSessionIdsForDebt.has(d.parkingEntryId ?? '')).map(d => d.clientId)
    );
    const standaloneDebtTotal = activeDebts
      .filter(d => !activeSessionIdsForDebt.has(d.parkingEntryId ?? ''))
      .reduce((s, d) => s + d.remainingAmount, 0);
    let sessionTotalDebt = 0;
    for (const s of allActiveSessionsForDebt) {
      const sDebt = calculateActiveSessionDebt(s, data.tariffs, data.subscriptions, data.debts);
      if (sDebt > 0) {
        debtorIds.add(s.clientId);
        sessionTotalDebt += sDebt;
      }
    }
    const totalDebt = standaloneDebtTotal + sessionTotalDebt;

    return {
      cashToday: roundMoney(cashToday),
      cardToday: roundMoney(cardToday),
      parkedNow: activeSessions.length,
      debtorsCount: debtorIds.size,
      totalDebt: roundMoney(totalDebt),
      debtPaymentsToday: roundMoney(debtPaymentsToday),
      adjustmentToday: roundMoney(adjustmentToday),
    };
  }, [data.transactions, activeSessions, activeDebts, data.sessions, data.tariffs, data.subscriptions, data.debts]);

  const getClientDebtTotal = useCallback((clientId: string): number => {
    const clientActiveSessions = data.sessions.filter(
      s => s.clientId === clientId && ['active', 'active_debt'].includes(s.status) && !s.exitTime && !s.cancelled
    );
    const clientActiveSessionIds = new Set(clientActiveSessions.map(s => s.id));

    const standaloneDebts = data.debts
      .filter(d => d.clientId === clientId && d.status === 'active' && !clientActiveSessionIds.has(d.parkingEntryId ?? ''))
      .reduce((s, d) => s + d.remainingAmount, 0);

    let sessionDebt = 0;
    for (const session of clientActiveSessions) {
      sessionDebt += calculateActiveSessionDebt(session, data.tariffs, data.subscriptions, data.debts);
    }

    console.log(`[getClientDebtTotal] client=${clientId}: standalone=${standaloneDebts}, session=${sessionDebt}, total=${standaloneDebts + sessionDebt}`);
    return roundMoney(standaloneDebts + sessionDebt);
  }, [data.debts, data.sessions, data.tariffs, data.subscriptions]);

  const debtors = useMemo(() => {
    const allActiveSessionsD = data.sessions.filter(
      s => ['active', 'active_debt'].includes(s.status) && !s.exitTime && !s.cancelled
    );
    const activeSessionIdsD = new Set(allActiveSessionsD.map(s => s.id));
    const debtorMap = new Map<string, number>();

    activeDebts
      .filter(d => !activeSessionIdsD.has(d.parkingEntryId ?? ''))
      .forEach(d => {
        debtorMap.set(d.clientId, (debtorMap.get(d.clientId) ?? 0) + d.remainingAmount);
      });

    for (const s of allActiveSessionsD) {
      const sDebt = calculateActiveSessionDebt(s, data.tariffs, data.subscriptions, data.debts);
      if (sDebt > 0) {
        debtorMap.set(s.clientId, (debtorMap.get(s.clientId) ?? 0) + sDebt);
      }
    }

    return Array.from(debtorMap.entries()).map(([clientId, amount]) => ({
      clientId,
      amount: roundMoney(amount),
      client: data.clients.find(c => c.id === clientId),
    })).filter(d => d.client && !d.client.deleted);
  }, [activeDebts, data.sessions, data.tariffs, data.subscriptions, data.debts, data.clients]);

  const expiringSubscriptions = useMemo(() => {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    return data.subscriptions
      .filter(s => {
        const paidUntil = new Date(s.paidUntil);
        return paidUntil >= now && paidUntil <= threeDaysFromNow;
      })
      .map(s => ({
        ...s,
        client: data.clients.find(c => c.id === s.clientId),
        car: data.cars.find(c => c.id === s.carId),
      }));
  }, [data.subscriptions, data.clients, data.cars]);

  const adminCashBalance = useMemo(() => {
    const cashFromManagers = data.withdrawals.reduce((s, w) => s + w.amount, 0);
    const cardIncome = data.adminCashOperations
      .filter(o => o.type === 'card_income')
      .reduce((s, o) => s + o.amount, 0);
    const adminExpensesCash = data.adminCashOperations
      .filter(o => o.type === 'admin_expense' && o.method === 'cash')
      .reduce((s, o) => s + o.amount, 0);
    const adminExpensesCard = data.adminCashOperations
      .filter(o => o.type === 'admin_expense' && o.method === 'card')
      .reduce((s, o) => s + o.amount, 0);
    const salaryAdvCash = data.salaryAdvances.filter(a => a.method === 'cash').reduce((s, a) => s + a.amount, 0);
    const salaryAdvCard = data.salaryAdvances.filter(a => a.method === 'card').reduce((s, a) => s + a.amount, 0);
    const salaryPayCash = data.salaryPayments.filter(p => p.method === 'cash').reduce((s, p) => s + p.netPaid, 0);
    const salaryPayCard = data.salaryPayments.filter(p => p.method === 'card').reduce((s, p) => s + p.netPaid, 0);

    const cash = roundMoney(cashFromManagers - adminExpensesCash - salaryAdvCash - salaryPayCash);
    const card = roundMoney(cardIncome - adminExpensesCard - salaryAdvCard - salaryPayCard);
    return { cash, card, total: cash + card };
  }, [data.withdrawals, data.adminCashOperations, data.salaryAdvances, data.salaryPayments]);

  const addScheduledShift = useCallback((shift: Omit<ScheduledShift, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newShift: ScheduledShift = {
      ...shift,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    update(prev => ({ ...prev, scheduledShifts: [...prev.scheduledShifts, newShift] }));
    logAction('schedule_add', 'Смена добавлена', `${shift.operatorName} ${shift.date}`, newShift.id, 'schedule');
    return newShift;
  }, [update, logAction]);

  const updateScheduledShift = useCallback((shiftId: string, updates: Partial<ScheduledShift>) => {
    update(prev => ({
      ...prev,
      scheduledShifts: prev.scheduledShifts.map(s =>
        s.id === shiftId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
      ),
    }));
    logAction('schedule_edit', 'Смена изменена', JSON.stringify(updates), shiftId, 'schedule');
  }, [update, logAction]);

  const deleteScheduledShift = useCallback((shiftId: string) => {
    update(prev => ({
      ...prev,
      scheduledShifts: prev.scheduledShifts.map(s =>
        s.id === shiftId ? { ...s, deleted: true } : s
      ),
    }));
    logAction('schedule_delete', 'Смена удалена', '', shiftId, 'schedule');
  }, [update, logAction]);

  const addViolation = useCallback((managerId: string, managerName: string, type: string, comment: string) => {
    if (!currentUser) return null;
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    update(prev => {
      let monthRecord = prev.violations.find(v => v.month === monthKey);
      if (!monthRecord) {
        monthRecord = {
          id: generateId(),
          month: monthKey,
          violationCount: 0,
          status: 'ok',
          violations: [],
        };
      }
      if (monthRecord.status === 'bonus_denied') return prev;

      const entry: ViolationEntry = {
        id: generateId(),
        managerId,
        managerName,
        type,
        comment,
        date: now.toISOString(),
        addedBy: currentUser!.id,
        addedByName: currentUser!.name,
      };

      const newCount = monthRecord.violationCount + 1;
      const newStatus = newCount >= 3 ? 'bonus_denied' as const : newCount >= 1 ? 'warning' as const : 'ok' as const;

      const updatedRecord: TeamViolationMonth = {
        ...monthRecord,
        violationCount: newCount,
        status: newStatus,
        violations: [...monthRecord.violations, entry],
      };

      const exists = prev.violations.some(v => v.month === monthKey);
      return {
        ...prev,
        violations: exists
          ? prev.violations.map(v => v.month === monthKey ? updatedRecord : v)
          : [...prev.violations, updatedRecord],
      };
    });
    logAction('violation_add', 'Нарушение добавлено', `${managerName}: ${type}`);
    return true;
  }, [currentUser, update, logAction]);

  const deleteViolation = useCallback((monthKey: string, violationId: string) => {
    update(prev => ({
      ...prev,
      violations: prev.violations.map(v => {
        if (v.month !== monthKey || v.status === 'bonus_denied') return v;
        const filtered = v.violations.filter(e => e.id !== violationId);
        const newCount = filtered.length;
        return {
          ...v,
          violationCount: newCount,
          status: newCount >= 3 ? 'bonus_denied' as const : newCount >= 1 ? 'warning' as const : 'ok' as const,
          violations: filtered,
        };
      }),
    }));
    logAction('violation_delete', 'Нарушение удалено', violationId);
  }, [update, logAction]);

  const issueSalaryAdvance = useCallback((employeeId: string, employeeName: string, amount: number, method: 'cash' | 'card', comment: string): { success: boolean; error?: string } => {
    if (!currentUser) return { success: false, error: 'Не авторизован' };
    const bal = method === 'cash' ? adminCashBalance.cash : adminCashBalance.card;
    if (roundMoney(amount) > bal) {
      const label = method === 'cash' ? 'наличных' : 'безналичных';
      return { success: false, error: `Недостаточно ${label} средств. Доступно: ${bal.toFixed(0)} ₽` };
    }
    const now = new Date().toISOString();
    const advance: SalaryAdvance = {
      id: generateId(),
      employeeId,
      employeeName,
      amount: roundMoney(amount),
      remainingAmount: roundMoney(amount),
      comment,
      issuedBy: currentUser.id,
      issuedByName: currentUser.name,
      issuedAt: now,
      source: 'admin',
      method,
    };
    const adminOp: AdminCashOperation = {
      id: generateId(),
      type: 'salary_advance',
      amount: roundMoney(amount),
      method,
      description: `Аванс: ${employeeName}`,
      date: now,
      operatorId: currentUser.id,
      operatorName: currentUser.name,
    };
    update(prev => ({
      ...prev,
      salaryAdvances: [...prev.salaryAdvances, advance],
      adminCashOperations: [...prev.adminCashOperations, adminOp],
    }));
    logAction('salary_advance', 'Выдан аванс', `${employeeName}: ${amount} ${method}`, advance.id, 'salary');
    return { success: true };
  }, [currentUser, adminCashBalance, update, logAction]);

  const paySalary = useCallback((employeeId: string, employeeName: string, grossAmount: number, method: 'cash' | 'card', comment: string): { success: boolean; error?: string } => {
    if (!currentUser) return { success: false, error: 'Не авторизован' };
    const now = new Date().toISOString();

    let debtDeducted = 0;
    const updatedAdvances = [...data.salaryAdvances];
    const empAdvances = updatedAdvances
      .filter(a => a.employeeId === employeeId && a.remainingAmount > 0)
      .sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime());

    let remaining = grossAmount;
    for (const adv of empAdvances) {
      if (remaining <= 0) break;
      const deduct = Math.min(remaining, adv.remainingAmount);
      const idx = updatedAdvances.findIndex(a => a.id === adv.id);
      if (idx >= 0) {
        updatedAdvances[idx] = { ...updatedAdvances[idx], remainingAmount: roundMoney(updatedAdvances[idx].remainingAmount - deduct), updatedAt: now };
      }
      debtDeducted += deduct;
      remaining -= deduct;
    }

    const netPaid = roundMoney(grossAmount - debtDeducted);
    const bal = method === 'cash' ? adminCashBalance.cash : adminCashBalance.card;
    if (netPaid > bal) {
      const label = method === 'cash' ? 'наличных' : 'безналичных';
      return { success: false, error: `Недостаточно ${label} средств для выплаты. На руки: ${netPaid.toFixed(0)} ₽, доступно: ${bal.toFixed(0)} ₽` };
    }
    const payment: SalaryPayment = {
      id: generateId(),
      employeeId,
      employeeName,
      grossAmount: roundMoney(grossAmount),
      debtDeducted: roundMoney(debtDeducted),
      netPaid,
      method,
      comment,
      paidBy: currentUser.id,
      paidByName: currentUser.name,
      paidAt: now,
      source: 'admin',
    };
    const adminOp: AdminCashOperation = {
      id: generateId(),
      type: 'salary_payment',
      amount: netPaid,
      method,
      description: `ЗП: ${employeeName} (начислено ${grossAmount}, удержано ${debtDeducted})`,
      date: now,
      operatorId: currentUser.id,
      operatorName: currentUser.name,
    };
    update(prev => ({
      ...prev,
      salaryAdvances: updatedAdvances,
      salaryPayments: [...prev.salaryPayments, payment],
      adminCashOperations: [...prev.adminCashOperations, adminOp],
    }));
    logAction('salary_payment', 'Выплата ЗП', `${employeeName}: ${grossAmount} (на руки ${netPaid})`, payment.id, 'salary');
    return { success: true };
  }, [currentUser, data.salaryAdvances, adminCashBalance, update, logAction]);

  const addAdminExpense = useCallback((amount: number, method: 'cash' | 'card', category: string, description: string): { success: boolean; error?: string } => {
    if (!currentUser) return { success: false, error: 'Не авторизован' };
    const bal = method === 'cash' ? adminCashBalance.cash : adminCashBalance.card;
    if (roundMoney(amount) > bal) {
      const label = method === 'cash' ? 'наличных' : 'безналичных';
      return { success: false, error: `Недостаточно ${label} средств. Доступно: ${bal.toFixed(0)} ₽` };
    }
    const now = new Date().toISOString();
    const adminOp: AdminCashOperation = {
      id: generateId(),
      type: 'admin_expense',
      amount: roundMoney(amount),
      method,
      description: `${category}: ${description}`,
      date: now,
      operatorId: currentUser.id,
      operatorName: currentUser.name,
    };
    const expense: Expense = {
      id: generateId(),
      amount: roundMoney(amount),
      category,
      description,
      operatorId: currentUser.id,
      operatorName: currentUser.name,
      date: now,
      type: 'admin',
    };
    update(prev => ({
      ...prev,
      adminCashOperations: [...prev.adminCashOperations, adminOp],
      expenses: [...prev.expenses, expense],
    }));
    logAction('admin_expense', 'Расход админа', `${category}: ${amount} ${method}`, adminOp.id, 'expense');
    return { success: true };
  }, [currentUser, adminCashBalance, update, logAction]);

  const adminWithdrawFromManager = useCallback((amount: number, note?: string): { success: boolean; error?: string } => {
    if (!currentUser) return { success: false, error: 'Не авторизован' };
    const managerCash = currentShift?.expectedCash ?? 0;
    if (roundMoney(amount) > managerCash) {
      return { success: false, error: `Недостаточно средств в кассе менеджера. Доступно: ${managerCash.toFixed(0)} ₽` };
    }
    const now = new Date().toISOString();
    const withdrawal: CashWithdrawal = {
      id: generateId(),
      amount: roundMoney(amount),
      operatorId: currentUser.id,
      operatorName: currentUser.name,
      date: now,
      shiftId: currentShift?.id ?? 'no-shift',
      note,
    };
    const adminOp: AdminCashOperation = {
      id: generateId(),
      type: 'cash_withdrawal_from_manager',
      amount: roundMoney(amount),
      method: 'cash',
      description: `Снятие с кассы менеджера${note ? `: ${note}` : ''}`,
      date: now,
      operatorId: currentUser.id,
      operatorName: currentUser.name,
    };
    update(prev => {
      const updatedShifts = currentShift
        ? prev.shifts.map(s =>
            s.id === currentShift.id ? { ...s, expectedCash: s.expectedCash - roundMoney(amount) } : s
          )
        : prev.shifts;
      return {
        ...prev,
        withdrawals: [...prev.withdrawals, withdrawal],
        adminCashOperations: [...prev.adminCashOperations, adminOp],
        shifts: updatedShifts,
      };
    });
    logAction('withdrawal', 'Снятие из кассы', `${amount}${note ? ` (${note})` : ''}`, withdrawal.id, 'withdrawal');
    return { success: true };
  }, [currentUser, currentShift, update, logAction]);

  const updateCleanupTemplate = useCallback((items: CleanupTemplateItem[]) => {
    update(prev => ({ ...prev, cleanupChecklistTemplate: items }));
    logAction('cleanup_template', 'Шаблон уборки обновлён', `${items.length} пунктов`);
  }, [update, logAction]);

  const completeCleanup = useCallback((shiftId: string, checklist?: CleanupChecklistItem[]) => {
    if (!currentUser) return;
    update(prev => ({
      ...prev,
      scheduledShifts: prev.scheduledShifts.map(s =>
        s.id === shiftId ? {
          ...s,
          cleanupCompleted: true,
          cleanupCompletedAt: new Date().toISOString(),
          cleanupCompletedBy: currentUser!.id,
          cleanupCompletedByName: currentUser!.name,
          ...(checklist ? { cleanupChecklist: checklist } : {}),
        } : s
      ),
    }));
    logAction('cleanup_complete', 'Уборка завершена', '', shiftId, 'schedule');
  }, [currentUser, update, logAction]);

  const getCurrentViolationMonth = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return data.violations.find(v => v.month === monthKey) ?? {
      id: '', month: monthKey, violationCount: 0, status: 'ok' as const, violations: [],
    };
  }, [data.violations]);

  const getTodayCleaningShift = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return data.scheduledShifts.find(s =>
      s.date === today && s.isDeepCleaning && !s.deleted
    ) ?? null;
  }, [data.scheduledShifts]);

  const activeScheduledShifts = useMemo(() =>
    data.scheduledShifts.filter(s => !s.deleted),
  [data.scheduledShifts]);

  const employeeSalaryDebts = useMemo(() => {
    const map = new Map<string, { employeeId: string; employeeName: string; total: number; remaining: number }>();
    data.salaryAdvances.forEach(a => {
      const existing = map.get(a.employeeId);
      if (existing) {
        existing.total += a.amount;
        existing.remaining += a.remainingAmount;
      } else {
        map.set(a.employeeId, { employeeId: a.employeeId, employeeName: a.employeeName, total: a.amount, remaining: a.remainingAmount });
      }
    });
    return Array.from(map.values()).filter(e => e.remaining > 0);
  }, [data.salaryAdvances]);

  const cancelCheckOut = useCallback((sessionId: string) => {
    if (!currentUser) return;
    const now = new Date().toISOString();
    const session = data.sessions.find(s => s.id === sessionId);
    if (!session || !session.exitTime) return;
    if (!['completed', 'released', 'released_debt'].includes(session.status)) return;
    if (session.cancelled) return;

    let newStatus: ParkingSession['status'] = 'active';
    if (session.status === 'released_debt') newStatus = 'active_debt';

    const exitTs = new Date(session.exitTime).getTime();
    const debtsToCancel = data.debts.filter(d =>
      d.parkingEntryId === sessionId &&
      Math.abs(new Date(d.createdAt).getTime() - exitTs) < 10000
    );

    let updatedClientDebts = [...data.clientDebts];
    if (newStatus === 'active_debt') {
      const accruals = data.dailyDebtAccruals.filter(a => a.parkingEntryId === sessionId);
      const accrualTotal = accruals.reduce((sum, a) => sum + a.amount, 0);
      const cdIdx = updatedClientDebts.findIndex(cd => cd.clientId === session.clientId);
      if (cdIdx >= 0) {
        updatedClientDebts[cdIdx] = {
          ...updatedClientDebts[cdIdx],
          totalAmount: updatedClientDebts[cdIdx].totalAmount + accrualTotal,
          activeAmount: updatedClientDebts[cdIdx].activeAmount + accrualTotal,
          lastUpdate: now,
        };
      }
    }

    update(prev => ({
      ...prev,
      sessions: prev.sessions.map(s =>
        s.id === sessionId ? { ...s, status: newStatus, exitTime: null } : s
      ),
      debts: prev.debts.map(d =>
        debtsToCancel.some(dc => dc.id === d.id)
          ? { ...d, remainingAmount: 0, status: 'paid' as const }
          : d
      ),
      clientDebts: updatedClientDebts,
      transactions: [{
        id: generateId(), type: 'cancel_exit' as const, amount: 0,
        description: 'Отмена выезда',
        clientId: session.clientId, carId: session.carId, sessionId,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
      }, ...prev.transactions],
    }));
    logAction('cancel_checkout', 'Отмена выезда', '', sessionId, 'session');
  }, [currentUser, data, update, logAction]);

  const cancelPayment = useCallback((paymentId: string) => {
    if (!currentUser) return;
    const now = new Date().toISOString();
    const payment = data.payments.find(p => p.id === paymentId);
    if (!payment || payment.cancelled) return;

    let updatedShifts = data.shifts;
    if (payment.method === 'cash' && currentShift) {
      updatedShifts = updatedShifts.map(s =>
        s.id === currentShift.id ? { ...s, expectedCash: s.expectedCash - payment.amount } : s
      );
    }

    let updatedSubs = data.subscriptions;
    if (payment.type === 'monthly' && payment.clientId && payment.carId) {
      updatedSubs = updatedSubs.map(sub => {
        if (sub.clientId === payment.clientId && sub.carId === payment.carId) {
          const paidUntil = new Date(sub.paidUntil);
          paidUntil.setDate(paidUntil.getDate() - 30);
          return { ...sub, paidUntil: paidUntil.toISOString(), updatedAt: now };
        }
        return sub;
      });
    }

    const newDebt: Debt = {
      id: generateId(),
      clientId: payment.clientId,
      carId: payment.carId ?? '',
      parkingEntryId: payment.sessionId,
      totalAmount: payment.amount,
      remainingAmount: payment.amount,
      status: 'active',
      description: 'Долг от отмены оплаты',
      createdAt: now,
    };

    update(prev => ({
      ...prev,
      payments: prev.payments.map(p =>
        p.id === paymentId ? { ...p, cancelled: true } : p
      ),
      sessions: prev.sessions.map(s =>
        s.id === payment.sessionId
          ? { ...s, prepaidAmount: Math.max(0, s.prepaidAmount - payment.amount) }
          : s
      ),
      debts: [...prev.debts, newDebt],
      shifts: updatedShifts,
      subscriptions: updatedSubs,
      transactions: [{
        id: generateId(), type: 'cancel_payment' as const, amount: payment.amount,
        description: `Отмена оплаты: ${payment.description}`,
        method: payment.method,
        clientId: payment.clientId, carId: payment.carId,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
        shiftId: currentShift?.id,
      }, ...prev.transactions],
    }));
    logAction('cancel_payment', 'Отмена оплаты', `${payment.amount}`, paymentId, 'payment');
  }, [currentUser, data, currentShift, update, logAction]);

  const earlyExitWithRefund = useCallback((sessionId: string, refundMethod: PaymentMethod) => {
    if (!currentUser) return null;
    if (!currentShift) {
      console.log('[EarlyExitWithRefund] Отказ: смена не открыта');
      return null;
    }
    const session = data.sessions.find(s => s.id === sessionId);
    if (!session || session.serviceType !== 'monthly') return null;

    const now = new Date().toISOString();
    const sub = data.subscriptions.find(s => s.clientId === session.clientId && s.carId === session.carId);
    if (!sub) return null;

    const clientPayments = data.payments
      .filter(p => p.clientId === session.clientId && p.carId === session.carId && p.type === 'monthly' && !p.cancelled && p.amount > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastPayment = clientPayments[0];
    if (!lastPayment) return null;

    const dailyRate = lastPayment.method === 'card' ? data.tariffs.monthlyCard : data.tariffs.monthlyCash;
    const payDate = new Date(lastPayment.date);
    const today = new Date();
    payDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const daysUsed = Math.min(30, Math.max(1, Math.ceil((today.getTime() - payDate.getTime()) / (24 * 60 * 60 * 1000)) + 1));
    const usedAmount = roundMoney(daysUsed * dailyRate);
    const refundAmount = Math.max(0, roundMoney(lastPayment.amount - usedAmount));

    if (refundAmount <= 0) return null;

    let updatedShifts = data.shifts;
    if (refundMethod === 'cash' && currentShift) {
      updatedShifts = updatedShifts.map(s =>
        s.id === currentShift.id ? { ...s, expectedCash: s.expectedCash - refundAmount } : s
      );
    }

    update(prev => ({
      ...prev,
      sessions: prev.sessions.map(s =>
        s.id === sessionId ? { ...s, status: 'completed' as const, exitTime: now } : s
      ),
      payments: prev.payments.map(p =>
        p.id === lastPayment.id ? { ...p, amount: usedAmount, refundAmount, refundDate: now } : p
      ),
      subscriptions: prev.subscriptions.map(s =>
        s.id === sub.id ? { ...s, paidUntil: now, updatedAt: now } : s
      ),
      shifts: updatedShifts,
      transactions: [{
        id: generateId(), type: 'refund' as const, amount: refundAmount,
        description: `Возврат за досрочный выезд (${daysUsed} сут. использовано)`,
        method: refundMethod,
        clientId: session.clientId, carId: session.carId, sessionId,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
        shiftId: currentShift?.id,
      }, {
        id: generateId(), type: 'exit' as const, amount: 0,
        description: 'Досрочный выезд с возвратом',
        clientId: session.clientId, carId: session.carId, sessionId,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
      }, ...prev.transactions],
    }));
    logAction('early_exit', 'Досрочный выезд', `Возврат: ${refundAmount}`, sessionId, 'session');
    return { refundAmount, daysUsed, usedAmount };
  }, [currentUser, data, currentShift, update, logAction]);

  const runDebtAccrual = useCallback(() => {
    update(prev => {
      const now = new Date();
      const newAccruals: DailyDebtAccrual[] = [];
      let updatedClientDebts = [...prev.clientDebts];
      let updatedDebts: Debt[] | null = null;

      const debtSessions = prev.sessions.filter(
        s => s.status === 'active_debt' && !s.exitTime && !s.cancelled
      );

      for (const session of debtSessions) {
        const days = calculateDays(session.entryTime, undefined, true);
        const elapsedDays = Math.min(MAX_ACCRUAL_DAYS, days);
        const existingCount = prev.dailyDebtAccruals.filter(a => a.parkingEntryId === session.id).length;
        const extraDays = elapsedDays - existingCount;

        const rate = session.lombardRateApplied || prev.tariffs.lombardRate;

        if (extraDays > 0) {
          const entryDate = new Date(session.entryTime);
          for (let d = 0; d < extraDays; d++) {
            const accrualDate = new Date(entryDate.getTime() + (existingCount + d) * 24 * 60 * 60 * 1000);
            newAccruals.push({
              id: generateId(),
              parkingEntryId: session.id,
              clientId: session.clientId,
              carId: session.carId,
              amount: rate,
              tariffRate: rate,
              accrualDate: accrualDate.toISOString().split('T')[0],
            });
          }
          console.log(`[DebtAccrual] Debt session ${session.id} (${session.serviceType}): elapsed=${elapsedDays}, existing=${existingCount}, new=${extraDays}, rate=${rate}`);
        }

        const correctDebt = roundMoney(elapsedDays * rate);
        const cdIdx = updatedClientDebts.findIndex(cd => cd.clientId === session.clientId);
        if (cdIdx >= 0) {
          const oldSessionAccruals = (prev.dailyDebtAccruals.filter(a => a.parkingEntryId === session.id).length) * rate;
          const diff = correctDebt - oldSessionAccruals;
          if (Math.abs(diff) > 0) {
            updatedClientDebts[cdIdx] = {
              ...updatedClientDebts[cdIdx],
              totalAmount: Math.max(0, updatedClientDebts[cdIdx].totalAmount + diff),
              activeAmount: Math.max(0, updatedClientDebts[cdIdx].activeAmount + diff),
              lastUpdate: now.toISOString(),
            };
          }
        } else {
          updatedClientDebts.push({
            id: generateId(),
            clientId: session.clientId,
            totalAmount: correctDebt,
            frozenAmount: 0,
            activeAmount: correctDebt,
            lastUpdate: now.toISOString(),
          });
        }
      }

      const manualDebts = prev.debts.filter(d => d.isManual && d.status === 'active' && d.remainingAmount > 0);
      for (const debt of manualDebts) {
        const createdDate = new Date(debt.createdAt);
        const elapsedMs = now.getTime() - createdDate.getTime();
        const elapsedDays = Math.min(MAX_ACCRUAL_DAYS, Math.max(0, Math.floor(elapsedMs / (24 * 60 * 60 * 1000))));

        if (elapsedDays <= 0) continue;

        const existingCount = prev.dailyDebtAccruals.filter(a => a.parkingEntryId === debt.id).length;
        const extraDays = elapsedDays - existingCount;

        if (extraDays <= 0) continue;

        const rate = prev.tariffs.lombardRate;
        let accrualSum = 0;
        for (let d = 0; d < extraDays; d++) {
          const accrualDate = new Date(createdDate.getTime() + (existingCount + d + 1) * 24 * 60 * 60 * 1000);
          newAccruals.push({
            id: generateId(),
            parkingEntryId: debt.id,
            clientId: debt.clientId,
            carId: debt.carId,
            amount: rate,
            tariffRate: rate,
            accrualDate: accrualDate.toISOString().split('T')[0],
          });
          accrualSum += rate;
        }

        if (!updatedDebts) {
          updatedDebts = [...prev.debts];
        }
        updatedDebts = updatedDebts.map(d =>
          d.id === debt.id
            ? {
                ...d,
                totalAmount: roundMoney(d.totalAmount + accrualSum),
                remainingAmount: roundMoney(d.remainingAmount + accrualSum),
                updatedAt: now.toISOString(),
              }
            : d
        );

        const cdIdx = updatedClientDebts.findIndex(cd => cd.clientId === debt.clientId);
        if (cdIdx >= 0) {
          updatedClientDebts[cdIdx] = {
            ...updatedClientDebts[cdIdx],
            totalAmount: updatedClientDebts[cdIdx].totalAmount + accrualSum,
            activeAmount: updatedClientDebts[cdIdx].activeAmount + accrualSum,
            lastUpdate: now.toISOString(),
          };
        } else {
          updatedClientDebts.push({
            id: generateId(),
            clientId: debt.clientId,
            totalAmount: accrualSum,
            frozenAmount: 0,
            activeAmount: accrualSum,
            lastUpdate: now.toISOString(),
          });
        }

        console.log(`[DebtAccrual] Manual debt ${debt.id}: +${extraDays} days, +${accrualSum} (rate ${rate})`);
      }

      if (newAccruals.length > 0 || updatedDebts) {
        console.log(`[DebtAccrual] Added ${newAccruals.length} accruals`);
        return {
          ...prev,
          dailyDebtAccruals: [...prev.dailyDebtAccruals, ...newAccruals],
          clientDebts: updatedClientDebts,
          ...(updatedDebts ? { debts: updatedDebts } : {}),
        };
      }

      return prev;
    });
  }, [update]);

  const runOccupancySnapshot = useCallback(() => {
    update(prev => {
      const now = new Date();
      const todayDateStr = now.toISOString().split('T')[0];

      const lastSnapshot = prev.dailyOccupancySnapshots.length > 0
        ? prev.dailyOccupancySnapshots[prev.dailyOccupancySnapshots.length - 1]
        : null;

      const missedDates: string[] = [];
      if (lastSnapshot) {
        const lastDate = new Date(lastSnapshot.date);
        lastDate.setDate(lastDate.getDate() + 1);
        while (lastDate.toISOString().split('T')[0] < todayDateStr) {
          missedDates.push(lastDate.toISOString().split('T')[0]);
          lastDate.setDate(lastDate.getDate() + 1);
        }
      }

      const alreadyHasToday = prev.dailyOccupancySnapshots.some(s => s.date === todayDateStr);
      const shouldSnapshotToday = now.getHours() >= 4 && !alreadyHasToday;

      if (!shouldSnapshotToday && missedDates.length === 0) return prev;

      const activeCarsNow = prev.sessions.filter(
        s => ['active', 'active_debt'].includes(s.status) && !s.exitTime && !s.cancelled
      );

      const buildSnapshot = (dateStr: string, snapshotTime: string): DailyOccupancySnapshot => {
        const snapshotDate = new Date(dateStr + 'T04:00:00');
        const carsOnDate = activeCarsNow.filter(s => new Date(s.entryTime) <= snapshotDate);

        return {
          id: generateId(),
          date: dateStr,
          snapshotTime,
          cars: carsOnDate.map(s => {
            const car = prev.cars.find(c => c.id === s.carId);
            const client = prev.clients.find(c => c.id === s.clientId);
            const entryDate = new Date(s.entryTime);
            const diffMs = snapshotDate.getTime() - entryDate.getTime();
            const daysParked = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
            return {
              carId: s.carId,
              clientId: s.clientId,
              plateNumber: car?.plateNumber ?? '???',
              clientName: client?.name ?? 'Неизвестный',
              sessionId: s.id,
              serviceType: s.serviceType,
              entryTime: s.entryTime,
              daysParked,
            };
          }),
          totalCars: carsOnDate.length,
        };
      };

      const newSnapshots: DailyOccupancySnapshot[] = [];

      for (const missedDate of missedDates) {
        newSnapshots.push(buildSnapshot(missedDate, missedDate + 'T04:00:00.000Z'));
      }

      if (shouldSnapshotToday) {
        newSnapshots.push(buildSnapshot(todayDateStr, now.toISOString()));
      }

      if (newSnapshots.length === 0) return prev;

      console.log(`[OccupancySnapshot] Generated ${newSnapshots.length} snapshot(s), latest: ${newSnapshots[newSnapshots.length - 1].date}, cars: ${newSnapshots[newSnapshots.length - 1].totalCars}`);

      return {
        ...prev,
        dailyOccupancySnapshots: [...prev.dailyOccupancySnapshots, ...newSnapshots].slice(-365),
      };
    });
  }, [update]);

  const runDebtAccrualRef = useRef(runDebtAccrual);
  const runOccupancySnapshotRef = useRef(runOccupancySnapshot);
  useEffect(() => {
    runDebtAccrualRef.current = runDebtAccrual;
    runOccupancySnapshotRef.current = runOccupancySnapshot;
  }, [runDebtAccrual, runOccupancySnapshot]);

  useEffect(() => {
    if (!isLoaded) return;
    runDebtAccrualRef.current();
    runOccupancySnapshotRef.current();
    const interval = setInterval(() => {
      runDebtAccrualRef.current();
      runOccupancySnapshotRef.current();
    }, 60000);
    return () => clearInterval(interval);
  }, [isLoaded]);

  const paySessionDebt = useCallback((clientId: string, amount: number, method: PaymentMethod) => {
    if (!currentUser || amount <= 0) return;
    if (!currentShift) {
      console.log('[PaySessionDebt] Отказ: смена не открыта');
      return;
    }
    const now = new Date().toISOString();

    const clientActiveSessions = data.sessions.filter(
      s => s.clientId === clientId && ['active', 'active_debt'].includes(s.status) && !s.exitTime && !s.cancelled
    );

    let totalSessionDebt = 0;
    for (const session of clientActiveSessions) {
      totalSessionDebt += calculateActiveSessionDebt(session, data.tariffs, data.subscriptions, data.debts);
    }

    const actualAmount = roundMoney(Math.min(amount, totalSessionDebt));
    if (actualAmount <= 0) return;

    let updatedShifts = data.shifts;
    const newAdminOps: AdminCashOperation[] = [];
    if (method === 'cash' && currentShift) {
      updatedShifts = updatedShifts.map(s =>
        s.id === currentShift.id ? { ...s, expectedCash: s.expectedCash + actualAmount } : s
      );
    }
    if (method === 'card') {
      newAdminOps.push({
        id: generateId(), type: 'card_income', amount: actualAmount,
        method: 'card', description: 'Безнал: погашение долга сессии',
        date: now, operatorId: currentUser.id, operatorName: currentUser.name,
      });
    }

    let updatedClientDebts = data.clientDebts.map(cd =>
      cd.clientId === clientId
        ? {
            ...cd,
            totalAmount: Math.max(0, cd.totalAmount - actualAmount),
            activeAmount: Math.max(0, cd.activeAmount - actualAmount),
            lastUpdate: now,
          }
        : cd
    );

    let remaining = actualAmount;
    let updatedSessions = data.sessions;
    for (const session of clientActiveSessions) {
      if (remaining <= 0) break;
      const sessionDebt = calculateActiveSessionDebt(session, data.tariffs, data.subscriptions, data.debts);
      if (sessionDebt <= 0) continue;
      const payForSession = Math.min(remaining, sessionDebt);
      updatedSessions = updatedSessions.map(s =>
        s.id === session.id
          ? { ...s, prepaidAmount: s.prepaidAmount + payForSession }
          : s
      );
      remaining -= payForSession;
    }

    update(prev => ({
      ...prev,
      sessions: updatedSessions,
      shifts: updatedShifts,
      clientDebts: updatedClientDebts,
      transactions: [{
        id: generateId(), type: 'debt_payment' as const, amount: actualAmount,
        description: 'Погашение долга (сессия)', method,
        clientId,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
        shiftId: currentShift?.id,
      }, ...prev.transactions],
      payments: [{
        id: generateId(), clientId, carId: clientActiveSessions[0]?.carId ?? '',
        amount: actualAmount, method, type: 'debt_payment',
        description: 'Погашение долга (сессия)',
        operatorId: currentUser.id, operatorName: currentUser.name,
        date: now, shiftId: currentShift?.id,
      }, ...prev.payments],
      adminCashOperations: [...newAdminOps, ...prev.adminCashOperations],
    }));

    logAction('session_debt_payment', 'Погашение долга сессии', `${actualAmount} ${method}`, clientId, 'client');
    console.log(`[paySessionDebt] client=${clientId}, amount=${actualAmount}, method=${method}`);
  }, [currentUser, data.sessions, data.tariffs, data.subscriptions, data.debts, data.shifts, data.clientDebts, currentShift, update, logAction]);

  const addManualDebt = useCallback((clientId: string, amount: number, comment: string, carId?: string, lombardAccrual?: boolean) => {
    if (!currentUser) return;
    const now = new Date().toISOString();
    const debtId = generateId();
    const debt: Debt = {
      id: debtId,
      clientId,
      carId: carId || '',
      totalAmount: roundMoney(amount),
      remainingAmount: roundMoney(amount),
      status: 'active',
      description: comment || 'Ручной долг',
      createdAt: now,
      isManual: true,
    };

    const newAccruals: DailyDebtAccrual[] = [];
    let updatedClientDebts = [...data.clientDebts];

    if (lombardAccrual && carId) {
      const rate = data.tariffs.lombardRate;
      newAccruals.push({
        id: generateId(),
        parkingEntryId: debtId,
        clientId,
        carId,
        amount: rate,
        tariffRate: rate,
        accrualDate: now.split('T')[0],
      });
      const cdIdx = updatedClientDebts.findIndex(cd => cd.clientId === clientId);
      if (cdIdx >= 0) {
        updatedClientDebts[cdIdx] = {
          ...updatedClientDebts[cdIdx],
          totalAmount: updatedClientDebts[cdIdx].totalAmount + amount,
          activeAmount: updatedClientDebts[cdIdx].activeAmount + amount,
          lastUpdate: now,
        };
      } else {
        updatedClientDebts.push({
          id: generateId(),
          clientId,
          totalAmount: amount,
          frozenAmount: 0,
          activeAmount: amount,
          lastUpdate: now,
        });
      }
    }

    update(prev => ({
      ...prev,
      debts: [...prev.debts, debt],
      dailyDebtAccruals: [...prev.dailyDebtAccruals, ...newAccruals],
      clientDebts: lombardAccrual ? updatedClientDebts : prev.clientDebts,
      transactions: [{
        id: generateId(), type: 'debt' as const, amount: roundMoney(amount),
        description: comment || 'Ручной долг', clientId, carId,
        operatorId: currentUser.id, operatorName: currentUser.name, date: now,
      }, ...prev.transactions],
    }));
    logAction('debt_add', 'Долг добавлен', `${amount}: ${comment}${lombardAccrual ? ' (ломбард)' : ''}`, debt.id, 'debt');
  }, [currentUser, data.clientDebts, data.tariffs, update, logAction]);

  const deleteDebt = useCallback((debtId: string) => {
    if (!currentUser) return;
    update(prev => ({
      ...prev,
      debts: prev.debts.map(d =>
        d.id === debtId ? { ...d, remainingAmount: 0, status: 'paid' as const } : d
      ),
    }));
    logAction('debt_delete', 'Долг удалён', '', debtId, 'debt');
  }, [currentUser, update, logAction]);

  const adminForceCloseShift = useCallback((shiftId: string, actualCash: number, note?: string) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    const now = new Date().toISOString();
    const targetShift = data.shifts.find(s => s.id === shiftId && s.status === 'open');
    if (!targetShift) return;

    const shiftTransactions = data.transactions.filter(t => {
      if (t.shiftId === targetShift.id) return true;
      const tDate = new Date(t.date).getTime();
      const openDate = new Date(targetShift.openedAt).getTime();
      return tDate >= openDate && tDate <= Date.now();
    });

    const cashIncome = shiftTransactions
      .filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'cash')
      .reduce((sum, t) => sum + t.amount, 0);
    const cardIncome = shiftTransactions
      .filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'card')
      .reduce((sum, t) => sum + t.amount, 0);
    const cancelled = shiftTransactions
      .filter(t => t.type === 'cancel_payment' && t.method === 'cash')
      .reduce((sum, t) => sum + t.amount, 0);
    const refunded = shiftTransactions
      .filter(t => t.type === 'refund' && t.method === 'cash')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = data.expenses
      .filter(e => e.shiftId === targetShift.id)
      .reduce((sum, e) => sum + e.amount, 0);
    const totalWithdrawals = data.withdrawals
      .filter(w => w.shiftId === targetShift.id)
      .reduce((sum, w) => sum + w.amount, 0);

    const startBalance = targetShift.acceptedCash ?? targetShift.carryOver;
    const calculatedBalance = startBalance + cashIncome - cancelled - refunded - totalExpenses - totalWithdrawals;
    const discrepancy = roundMoney(actualCash - calculatedBalance);

    const closingSummary = {
      cashIncome: roundMoney(cashIncome),
      cardIncome: roundMoney(cardIncome),
      totalExpenses: roundMoney(totalExpenses),
      totalWithdrawals: roundMoney(totalWithdrawals),
      calculatedBalance: roundMoney(calculatedBalance),
      discrepancy,
    };

    update(prev => ({
      ...prev,
      shifts: prev.shifts.map(s =>
        s.id === shiftId ? {
          ...s,
          status: 'closed' as const,
          closedAt: now,
          actualCash: roundMoney(actualCash),
          expectedCash: roundMoney(calculatedBalance),
          cashVariance: Math.abs(discrepancy),
          cashVarianceType: discrepancy === 0 ? 'none' as const : discrepancy < 0 ? 'short' as const : 'over' as const,
          closingSummary,
          note: note ? `[Закрыта админом] ${note}` : '[Закрыта админом]',
        } : s
      ),
    }));

    logAction('admin_force_close_shift', 'Смена закрыта админом', `Менеджер: ${targetShift.operatorName}, Факт: ${actualCash}, Расхождение: ${discrepancy}`, shiftId, 'shift');
    console.log(`[AdminForceCloseShift] Closed shift ${shiftId} of ${targetShift.operatorName}`);
  }, [currentUser, data.shifts, data.transactions, data.expenses, data.withdrawals, update, logAction]);

  const addExpenseCategory = useCallback((name: string, type: ExpenseCategory['type']) => {
    const cat: ExpenseCategory = { id: generateId(), name, type };
    update(prev => ({ ...prev, expenseCategories: [...prev.expenseCategories, cat] }));
    return cat;
  }, [update]);

  const deleteExpenseCategory = useCallback((catId: string) => {
    update(prev => ({
      ...prev,
      expenseCategories: prev.expenseCategories.map(c => c.id === catId ? { ...c, deleted: true } : c),
    }));
  }, [update]);

  const createBackup = useCallback((): string => {
    return JSON.stringify({
      formatId: 'park_manager_backup',
      version: 2,
      createdAt: new Date().toISOString(),
      data,
    });
  }, [data]);

  const restoreBackup = useCallback((jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      const backupData = parsed.data || parsed;
      const restored: AppData = { ...createEmptyData(), ...backupData };
      const adminUser = data.users.find(u => u.role === 'admin');
      if (adminUser && !restored.users.find(u => u.role === 'admin')) {
        restored.users.push(adminUser);
      }
      setData(restored);
      persist(restored);
      logAction('backup_restore', 'Восстановление из бэкапа', 'Данные восстановлены');
      return { success: true };
    } catch (e) {
      console.log('[Parking] Restore error:', e);
      return { success: false, error: 'Неверный формат файла' };
    }
  }, [data.users, persist, logAction]);

  const exportClientsJson = useCallback((): string => {
    const clients = data.clients.filter(c => !c.deleted);
    const cars = data.cars.filter(c => !c.deleted);
    const subscriptions = data.subscriptions.filter(s =>
      clients.some(cl => cl.id === s.clientId)
    );
    return JSON.stringify({
      formatId: 'park_manager_clients',
      version: 1,
      createdAt: new Date().toISOString(),
      data: { clients, cars, subscriptions },
    });
  }, [data.clients, data.cars, data.subscriptions]);

  const importClientsJson = useCallback((jsonString: string): { success: boolean; error?: string; imported?: number; skipped?: number } => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.formatId !== 'park_manager_clients') {
        return { success: false, error: 'Неверный формат файла. Ожидается файл экспорта клиентов.' };
      }
      const importData = parsed.data as { clients: Client[]; cars: Car[]; subscriptions?: typeof data.subscriptions };
      if (!importData?.clients || !Array.isArray(importData.clients)) {
        return { success: false, error: 'Файл не содержит данных клиентов.' };
      }

      let imported = 0;
      let skipped = 0;
      const existingPhones = new Set(data.clients.filter(c => !c.deleted).map(c => c.phone));
      const existingPlates = new Set(data.cars.filter(c => !c.deleted).map(c => c.plateNumber.toUpperCase()));

      const newClients: Client[] = [];
      const newCars: Car[] = [];
      const idMap = new Map<string, string>();

      for (const client of importData.clients) {
        if (client.deleted) { skipped++; continue; }
        if (existingPhones.has(client.phone)) {
          skipped++;
          idMap.set(client.id, '');
          continue;
        }
        const newId = generateId();
        idMap.set(client.id, newId);
        newClients.push({ ...client, id: newId, createdAt: client.createdAt ?? new Date().toISOString() });
        existingPhones.add(client.phone);
        imported++;
      }

      if (importData.cars && Array.isArray(importData.cars)) {
        for (const car of importData.cars) {
          if (car.deleted) continue;
          const newClientId = idMap.get(car.clientId);
          if (!newClientId) continue;
          if (existingPlates.has(car.plateNumber.toUpperCase())) continue;
          newCars.push({ ...car, id: generateId(), clientId: newClientId });
          existingPlates.add(car.plateNumber.toUpperCase());
        }
      }

      let newSubs: typeof data.subscriptions = [];
      if (importData.subscriptions && Array.isArray(importData.subscriptions)) {
        for (const sub of importData.subscriptions) {
          const newClientId = idMap.get(sub.clientId);
          if (!newClientId) continue;
          const newCarId = newCars.find(c => c.clientId === newClientId)?.id;
          if (!newCarId) continue;
          newSubs.push({ ...sub, id: generateId(), clientId: newClientId, carId: newCarId });
        }
      }

      if (newClients.length === 0) {
        return { success: true, imported: 0, skipped };
      }

      update(prev => ({
        ...prev,
        clients: [...prev.clients, ...newClients],
        cars: [...prev.cars, ...newCars],
        subscriptions: [...prev.subscriptions, ...newSubs],
      }));

      logAction('clients_import', 'Импорт клиентов', `Импортировано: ${imported}, пропущено: ${skipped}`);
      console.log(`[Parking] Imported ${imported} clients, ${newCars.length} cars, skipped ${skipped}`);
      return { success: true, imported, skipped };
    } catch (e) {
      console.log('[Parking] Import clients error:', e);
      return { success: false, error: 'Ошибка чтения файла' };
    }
  }, [data.clients, data.cars, update, logAction]);

  const saveCleanupChecklist = useCallback((shiftId: string, checklist: CleanupChecklistItem[]) => {
    update(prev => ({
      ...prev,
      scheduledShifts: prev.scheduledShifts.map(s =>
        s.id === shiftId ? { ...s, cleanupChecklist: checklist } : s
      ),
    }));
  }, [update]);

  const resetAllData = useCallback(() => {
    const fresh = createEmptyData();
    fresh.users = data.users;
    fresh.tariffs = data.tariffs;
    fresh.clients = data.clients;
    fresh.cars = data.cars;
    fresh.expenseCategories = data.expenseCategories;
    fresh.cleanupChecklistTemplate = data.cleanupChecklistTemplate;
    fresh.subscriptions = [];
    fresh.clientDebts = [];
    fresh.debts = [];
    setData(fresh);
    persist(fresh);
    console.log('[ResetData] Data reset. Preserved: clients, cars, users, tariffs, admin settings');
  }, [data.users, data.tariffs, data.clients, data.cars, data.expenseCategories, data.cleanupChecklistTemplate, persist]);

  const logLogin = useCallback((user: User) => {
    const entry: LoginLogEntry = {
      id: generateId(),
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      timestamp: new Date().toISOString(),
    };
    update(prev => ({
      ...prev,
      loginLogs: [entry, ...prev.loginLogs].slice(0, 1000),
    }));
  }, [update]);

  const addSessionNote = useCallback((sessionId: string, text: string, type: SessionNote['type']) => {
    if (!currentUser || !text.trim()) return;
    const note: SessionNote = {
      id: generateId(),
      sessionId,
      text: text.trim(),
      authorId: currentUser.id,
      authorName: currentUser.name,
      createdAt: new Date().toISOString(),
      type,
    };
    update(prev => ({
      ...prev,
      sessionNotes: [note, ...prev.sessionNotes].slice(0, 5000),
    }));
    logAction('session_note', 'Заметка к сессии', text.trim(), sessionId, 'session');
  }, [currentUser, update, logAction]);

  const getSessionNotes = useCallback((sessionId: string): SessionNote[] => {
    return data.sessionNotes.filter(n => n.sessionId === sessionId);
  }, [data.sessionNotes]);

  const getSessionAccrualTotal = useCallback((sessionId: string): number => {
    const session = data.sessions.find(s => s.id === sessionId);
    if (!session) return 0;
    if (session.serviceType !== 'lombard' && session.status !== 'active_debt') {
      return data.dailyDebtAccruals
        .filter(a => a.parkingEntryId === sessionId)
        .reduce((sum, a) => sum + a.amount, 0);
    }
    const rate = session.lombardRateApplied || data.tariffs.lombardRate;
    const days = calculateDays(session.entryTime, session.exitTime ?? undefined, true);
    return roundMoney(days * rate);
  }, [data.sessions, data.dailyDebtAccruals, data.tariffs.lombardRate]);

  const activeExpenseCategories = useMemo(() =>
    data.expenseCategories.filter(c => !c.deleted),
  [data.expenseCategories]);

  const applyHealing = useCallback((patch: Partial<Pick<AppData, 'debts' | 'clientDebts' | 'salaryAdvances'>>) => {
    update(prev => ({ ...prev, ...patch }));
  }, [update]);

  return useMemo(() => ({
    ...data,
    isLoaded,
    currentShift,
    needsShiftCheck,
    addClient,
    addCarToClient,
    updateClient,
    deleteClient,
    updateCar,
    deleteCar,
    checkIn,
    checkOut,
    cancelCheckIn,
    cancelCheckOut,
    cancelPayment,
    earlyExitWithRefund,
    openShift,
    closeShift,
    addExpense,
    payDebt,
    paySessionDebt,
    payMonthly,
    withdrawCash,
    updateTariffs,
    addUser,
    toggleUserActive,
    removeUser,
    updateManagedUserPassword,
    activeClients,
    activeCars,
    activeSessions,
    activeDebts,
    todayStats,
    getClientDebtTotal,
    debtors,
    expiringSubscriptions,
    resetAllData,
    addScheduledShift,
    updateScheduledShift,
    deleteScheduledShift,
    addViolation,
    deleteViolation,
    issueSalaryAdvance,
    paySalary,
    addAdminExpense,
    adminWithdrawFromManager,
    updateCleanupTemplate,
    completeCleanup,
    saveCleanupChecklist,
    getCurrentViolationMonth,
    getTodayCleaningShift,
    activeScheduledShifts,
    adminCashBalance,
    employeeSalaryDebts,
    addManualDebt,
    deleteDebt,
    addExpenseCategory,
    deleteExpenseCategory,
    activeExpenseCategories,
    logLogin,
    addSessionNote,
    getSessionNotes,
    getSessionAccrualTotal,
    createBackup,
    adminForceCloseShift,
    applyHealing,
    restoreBackup,
    exportClientsJson,
    importClientsJson,
    syncStatus,
  }), [
    data, isLoaded, currentShift, needsShiftCheck, syncStatus,
    addClient, addCarToClient, updateClient, deleteClient, updateCar, deleteCar,
    checkIn, checkOut, cancelCheckIn, cancelCheckOut, cancelPayment, earlyExitWithRefund,
    openShift, closeShift, addExpense, payDebt, paySessionDebt, payMonthly, withdrawCash,
    updateTariffs, addUser, toggleUserActive, removeUser, updateManagedUserPassword,
    activeClients, activeCars, activeSessions, activeDebts,
    todayStats, getClientDebtTotal, debtors, expiringSubscriptions, resetAllData,
    addScheduledShift, updateScheduledShift, deleteScheduledShift,
    addViolation, deleteViolation,
    issueSalaryAdvance, paySalary, addAdminExpense, adminWithdrawFromManager,
    updateCleanupTemplate, completeCleanup, saveCleanupChecklist,
    getCurrentViolationMonth, getTodayCleaningShift, activeScheduledShifts,
    adminCashBalance, employeeSalaryDebts,
    addManualDebt, deleteDebt, addExpenseCategory, deleteExpenseCategory, activeExpenseCategories,
    logLogin, addSessionNote, getSessionNotes, getSessionAccrualTotal,
    adminForceCloseShift,
    createBackup, restoreBackup, applyHealing, exportClientsJson, importClientsJson,
  ]);
});
