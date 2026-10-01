import React, { useState, useEffect } from 'react';
import type { TasmotaDevice, DeviceState, TasmotaTimerConfig } from '../store/device-store.types';
import { useDeviceStore } from '../store/device-store';
import { tasmotaHttp } from '@/core/http/tasmota-http-client';
import {
  Clock,
  Calendar,
  Power,
  Zap,
  RefreshCw,
  Check,
  X,
  Edit2,
  Trash2,
  SlidersHorizontal,
  RotateCcw,
  Plus,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useToast } from '@/shared/components/Toast';
import { useTranslation } from '@/core/i18n';
import type { TranslationKey } from '@/core/i18n/translations';
import {
  secondsToPulseTime,
  pulseTimeToSeconds,
  formatTimerDuration,
  parsePulseTimeResponse,
  parseTimersResponse
} from '@/shared/utils/tasmota-parsers';

interface DeviceTimerTabProps {
  device: TasmotaDevice;
  state?: DeviceState;
}

const PULSE_PRESETS: Array<{ key: TranslationKey; val: number }> = [
  { key: 'timerOff', val: 0 },
  { key: 'time10s', val: 100 },
  { key: 'time30s', val: 130 },
  { key: 'time1m', val: 160 },
  { key: 'time2m', val: 220 },
  { key: 'time5m', val: 400 },
  { key: 'time15m', val: 1000 },
  { key: 'time30m', val: 1900 },
  { key: 'time1h', val: 3700 }
];

