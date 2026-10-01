/// <reference types="vite/client" />
import React from 'react';
import { CheckCircle2, Clock, Cpu, ExternalLink, Radio, Server, Wifi, WifiOff } from 'lucide-react';
import type { WidgetProps } from '@/features/widgets/registry/widget-types';
import { formatUptime } from '@/shared/utils/tasmota-parsers';
import { useTranslation } from '@/core/i18n';
import './DeviceInfoWidget.css';

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : '—';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const number = (value: unknown, unit = '') => finite(value) ? `${value}${unit}` : '—';

function uptimeText(value: unknown) {
  if (finite(value) && value >= 0) return formatUptime(value === 0 ? '00:00:00' : value);
  if (typeof value !== 'string' || !value.trim() || /^(N\/A|NaN|Infinity)$/i.test(value.trim())) return '—';
  return formatUptime(value.trim() === '0' ? '00:00:00' : value.trim());
}

function webUiUrl(address: unknown) {
  if (typeof address !== 'string' || !address || /[\s/\\?#@]/.test(address)) return undefined;
  try {
    const url = new URL(`http://${address}`);
    return url.hostname && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export const DeviceInfoWidget: React.FC<WidgetProps> = ({
  devices,
  deviceStates,
  colSpan = 2,
  rowSpan = 1
}) => {
  const { t } = useTranslation();
  const device = devices[0];
  const state = device ? deviceStates[device.id] : undefined;
  // lastSeen only establishes that polling was attempted; errors update it too.
  const status = state?.online === true ? 'online' : state?.online === false && state.lastSeen > 0 ? 'offline' : 'waiting';
  const StatusIcon = status === 'online' ? CheckCircle2 : status === 'offline' ? WifiOff : Clock;
  const wifi = state?.wifi;
  const signal = finite(wifi?.signal) && wifi.signal >= 0 && wifi.signal <= 100 ? wifi.signal : undefined;
  const latency = finite(state?.latency) && state.latency >= 0 ? state.latency : undefined;
  const href = webUiUrl(device?.ipAddress);
  const gpio = state?.gpioConfig;

  return (
    <article className="device-info" data-rows={rowSpan} data-layout={`${colSpan}x${rowSpan}`} data-status={status} aria-label={t('widgetDeviceInfoTitle')}>
      {!device ? (
        <div className="di-empty"><Cpu aria-hidden="true" /><p>{t('unassignedDevice')}</p></div>
      ) : (
        <div className="di-layout">
          <header className="di-identity">
            <div className="di-heading">
              <h3 className="di-name">{text(device.friendlyName)}</h3>
              <p className="di-status"><StatusIcon aria-hidden="true" />
                {status === 'online' ? t('online') : status === 'offline' ? t('offlineStale') : t('waitingData')}
              </p>
              <p className="di-identity-type">{t('deviceType')} <strong>{text(device.module)}</strong></p>
            </div>
            {href && (
              <a className="di-web" href={href} target="_blank" rel="noopener noreferrer" draggable
                aria-label={t('openWebUi')}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}>
                <ExternalLink aria-hidden="true" /><span>Web UI</span>
              </a>
            )}
          </header>

          <div className="di-system">
            <div className="di-panel di-hardware">
              <h4><Cpu aria-hidden="true" /> {t('hardware')}</h4>
              <dl className="di-details">
                <div><dt>Chip</dt><dd>{text(device.hardware)}</dd></div>
                <div><dt>{t('deviceType')}</dt><dd>{text(device.module)}</dd></div>
              </dl>
            </div>
            <div className="di-panel di-firmware">
              <h4><Server aria-hidden="true" /> {t('firmware')}</h4>
              <p className="di-firmware-value">{text(device.firmwareVersion)}</p>
            </div>
          </div>

          <div className="di-panel di-wifi">
            <h4><Wifi aria-hidden="true" /> {t('wifi')}</h4>
            <p className="di-signal">{number(signal, '%')}</p>
            <p className="di-rssi">RSSI <strong>{number(wifi?.rssi, ' dBm')}</strong></p>
            <dl className="di-wifi-details di-details">
              <div><dt>SSID</dt><dd>{text(wifi?.ssid)}</dd></div>
              <div className="di-wifi-channel"><dt>{t('channel')}</dt><dd>{number(wifi?.channel)}</dd></div>
            </dl>
          </div>

          <div className="di-panel di-runtime">
            <dl>
              <div className="di-uptime"><dt><Clock aria-hidden="true" /> {t('uptime')}</dt><dd>{uptimeText(state?.uptime)}</dd></div>
              <div className="di-latency"><dt>{t('latency')}</dt><dd>{number(latency, ' ms')}</dd></div>
            </dl>
          </div>

          <div className="di-panel di-network">
            <h4><Radio aria-hidden="true" /> {t('connection')}</h4>
            <dl className="di-details">
              <div><dt>SSID</dt><dd>{text(wifi?.ssid)}</dd></div>
              <div><dt>{t('channel')}</dt><dd>{number(wifi?.channel)}</dd></div>
              <div><dt>MAC</dt><dd>{text(device.macAddress)}</dd></div>
            </dl>
          </div>

          <div className="di-panel di-gpio">
            <h4><Cpu aria-hidden="true" /> {t('gpio')}</h4>
            {gpio?.length ? (
              <table>
                <caption className="di-sr-only">{t('gpio')}</caption>
                <thead><tr><th scope="col">{t('gpioPin')}</th><th scope="col">{t('gpioFunction')}</th><th className="di-gpio-extra" scope="col">{t('gpioCode')}</th><th className="di-gpio-extra" scope="col">{t('gpioEntity')}</th></tr></thead>
                <tbody>{gpio.map((pin, index) => (
                  <tr key={`${pin.gpioPin}-${index}`}>
                    <td>{number(pin.gpioPin)}</td><td>{text(pin.gpioName)}</td>
                    <td className="di-gpio-extra">{number(pin.gpioCode)}</td><td className="di-gpio-extra">{text(pin.entityKey)}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="di-note">{gpio ? t('noGpioReported') : t('noGpioData')}</p>}
          </div>
        </div>
      )}
    </article>
  );
};
