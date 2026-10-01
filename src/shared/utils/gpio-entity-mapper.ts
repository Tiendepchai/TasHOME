import type { GpioEntityInfo, PanelEntityType } from '@/features/devices/store/device-store.types';

export function mapGpioToEntities(payload: Record<string, unknown>): GpioEntityInfo[] {
  const result: GpioEntityInfo[] = [];

  const gpioObj = (payload.GPIO ?? payload.GPIOs ?? payload) as Record<string, unknown>;
  if (!gpioObj || typeof gpioObj !== 'object') return result;

  for (const [key, val] of Object.entries(gpioObj)) {
    const pinMatch = key.match(/(?:GPIO|pin|d)?(\d+)/i);
    if (!pinMatch) continue;
    const gpioPin = Number(pinMatch[1]);

    let name = '';
    let gpioCode = 0;

    if (val && typeof val === 'object') {
      const keys = Object.keys(val);
      if (keys.length > 0) {
        name = keys[0];
        gpioCode = Number((val as Record<string, unknown>)[name]) || 0;
      }
    } else {
      name = String(val || '');
    }

    let entityType: PanelEntityType = 'switch_input';
    let entityKey = `GPIO${gpioPin}`;

    if (!name || name === 'None' || gpioCode === 0) {
      entityType = 'unused';
      name = 'None';
    } else if (/Relay(\d*)/i.test(name)) {
      entityType = 'relay';
      const m = name.match(/Relay(\d*)/i);
      const num = m && m[1] ? m[1] : '1';
      entityKey = `POWER${num}`;
    } else if (/Tuya|Tx|Rx|Serial/i.test(name)) {
      entityType = 'serial';
      entityKey = name.toUpperCase().replace(/\s+/g, '_');
    } else if (/Button/i.test(name)) {
      entityType = 'button';
      entityKey = name.toUpperCase();
    } else if (/Switch/i.test(name)) {
      entityType = 'switch_input';
      entityKey = name.toUpperCase();
    } else if (/PWM/i.test(name)) {
      entityType = 'pwm';
      entityKey = name.toUpperCase();
    } else if (/Led/i.test(name)) {
      entityType = 'led';
      entityKey = name.toUpperCase();
    } else if (/ADC|Analog/i.test(name)) {
      entityType = 'adc';
      entityKey = `ADC${gpioPin}`;
    } else if (/Sensor|DHT|DS18|I2C/i.test(name)) {
      entityType = 'sensor';
      entityKey = name.toUpperCase();
    }

    result.push({
      gpioPin,
      gpioCode,
      gpioName: name,
      entityType,
      entityKey
    });
  }

  return result.sort((a, b) => a.gpioPin - b.gpioPin);
}
