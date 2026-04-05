import AsyncStorage from '@react-native-async-storage/async-storage';
import { AnomalyLogEntry } from '@/types';
import { generateId } from './helpers';

const STORAGE_KEY = 'park_anomaly_log';
const MAX_ENTRIES = 500;
const DEBOUNCE_MS = 2000;

let memoryLog: AnomalyLogEntry[] = [];
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export type AnomalySeverity = AnomalyLogEntry['severity'];
export type AnomalyCategory =
  | 'cash_balance'
  | 'debt_mismatch'
  | 'report_aggregate'
  | 'orphan_entity'
  | 'sync_protection'
  | 'session_state'
  | 'rounding_artifact'
  | 'salary_mismatch'
  | 'shift_anomaly'
  | 'general';

export type AnomalyAction = AnomalyLogEntry['action'];

interface LogParams {
  severity: AnomalySeverity;
  category: AnomalyCategory;
  message: string;
  expected?: string;
  actual?: string;
  action: AnomalyAction;
  actionDetail?: string;
  entityId?: string;
  entityType?: string;
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memoryLog)).catch(e =>
      console.log('[AnomalyLogger] Save error:', e)
    );
  }, DEBOUNCE_MS);
}

export async function loadAnomalyLog(): Promise<AnomalyLogEntry[]> {
  if (loaded) return memoryLog;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      memoryLog = JSON.parse(stored);
    }
  } catch {
    console.log('[AnomalyLogger] Load error');
  }
  loaded = true;
  return memoryLog;
}

export function logAnomaly(params: LogParams): AnomalyLogEntry {
  const entry: AnomalyLogEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    severity: params.severity,
    category: params.category,
    message: params.message,
    expected: params.expected,
    actual: params.actual,
    action: params.action,
    actionDetail: params.actionDetail,
    entityId: params.entityId,
    entityType: params.entityType,
  };

  memoryLog = [entry, ...memoryLog].slice(0, MAX_ENTRIES);
  scheduleSave();
  console.log(`[Anomaly] [${params.severity}] ${params.category}: ${params.message}`);
  return entry;
}

export function getAnomalyLog(): AnomalyLogEntry[] {
  return memoryLog;
}

export async function clearAnomalyLog(): Promise<void> {
  memoryLog = [];
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function getAnomalyStats() {
  return {
    critical: memoryLog.filter(e => e.severity === 'critical').length,
    error: memoryLog.filter(e => e.severity === 'error').length,
    warning: memoryLog.filter(e => e.severity === 'warning').length,
    info: memoryLog.filter(e => e.severity === 'info').length,
    total: memoryLog.length,
  };
}
