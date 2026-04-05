import {
  CashShift, Transaction, Expense, CashWithdrawal,
  Debt, ClientDebt, DailyDebtAccrual, ParkingSession,
  AdminCashOperation, SalaryAdvance, SalaryPayment,
  Tariffs, MonthlySubscription,
} from '@/types';
import { roundMoney, calculateDays } from './helpers';

export function calculateShiftCashBalance(
  shift: CashShift,
  transactions: Transaction[],
  expenses: Expense[],
  withdrawals: CashWithdrawal[],
): number {
  const shiftTx = transactions.filter(t => {
    if (t.shiftId === shift.id) return true;
    const tDate = new Date(t.date).getTime();
    const openDate = new Date(shift.openedAt).getTime();
    const closeDate = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now();
    return tDate >= openDate && tDate <= closeDate;
  });

  const cashIncome = shiftTx
    .filter(t => ['payment', 'debt_payment'].includes(t.type) && t.method === 'cash')
    .reduce((s, t) => s + t.amount, 0);

  const cancelled = shiftTx
    .filter(t => t.type === 'cancel_payment' && t.method === 'cash')
    .reduce((s, t) => s + t.amount, 0);

  const refunded = shiftTx
    .filter(t => t.type === 'refund' && t.method === 'cash')
    .reduce((s, t) => s + t.amount, 0);

  const shiftExpenses = expenses
    .filter(e => e.shiftId === shift.id)
    .reduce((s, e) => s + e.amount, 0);

  const shiftWithdrawals = withdrawals
    .filter(w => w.shiftId === shift.id)
    .reduce((s, w) => s + w.amount, 0);

  const startBalance = shift.acceptedCash ?? shift.carryOver;
  return roundMoney(startBalance + cashIncome - cancelled - refunded - shiftExpenses - shiftWithdrawals);
}

export function calculateClientDebtBreakdown(
  clientId: string,
  debts: Debt[],
  clientDebts: ClientDebt[],
  sessions: ParkingSession[],
  dailyDebtAccruals: DailyDebtAccrual[],
  tariffs: Tariffs,
): {
  oldDebtsTotal: number;
  clientDebtTotal: number;
  overstayTotal: number;
  total: number;
} {
  const oldDebtsTotal = debts
    .filter(d => d.clientId === clientId && d.status === 'active')
    .reduce((s, d) => s + d.remainingAmount, 0);

  const cd = clientDebts.find(c => c.clientId === clientId);
  const clientDebtTotal = cd?.totalAmount ?? 0;

  let overstayTotal = 0;
  const activeSessions = sessions.filter(
    s => s.clientId === clientId && ['active', 'active_debt'].includes(s.status) && !s.cancelled
  );

  for (const session of activeSessions) {
    if (session.serviceType === 'onetime') {
      const days = calculateDays(session.entryTime);
      const standardRate = session.prepaidMethod === 'card' ? tariffs.onetimeCard : tariffs.onetimeCash;
      const rate = (session.customRate !== undefined && session.isDiscounted) ? session.customRate : standardRate;
      const totalOwed = days * rate;
      const paidDebts = debts
        .filter(d => d.parkingEntryId === session.id && d.status === 'paid')
        .reduce((s, d) => s + d.totalAmount, 0);
      const owing = Math.max(0, totalOwed - Math.max(session.prepaidAmount, paidDebts));
      overstayTotal += owing;
    }
  }

  return {
    oldDebtsTotal: roundMoney(oldDebtsTotal),
    clientDebtTotal: roundMoney(clientDebtTotal),
    overstayTotal: roundMoney(overstayTotal),
    total: roundMoney(oldDebtsTotal + clientDebtTotal + overstayTotal),
  };
}