export const DeviceTimerTab: React.FC<DeviceTimerTabProps> = ({ device, state }) => {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const { updateDeviceState } = useDeviceStore();

  const isOnline = !!state?.online;

  // Loading states
  const [syncingTimers, setSyncingTimers] = useState(false);
  const [savingPulse, setSavingPulse] = useState<Record<string, boolean>>({});
  const [togglingGlobal, setTogglingGlobal] = useState(false);
  const [showExpertMode, setShowExpertMode] = useState(false);
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);

  // Custom pulse inputs per channel: { POWER1: { mins: 5, secs: 0 } }
  const [customPulseInputs, setCustomPulseInputs] = useState<Record<string, { mins: number; secs: number }>>({});

  // Editing timer modal state
  const [editingTimerIndex, setEditingTimerIndex] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [editTimerForm, setEditTimerForm] = useState<TasmotaTimerConfig>({
    Enable: 1,
    Mode: 0,
    Time: '07:00',
    Window: 0,
    Days: '1111111',
    Repeat: 1,
    Output: 1,
    Action: 1
  });
  const [savingTimer, setSavingTimer] = useState(false);

  // Available relay channels
  const channelSet = new Set<string>();
  Object.keys(state?.power || {}).forEach((k) => {
    if (/^POWER\d*$/i.test(k)) channelSet.add(k.toUpperCase());
  });
  if (device.relayLabels) {
    Object.keys(device.relayLabels).forEach((k) => {
      if (/^POWER\d*$/i.test(k)) channelSet.add(k.toUpperCase());
    });
  }
  if (channelSet.size === 0) channelSet.add('POWER1');
  const powerKeys = Array.from(channelSet).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, '') || '1', 10);
    const numB = parseInt(b.replace(/\D/g, '') || '1', 10);
    return numA - numB;
  });

  // Query Timers & PulseTimes on mount or when device changes
  useEffect(() => {
    if (!isOnline) return;
    handleSyncAll();
  }, [device.id, isOnline]);

  const handleSyncAll = async () => {
    if (!isOnline || syncingTimers) return;
    setSyncingTimers(true);
    try {
      // 1. Fetch Timers
      const timerRes = await tasmotaHttp.sendCommand(device.ipAddress, 'Timers');
      if (timerRes.ok) {
        const parsed = parseTimersResponse(timerRes.data);
        updateDeviceState(device.id, {
          timers: parsed.timers,
          timersEnabled: parsed.timersEnabled
        });
      }

      // 2. Fetch PulseTimes for all channels
      const pulseCommands = powerKeys.map((key) => {
        const chNum = parseInt(key.replace(/\D/g, '') || '1', 10);
        return tasmotaHttp.sendCommand(device.ipAddress, `PulseTime${chNum}`);
      });
      const pulseResponses = await Promise.allSettled(pulseCommands);
      const pulseTimes: Record<string, any> = {};
      pulseResponses.forEach((res) => {
        if (res.status === 'fulfilled' && res.value.ok) {
          const parsed = parsePulseTimeResponse(res.value.data);
          Object.assign(pulseTimes, parsed);
        }
      });
      if (Object.keys(pulseTimes).length > 0) {
        updateDeviceState(device.id, {
          pulseTimes: { ...(state?.pulseTimes || {}), ...pulseTimes }
        });
      }
    } catch {
      // Silent error during background sync
    } finally {
      setSyncingTimers(false);
    }
  };

  // Handle setting PulseTime
  const handleSetPulseTime = async (key: string, chNum: number, pulseVal: number) => {
    if (!isOnline || savingPulse[key]) return;
    setSavingPulse((prev) => ({ ...prev, [key]: true }));

    try {
      const res = await tasmotaHttp.sendCommand(device.ipAddress, `PulseTime${chNum} ${pulseVal}`);
      if (res.ok) {
        const parsed = parsePulseTimeResponse(res.data);
        updateDeviceState(device.id, {
          pulseTimes: {
            ...(state?.pulseTimes || {}),
            [key]: parsed[key] || { set: pulseVal, remaining: 0 }
          }
        });
        addToast(t('toastPulseTimeSaved'), 'success');
      } else {
        addToast(t('error'), 'error');
      }
    } catch {
      addToast(t('error'), 'error');
    } finally {
      setSavingPulse((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Handle setting custom PulseTime
  const handleCustomPulseSubmit = (key: string, chNum: number, e: React.FormEvent) => {
    e.preventDefault();
    const input = customPulseInputs[key] || { mins: 0, secs: 0 };
    const totalSecs = Math.max(0, (input.mins || 0) * 60 + (input.secs || 0));
    const pulseVal = secondsToPulseTime(totalSecs);
    handleSetPulseTime(key, chNum, pulseVal);
  };

  // Handle Global Timers switch (Timers 1 / Timers 0)
  const handleToggleGlobalTimers = async () => {
    if (!isOnline || togglingGlobal) return;
    setTogglingGlobal(true);
    const targetState = !state?.timersEnabled;

    try {
      const res = await tasmotaHttp.sendCommand(device.ipAddress, `Timers ${targetState ? '1' : '0'}`);
      if (res.ok) {
        updateDeviceState(device.id, { timersEnabled: targetState });
        addToast(
          targetState ? t('timerEnabled') : t('timerDisabled'),
          'success'
        );
      } else {
        addToast(t('error'), 'error');
      }
    } catch {
      addToast(t('error'), 'error');
    } finally {
      setTogglingGlobal(false);
    }
  };

  // Handle Toggle individual timer Enable/Disable
  const handleToggleSingleTimer = async (timerNum: number, currentTimer: TasmotaTimerConfig) => {
    if (!isOnline) return;
    const newEnable = currentTimer.Enable === 1 ? 0 : 1;
    const updated = { ...currentTimer, Enable: newEnable };

    try {
      const payload = JSON.stringify(updated);
      const res = await tasmotaHttp.sendCommand(device.ipAddress, `Timer${timerNum} ${payload}`);
      if (res.ok) {
        updateDeviceState(device.id, {
          timers: {
            ...(state?.timers || {}),
            [`Timer${timerNum}`]: updated
          }
        });
        addToast(
          newEnable === 1 ? `${t('timerEnabled')}` : `${t('timerDisabled')}`,
          'success'
        );
      }
    } catch {
      addToast(t('error'), 'error');
    }
  };

  // Helper to determine if a timer has been configured
  const isTimerConfigured = (timer?: TasmotaTimerConfig) => {
    if (!timer) return false;
    return timer.Enable === 1 || (timer.Time !== '00:00' && timer.Days !== '0000000');
  };

  const allTimerIndices = Array.from({ length: 16 }, (_, i) => i + 1);
  const configuredIndices = allTimerIndices.filter((num) =>
    isTimerConfigured(state?.timers?.[`Timer${num}`])
  );

  // Open Add Schedule Modal
  const handleOpenAddSchedule = () => {
    const firstFreeIndex = allTimerIndices.find(
      (num) => !isTimerConfigured(state?.timers?.[`Timer${num}`])
    );
    if (!firstFreeIndex) {
      addToast(t('maxSchedulesReached'), 'warning');
      return;
    }
    setIsCreatingNew(true);
    setEditingTimerIndex(firstFreeIndex);
    setEditTimerForm({
      Enable: 1,
      Mode: 0,
      Time: '07:00',
      Window: 0,
      Days: '1111111',
      Repeat: 1,
      Output: 1,
      Action: 1
    });
  };

  // Open Edit Modal for existing Timer
  const handleOpenEditTimer = (timerNum: number) => {
    const current = state?.timers?.[`Timer${timerNum}`] || {
      Enable: 1,
      Mode: 0,
      Time: '07:00',
      Window: 0,
      Days: '1111111',
      Repeat: 1,
      Output: 1,
      Action: 1
    };
    setIsCreatingNew(false);
    setEditingTimerIndex(timerNum);
    setEditTimerForm(current);
  };

  // Save Timer from Modal
  const handleSaveTimerModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline || editingTimerIndex === null || savingTimer) return;
    setSavingTimer(true);

    try {
      const payload = JSON.stringify({
        Enable: editTimerForm.Enable,
        Mode: editTimerForm.Mode || 0,
        Time: editTimerForm.Time || '00:00',
        Window: editTimerForm.Window || 0,
        Days: editTimerForm.Days || '0000000',
        Repeat: editTimerForm.Repeat ? 1 : 0,
        Output: editTimerForm.Output || 1,
        Action: editTimerForm.Action
      });

      const res = await tasmotaHttp.sendCommand(device.ipAddress, `Timer${editingTimerIndex} ${payload}`);
      if (res.ok) {
        updateDeviceState(device.id, {
          timers: {
            ...(state?.timers || {}),
            [`Timer${editingTimerIndex}`]: editTimerForm
          }
        });
        addToast(t('toastTimerSaved'), 'success');
        setEditingTimerIndex(null);
      } else {
        addToast(t('error'), 'error');
      }
    } catch {
      addToast(t('error'), 'error');
    } finally {
      setSavingTimer(false);
    }
  };

  // Reset / Clear Timer
  const handleResetTimer = async (timerNum: number) => {
    if (!isOnline) return;
    try {
      const res = await tasmotaHttp.sendCommand(device.ipAddress, `Timer${timerNum} 0`);
      if (res.ok) {
        const cleared: TasmotaTimerConfig = {
          Enable: 0,
          Mode: 0,
          Time: '00:00',
          Window: 0,
          Days: '0000000',
          Repeat: 0,
          Output: 1,
          Action: 0
        };
        updateDeviceState(device.id, {
          timers: {
            ...(state?.timers || {}),
            [`Timer${timerNum}`]: cleared
          }
        });
        addToast(t('toastTimerDeleted'), 'info');
        if (editingTimerIndex === timerNum) {
          setEditingTimerIndex(null);
        }
      }
    } catch {
      addToast(t('error'), 'error');
    }
  };

  // Day names: Sunday (0) to Saturday (6)
  const DAY_KEYS: Array<{ key: TranslationKey; index: number }> = [
    { key: 'daySun', index: 0 },
    { key: 'dayMon', index: 1 },
    { key: 'dayTue', index: 2 },
    { key: 'dayWed', index: 3 },
    { key: 'dayThu', index: 4 },
    { key: 'dayFri', index: 5 },
    { key: 'daySat', index: 6 }
  ];

  // Helper for day bitmask
  const isDayActive = (daysMask: string, dayIndex: number) => {
    if (!daysMask || daysMask.length < 7) return false;
    return daysMask.charAt(dayIndex) === '1';
  };

  const toggleDayInMask = (daysMask: string, dayIndex: number): string => {
    const chars = (daysMask || '0000000').padEnd(7, '0').split('');
    chars[dayIndex] = chars[dayIndex] === '1' ? '0' : '1';
    return chars.join('');
  };

  const formatDaysDisplay = (daysMask: string) => {
    if (!daysMask || daysMask === '0000000') return t('noTimersConfigured');
    if (daysMask === '1111111') return t('repeatDaily');
    if (daysMask === '0111110') return t('repeatWeekdays');
    if (daysMask === '1000001') return t('repeatWeekends');
    const activeDays = DAY_KEYS.filter((d) => isDayActive(daysMask, d.index)).map((d) => t(d.key));
    return activeDays.join(', ');
  };

  const displayedTimersInExpert = filterActiveOnly
    ? allTimerIndices.filter((num) => (state?.timers?.[`Timer${num}`]?.Enable ?? 0) === 1)
    : allTimerIndices;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* SECTION 1: PULSETIME AUTO-OFF CONFIGURATION */}
      <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-850 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                {t('pulseTimeTitle')}
              </h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                {t('pulseTimeDesc')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSyncAll}
            disabled={!isOnline || syncingTimers}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-all active:scale-95 disabled:opacity-50 self-start sm:self-auto"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', syncingTimers && 'animate-spin text-amber-400')} />
            <span>{t('refreshAll')}</span>
          </button>
        </div>

        {/* PulseTime cards per relay */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {powerKeys.map((key) => {
            const chNum = parseInt(key.replace(/\D/g, '') || '1', 10);
            const channelName =
              device.relayLabels?.[key] ||
              device.friendlyNames?.[chNum - 1] ||
              `${t('channelLabel')} ${chNum}`;
            const currentPulse = state?.pulseTimes?.[key];
            const currentSet = currentPulse?.set ?? 0;
            const isArmed = currentSet > 0;
            const inputVal = customPulseInputs[key] || { mins: 5, secs: 0 };
            const isSaving = !!savingPulse[key];

            return (
              <div
                key={key}
                className={cn(
                  'p-4 rounded-xl border transition-all space-y-3',
                  isArmed
                    ? 'bg-zinc-900/90 border-amber-500/30 shadow-sm'
                    : 'bg-zinc-900/50 border-zinc-800/80'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className={cn('w-4 h-4', isArmed ? 'text-amber-400' : 'text-zinc-500')} />
                    <span className="font-bold text-xs text-zinc-200">{channelName}</span>
                    <span className="text-[10px] font-mono text-zinc-500">({key})</span>
                  </div>

                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border',
                      isArmed
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700/60'
                    )}
                  >
                    {isArmed
                      ? `${t('autoOffAfter')} ${formatTimerDuration(pulseTimeToSeconds(currentSet))}`
                      : t('timerOff')}
                  </span>
                </div>

                {/* Quick Presets */}
                <div>
                  <div className="text-[11px] text-zinc-400 mb-1.5 flex items-center gap-1">
                    <span>Mốc hẹn giờ nhanh:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PULSE_PRESETS.map((preset) => {
                      const isActive = currentSet === preset.val;
                      return (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => handleSetPulseTime(key, chNum, preset.val)}
                          disabled={!isOnline || isSaving}
                          className={cn(
                            'px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                            isActive
                              ? 'bg-amber-500 text-zinc-950 font-bold border-amber-400 shadow-sm shadow-amber-500/20'
                              : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border-zinc-750 hover:border-zinc-600'
                          )}
                        >
                          {t(preset.key)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Time Input Form */}
                <form
                  onSubmit={(e) => handleCustomPulseSubmit(key, chNum, e)}
                  className="pt-2 border-t border-zinc-800/80 flex items-center gap-2 flex-wrap"
                >
                  <span className="text-xs text-zinc-400 shrink-0">{t('timeCustom')}:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={1080}
                      value={inputVal.mins}
                      onChange={(e) =>
                        setCustomPulseInputs((prev) => ({
                          ...prev,
                          [key]: { ...inputVal, mins: Math.max(0, parseInt(e.target.value || '0', 10)) }
                        }))
                      }
                      className="w-14 px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs font-mono text-center"
                    />
                    <span className="text-[11px] text-zinc-500">p</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={inputVal.secs}
                      onChange={(e) =>
                        setCustomPulseInputs((prev) => ({
                          ...prev,
                          [key]: {
                            ...inputVal,
                            secs: Math.max(0, Math.min(59, parseInt(e.target.value || '0', 10)))
                          }
                        }))
                      }
                      className="w-14 px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs font-mono text-center"
                    />
                    <span className="text-[11px] text-zinc-500">s</span>
                  </div>

                  <button
                    type="submit"
                    disabled={!isOnline || isSaving}
                    className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-all ml-auto"
                  >
                    {t('setTimer')}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: SMART SCHEDULE VIEW */}
      <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-4">
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-850 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-zinc-100">
                  {t('scheduledTimersTitle')}
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
                  {configuredIndices.length}/16 {t('usedSchedules')}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {t('scheduledTimersDesc')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Master Switch */}
            <button
              type="button"
              onClick={handleToggleGlobalTimers}
              disabled={!isOnline || togglingGlobal}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-sm',
                state?.timersEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-zinc-850 text-zinc-400 border-zinc-750'
              )}
              title={state?.timersEnabled ? 'Đang bật tự động chạy' : 'Đang tạm dừng toàn bộ'}
            >
              <Power className="w-3.5 h-3.5" />
              <span>
                {state?.timersEnabled ? 'Lịch trình: BẬT' : 'Lịch trình: TẮT'}
              </span>
            </button>

            {/* Add Schedule Button */}
            <button
              type="button"
              onClick={handleOpenAddSchedule}
              disabled={!isOnline || configuredIndices.length >= 16}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>{t('addSchedule')}</span>
            </button>
          </div>
        </div>

        {/* Global disabled warning notice */}
        {!state?.timersEnabled && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-300">
            <Clock className="w-4 h-4 shrink-0" />
            <span>
              Lưu ý: Công tắc tổng đang TẮT. Để lịch tự động chạy, vui lòng bật "Lịch trình: BẬT".
            </span>
          </div>
        )}

        {/* Empty State */}
        {configuredIndices.length === 0 ? (
          <div className="py-10 px-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-850 border border-zinc-750 flex items-center justify-center text-zinc-500">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-300">{t('emptyScheduleTitle')}</p>
              <p className="text-xs text-zinc-500 max-w-sm mt-1">
                {t('emptyScheduleDesc')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddSchedule}
              disabled={!isOnline}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 active:scale-95 disabled:opacity-50 mt-1"
            >
              <Plus className="w-4 h-4" />
              <span>{t('createFirstSchedule')}</span>
            </button>
          </div>
        ) : (
          /* Smart Schedule Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {configuredIndices.map((timerNum) => {
              const timer = state?.timers?.[`Timer${timerNum}`] || {
                Enable: 0,
                Mode: 0,
                Time: '00:00',
                Window: 0,
                Days: '0000000',
                Repeat: 0,
                Output: 1,
                Action: 0
              };
              const isEnabled = timer.Enable === 1;
              const outputRelayName =
                device.relayLabels?.[`POWER${timer.Output}`] ||
                device.friendlyNames?.[timer.Output - 1] ||
                `${t('channelLabel')} ${timer.Output}`;

              return (
                <div
                  key={timerNum}
                  className={cn(
                    'p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3',
                    isEnabled
                      ? 'bg-zinc-900/90 border-zinc-750/90 shadow-sm hover:border-zinc-700'
                      : 'bg-zinc-950/50 border-zinc-850/80 opacity-60'
                  )}
                >
                  {/* Top row: Time, Action, Master Switch */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl font-bold font-mono tracking-tight text-zinc-100">
                        {timer.Time || '00:00'}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase flex items-center gap-1',
                          timer.Action === 1
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : timer.Action === 0
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        )}
                      >
                        {timer.Action === 1 ? (
                          <>
                            <Zap className="w-3 h-3" />
                            <span>{t('btnOn')}</span>
                          </>
                        ) : timer.Action === 0 ? (
                          <>
                            <Power className="w-3 h-3" />
                            <span>{t('btnOff')}</span>
                          </>
                        ) : (
                          <span>{t('actionToggle')}</span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Toggle enable switch */}
                      <button
                        type="button"
                        onClick={() => handleToggleSingleTimer(timerNum, timer)}
                        disabled={!isOnline}
                        className={cn(
                          'w-9 h-5 rounded-full transition-colors relative p-0.5 cursor-pointer',
                          isEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
                        )}
                        title={isEnabled ? t('timerEnabled') : t('timerDisabled')}
                      >
                        <span
                          className={cn(
                            'block w-4 h-4 rounded-full bg-white transition-transform',
                            isEnabled ? 'translate-x-4' : 'translate-x-0'
                          )}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Middle row: Relay name & Repeat rule */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>{outputRelayName}</span>
                    </div>

                    <span className="text-zinc-400 text-xs font-medium">
                      {formatDaysDisplay(timer.Days)}
                    </span>
                  </div>

                  {/* Bottom row: Day circles & Action buttons */}
                  <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {DAY_KEYS.map((d) => {
                        const active = isDayActive(timer.Days, d.index);
                        return (
                          <span
                            key={d.index}
                            className={cn(
                              'w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-semibold transition-colors',
                              active
                                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                                : 'text-zinc-600 bg-zinc-900/50'
                            )}
                          >
                            {t(d.key)}
                          </span>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditTimer(timerNum)}
                        disabled={!isOnline}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-zinc-300 hover:text-amber-400 hover:bg-zinc-800 transition-colors flex items-center gap-1"
                        title="Chỉnh sửa"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Sửa</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResetTimer(timerNum)}
                        disabled={!isOnline}
                        className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                        title="Xóa lịch này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Collapsible Expert Mode (16 Raw Timers Grid) */}
        <div className="pt-2 border-t border-zinc-850">
          <button
            type="button"
            onClick={() => setShowExpertMode((prev) => !prev)}
            className="flex items-center justify-between w-full py-2 px-3 rounded-xl bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-850 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
              <span>{t('expertModeToggle')}</span>
            </div>
            {showExpertMode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showExpertMode && (
            <div className="mt-3 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">
                  Bảng hiển thị 16 slot phần cứng nguyên bản của Tasmota:
                </span>
                <button
                  type="button"
                  onClick={() => setFilterActiveOnly((prev) => !prev)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-medium border transition-colors',
                    filterActiveOnly
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  )}
                >
                  {filterActiveOnly ? 'Hiện tất cả 16 lịch' : 'Chỉ xem lịch đang bật'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
                {displayedTimersInExpert.map((timerNum) => {
                  const timer = state?.timers?.[`Timer${timerNum}`] || {
                    Enable: 0,
                    Mode: 0,
                    Time: '00:00',
                    Window: 0,
                    Days: '0000000',
                    Repeat: 0,
                    Output: 1,
                    Action: 0
                  };
                  const isEnabled = timer.Enable === 1;

                  return (
                    <div
                      key={timerNum}
                      className={cn(
                        'p-2.5 rounded-lg border text-xs flex flex-col justify-between gap-1.5',
                        isEnabled ? 'bg-zinc-900 border-zinc-750' : 'bg-zinc-950/40 border-zinc-850 opacity-60'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          #{timerNum}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleSingleTimer(timerNum, timer)}
                            disabled={!isOnline}
                            className={cn(
                              'w-6 h-3 rounded-full transition-colors relative p-0.5',
                              isEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
                            )}
                          >
                            <span
                              className={cn(
                                'block w-2 h-2 rounded-full bg-white transition-transform',
                                isEnabled ? 'translate-x-3' : 'translate-x-0'
                              )}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditTimer(timerNum)}
                            className="p-1 text-zinc-400 hover:text-amber-400"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-baseline justify-between">
                        <span className="font-mono font-bold text-zinc-200">{timer.Time || '00:00'}</span>
                        <span className="text-[10px] text-zinc-500">
                          {timer.Action === 1 ? 'ON' : timer.Action === 0 ? 'OFF' : 'TOG'} · Relay {timer.Output}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: ADD / EDIT TIMER */}
      {editingTimerIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setEditingTimerIndex(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-750 rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <h4 className="font-bold text-sm text-zinc-100">
                  {isCreatingNew ? t('addSchedule') : `${t('editTimerTitle')} (#${editingTimerIndex})`}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingTimerIndex(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTimerModal} className="space-y-4">
              {/* Enable Switch */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div>
                  <span className="text-xs font-semibold text-zinc-200 block">{t('timerEnabled')}</span>
                  <span className="text-[11px] text-zinc-500">Tự động kích hoạt khi đến giờ</span>
                </div>
                <input
                  type="checkbox"
                  checked={editTimerForm.Enable === 1}
                  onChange={(e) =>
                    setEditTimerForm((prev) => ({ ...prev, Enable: e.target.checked ? 1 : 0 }))
                  }
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Time Picker */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  {t('timerTimeLabel')}
                </label>
                <input
                  type="time"
                  required
                  value={editTimerForm.Time}
                  onChange={(e) =>
                    setEditTimerForm((prev) => ({ ...prev, Time: e.target.value }))
                  }
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 text-base font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Action: ON / OFF / TOGGLE */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  {t('timerActionLabel')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditTimerForm((prev) => ({ ...prev, Action: 1 }))}
                    className={cn(
                      'py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center flex items-center justify-center gap-1.5',
                      editTimerForm.Action === 1
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-sm'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                    )}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{t('btnOn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTimerForm((prev) => ({ ...prev, Action: 0 }))}
                    className={cn(
                      'py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center flex items-center justify-center gap-1.5',
                      editTimerForm.Action === 0
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500 shadow-sm'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                    )}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{t('btnOff')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTimerForm((prev) => ({ ...prev, Action: 2 }))}
                    className={cn(
                      'py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center flex items-center justify-center gap-1.5',
                      editTimerForm.Action === 2
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                    )}
                  >
                    <span>{t('actionToggle')}</span>
                  </button>
                </div>
              </div>

              {/* Target Relay */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  {t('targetRelay')}
                </label>
                <select
                  value={editTimerForm.Output}
                  onChange={(e) =>
                    setEditTimerForm((prev) => ({
                      ...prev,
                      Output: parseInt(e.target.value, 10)
                    }))
                  }
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs focus:border-amber-500 focus:outline-none"
                >
                  {powerKeys.map((key) => {
                    const num = parseInt(key.replace(/\D/g, '') || '1', 10);
                    const label =
                      device.relayLabels?.[key] ||
                      device.friendlyNames?.[num - 1] ||
                      `${t('channelLabel')} ${num}`;
                    return (
                      <option key={key} value={num}>
                        {label} ({key})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Days of Week selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-zinc-300">
                    {t('daysOfWeek')}
                  </label>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setEditTimerForm((prev) => ({ ...prev, Days: '1111111' }))}
                      className="text-amber-400 hover:underline"
                    >
                      {t('repeatDaily')}
                    </button>
                    <span className="text-zinc-600">•</span>
                    <button
                      type="button"
                      onClick={() => setEditTimerForm((prev) => ({ ...prev, Days: '0111110' }))}
                      className="text-amber-400 hover:underline"
                    >
                      {t('repeatWeekdays')}
                    </button>
                    <span className="text-zinc-600">•</span>
                    <button
                      type="button"
                      onClick={() => setEditTimerForm((prev) => ({ ...prev, Days: '1000001' }))}
                      className="text-amber-400 hover:underline"
                    >
                      {t('repeatWeekends')}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {DAY_KEYS.map((d) => {
                    const active = isDayActive(editTimerForm.Days, d.index);
                    return (
                      <button
                        key={d.index}
                        type="button"
                        onClick={() =>
                          setEditTimerForm((prev) => ({
                            ...prev,
                            Days: toggleDayInMask(prev.Days, d.index)
                          }))
                        }
                        className={cn(
                          'py-1.5 rounded-lg text-xs font-bold border transition-all text-center',
                          active
                            ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-sm'
                            : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                        )}
                      >
                        {t(d.key)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Repeat Weekly */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-xs font-semibold text-zinc-200">{t('timerRepeatLabel')}</span>
                <input
                  type="checkbox"
                  checked={editTimerForm.Repeat === 1}
                  onChange={(e) =>
                    setEditTimerForm((prev) => ({ ...prev, Repeat: e.target.checked ? 1 : 0 }))
                  }
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                {!isCreatingNew ? (
                  <button
                    type="button"
                    onClick={() => handleResetTimer(editingTimerIndex)}
                    className="px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/15 border border-rose-500/30 text-xs font-semibold transition-all flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t('deleteBtn')}</span>
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTimerIndex(null)}
                    className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold border border-zinc-700 transition-all"
                  >
                    {t('cancelBtn')}
                  </button>
                  <button
                    type="submit"
                    disabled={savingTimer}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
                  >
                    {t('save')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
