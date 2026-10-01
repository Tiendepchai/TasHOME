/// <reference types="vite/client" />
import React, { useState } from 'react';
import type { WidgetProps } from '@/features/widgets/registry/widget-types';
import { Clock, Power, Wifi, WifiOff } from 'lucide-react';
import './RelayToggleWidget.css';

const PULSE_TIME_PRESETS = [
  { label: 'Tắt hẹn giờ', val: 0 },
  { label: '1p', val: 160 },
  { label: '5p', val: 400 },
  { label: '15p', val: 1000 },
  { label: '30p', val: 1900 },
];

export const RelayToggleWidget: React.FC<WidgetProps> = ({
  devices,
  deviceStates,
  onCommand,
  colSpan = 1,
  rowSpan = 1
}) => {
  const device = devices[0];
  const state = device ? deviceStates[device.id] : undefined;
  const isOnline = !!state?.online;
  const status = isOnline ? 'online' : state && (state.lastSeen ?? 0) > 0 ? 'offline' : 'waiting';

  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [localPower, setLocalPower] = useState<Record<string, boolean>>({});
  const [pulseSending, setPulseSending] = useState<Record<string, boolean>>({});

  if (!device) {
    return (
      <article
        className="relay-widget"
        data-rows={rowSpan}
        data-layout={`${colSpan}x${rowSpan}`}
        data-channels="0"
        data-status="waiting"
        aria-label="Điều khiển Relay"
      >
        <div className="rw-empty">
          <Power aria-hidden="true" />
          <p>Chưa gán thiết bị cho widget này</p>
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

  const handleToggle = async (key: string) => {
    if (!isOnline || toggling[key]) return;
    const current = localPower[key] !== undefined ? localPower[key] : !!state?.power?.[key];
    const target = !current;

    setLocalPower((prev) => ({ ...prev, [key]: target }));
    setToggling((prev) => ({ ...prev, [key]: true }));

    try {
      await onCommand(device.id, `${key} ${target ? 'ON' : 'OFF'}`);
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

  const handlePulseTime = async (channelNum: number, pulseVal: number, key: string) => {
    if (!isOnline || pulseSending[key]) return;
    setPulseSending((prev) => ({ ...prev, [key]: true }));
    try {
      await onCommand(device.id, `PulseTime${channelNum} ${pulseVal}`);
    } finally {
      setTimeout(() => {
        setPulseSending((prev) => ({ ...prev, [key]: false }));
      }, 500);
    }
  };

  const isSingleChannel = powerKeys.length === 1;
  const is1x1 = colSpan === 1 && rowSpan === 1;

  return (
    <article
      className="relay-widget"
      data-rows={rowSpan}
      data-layout={`${colSpan}x${rowSpan}`}
      data-channels={powerKeys.length}
      data-status={status}
      aria-label="Điều khiển Relay"
    >
      <div className="rw-layout">
        {/* Card Header */}
        <header className="rw-header">
          <div className="rw-identity">
            <h3 className="rw-name">{device.friendlyName}</h3>
            <div className="rw-meta">
              <span className="rw-status-tag">
                {isOnline ? (
                  <>
                    <Wifi aria-hidden="true" />
                    <span>Online</span>
                  </>
                ) : (
                  <>
                    <WifiOff aria-hidden="true" />
                    <span>Offline</span>
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
              const key = powerKeys[0];
              const isActive = localPower[key] !== undefined ? localPower[key] : !!state?.power?.[key];
              const isBusy = !!toggling[key];
              return (
                <div className="rw-hero-box">
                  <button
                    type="button"
                    onClick={() => handleToggle(key)}
                    disabled={!isOnline || isBusy}
                    data-active={isActive ? 'true' : 'false'}
                    aria-pressed={isActive}
                    aria-label={`${device.friendlyName}: ${isActive ? 'Đang bật' : 'Đang tắt'}`}
                    className="rw-toggle-btn rw-hero-toggle"
                  >
                    <Power aria-hidden="true" />
                    <span className="rw-btn-label">{isActive ? 'BẬT' : 'TẮT'}</span>
                  </button>
                </div>
              );
            })()
          ) : (
            // Multi-channel list / cards
            powerKeys.map((key) => {
              const chNum = parseInt(key.replace(/\D/g, '') || '1', 10);
              const isActive = localPower[key] !== undefined ? localPower[key] : !!state?.power?.[key];
              const isBusy = !!toggling[key];
              const channelName =
                device.relayLabels?.[key] ||
                device.friendlyNames?.[chNum - 1] ||
                `Kênh ${chNum}`;

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
                      aria-label={`${channelName}: ${isActive ? 'Đang bật' : 'Đang tắt'}`}
                      className="rw-channel-switch"
                    >
                      <Power aria-hidden="true" />
                      <span>{isActive ? 'BẬT' : 'TẮT'}</span>
                    </button>
                  </div>

                  {/* PulseTime auto-off timer controls */}
                  <div className="rw-pulsetime-wrap">
                    <div className="rw-pulsetime-title">
                      <Clock aria-hidden="true" />
                      <span>Tự tắt sau:</span>
                    </div>
                    {PULSE_TIME_PRESETS.map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => handlePulseTime(chNum, preset.val, key)}
                        disabled={!isOnline || !!pulseSending[key]}
                        className="rw-timer-chip"
                        aria-label={`Đặt tự tắt ${preset.label} cho ${channelName}`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </article>
  );
};
