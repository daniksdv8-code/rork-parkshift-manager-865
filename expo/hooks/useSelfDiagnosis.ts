import { useEffect, useRef, useCallback } from 'react';
import { useParking } from '@/providers/ParkingProvider';
import { logAnomaly, loadAnomalyLog } from '@/utils/anomaly-logger';
import { calculateShiftCashBalance } from '@/utils/financeCalculations';

import { AppData, Debt, ClientDebt, SalaryAdvance } from '@/types';

const INITIAL_DELAY_MS = 10000;
const INTERVAL_MS = 120000;
const MIN_GAP_MS = 30000;

export function useSelfDiagnosis() {
  const parking = useParking();
  const lastRunRef = useRef<number>(0);

  const runDiagnosis = useCallback(() => {
    const now = Date.now();
    if (now - lastRunRef.current < MIN_GAP_MS) return;
    lastRunRef.current = now;

    console.log('[SelfDiagnosis] Running checks...');

    verifyShiftIntegrity(parking);
    verifyDebtConsistency(parking);
    verifySalaryAdvanceConsistency(parking);
    verifySessionStates(parking);

    const healingPatch = buildHealingPatch(parking);
    if (healingPatch && parking.applyHealing) {
      parking.applyHealing(healingPatch);
      console.log('[SelfDiagnosis] Safe healing applied and persisted');
    }

    console.log('[SelfDiagnosis] Checks complete');
  }, [parking]);

  useEffect(() => {
    if (!parking.isLoaded) return;

    loadAnomalyLog().catch(() => {});

    const initialTimer = setTimeout(runDiagnosis, INITIAL_DELAY_MS);
    const interval = setInterval(runDiagnosis, INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [parking.isLoaded, runDiagnosis]);

  return { runDiagnosis };
}

function verifyShiftIntegrity(data: AppData & Record<string, unknown>) {
  const openShifts = data.shifts.filter(s => s.status === 'open');
  if (openShifts.length > 1) {
    logAnomaly({
      severity: 'warning',
      category: 'shift_anomaly',
      message: `Найдено ${openShifts.length} открытых смен одновременно`,
      expected: '1',
      actual: String(openShifts.length),
      action: 'admin_alert',
      actionDetail: 'Рекомендуется закрыть лишние смены',
    });
  }

  for (const shift of data.shifts.filter(s => s.status === 'closed' && s.closingSummary)) {
    const calculated = calculateShiftCashBalance(
      shift,
      data.transactions,
      data.expenses,
      data.withdrawals,
    );
    const diff = Math.abs(calculated - (shift.closingSummary?.calculatedBalance ?? 0));
    if (diff > 1) {
      logAnomaly({
        severity: 'warning',
        category: 'cash_balance',
        message: `Расхождение в расчёте баланса смены ${shift.operatorName}`,
        expected: String(shift.closingSummary?.calculatedBalance ?? 0),
        actual: String(calculated),
        action: 'logged_only',
        entityId: shift.id,
        entityType: 'shift',
      });
    }
  }
}

function verifyDebtConsistency(data: AppData & Record<string, unknown>) {
  for (const debt of data.debts) {
    if (debt.remainingAmount < 0) {
      logAnomaly({
        severity: 'error',
        category: 'debt_mismatch',
        message: `Отрицательный остаток долга: ${debt.remainingAmount}`,
        expected: '>= 0',
        actual: String(debt.remainingAmount),
        action: 'normalized',
        actionDetail: 'Остаток будет обнулён при следующем healing',
        entityId: debt.id,
        entityType: 'debt',
      });
    }
  }

  for (const cd of data.clientDebts) {
    if (cd.totalAmount < 0) {
      logAnomaly({
        severity: 'error',
        category: 'debt_mismatch',
        message: `Отрицательный ClientDebt для клиента`,
        expected: '>= 0',
        actual: String(cd.totalAmount),
        action: 'normalized',
        entityId: cd.clientId,
        entityType: 'clientDebt',
      });
    }
  }

  const orphanDebts = data.debts.filter(d => {
    if (d.status !== 'active') return false;
    const clientExists = data.clients.some(c => c.id === d.clientId && !c.deleted);
    return !clientExists;
  });

  if (orphanDebts.length > 0) {
    logAnomaly({
      severity: 'warning',
      category: 'orphan_entity',
      message: `Найдено ${orphanDebts.length} долгов без клиента (удалён)`,
      action: 'logged_only',
      actionDetail: orphanDebts.map(d => d.id).join(', '),
    });
  }
}

function verifySalaryAdvanceConsistency(data: AppData & Record<string, unknown>) {
  for (const adv of data.salaryAdvances) {
    if (adv.remainingAmount < 0) {
      logAnomaly({
        severity: 'error',
        category: 'salary_mismatch',
        message: `Отрицательный остаток аванса: ${adv.remainingAmount} (${adv.employeeName})`,
        expected: '>= 0',
        actual: String(adv.remainingAmount),
        action: 'normalized',
        entityId: adv.id,
        entityType: 'salaryAdvance',
      });
    }
    if (adv.remainingAmount > adv.amount) {
      logAnomaly({
        severity: 'error',
        category: 'salary_mismatch',
        message: `Остаток аванса больше суммы: ${adv.remainingAmount} > ${adv.amount}`,
        expected: `<= ${adv.amount}`,
        actual: String(adv.remainingAmount),
        action: 'logged_only',
        entityId: adv.id,
        entityType: 'salaryAdvance',
      });
    }
  }
}

function verifySessionStates(data: AppData & Record<string, unknown>) {
  const activeSessions = data.sessions.filter(
    s => ['active', 'active_debt'].includes(s.status) && !s.cancelled
  );

  const carSessionMap = new Map<string, number>();
  for (const session of activeSessions) {
    carSessionMap.set(session.carId, (carSessionMap.get(session.carId) ?? 0) + 1);
  }

  for (const [carId, count] of carSessionMap) {
    if (count > 1) {
      const car = data.cars.find(c => c.id === carId);
      logAnomaly({
        severity: 'error',
        category: 'session_state',
        message: `Авто ${car?.plateNumber ?? carId} имеет ${count} активных сессий`,
        expected: '1',
        actual: String(count),
        action: 'admin_alert',
        entityId: carId,
        entityType: 'car',
      });
    }
  }

  for (const session of data.sessions) {
    if (session.status === 'completed' && !session.exitTime && !session.cancelled) {
      logAnomaly({
        severity: 'warning',
        category: 'session_state',
        message: 'Сессия completed без exitTime',
        action: 'logged_only',
        entityId: session.id,
        entityType: 'session',
      });
    }
  }
}

export interface HealingPatch {
  debts?: Debt[];
  clientDebts?: ClientDebt[];
  salaryAdvances?: SalaryAdvance[];
}

function buildHealingPatch(data: AppData & Record<string, unknown>): HealingPatch | null {
  let patch: HealingPatch | null = null;

  const needsDebtFix = data.debts.some(d => d.remainingAmount < 0);
  if (needsDebtFix) {
    if (!patch) patch = {};
    patch.debts = data.debts.map(d => {
      if (d.remainingAmount < 0) {
        logAnomaly({
          severity: 'info',
          category: 'general',
          message: `Исправлен отрицательный долг → 0`,
          action: 'recalculated',
          entityId: d.id,
          entityType: 'debt',
        });
        return { ...d, remainingAmount: 0 };
      }
      return d;
    });
  }

  const needsCdFix = data.clientDebts.some(cd => cd.totalAmount < 0);
  if (needsCdFix) {
    if (!patch) patch = {};
    patch.clientDebts = data.clientDebts.map(cd => {
      if (cd.totalAmount < 0) {
        logAnomaly({
          severity: 'info',
          category: 'general',
          message: `Исправлен отрицательный ClientDebt → 0`,
          action: 'recalculated',
          entityId: cd.clientId,
          entityType: 'clientDebt',
        });
        return { ...cd, totalAmount: 0, activeAmount: Math.max(0, cd.activeAmount), frozenAmount: Math.max(0, cd.frozenAmount) };
      }
      return cd;
    });
  }

  const needsAdvFix = data.salaryAdvances.some(a => a.remainingAmount < 0);
  if (needsAdvFix) {
    if (!patch) patch = {};
    patch.salaryAdvances = data.salaryAdvances.map(a => {
      if (a.remainingAmount < 0) {
        logAnomaly({
          severity: 'info',
          category: 'general',
          message: `Исправлен отрицательный аванс → 0 (${a.employeeName})`,
          action: 'recalculated',
          entityId: a.id,
          entityType: 'salaryAdvance',
        });
        return { ...a, remainingAmount: 0 };
      }
      return a;
    });
  }

  return patch;
}
