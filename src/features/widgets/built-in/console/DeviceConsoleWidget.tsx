import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { WidgetProps } from '@/features/widgets/registry/widget-types';
import { Terminal, Send, Trash2, Copy, Check, RotateCw, HelpCircle } from 'lucide-react';
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
  command: string;
  response: string;
  latencyMs?: number;
  isError?: boolean;
}

export const DeviceConsoleWidget: React.FC<WidgetProps> = ({
  devices,
  onCommand,
  colSpan = 2,
  rowSpan = 1
}) => {
  const device = devices[0];
  const [cmd, setCmd] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // No initial greeting
  const [logs, setLogs] = useState<ConsoleLog[]>([]);

  // Auto-complete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestIndex, setSelectedSuggestIndex] = useState(0);

  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Autocomplete matching list
  const suggestions = useMemo(() => {
    const query = cmd.trim().toLowerCase();
    if (!query) return [];
    return CLI_COMMAND_SUGGESTIONS.filter((item) =>
      item.cmd.toLowerCase().startsWith(query) || item.cmd.toLowerCase().includes(query)
    ).slice(0, 5);
  }, [cmd]);

  const executeCommand = async (commandToSend: string) => {
    const commandText = commandToSend.trim();
    if (!commandText || loading) return;

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
        ...prev.slice(-49),
        {
          id: Date.now().toString(),
          time,
          command: commandText,
          response: CLI_HELP_TEXT,
          latencyMs: 0
        }
      ]);
      setCmd('');
      return;
    }

    if (!device) return;

    setLoading(true);
    setCmd('');
    const startTime = performance.now();

    try {
      const res = await onCommand(device.id, commandText);
      const latencyMs = Math.round(performance.now() - startTime);
      const { formattedText } = formatTerminalResponse(res);

      setLogs((prev) => [
        ...prev.slice(-49),
        {
          id: Date.now().toString(),
          time,
          command: commandText,
          response: formattedText,
          latencyMs
        }
      ]);
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      setLogs((prev) => [
        ...prev.slice(-49),
        {
          id: Date.now().toString(),
          time,
          command: commandText,
          response: err.message || 'Lỗi gửi lệnh',
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
    if (e.key === 'Tab') {
      e.preventDefault();
      if (suggestions.length > 0) {
        const target = suggestions[selectedSuggestIndex] || suggestions[0];
        setCmd(target.cmd);
        setShowSuggestions(false);
      }
      return;
    }

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
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (!device) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl text-zinc-500 text-xs h-full">
        Chưa gán thiết bị cho widget này
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-zinc-900/95 to-zinc-950/95 border border-zinc-800/90 hover:border-zinc-700/80 rounded-2xl p-4 shadow-xl transition-all duration-300 overflow-hidden">
      {/* Widget Header */}
      <div className="flex items-center justify-between mb-2.5 border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="font-bold text-zinc-100 text-xs tracking-tight">
              {device.friendlyName} Console
            </h3>
            <span className="text-[10px] text-zinc-500 font-mono">{device.ipAddress}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => executeCommand('help')}
            title="Trợ giúp (help)"
            className="p-1 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-850 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setLogs([])}
            title="Xóa log (clear)"
            className="p-1 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-850 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Log Output Window */}
      <div className="flex-1 bg-zinc-950/95 border border-zinc-850 rounded-xl p-2.5 font-mono text-[11px] overflow-y-auto space-y-2 select-text shadow-inner">
        {logs.length === 0 ? (
          <div className="text-center py-8 text-zinc-600 text-xs">
            Gõ lệnh hoặc <code className="text-amber-400 font-mono">help</code> để bắt đầu.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="group rounded-lg p-1.5 hover:bg-zinc-900/40 border border-transparent hover:border-zinc-850/80 transition-colors"
            >
              <div className="flex items-center justify-between text-zinc-500 text-[10px]">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">[{log.time}]</span>
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <span className="text-zinc-600 font-normal">❯</span> {log.command}
                  </span>
                  {log.latencyMs !== undefined && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-emerald-400/90">
                      {log.latencyMs}ms
                    </span>
                  )}
                </div>

                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                  <button
                    onClick={() => executeCommand(log.command)}
                    disabled={loading}
                    className="p-0.5 rounded text-zinc-500 hover:text-amber-400"
                    title="Chạy lại"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => copyToClipboard(log.id, log.response)}
                    className="p-0.5 rounded text-zinc-500 hover:text-zinc-200"
                    title="Sao chép"
                  >
                    {copiedId === log.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

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

      {/* Input Form with Auto-Complete Dropdown */}
      <form onSubmit={handleSend} className="relative mt-2.5 flex gap-2">
        {/* Auto-Complete Dropdown Menu */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute bottom-full mb-1.5 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl p-1 z-30 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
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
                  'w-full text-left px-2 py-1 rounded-lg flex items-center justify-between text-xs font-mono transition-colors',
                  idx === selectedSuggestIndex
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-zinc-200 hover:bg-zinc-800 border border-transparent'
                )}
              >
                <span className="font-bold flex items-center gap-1.5">
                  <span className="text-amber-500/60 font-normal">❯</span> {item.cmd}
                </span>
                <span className="text-[10px] text-zinc-500 font-sans ml-2 truncate">
                  {item.desc}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="relative flex-1 flex items-center">
          <span className="absolute left-2.5 text-amber-400 font-mono font-bold text-xs pointer-events-none select-none">
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
            placeholder="Lệnh Tasmota (gõ 'help', bấm Tab để điền)..."
            disabled={!device || loading}
            className="w-full bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 focus:border-amber-500/80 rounded-xl pl-6 pr-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono transition-colors disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={!cmd.trim() || loading}
          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 rounded-xl font-bold text-xs flex items-center gap-1 transition-all active:scale-95"
        >
          {loading ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          <span>Gửi</span>
        </button>
      </form>
    </div>
  );
};
