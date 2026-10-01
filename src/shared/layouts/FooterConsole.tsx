import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Terminal,
  Send,
  Trash2,
  ChevronUp,
  ChevronDown,
  Copy,
  Check,
  RotateCw,
  Search,
  Maximize2,
  Minimize2,
  X,
  ArrowDownCircle,
  HelpCircle
} from 'lucide-react';
import { useDeviceStore } from '@/features/devices/store/device-store';
import { tasmotaHttp } from '@/core/http/tasmota-http-client';
import { pollScheduler } from '@/core/http/poll-scheduler';
import { useToast } from '@/shared/components/Toast';
import { useTranslation } from '@/core/i18n';
import { cn } from '@/shared/utils/cn';
import {
  renderSyntaxHighlightedText,
  formatTerminalResponse,
  CLI_HELP_TEXT,
  CLI_COMMAND_SUGGESTIONS
} from '@/shared/utils/terminal-formatters';

interface ConsoleLog {
  id: string;
  time: string;
  deviceIp: string;
  command: string;
  response: string;
  latencyMs?: number;
  isError?: boolean;
}

type ConsoleViewMode = 'collapsed' | 'normal' | 'maximized';

export const FooterConsole: React.FC = () => {
  const { t } = useTranslation();
  const { devices, deviceStates, selectedDeviceId, setSelectedDevice } = useDeviceStore();
  const deviceList = Object.values(devices);
  const activeDevice = devices[selectedDeviceId || ''] || deviceList[0];
  const activeState = activeDevice ? deviceStates[activeDevice.id] : undefined;

  const [viewMode, setViewMode] = useState<ConsoleViewMode>('collapsed');
  const [cmd, setCmd] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-complete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestIndex, setSelectedSuggestIndex] = useState(0);

  // Command History Navigation
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const { addToast } = useToast();

  // No initial greeting
  const [logs, setLogs] = useState<ConsoleLog[]>([]);

  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto scroll to latest output if autoScroll enabled
  useEffect(() => {
    if (viewMode !== 'collapsed' && autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, viewMode, autoScroll]);

  // Global ESC key to close/collapse
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewMode !== 'collapsed') {
        if (showSuggestions) {
          setShowSuggestions(false);
          return;
        }
        if (viewMode === 'maximized') {
          setViewMode('normal');
        } else {
          setViewMode('collapsed');
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [viewMode, showSuggestions]);

  // Autocomplete matching list
  const suggestions = useMemo(() => {
    const query = cmd.trim().toLowerCase();
    if (!query) return [];
    return CLI_COMMAND_SUGGESTIONS.filter((item) =>
      item.cmd.toLowerCase().startsWith(query) || item.cmd.toLowerCase().includes(query)
    ).slice(0, 6);
  }, [cmd]);

  const executeCommand = async (commandToSend: string) => {
    const commandText = commandToSend.trim();
    if (!commandText || loading) return;

    // Add to history
    setHistory((prev) => [...prev.filter((h) => h !== commandText), commandText]);
    setHistoryIndex(-1);
    setShowSuggestions(false);

    const time = new Date().toLocaleTimeString();
    const lower = commandText.toLowerCase();

    // 1. Built-in 'clear'
    if (lower === 'clear' || lower === 'cls') {
      setLogs([]);
      setCmd('');
      return;
    }

    // 2. Built-in 'help'
    if (lower === 'help' || lower === '?') {
      setLogs((prev) => [
        ...prev.slice(-99),
        {
          id: Date.now().toString(),
          time,
          deviceIp: activeDevice?.ipAddress || '127.0.0.1',
          command: commandText,
          response: CLI_HELP_TEXT,
          latencyMs: 0
        }
      ]);
      setCmd('');
      return;
    }

    if (!activeDevice?.ipAddress) return;

    setLoading(true);
    setCmd('');
    const startTime = performance.now();

    try {
      const res = await tasmotaHttp.sendCommand(activeDevice.ipAddress, commandText);
      const latencyMs = Math.round(performance.now() - startTime);
      const { formattedText } = formatTerminalResponse(res.data);

      setLogs((prev) => [
        ...prev.slice(-99),
        {
          id: Date.now().toString(),
          time,
          deviceIp: activeDevice.ipAddress,
          command: commandText,
          response: formattedText,
          latencyMs
        }
      ]);
      // Trigger quick poll to sync UI
      setTimeout(() => pollScheduler.pollNow(activeDevice.id), 200);
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      setLogs((prev) => [
        ...prev.slice(-99),
        {
          id: Date.now().toString(),
          time,
          deviceIp: activeDevice.ipAddress,
          command: commandText,
          response: err.message || 'Lỗi gửi lệnh tới thiết bị',
          latencyMs,
          isError: true
        }
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (showSuggestions && suggestions.length > 0 && selectedSuggestIndex >= 0) {
      const chosen = suggestions[selectedSuggestIndex]?.cmd;
      if (chosen && chosen.toLowerCase() !== cmd.trim().toLowerCase()) {
        setCmd(chosen);
        setShowSuggestions(false);
        return;
      }
    }
    executeCommand(cmd);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 1. Tab key completion
    if (e.key === 'Tab') {
      e.preventDefault();
      if (suggestions.length > 0) {
        const target = suggestions[selectedSuggestIndex] || suggestions[0];
        setCmd(target.cmd);
        setShowSuggestions(false);
      }
      return;
    }

    // 2. Navigation when autocomplete suggestions are active
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }

    // 3. Command History Navigation when no suggestions
    if (history.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIdx);
        setCmd(history[nextIdx] || '');
        setShowSuggestions(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex === -1) return;
        const nextIdx = historyIndex + 1;
        if (nextIdx >= history.length) {
          setHistoryIndex(-1);
          setCmd('');
        } else {
          setHistoryIndex(nextIdx);
          setCmd(history[nextIdx] || '');
        }
        setShowSuggestions(false);
      }
    }
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    addToast(t('copiedConsole'), 'info');
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Filtered log items
  const filteredLogs = useMemo(() => {
    if (!filterText.trim()) return logs;
    const term = filterText.toLowerCase();
    return logs.filter(
      (l) => l.command.toLowerCase().includes(term) || l.response.toLowerCase().includes(term)
    );
  }, [logs, filterText]);

  return (
    <footer
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800 transition-all duration-300 shadow-[0_-10px_35px_rgba(0,0,0,0.7)] flex flex-col',
        viewMode === 'collapsed' && 'h-11',
        viewMode === 'normal' && 'h-[400px] sm:h-[430px]',
        viewMode === 'maximized' && 'h-[80vh]'
      )}
    >
      {/* Top Header Bar */}
      <div
        onClick={() => {
          if (viewMode === 'collapsed') setViewMode('normal');
          else setViewMode('collapsed');
        }}
        className="h-11 px-3 sm:px-4 flex items-center justify-between cursor-pointer select-none bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 hover:bg-zinc-900/80 transition-colors border-b border-zinc-850"
      >
        {/* Left Side: macOS Dots + Title + Device Picker */}
        <div className="flex items-center gap-3 min-w-0">
          {/* macOS Window Controls */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="hidden sm:flex items-center gap-1.5 mr-1"
          >
            <button
              onClick={() => setViewMode('collapsed')}
              className="w-3 h-3 rounded-full bg-rose-500/80 hover:bg-rose-500 transition-colors"
              title="Đóng / Thu gọn (Esc)"
            />
            <button
              onClick={() => setViewMode(viewMode === 'normal' ? 'collapsed' : 'normal')}
              className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 transition-colors"
              title="Kích thước tiêu chuẩn"
            />
            <button
              onClick={() => setViewMode(viewMode === 'maximized' ? 'normal' : 'maximized')}
              className="w-3 h-3 rounded-full bg-emerald-500/80 hover:bg-emerald-500 transition-colors"
              title="Phóng to toàn màn hình"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Terminal className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-zinc-100 tracking-tight flex items-center gap-1.5">
              <span>{t('commandConsoleTitle')}</span>
              {viewMode !== 'collapsed' && (
                <span className="text-[10px] font-mono font-normal text-zinc-500 hidden md:inline">
                  {t('helpHint')}
                </span>
              )}
            </span>
          </div>

          {/* Active Device Indicator / Picker */}
          {deviceList.length > 0 ? (
            <div onClick={(e) => e.stopPropagation()} className="flex items-center">
              {deviceList.length > 1 ? (
                <select
                  value={activeDevice?.id}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-200 rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:border-amber-500/80 max-w-[170px] sm:max-w-[220px] truncate"
                >
                  {deviceList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.friendlyName} ({d.ipAddress})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800 text-[11px] font-mono text-zinc-300">
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      activeState?.online ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                    )}
                  />
                  <span className="font-semibold text-zinc-200 truncate max-w-[100px] sm:max-w-none">
                    {activeDevice?.friendlyName}
                  </span>
                  <span className="text-zinc-500 hidden sm:inline font-mono">
                    ({activeDevice?.ipAddress})
                  </span>
                  {activeState?.latency !== undefined && (
                    <span className="text-[10px] text-amber-400/90 font-mono ml-0.5">
                      {activeState.latency}ms
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-zinc-500 italic">{t('noDeviceConnected')}</span>
          )}
        </div>

        {/* Right Side Action Controls */}
        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
          {viewMode !== 'collapsed' && (
            <>
              {/* Help Button */}
              <button
                type="button"
                onClick={() => executeCommand('help')}
                title="Xem hướng dẫn lệnh (help)"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors hidden sm:flex items-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span className="text-[10px] font-mono hidden lg:inline">help</span>
              </button>

              {/* Search Log Input */}
              <div className="relative hidden md:flex items-center">
                <Search className="w-3 h-3 text-zinc-500 absolute left-2 pointer-events-none" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder={t('filterLogs')}
                  className="bg-zinc-900/90 border border-zinc-800 rounded-lg pl-7 pr-2 py-0.5 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500 w-32 lg:w-44 font-mono"
                />
                {filterText && (
                  <button
                    onClick={() => setFilterText('')}
                    className="absolute right-1.5 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Auto Scroll Toggle */}
              <button
                type="button"
                onClick={() => setAutoScroll(!autoScroll)}
                className={cn(
                  'p-1.5 rounded-lg border text-xs transition-colors hidden sm:flex items-center gap-1',
                  autoScroll
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                )}
                title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
              >
                <ArrowDownCircle className="w-3.5 h-3.5" />
                <span className="text-[10px] font-mono hidden lg:inline">Auto-scroll</span>
              </button>

              {/* Clear Log */}
              <button
                type="button"
                onClick={() => setLogs([])}
                title={t('clearLogs')}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {/* Maximize Toggle */}
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'maximized' ? 'normal' : 'maximized')}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors hidden sm:block"
                title={viewMode === 'maximized' ? 'Thu nhỏ lại' : 'Phóng to console'}
              >
                {viewMode === 'maximized' ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            </>
          )}

          {/* Toggle Expand / Collapse */}
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'collapsed' ? 'normal' : 'collapsed')}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
            title={viewMode === 'collapsed' ? 'Mở console' : 'Đóng console'}
          >
            {viewMode === 'collapsed' ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Console Body */}
      {viewMode !== 'collapsed' && (
        <div className="flex-1 p-3 sm:p-4 pt-2.5 flex flex-col gap-2.5 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
          {/* Terminal Window with Syntax Highlighting */}
          <div className="flex-1 bg-zinc-950/95 border border-zinc-850 rounded-xl p-3 font-mono text-[11px] overflow-y-auto space-y-3 select-text shadow-inner">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs flex flex-col items-center gap-1.5">
                <span className="font-mono text-zinc-600">TasHOME Console</span>
                <span className="text-[11px] text-zinc-600">
                  {t('consoleEmptyPrompt')}
                </span>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="group rounded-lg p-2 hover:bg-zinc-900/40 border border-transparent hover:border-zinc-850/80 transition-colors"
                >
                  {/* Command Row */}
                  <div className="flex items-center justify-between text-zinc-500 text-[10px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-zinc-600">[{log.time}]</span>
                      <span className="text-zinc-500 font-mono">[{log.deviceIp}]</span>
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <span className="text-zinc-600 font-normal">❯</span> {log.command}
                      </span>
                      {log.latencyMs !== undefined && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-emerald-400/90">
                          {log.latencyMs}ms
                        </span>
                      )}
                    </div>

                    {/* Action buttons on hover */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                      <button
                        onClick={() => executeCommand(log.command)}
                        disabled={loading}
                        className="p-1 rounded text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 transition-colors"
                        title="Chạy lại lệnh này"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => copyToClipboard(log.id, log.response)}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                        title="Sao chép kết quả"
                      >
                        {copiedId === log.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Output Preview */}
                  <div
                    className={cn(
                      'mt-1 font-mono text-[11px] overflow-x-auto p-1.5 rounded bg-zinc-950/70 border border-zinc-900',
                      log.isError ? 'text-rose-400 border-rose-950/60 bg-rose-950/10' : ''
                    )}
                  >
                    {log.isError ? (
                      <div className="text-rose-400 whitespace-pre-wrap">{log.response}</div>
                    ) : (
                      renderSyntaxHighlightedText(log.response)
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>

          {/* Command Prompt Input Bar with Auto-Complete Dropdown */}
          <form onSubmit={handleSend} className="relative flex gap-2 items-center">
            {/* Auto-Complete Floating Menu */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute bottom-full mb-2 left-0 right-0 sm:right-auto sm:min-w-[360px] bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-mono text-zinc-500 border-b border-zinc-800/80 mb-0.5">
                  <span>{t('commandSuggestions')}</span>
                  <span className="text-amber-400 font-semibold">{t('tabToFill')}</span>
                </div>
                {suggestions.map((item, idx) => (
                  <button
                    key={item.cmd}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCmd(item.cmd);
                      setShowSuggestions(false);
                      setTimeout(() => inputRef.current?.focus(), 20);
                    }}
                    className={cn(
                      'w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs font-mono transition-colors',
                      idx === selectedSuggestIndex
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'text-zinc-200 hover:bg-zinc-800 border border-transparent'
                    )}
                  >
                    <span className="font-bold flex items-center gap-1.5">
                      <span className="text-amber-500/70 font-normal">❯</span> {item.cmd}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-sans ml-2 truncate">
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="relative flex-1 flex items-center">
              <span className="absolute left-3.5 text-amber-400 font-mono font-bold text-sm pointer-events-none select-none">
                ❯
              </span>
              <input
                ref={inputRef}
                type="text"
                value={cmd}
                onChange={(e) => {
                  setCmd(e.target.value);
                  setShowSuggestions(true);
                  setSelectedSuggestIndex(0);
                }}
                onFocus={() => {
                  if (cmd.trim()) setShowSuggestions(true);
                }}
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeDevice
                    ? t('enterCmdPlaceholder')
                    : t('selectDevicePrompt')
                }
                disabled={!activeDevice?.ipAddress || loading}
                className="w-full bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 focus:border-amber-500/80 rounded-xl pl-8 pr-20 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono transition-colors shadow-inner disabled:opacity-50"
              />
              <div className="absolute right-3 flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 pointer-events-none select-none">
                {suggestions.length > 0 && showSuggestions ? (
                  <span className="bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30">
                    Tab ⇥
                  </span>
                ) : (
                  <span className="hidden sm:inline bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60">
                    ↵ Enter
                  </span>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={!cmd.trim() || !activeDevice?.ipAddress || loading}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 active:scale-95 shrink-0"
            >
              {loading ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Gửi lệnh</span>
            </button>
          </form>
        </div>
      )}
    </footer>
  );
};
