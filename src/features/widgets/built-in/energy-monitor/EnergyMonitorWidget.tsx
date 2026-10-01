/// <reference types="vite/client" />
import React from 'react';
import { Activity, AlertCircle, CheckCircle2, Clock, Gauge, Power, WifiOff, Zap } from 'lucide-react';
import type { WidgetProps } from '@/features/widgets/registry/widget-types';
import './EnergyMonitorWidget.css';

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : '—';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const formatMetric = (value: unknown, unit = '') => finite(value) ? `${value}${unit ? ` ${unit}` : ''}` : '—';

export const EnergyMonitorWidget: React.FC<WidgetProps> = ({
  devices,
  deviceStates,
  colSpan = 2,
  rowSpan = 1
}) => {
  const device = devices[0];
  const state = device ? deviceStates[device.id] : undefined;
  const status = state?.online === true ? 'online' : state?.online === false && (state.lastSeen ?? 0) > 0 ? 'offline' : 'waiting';
  const StatusIcon = status === 'online' ? CheckCircle2 : status === 'offline' ? WifiOff : Clock;

  const energy = state?.energy;
  const hasSensor = !!energy;

  return (
    <article
      className="energy-monitor"
      data-rows={rowSpan}
      data-layout={`${colSpan}x${rowSpan}`}
      data-status={status}
      aria-label="Giám sát Điện năng"
    >
      {!device ? (
        <div className="em-empty">
          <Zap aria-hidden="true" />
          <p>Chưa gán thiết bị</p>
        </div>
      ) : !state || status === 'waiting' ? (
        <div className="em-layout">
          <header className="em-identity">
            <div className="em-heading">
              <h3 className="em-name">{text(device.friendlyName)}</h3>
              <p className="em-status">
                <StatusIcon aria-hidden="true" />
                <span>Đang chờ dữ liệu</span>
              </p>
            </div>
          </header>
          <div className="em-empty-notice">
            <Clock aria-hidden="true" />
            <p>Đang chờ dữ liệu</p>
          </div>
        </div>
      ) : !hasSensor ? (
        <div className="em-layout">
          <header className="em-identity">
            <div className="em-heading">
              <h3 className="em-name">{text(device.friendlyName)}</h3>
              <p className="em-status">
                <StatusIcon aria-hidden="true" />
                <span>{status === 'online' ? 'Online' : 'Offline · Dữ liệu cũ'}</span>
              </p>
            </div>
          </header>
          <div className="em-no-sensor">
            <AlertCircle aria-hidden="true" />
            <p>Thiết bị không có cảm biến đo năng lượng</p>
          </div>
        </div>
      ) : (
        <div className="em-layout">
          <header className="em-identity">
            <div className="em-heading">
              <h3 className="em-name">{text(device.friendlyName)}</h3>
              <p className="em-status">
                <StatusIcon aria-hidden="true" />
                <span>{status === 'online' ? 'Online' : 'Offline · Dữ liệu cũ'}</span>
              </p>
            </div>
            <div className="em-live-tag">
              <Zap aria-hidden="true" />
              <span>Điện năng</span>
            </div>
          </header>

          {/* Primary Hero: Real-time Power (W) */}
          <div className="em-hero">
            <span className="em-hero-label">Công suất tiêu thụ</span>
            <div className="em-hero-val-wrap">
              <span className="em-hero-val">{formatMetric(energy?.power, 'W')}</span>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="em-metrics-grid">
            <div className="em-metric-card em-metric-voltage">
              <span className="em-metric-label">Điện áp</span>
              <span className="em-metric-val">{formatMetric(energy?.voltage, 'V')}</span>
            </div>

            <div className="em-metric-card em-metric-current">
              <span className="em-metric-label">Dòng điện</span>
              <span className="em-metric-val">{formatMetric(energy?.current, 'A')}</span>
            </div>

            <div className="em-metric-card em-metric-today">
              <span className="em-metric-label">Hôm nay</span>
              <span className="em-metric-val">{formatMetric(energy?.today, 'kWh')}</span>
            </div>

            <div className="em-metric-card em-metric-yesterday">
              <span className="em-metric-label">Hôm qua</span>
              <span className="em-metric-val">{formatMetric(energy?.yesterday, 'kWh')}</span>
            </div>

            <div className="em-metric-card em-metric-total">
              <span className="em-metric-label">Tổng cộng</span>
              <span className="em-metric-val">{formatMetric(energy?.total, 'kWh')}</span>
            </div>

            <div className="em-metric-card em-metric-factor">
              <span className="em-metric-label">Hệ số công suất</span>
              <span className="em-metric-val">{formatMetric(energy?.factor)}</span>
            </div>

            <div className="em-metric-card em-metric-apparent">
              <span className="em-metric-label">Biểu kiến</span>
              <span className="em-metric-val">{formatMetric(energy?.apparentPower, 'VA')}</span>
            </div>

            <div className="em-metric-card em-metric-reactive">
              <span className="em-metric-label">Phản kháng</span>
              <span className="em-metric-val">{formatMetric(energy?.reactivePower, 'VAr')}</span>
            </div>
          </div>
        </div>
      )}
    </article>
  );
};
