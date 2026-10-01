import React from 'react';
import type { WidgetProps } from '@/features/widgets/registry/widget-types';
import { Thermometer, Gauge, Activity, Radio, Droplets, Zap, Sun } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export const SensorDisplayWidget: React.FC<WidgetProps> = ({
  devices,
  deviceStates
}) => {
  const device = devices[0];
  const state = device ? deviceStates[device.id] : undefined;
  const sensors = state?.sensors || {};
  const sensorEntries = Object.entries(sensors);

  const getMetricIcon = (key: string) => {
    const lower = key.toLowerCase();
    if (lower.includes('temp')) return <Thermometer className="w-3.5 h-3.5 text-rose-400" />;
    if (lower.includes('hum')) return <Droplets className="w-3.5 h-3.5 text-sky-400" />;
    if (lower.includes('power') || lower.includes('voltage') || lower.includes('current')) {
      return <Zap className="w-3.5 h-3.5 text-amber-400" />;
    }
    if (lower.includes('light') || lower.includes('lux')) return <Sun className="w-3.5 h-3.5 text-amber-300" />;
    return <Activity className="w-3.5 h-3.5 text-emerald-400" />;
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-zinc-800/90 hover:border-zinc-700/80 rounded-2xl p-5 shadow-xl transition-all duration-300">
      <div className="flex items-center justify-between mb-4 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-zinc-100 text-sm tracking-tight">Cảm biến & Đo đạc</h3>
            <p className="text-[10px] text-zinc-500">Telemetry Status 8 / 10</p>
          </div>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-400">
          {sensorEntries.length} chỉ số
        </span>
      </div>

      {sensorEntries.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500 bg-zinc-950/40 rounded-xl border border-dashed border-zinc-800/80">
          <Gauge className="w-10 h-10 text-zinc-700 mb-2.5 stroke-[1.2]" />
          <p className="text-xs font-semibold text-zinc-400">Chưa phát hiện cảm biến telemetry</p>
          <span className="text-[11px] text-zinc-600 mt-1 max-w-xs">
            Hệ thống tự động hiển thị khi thiết bị có cảm biến I2C/OneWire (DHT11/22, DS18B20, BME280, ADC).
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 flex-1">
          {sensorEntries.map(([key, item]) => {
            const label = key.split('.').pop() || key;
            return (
              <div
                key={key}
                className="bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700/80 p-3 rounded-xl flex flex-col justify-between transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400 font-medium truncate max-w-[100px]">
                    {label}
                  </span>
                  {getMetricIcon(key)}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono text-zinc-100 tracking-tight">
                    {item.value}
                  </span>
                  {item.unit && (
                    <span className="text-xs font-semibold text-zinc-500">{item.unit}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
