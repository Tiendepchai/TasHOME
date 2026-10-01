/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import type { WidgetProps } from '@/features/widgets/registry/widget-types';
import { Clock, Power, Wifi, WifiOff, X } from 'lucide-react';
import { useTranslation } from '@/core/i18n';
import type { TranslationKey } from '@/core/i18n/translations';
import {
  secondsToPulseTime,
  pulseTimeToSeconds,
  formatTimerDuration
} from '@/shared/utils/tasmota-parsers';
import './RelayToggleWidget.css';

const PULSE_TIME_PRESETS: Array<{ key: TranslationKey; val: number }> = [
  { key: 'timerOff', val: 0 },
  { key: 'time10s', val: 100 },
  { key: 'time30s', val: 130 },
  { key: 'time1m', val: 160 },
  { key: 'time2m', val: 220 },
  { key: 'time5m', val: 400 },
  { key: 'time15m', val: 1000 },
  { key: 'time30m', val: 1900 },
  { key: 'time1h', val: 3700 },
];

interface ActiveTimer {
  mode: 'on' | 'off';
  endsAt: number;
  totalSecs: number;
}

export const RelayToggleWidget: React.FC<WidgetProps> = ({
  config,
  title,
  devices,
  deviceStates,
  onCommand,
  colSpan = 1,
  rowSpan = 1
}) => {
  const { t } = useTranslation();
  const device = devices[0];
  const state = device ? deviceStates[device.id] : undefined;
  const isOnline = !!state?.online;
  const status = isOnline ? 'online' : state && (state.lastSeen ?? 0) > 0 ? 'offline' : 'waiting';

  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [localPower, setLocalPower] = useState<Record<string, boolean>>({});
  const [pulseSending, setPulseSending] = useState<Record<string, boolean>>({});

  // Active timers per channel (Auto-On or Auto-Off)
  const [channelTimers, setChannelTimers] = useState<Record<string, ActiveTimer>>({});
  const [, setTick] = useState(0);

  // Custom timer modal (chNum, key, name, mode)
  const [customModalChannel, setCustomModalChannel] = useState<{
    chNum: number;
    key: string;
    name: string;
    mode: 'on' | 'off';
  } | null>(null);
  const [customMins, setCustomMins] = useState(5);
  const [customSecs, setCustomSecs] = useState(0);

  // Mitosis cell division state for 2s hover on hero toggle
  const [isDivided, setIsDivided] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const isDividedRef = React.useRef(false);
  isDividedRef.current = isDivided;
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStageMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (isDividedRef.current) return;
    setIsPreparing(true);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsDivided(true);
      setIsPreparing(false);
      hoverTimeoutRef.current = null;
    }, 2000);
  };

  const handleStageMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsPreparing(false);
    if (isDividedRef.current) {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      closeTimeoutRef.current = setTimeout(() => {
        setIsDivided(false);
        closeTimeoutRef.current = null;
      }, 500);
    }
  };

  const handleStageTouchStart = () => {
    handleStageMouseEnter();
  };

  const handleStageTouchEnd = () => {
    if (!isDividedRef.current) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setIsPreparing(false);
    }
  };

  const handleStageTouchCancel = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsPreparing(false);
  };

  useEffect(() => {
    if (!isDivided) return;
    const onOutside = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.rw-mitosis-stage')) {
        setIsDivided(false);
      }
    };
    const autoCloseTimer = setTimeout(() => setIsDivided(false), 8000);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      clearTimeout(autoCloseTimer);
      document.removeEventListener('pointerdown', onOutside);
    };
  }, [isDivided]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  if (!device) {
    return (
      <article
        className="relay-widget"
        data-rows={rowSpan}
        data-layout={`${colSpan}x${rowSpan}`}
        data-channels="0"
        data-status="waiting"
        aria-label={t('relayControl')}
      >
        <div className="rw-empty">
          <Power aria-hidden="true" />
          <p>{t('unassignedRelay')}</p>
        </div>
      </article>
    );
  }

  // Detect power channels (POWER1, POWER2, ...)
  const channelSet = new Set<string>();
  Object.keys(state?.power || {}).forEach((k) => {
    if (/^POWER\d*$/i.test(k)) channelSet.add(k.toUpperCase());
  });
  if (device.relayLabels) {
    Object.keys(device.relayLabels).forEach((k) => {
      if (/^POWER\d*$/i.test(k)) channelSet.add(k.toUpperCase());
    });
  }
  if (channelSet.size === 0) {
    channelSet.add('POWER1');
  }
  const powerKeys = Array.from(channelSet);

  // Sort channels canonically
  powerKeys.sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, '') || '1', 10);
    const numB = parseInt(b.replace(/\D/g, '') || '1', 10);
    return numA - numB;
  });

  // User configured visible channels
  const visibleConfig = config?.settings?.visibleChannels as string[] | undefined;
  const activePowerKeys =
    Array.isArray(visibleConfig) && visibleConfig.length > 0
      ? powerKeys.filter((k) => visibleConfig.includes(k))
      : powerKeys;

  const isSingleChannel = activePowerKeys.length === 1;
  const is1x1 = colSpan === 1 && rowSpan === 1;

  // Sync remaining seconds from Tasmota state.pulseTimes when relay is ON
  useEffect(() => {
    if (!state?.power) return;
    for (const key of activePowerKeys) {
      const isRelayOn = localPower[key] !== undefined ? localPower[key] : !!state.power[key];
      const pulse = state.pulseTimes?.[key];
      if (isRelayOn && pulse && pulse.set > 0) {
        setChannelTimers((prev) => {
          if (!prev[key]) {
            const rem = pulse.remaining > 0 ? pulse.remaining : pulseTimeToSeconds(pulse.set);
            return {
              ...prev,
              [key]: {
                mode: 'off',
                endsAt: Date.now() + rem * 1000,
                totalSecs: rem
              }
            };
          }
          return prev;
        });
      }
    }
  }, [state?.power, state?.pulseTimes, localPower, activePowerKeys]);

  // Tick countdown every second and trigger actions on completion
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setChannelTimers((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [key, tm] of Object.entries(prev)) {
          if (now >= tm.endsAt) {
            delete next[key];
            changed = true;
            if (device?.id) {
              onCommand(device.id, `${key} ${tm.mode === 'on' ? 'ON' : 'OFF'}`);
            }
          }
        }
        return changed ? next : prev;
      });
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [device?.id, onCommand]);

  const getChannelRemaining = (key: string) => {
    const tm = channelTimers[key];
    if (tm) {
      return Math.max(0, Math.ceil((tm.endsAt - Date.now()) / 1000));
    }
    const pulse = state?.pulseTimes?.[key];
    const isRelayOn = localPower[key] !== undefined ? localPower[key] : !!state?.power?.[key];
    if (isRelayOn && pulse && pulse.set > 0) {
      return pulse.remaining > 0 ? pulse.remaining : pulseTimeToSeconds(pulse.set);
    }
    return 0;
  };

  const formatCountdown = (secs: number) => {
    if (secs <= 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleToggle = async (key: string) => {
    if (!isOnline || toggling[key]) return;
    const current = localPower[key] !== undefined ? localPower[key] : !!state?.power?.[key];
    const target = !current;

    // Clear any pending timer for this channel when user manually toggles
    if (channelTimers[key]) {
      setChannelTimers((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }

    setLocalPower((prev) => ({ ...prev, [key]: target }));
    setToggling((prev) => ({ ...prev, [key]: true }));

    try {
      await onCommand(device.id, `Backlog Delay 0; ${key} ${target ? 'ON' : 'OFF'}`);
    } catch {
      // Rollback on failure
      setLocalPower((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    } finally {
      setToggling((prev) => ({ ...prev, [key]: false }));
      setTimeout(() => {
        setLocalPower((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }, 1200);
    }
  };

  const setTimerForChannel = async (channelNum: number, key: string, totalSecs: number, mode: 'on' | 'off') => {
    if (!isOnline || pulseSending[key]) return;
    setPulseSending((prev) => ({ ...prev, [key]: true }));

    try {
      if (totalSecs <= 0) {
        setChannelTimers((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        await onCommand(device.id, `Backlog Delay 0; PulseTime${channelNum} 0`);
      } else {
        setChannelTimers((prev) => ({
          ...prev,
          [key]: {
            mode,
            endsAt: Date.now() + totalSecs * 1000,
            totalSecs
          }
        }));

        if (mode === 'off') {
          const pulseVal = secondsToPulseTime(totalSecs);
          await onCommand(device.id, `PulseTime${channelNum} ${pulseVal}`);
        } else {
          const tenths = Math.min(36000, Math.round(totalSecs * 10));
          await onCommand(device.id, `Backlog Delay ${tenths}; Power${channelNum} ON`);
        }
      }
    } finally {
      setTimeout(() => {
        setPulseSending((prev) => ({ ...prev, [key]: false }));
      }, 500);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customModalChannel) return;
    const totalSecs = Math.max(0, customMins * 60 + customSecs);
    await setTimerForChannel(
      customModalChannel.chNum,
      customModalChannel.key,
      totalSecs,
      customModalChannel.mode
    );
    setCustomModalChannel(null);
  };

  return (
    <article
      className="relay-widget"
      data-rows={rowSpan}
      data-layout={`${colSpan}x${rowSpan}`}
      data-channels={activePowerKeys.length}
      data-status={status}
      aria-label={t('relayControl')}
    >
      <div className="rw-layout">
        {/* Card Header */}
        <header className="rw-header">
          <div className="rw-identity">
            <h3 className="rw-name">{title || device.friendlyName}</h3>
            <div className="rw-meta">
              <span className="rw-status-tag">
                {isOnline ? (
                  <>
                    <Wifi aria-hidden="true" />
                    <span>{t('online')}</span>
                  </>
                ) : (
                  <>
                    <WifiOff aria-hidden="true" />
                    <span>{t('offline')}</span>
                  </>
                )}
              </span>
              {state?.latency !== undefined && (
                <span className="rw-latency">{state.latency}ms</span>
              )}
            </div>
          </div>
        </header>

        {/* Channels */}
        <div className="rw-channels">
          {isSingleChannel && is1x1 ? (
            // Hero single toggle for 1x1
            (() => {
              const key = activePowerKeys[0];
              const isActive = localPower[key] !== undefined ? localPower[key] : !!state?.power?.[key];
              const isBusy = !!toggling[key];
              const remainingSecs = getChannelRemaining(key);
              const activeTimer = channelTimers[key];
              const currentTimerMode = activeTimer?.mode || (isActive ? 'off' : 'on');

              const chNum = parseInt(key.replace(/\D/g, '') || '1', 10);
              const channelName =
                device.relayLabels?.[key] ||
                device.friendlyNames?.[chNum - 1] ||
                `${t('channelLabel')} ${chNum}`;
              const pulse = state?.pulseTimes?.[key];
              const isArmed = remainingSecs > 0 || (isActive && (pulse?.set ?? 0) > 0);

              return (
                <div className="rw-hero-box">
                  <div
                    className="rw-mitosis-stage"
                    data-divided={isDivided ? 'true' : 'false'}
                    data-preparing={isPreparing ? 'true' : 'false'}
                    onMouseEnter={handleStageMouseEnter}
                    onMouseLeave={handleStageMouseLeave}
                    onTouchStart={handleStageTouchStart}
                    onTouchEnd={handleStageTouchEnd}
                    onTouchCancel={handleStageTouchCancel}
                  >
                    {/* Mother cell: Power toggle button */}
                    <button
                      type="button"
                      onClick={() => handleToggle(key)}
                      disabled={!isOnline || isBusy}
                      data-active={isActive ? 'true' : 'false'}
                      aria-pressed={isActive}
                      aria-label={`${device.friendlyName}: ${isActive ? t('stateOn') : t('stateOff')}`}
                      className="rw-toggle-btn rw-hero-toggle rw-mother-cell"
                    >
                      <Power aria-hidden="true" />
                      <span className="rw-btn-label">{isActive ? t('btnOn') : t('btnOff')}</span>
                    </button>

                    {/* Daughter cell: Timer button appearing symmetrically next to power button */}
                    <button
                      type="button"
                      onClick={() =>
                        setCustomModalChannel({
                          chNum,
                          key,
                          name: channelName,
                          mode: isActive ? 'off' : 'on'
                        })
                      }
                      disabled={!isOnline}
                      className="rw-toggle-btn rw-hero-toggle rw-hero-timer-cell rw-daughter-cell"
                      data-active={isArmed ? 'true' : 'false'}
                      title={isActive ? t('timerTurnOffTitle') : t('timerTurnOnTitle')}
                      aria-label={isActive ? t('timerTurnOffTitle') : t('timerTurnOnTitle')}
                      aria-hidden={!isDivided}
                      tabIndex={isDivided ? 0 : -1}
                    >
                      <Clock aria-hidden="true" />
                      <span className="rw-btn-label">
                        {remainingSecs > 0
                          ? formatCountdown(remainingSecs)
                          : isActive
                            ? t('btnTimerOff')
                            : t('btnTimerOn')}
                      </span>
                    </button>
                  </div>

                  {!isDivided && remainingSecs > 0 && (
                    <div
                      className="rw-countdown-badge"
                      title={currentTimerMode === 'on' ? t('activeTimerRemainingOn') : t('activeTimerRemainingOff')}
                    >
                      <Clock aria-hidden="true" />
                      <span>{formatCountdown(remainingSecs)}</span>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            // Multi-channel list / cards
            activePowerKeys.map((key) => {
              const chNum = parseInt(key.replace(/\D/g, '') || '1', 10);
              const isActive = localPower[key] !== undefined ? localPower[key] : !!state?.power?.[key];
              const isBusy = !!toggling[key];
              const channelName =
                device.relayLabels?.[key] ||
                device.friendlyNames?.[chNum - 1] ||
                `${t('channelLabel')} ${chNum}`;

              const remainingSecs = getChannelRemaining(key);
              const activeTimer = channelTimers[key];
              const pulse = state?.pulseTimes?.[key];
              const currentSet = pulse?.set ?? 0;
              const isCustomActive =
                remainingSecs > 0 &&
                !PULSE_TIME_PRESETS.some((p) => p.val > 0 && pulseTimeToSeconds(p.val) === remainingSecs);

              return (
                <div key={key} className="rw-channel-card">
                  <div className="rw-channel-header">
                    <span className="rw-channel-name">{channelName}</span>
                    <button
                      type="button"
                      onClick={() => handleToggle(key)}
                      disabled={!isOnline || isBusy}
                      data-active={isActive ? 'true' : 'false'}
                      aria-pressed={isActive}
                      aria-label={`${channelName}: ${isActive ? t('stateOn') : t('stateOff')}`}
                      className="rw-channel-switch"
                    >
                      <Power aria-hidden="true" />
                      <span>{isActive ? t('btnOn') : t('btnOff')}</span>
                    </button>
                  </div>

                  {/* Auto-On or Auto-Off timer controls */}
                  <div className="rw-pulsetime-wrap">
                    <div className="rw-pulsetime-title" style={{ justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock aria-hidden="true" />
                        <span>{isActive ? t('autoOffAfter') : t('autoOnAfter')}</span>
                      </div>
                      {remainingSecs > 0 && (
                        <span className="rw-countdown-badge" style={{ marginTop: 0 }}>
                          <Clock aria-hidden="true" />
                          <span>{formatCountdown(remainingSecs)}</span>
                        </span>
                      )}
                    </div>
                    {PULSE_TIME_PRESETS.map((preset) => {
                      const isPresetActive =
                        preset.val === 0
                          ? remainingSecs === 0 && (!isActive || currentSet === 0)
                          : activeTimer
                            ? activeTimer.totalSecs === pulseTimeToSeconds(preset.val) &&
                              activeTimer.mode === (isActive ? 'off' : 'on')
                            : isActive && currentSet === preset.val;

                      return (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => {
                            if (preset.val === 0) {
                              setTimerForChannel(chNum, key, 0, isActive ? 'off' : 'on');
                            } else {
                              const secs = pulseTimeToSeconds(preset.val);
                              setTimerForChannel(chNum, key, secs, isActive ? 'off' : 'on');
                            }
                          }}
                          disabled={!isOnline || !!pulseSending[key]}
                          data-active={isPresetActive ? 'true' : 'false'}
                          className="rw-timer-chip"
                          aria-label={`${isActive ? t('autoOffAfter') : t('autoOnAfter')} ${t(preset.key)} - ${channelName}`}
                        >
                          {t(preset.key)}
                        </button>
                      );
                    })}
                    {/* Custom button */}
                    <button
                      type="button"
                      onClick={() =>
                        setCustomModalChannel({
                          chNum,
                          key,
                          name: channelName,
                          mode: isActive ? 'off' : 'on'
                        })
                      }
                      disabled={!isOnline || !!pulseSending[key]}
                      data-active={isCustomActive ? 'true' : 'false'}
                      className="rw-timer-chip"
                      aria-label={`${t('timeCustom')} - ${channelName}`}
                    >
                      {isCustomActive ? formatTimerDuration(remainingSecs) : t('timeCustom')}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Custom Timer Dialog */}
      {customModalChannel && (
        <div className="rw-modal-overlay" onClick={() => setCustomModalChannel(null)}>
          <div className="rw-modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fafafa', fontSize: 13, fontWeight: 650 }}>
                <Clock size={16} color="var(--rw-accent)" />
                <span>
                  {customModalChannel.mode === 'on' ? t('timeCustomTitleOn') : t('timeCustomTitleOff')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCustomModalChannel(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--rw-muted)',
                  cursor: 'pointer',
                  padding: 4
                }}
                aria-label={t('close')}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 11, color: 'var(--rw-muted)' }}>
              {customModalChannel.name}
            </p>

            <form onSubmit={handleCustomSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--rw-muted)', marginBottom: 4 }}>
                    {customModalChannel.mode === 'on' ? t('customMinutesLabelOn') : t('customMinutesLabelOff')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1080}
                    value={customMins}
                    onChange={(e) => setCustomMins(Math.max(0, parseInt(e.target.value || '0', 10)))}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--rw-line)',
                      background: 'var(--rw-surface)',
                      color: 'var(--rw-ink)',
                      fontSize: 13
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--rw-muted)', marginBottom: 4 }}>
                    {t('customSecondsLabel')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={customSecs}
                    onChange={(e) => setCustomSecs(Math.max(0, Math.min(59, parseInt(e.target.value || '0', 10))))}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--rw-line)',
                      background: 'var(--rw-surface)',
                      color: 'var(--rw-ink)',
                      fontSize: 13
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 4 }}>
                {getChannelRemaining(customModalChannel.key) > 0 ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await setTimerForChannel(
                        customModalChannel.chNum,
                        customModalChannel.key,
                        0,
                        customModalChannel.mode
                      );
                      setCustomModalChannel(null);
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {t('timerCancel')}
                  </button>
                ) : (
                  <span />
                )}

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setCustomModalChannel(null)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--rw-line)',
                      background: 'transparent',
                      color: 'var(--rw-muted)',
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: '6px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'var(--rw-accent)',
                      color: '#09090b',
                      fontSize: 12,
                      fontWeight: 650,
                      cursor: 'pointer'
                    }}
                  >
                    {t('setTimer')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </article>
  );
};
