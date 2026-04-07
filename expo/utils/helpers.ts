import { GRACE_HOURS, MONTHLY_PERIOD_DAYS } from '@/constants/tariffs';
import { PaymentMethod } from '@/types';

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export function roundMoney(value: number): number {
  return Math.round(value);
}

export function formatMoney(value: number): string {
  const rounded = roundMoney(value);
  if (isNaN(rounded) || !isFinite(rounded)) return '0 ₽';
  return rounded.toLocaleString('ru-RU') + ' ₽';
}

export function formatPlateNumber(plate: string): string {
  return plate.toUpperCase().replace(/\s+/g, '').trim();
}

export function calculateDays(entryTime: string, exitTime?: string, skipGrace?: boolean): number {
  const entry = new Date(entryTime).getTime();
  const exit = exitTime ? new Date(exitTime).getTime() : Date.now();
  const graceMs = skipGrace ? 0 : GRACE_HOURS * 60 * 60 * 1000;
  const diffMs = exit - entry - graceMs;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil(diffMs / dayMs));
}

export function getMonthlyAmount(dailyRate: number): number {
  return roundMoney(dailyRate * MONTHLY_PERIOD_DAYS);
}

export function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(dateStr: string): string {
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

export function daysBetween(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(0, Math.floor((e - s) / (24 * 60 * 60 * 1000)));
}

export function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function getMethodLabel(method?: PaymentMethod): string {
  switch (method) {
    case 'cash':
      return 'Наличные';
    case 'card':
      return 'Безнал';
    case 'adjustment':
      return 'Корректировка';
    default:
      return '';
  }
}

const LATIN_TO_CYRILLIC: Record<string, string> = {
  'A': 'А', 'B': 'В', 'C': 'С', 'E': 'Е', 'H': 'Н',
  'K': 'К', 'M': 'М', 'O': 'О', 'P': 'Р', 'T': 'Т',
  'X': 'Х', 'Y': 'У',
};

export function normalizeForSearch(text: string): string {
  return text
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/Ё/g, 'Е')
    .split('')
    .map(ch => LATIN_TO_CYRILLIC[ch] ?? ch)
    .join('');
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '').replace(/^8/, '7');
}

export function getServiceTypeLabel(type: string): string {
  switch (type) {
    case 'onetime':
      return 'Разово';
    case 'monthly':
      return 'Месяц';
    case 'lombard':
      return 'Ломбард';
    default:
      return type;
  }
}

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин. назад`;
  if (hours < 24) return `${hours} ч. назад`;
  return `${days} дн. назад`;
}
