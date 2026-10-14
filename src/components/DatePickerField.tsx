import React, { useMemo } from 'react';
import { Calendar, RefreshCw, X, Sparkles } from 'lucide-react';
import {
  toYMDString,
  toIsoFromYMD,
  isValidYMD,
  getDaysInMonth,
  formatFriendlyDate,
  getTodayYMD,
  addDaysToYMD,
  addYearsToYMD,
} from '../lib/dateUtils.js';

interface DatePickerFieldProps {
  label: string;
  value: string | null | undefined;
  onChange: (isoStringOrNull: string | null) => void;
  required?: boolean;
  allowClear?: boolean;
  helpText?: string;
  showPresets?: boolean;
}

const MONTH_NAMES = [
  '01 - Jan',
  '02 - Feb',
  '03 - Mar',
  '04 - Apr',
  '05 - May',
  '06 - Jun',
  '07 - Jul',
  '08 - Aug',
  '09 - Sep',
  '10 - Oct',
  '11 - Nov',
  '12 - Dec',
];

export const DatePickerField: React.FC<DatePickerFieldProps> = ({
  label,
  value,
  onChange,
  required = false,
  allowClear = true,
  helpText,
  showPresets = true,
}) => {
  // Current YYYY-MM-DD string representation
  const ymd = useMemo(() => toYMDString(value), [value]);

  // Break into constituent parts
  const parsed = useMemo(() => {
    if (!ymd) {
      return { year: null, month: null, day: null, isValid: false };
    }
    const [yStr, mStr, dStr] = ymd.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const day = parseInt(dStr, 10);
    const valid = isValidYMD(year, month, day);
    return { year, month, day, isValid: valid };
  }, [ymd]);

  // Dynamic max days for the currently selected month and year
  const maxDaysInCurrentMonth = useMemo(() => {
    const yr = parsed.year || new Date().getFullYear();
    const mo = parsed.month || new Date().getMonth() + 1;
    return getDaysInMonth(yr, mo);
  }, [parsed.year, parsed.month]);

  // Year options: range around today (e.g. 2022 to 2035)
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = Math.min(2018, parsed.year ? parsed.year - 5 : currentYear - 6);
    const endYear = Math.max(2040, parsed.year ? parsed.year + 5 : currentYear + 14);
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) {
      years.push(y);
    }
    return years;
  }, [parsed.year]);

  // Update Day independently
  const handleDayChange = (newDayVal: number) => {
    const yr = parsed.year || new Date().getFullYear();
    const mo = parsed.month || new Date().getMonth() + 1;
    const maxDays = getDaysInMonth(yr, mo);
    const clampedDay = Math.min(Math.max(1, newDayVal), maxDays);
    const newYmd = `${yr}-${String(mo).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
    onChange(toIsoFromYMD(newYmd));
  };

  // Update Month independently
  const handleMonthChange = (newMonthVal: number) => {
    const yr = parsed.year || new Date().getFullYear();
    const maxDays = getDaysInMonth(yr, newMonthVal);
    const clampedDay = Math.min(parsed.day || 1, maxDays);
    const newYmd = `${yr}-${String(newMonthVal).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
    onChange(toIsoFromYMD(newYmd));
  };

  // Update Year independently
  const handleYearChange = (newYearVal: number) => {
    const mo = parsed.month || new Date().getMonth() + 1;
    const maxDays = getDaysInMonth(newYearVal, mo);
    const clampedDay = Math.min(parsed.day || 1, maxDays);
    const newYmd = `${newYearVal}-${String(mo).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
    onChange(toIsoFromYMD(newYmd));
  };

  // Native HTML date picker change
  const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) {
      if (allowClear) {
        onChange(null);
      }
      return;
    }
    const iso = toIsoFromYMD(val);
    if (iso) {
      onChange(iso);
    }
  };

  return (
    <div className="space-y-2 p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl">
      {/* Header with Title and Current Value Preview */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-purple-400" />
          <span>{label}</span>
          {required && <span className="text-rose-400">*</span>}
        </label>
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[11px] font-mono px-2 py-0.5 rounded-md border ${
              ymd
                ? 'bg-purple-950/50 text-purple-300 border-purple-500/30'
                : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/50'
            }`}
          >
            {ymd ? formatFriendlyDate(ymd) : 'Not set / Pending'}
          </span>
          {allowClear && ymd && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="p-1 text-zinc-400 hover:text-rose-400 transition-colors"
              title="Clear date"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* HTML Date Input + Independent Day/Month/Year Dropdowns */}
      <div className="space-y-2">
        <div>
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
            Standard Date Picker (YYYY-MM-DD)
          </span>
          <input
            type="date"
            value={ymd}
            onChange={handleNativeDateChange}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        <div>
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
            Independent Selectors (Day · Month · Year)
          </span>
          <div className="grid grid-cols-3 gap-2">
            {/* Day Dropdown */}
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">Day</label>
              <select
                value={parsed.day || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) handleDayChange(val);
                }}
                className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-purple-500"
              >
                <option value="" disabled>
                  Day
                </option>
                {Array.from({ length: maxDaysInCurrentMonth }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {String(d).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>

            {/* Month Dropdown */}
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">Month</label>
              <select
                value={parsed.month || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) handleMonthChange(val);
                }}
                className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="" disabled>
                  Month
                </option>
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Dropdown */}
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">Year</label>
              <select
                value={parsed.year || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) handleYearChange(val);
                }}
                className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-purple-500"
              >
                <option value="" disabled>
                  Year
                </option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Explicit Calculation & Preset Buttons (Admin Click Only) */}
      {showPresets && (
        <div className="pt-1 border-t border-zinc-800/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-zinc-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              Quick Presets (Click to apply)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChange(toIsoFromYMD(getTodayYMD()))}
              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-[11px] font-medium border border-zinc-700 transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onChange(toIsoFromYMD(addDaysToYMD(ymd, 30)))}
              className="px-2 py-1 bg-zinc-800 hover:bg-purple-900/40 text-purple-300 rounded-md text-[11px] font-medium border border-zinc-700 hover:border-purple-600 transition-colors"
            >
              +30 Days
            </button>
            <button
              type="button"
              onClick={() => onChange(toIsoFromYMD(addDaysToYMD(ymd, 60)))}
              className="px-2 py-1 bg-zinc-800 hover:bg-purple-900/40 text-purple-300 rounded-md text-[11px] font-medium border border-zinc-700 hover:border-purple-600 transition-colors"
            >
              +60 Days
            </button>
            <button
              type="button"
              onClick={() => onChange(toIsoFromYMD(addYearsToYMD(ymd, 1)))}
              className="px-2 py-1 bg-zinc-800 hover:bg-purple-900/40 text-purple-300 rounded-md text-[11px] font-medium border border-zinc-700 hover:border-purple-600 transition-colors"
            >
              +1 Year
            </button>
            {allowClear && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="px-2 py-1 bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 rounded-md text-[11px] font-medium border border-zinc-800 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Helpful Hint or Guidance */}
      {helpText && <p className="text-[11px] text-zinc-500">{helpText}</p>}
    </div>
  );
};
