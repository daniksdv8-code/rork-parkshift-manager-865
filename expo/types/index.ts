export type UserRole = 'admin' | 'manager';

export interface User {
  id: string;
  login: string;
  name: string;
  role: UserRole;
  active: boolean;
  deleted?: boolean;
  passwordHash?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  phone2?: string;
  notes: string;
  createdAt: string;
  updatedAt?: string;
  deleted?: boolean;
  deletedAt?: string;
}

export interface Car {
  id: string;
  plateNumber: string;
  carModel?: string;
  clientId: string;
  deleted?: boolean;
  deletedAt?: string;
}

export type ServiceType = 'monthly' | 'onetime' | 'lombard';
export type TariffType = 'standard' | 'lombard';
export type SessionStatus = 'draft' | 'active' | 'completed' | 'active_debt' | 'released' | 'released_debt';
export type PaymentMethod = 'cash' | 'card' | 'adjustment';

export interface ParkingSession {
  id: string;
  carId: string;
  clientId: string;
  entryTime: string;
  exitTime: string | null;
  serviceType: ServiceType;
  status: SessionStatus;
  plannedDepartureTime?: string | null;
  prepaidAmount: number;
  prepaidMethod: PaymentMethod | null;
  tariffType: TariffType;
  lombardRateApplied: number;
  managerId: string;
  managerName: string;
  shiftId: string | null;
  cancelled: boolean;
  customRate?: number;
  isDiscounted?: boolean;
}

export interface Payment {
  id: string;
  clientId: string;
  carId?: string;
  sessionId?: string;
  amount: number;
  method: PaymentMethod;
  type: 'onetime' | 'monthly' | 'lombard' | 'debt_payment';
  description: string;
  operatorId: string;
  operatorName: string;
  date: string;
  shiftId?: string;
  cancelled?: boolean;
  baseAmount?: number;
  adjustmentReason?: string;
  refundAmount?: number;
  refundDate?: string;
}

export type TransactionType =
  | 'payment'
  | 'debt'
  | 'debt_payment'
  | 'exit'
  | 'entry'
  | 'cancel_entry'
  | 'cancel_exit'
  | 'cancel_payment'
  | 'withdrawal'
  | 'client_deleted'
  | 'refund'
  | 'debt_accrual';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  clientId?: string;
  carId?: string;
  sessionId?: string;
  method?: PaymentMethod;
  operatorId: string;
  operatorName: string;
  date: string;
  shiftId?: string;
}

export interface Debt {
  id: string;
  clientId: string;
  carId: string;
  parkingEntryId?: string;
  totalAmount: number;
  remainingAmount: number;
  status: 'active' | 'frozen' | 'paid';
  description: string;
  createdAt: string;
  updatedAt?: string;
  isManual?: boolean;
}

export interface ClientDebt {
  id: string;
  clientId: string;
  totalAmount: number;
  frozenAmount: number;
  activeAmount: number;
  lastUpdate: string;
}

export interface MonthlySubscription {
  id: string;
  clientId: string;
  carId: string;
  paidUntil: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Tariffs {
  monthlyCash: number;
  monthlyCard: number;
  onetimeCash: number;
  onetimeCard: number;
  lombardRate: number;
  updatedAt?: string;
}

export interface CashShift {
  id: string;
  operatorId: string;
  operatorName: string;
  operatorRole: UserRole;
  openedAt: string;
  closedAt: string | null;
  status: 'open' | 'closed';
  carryOver: number;
  acceptedCash: number;
  expectedCash: number;
  actualCash: number;
  cashVariance: number;
  cashVarianceType: 'none' | 'short' | 'over';
  closingSummary?: ClosingSummary;
  note?: string;
}

export interface ClosingSummary {
  cashIncome: number;
  cardIncome: number;
  totalExpenses: number;
  totalWithdrawals: number;
  calculatedBalance: number;
  discrepancy: number;
}

export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  operatorId: string;
  operatorName: string;
  date: string;
  shiftId?: string;
  type?: 'manager' | 'admin';
}

export interface CashWithdrawal {
  id: string;
  amount: number;
  operatorId: string;
  operatorName: string;
  date: string;
  shiftId?: string;
  note?: string;
}

export interface CashOperation {
  id: string;
  type: 'income' | 'expense' | 'withdrawal' | 'refund';
  amount: number;
  description: string;
  balanceBefore: number;
  balanceAfter: number;
  date: string;
  shiftId?: string;
  operatorId: string;
  operatorName: string;
}

