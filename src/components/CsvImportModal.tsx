import React, { useState, useRef } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { CsvImportResult } from '../types.js';
import { importSubscribersCsv } from '../lib/api.js';

interface CsvImportModalProps {
  onClose: () => void;
  onImportCompleted: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  onClose,
  onImportCompleted,
  showToast,
}) => {
  const [csvRawText, setCsvRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<Array<Record<string, string>>>([]);
  const [mode, setMode] = useState<'skip_existing' | 'merge_existing'>('skip_existing');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Simple, robust CSV parser
  const parseCsv = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) return [];

    // Parse header line handling potential quotes
    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let insideQuote = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (insideQuote && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            insideQuote = !insideQuote;
          }
        } else if (char === ',' && !insideQuote) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const headers = parseLine(lines[0]);
    const rows: Array<Record<string, string>> = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = parseLine(lines[i]);
      if (vals.length === 0 || (vals.length === 1 && !vals[0])) continue;
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = vals[idx] || '';
      });
      rows.push(row);
    }
    return rows;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      setCsvRawText(content);
      const parsed = parseCsv(content);
      setParsedRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCsvRawText(val);
    const parsed = parseCsv(val);
    setParsedRows(parsed);
  };

  const handleExecuteImport = async () => {
    if (parsedRows.length === 0) {
      showToast('No valid CSV records detected to import', 'error');
      return;
    }

    try {
      setIsImporting(true);
      const res = await importSubscribersCsv(parsedRows, mode);
      setImportResult(res);
      showToast(`CSV imported: ${res.inserted} added, ${res.skipped} skipped`, 'success');
      onImportCompleted();
    } catch (err: any) {
      showToast(err.message || 'CSV Import failed', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-purple-400" />
            <div>
              <h3 className="text-base font-bold text-white">Import Subscriber Master CSV</h3>
              <p className="text-xs text-zinc-400">
                Preserve existing records & prevent duplicates
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {importResult ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">CSV Import Completed</h4>
              <div className="grid grid-cols-4 gap-2 max-w-md mx-auto text-center font-mono">
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <div className="text-xs text-zinc-500">Processed</div>
                  <div className="text-base font-bold text-white">{importResult.totalProcessed}</div>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <div className="text-xs text-zinc-500">Inserted</div>
                  <div className="text-base font-bold text-emerald-400">{importResult.inserted}</div>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <div className="text-xs text-zinc-500">Updated</div>
                  <div className="text-base font-bold text-purple-400">{importResult.updated}</div>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <div className="text-xs text-zinc-500">Skipped</div>
                  <div className="text-base font-bold text-zinc-400">{importResult.skipped}</div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-300 text-left max-h-32 overflow-y-auto">
                  <span className="font-semibold block mb-1">Warnings / Errors:</span>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {importResult.errors.map((e, idx) => (
                      <li key={idx}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold"
              >
                Close & View Subscribers
              </button>
            </div>
          ) : (
            <>
              {/* Duplicate Prevention Guarantee Banner */}
              <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-zinc-300">
                <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-purple-300 block">Record Preservation Guarantee:</strong>
                  Existing subscriber records are preserved. Any row with an already existing Telegram User ID will not overwrite your active verified subscriber dates.
                </div>
              </div>

              {/* Upload or Paste */}
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-800 hover:border-purple-500/60 rounded-xl p-4 text-center cursor-pointer transition-colors bg-zinc-950/50"
                >
                  <Upload className="w-5 h-5 text-zinc-400 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-zinc-200">
                    {fileName ? `Loaded: ${fileName}` : 'Choose CSV file to upload'}
                  </p>
                  <p className="text-[11px] text-zinc-500">Supports headers: telegram_user_id, username, plan, expiry_date, notes</p>
                </div>

                <div className="relative">
                  <span className="text-[11px] text-zinc-400 block mb-1">Or paste CSV content directly:</span>
                  <textarea
                    rows={4}
                    value={csvRawText}
                    onChange={handleTextChange}
                    placeholder="telegram_user_id,username,plan,expiry_date,notes&#10;884129402,dragonbreath1,Super,2026-12-15,VIP Member"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Import Mode Options */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-2">
                <span className="text-xs font-semibold text-zinc-200 block">Import Mode:</span>
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="skip_existing"
                    checked={mode === 'skip_existing'}
                    onChange={() => setMode('skip_existing')}
                    className="accent-purple-600"
                  />
                  <span>
                    <strong>Skip Existing</strong> (Prevents duplicates; leaves current records completely intact)
                  </span>
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="merge_existing"
                    checked={mode === 'merge_existing'}
                    onChange={() => setMode('merge_existing')}
                    className="accent-purple-600"
                  />
                  <span>
                    <strong>Merge Missing Fields</strong> (Updates name or notes while retaining active expiry)
                  </span>
                </label>
              </div>

              {/* Parsed Preview */}
              {parsedRows.length > 0 && (
                <div className="border border-zinc-800 rounded-xl overflow-hidden text-xs">
                  <div className="bg-zinc-950 px-3 py-2 border-b border-zinc-800 flex justify-between items-center text-zinc-400">
                    <span className="font-semibold text-zinc-200">
                      Detected {parsedRows.length} record{parsedRows.length === 1 ? '' : 's'}
                    </span>
                    <span className="text-[11px]">Showing first 3 rows</span>
                  </div>
                  <div className="max-h-28 overflow-y-auto font-mono text-[11px] p-2 bg-zinc-900/40 divide-y divide-zinc-800">
                    {parsedRows.slice(0, 3).map((r, i) => (
                      <div key={i} className="py-1 text-zinc-300 truncate">
                        Row {i + 1}: ID: {r.telegram_user_id || r['Telegram User ID'] || Object.values(r)[0]} | User: {r.username || r['Username'] || '—'} | Plan: {r.plan || r['Plan'] || '—'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!importResult && (
          <div className="px-6 py-3.5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isImporting || parsedRows.length === 0}
              onClick={handleExecuteImport}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
            >
              {isImporting ? 'Importing...' : `Import ${parsedRows.length} Subscribers`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