export function calculateAdminCashRegister(
  adminOps: AdminCashOperation[],
  withdrawals: CashWithdrawal[],
  salaryAdvances: SalaryAdvance[],
  salaryPayments: SalaryPayment[],
  fromDate?: Date,
  toDate?: Date,
): {
  cardIncome: number;
  cashFromManagers: number;
  adminExpenses: number;
  salaryAdvanceTotal: number;
  salaryPaymentTotal: number;
  balance: number;
  operations: AdminCashOperation[];
} {
  const inRange = (dateStr: string) => {
    if (!fromDate && !toDate) return true;
    const d = new Date(dateStr).getTime();
    if (fromDate && d < fromDate.getTime()) return false;
    if (toDate && d > toDate.getTime()) return false;
    return true;
  };

  const filteredOps = adminOps.filter(o => inRange(o.date));

  const cardIncome = filteredOps
    .filter(o => o.type === 'card_income')
    .reduce((s, o) => s + o.amount, 0);

  const cashFromManagers = withdrawals
    .filter(w => inRange(w.date))
    .reduce((s, w) => s + w.amount, 0);

  const adminExpenses = filteredOps
    .filter(o => o.type === 'admin_expense')
    .reduce((s, o) => s + o.amount, 0);

  const salaryAdvanceTotal = filteredOps
    .filter(o => o.type === 'salary_advance')
    .reduce((s, o) => s + o.amount, 0);

  const salaryPaymentTotal = filteredOps
    .filter(o => o.type === 'salary_payment')
    .reduce((s, o) => s + o.amount, 0);

  const balance = roundMoney(
    cardIncome + cashFromManagers - adminExpenses - salaryAdvanceTotal - salaryPaymentTotal
  );

  return {
    cardIncome: roundMoney(cardIncome),
    cashFromManagers: roundMoney(cashFromManagers),
    adminExpenses: roundMoney(adminExpenses),
    salaryAdvanceTotal: roundMoney(salaryAdvanceTotal),
    salaryPaymentTotal: roundMoney(salaryPaymentTotal),
    balance,
    operations: filteredOps.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  };
}

export function calculateActiveSessionDebt(
  session: ParkingSession,
  tariffs: Tariffs,
  subscriptions: MonthlySubscription[],
  debts: Debt[],
): number {
  const debtPaidOnSession = debts
    .filter(d => d.parkingEntryId === session.id)
    .reduce((s, d) => s + Math.max(0, d.totalAmount - d.remainingAmount), 0);
  const totalPaid = session.prepaidAmount + debtPaidOnSession;

  if (session.serviceType === 'lombard' || session.status === 'active_debt') {
    const rate = session.lombardRateApplied || tariffs.lombardRate;
    const days = calculateDays(session.entryTime);
    return roundMoney(Math.max(0, days * rate - totalPaid));
  }

  if (session.serviceType === 'onetime') {
    const standardRate = session.prepaidMethod === 'card' ? tariffs.onetimeCard : tariffs.onetimeCash;
    const rate = (session.customRate !== undefined && session.isDiscounted) ? session.customRate : standardRate;
    const days = calculateDays(session.entryTime);
    return roundMoney(Math.max(0, days * rate - totalPaid));
  }

  if (session.serviceType === 'monthly') {
    const sub = subscriptions.find(
      s => s.clientId === session.clientId && s.carId === session.carId
    );
    if (sub) {
      const paidUntil = new Date(sub.paidUntil);
      const now = new Date();
      if (now > paidUntil) {
        const dailyRate = session.prepaidMethod === 'card' ? tariffs.monthlyCard : tariffs.monthlyCash;
        const msOverdue = now.getTime() - paidUntil.getTime();
        const daysOverdue = Math.max(1, Math.ceil(msOverdue / (24 * 60 * 60 * 1000)));
        return roundMoney(daysOverdue * dailyRate);
      }
      return 0;
    }
    const dailyRate = session.prepaidMethod === 'card' ? tariffs.monthlyCard : tariffs.monthlyCash;
    const days = calculateDays(session.entryTime);
    return roundMoney(Math.max(0, days * dailyRate - totalPaid));
  }

  return 0;
}

export type PeriodKey = 'today' | 'week' | 'month' | 'all';

export function getDateRangeForPeriod(period: PeriodKey): { from: Date | undefined; to: Date | undefined } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case 'today':
      return { from: today, to: undefined };
    case 'week': {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { from: weekAgo, to: undefined };
    }
    case 'month': {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return { from: monthAgo, to: undefined };
    }
    case 'all':
      return { from: undefined, to: undefined };
  }
}
