import { Tariffs } from '@/types';

export const DEFAULT_TARIFFS: Tariffs = {
  monthlyCash: 150,
  monthlyCard: 160,
  onetimeCash: 200,
  onetimeCard: 220,
  lombardRate: 150,
};

export const MONTHLY_PERIOD_DAYS = 30;
export const GRACE_HOURS = 4;
export const MAX_ACCRUAL_DAYS = 90;
