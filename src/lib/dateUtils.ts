/**
 * Zero-timezone Date Utilities for Actorsparadise Subscription Portal
 * Guarantees that calendar dates (YYYY-MM-DD) do not shift across timezones
 * and allows independent manipulation of Day, Month, and Year.
 */

// Check if year, month (1-12), day (1-31) form a valid real calendar date
export function isValidYMD(year: number, month: number, day: number): boolean {
  if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
  if (year < 1970 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  const maxDays = getDaysInMonth(year, month);
  if (day < 1 || day > maxDays) return false;
  return true;
}

// Get number of days in a given month (accounting for leap years)
export function getDaysInMonth(year: number, month: number): number {
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return 31;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Format any date string (ISO, YYYY-MM-DD, or timestamp) to clean YYYY-MM-DD
export function toYMDString(dateStr: string | null | undefined): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();
  if (!trimmed) return '';

  // If already starts with YYYY-MM-DD
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const d = parseInt(match[3], 10);
    if (isValidYMD(y, m, d)) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  // Fallback parse safely
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return '';
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Convert YYYY-MM-DD to ISO string (UTC midnight) or null
export function toIsoFromYMD(ymd: string | null | undefined): string | null {
  if (!ymd || typeof ymd !== 'string') return null;
  const trimmed = ymd.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  if (!isValidYMD(y, m, d)) return null;
  return `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`;
}

// Format friendly date: "15 Oct 2026"
export function formatFriendlyDate(dateStr: string | null | undefined): string {
  const ymd = toYMDString(dateStr);
  if (!ymd) return 'None / Unset';
  const parts = ymd.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

// Today in YYYY-MM-DD (UTC/local neutral)
export function getTodayYMD(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Add days to a YYYY-MM-DD date safely without timezone shift
export function addDaysToYMD(ymd: string | null | undefined, daysToAdd: number): string {
  const base = toYMDString(ymd) || getTodayYMD();
  const parts = base.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  const date = new Date(Date.UTC(y, m - 1, d + daysToAdd));
  const newY = date.getUTCFullYear();
  const newM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const newD = String(date.getUTCDate()).padStart(2, '0');
  return `${newY}-${newM}-${newD}`;
}

// Add years to a YYYY-MM-DD date safely
export function addYearsToYMD(ymd: string | null | undefined, yearsToAdd: number): string {
  const base = toYMDString(ymd) || getTodayYMD();
  const parts = base.split('-');
  const y = parseInt(parts[0], 10) + yearsToAdd;
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  const maxDays = getDaysInMonth(y, m);
  const safeD = Math.min(d, maxDays);
  return `${y}-${String(m).padStart(2, '0')}-${String(safeD).padStart(2, '0')}`;
}