export interface ActionLog {
  id: string;
  action: string;
  label: string;
  details: string;
  operatorId: string;
  operatorName: string;
  timestamp: string;
  entityId?: string;
  entityType?: string;
}

export interface DailyDebtAccrual {
  id: string;
  parkingEntryId: string;
  clientId: string;
  carId: string;
  amount: number;
  tariffRate: number;
  accrualDate: string;
}

export interface ScheduledShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  operatorId: string;
  operatorName: string;
  comment?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  isDeepCleaning: boolean;
  isSplitShift?: boolean;
  cleanupCompleted?: boolean;
  cleanupCompletedAt?: string;
  cleanupCompletedBy?: string;
  cleanupCompletedByName?: string;
  cleanupChecklist?: CleanupChecklistItem[];
  deleted?: boolean;
}

export interface TeamViolationMonth {
  id: string;
  month: string;
  violationCount: number;
  status: 'ok' | 'warning' | 'bonus_denied';
  violations: ViolationEntry[];
}

export interface ViolationEntry {
  id: string;
  managerId: string;
  managerName: string;
  type: string;
  comment: string;
  date: string;
  addedBy: string;
  addedByName: string;
}

export interface SalaryAdvance {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  remainingAmount: number;
  comment: string;
  issuedBy: string;
  issuedByName: string;
  issuedAt: string;
  updatedAt?: string;
  source: 'admin';
  method: 'cash' | 'card';
}

export interface SalaryPayment {
  id: string;
  employeeId: string;
  employeeName: string;
  grossAmount: number;
  debtDeducted: number;
  netPaid: number;
  method: 'cash' | 'card';
  comment: string;
  paidBy: string;
  paidByName: string;
  paidAt: string;
  source: 'admin';
}

export interface AdminCashOperation {
  id: string;
  type: 'cash_withdrawal_from_manager' | 'card_income' | 'admin_expense' | 'salary_advance' | 'salary_payment';
  amount: number;
  method: 'cash' | 'card';
  description: string;
  date: string;
  operatorId: string;
  operatorName: string;
  managerId?: string;
  paymentId?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  type: 'manager' | 'admin' | 'both';
  deleted?: boolean;
}

export interface CleanupTemplateItem {
  id: string;
  label: string;
  order: number;
}

export interface CleanupChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface LoginLogEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  timestamp: string;
  device?: string;
}

export interface SessionNote {
  id: string;
  sessionId: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  type: 'checkin' | 'checkout' | 'general';
}

export interface DailyOccupancySnapshot {
  id: string;
  date: string;
  snapshotTime: string;
  cars: {
    carId: string;
    clientId: string;
    plateNumber: string;
    clientName: string;
    sessionId: string;
    serviceType: ServiceType;
    entryTime: string;
    daysParked: number;
  }[];
  totalCars: number;
}

export interface AnomalyLogEntry {
  id: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  message: string;
  expected?: string;
  actual?: string;
  action: 'logged_only' | 'recalculated' | 'normalized' | 'blocked' | 'admin_alert';
  actionDetail?: string;
  entityId?: string;
  entityType?: string;
}

export interface ClientEditHistoryEntry {
  id: string;
  clientId: string;
  editedBy: string;
  editorName: string;
  editedAt: string;
  field: 'name' | 'phone' | 'phone2' | 'plateNumber' | 'carModel' | 'notes';
  oldValue: string;
  newValue: string;
  carId?: string;
}

export interface AppData {
  users: User[];
  clients: Client[];
  cars: Car[];
  sessions: ParkingSession[];
  payments: Payment[];
  transactions: Transaction[];
  debts: Debt[];
  clientDebts: ClientDebt[];
  subscriptions: MonthlySubscription[];
  shifts: CashShift[];
  expenses: Expense[];
  withdrawals: CashWithdrawal[];
  cashOperations: CashOperation[];
  actionLogs: ActionLog[];
  dailyDebtAccruals: DailyDebtAccrual[];
  scheduledShifts: ScheduledShift[];
  violations: TeamViolationMonth[];
  tariffs: Tariffs;
  salaryAdvances: SalaryAdvance[];
  salaryPayments: SalaryPayment[];
  adminCashOperations: AdminCashOperation[];
  expenseCategories: ExpenseCategory[];
  cleanupChecklistTemplate: CleanupTemplateItem[];
  editHistory: ClientEditHistoryEntry[];
  loginLogs: LoginLogEntry[];
  sessionNotes: SessionNote[];
  dailyOccupancySnapshots: DailyOccupancySnapshot[];
}
