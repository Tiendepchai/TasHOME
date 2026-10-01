import { create } from 'zustand';
import type {
  DeviceStoreState,
  TasmotaDevice,
  DeviceState
} from './device-store.types';

export const useDeviceStore = create<DeviceStoreState>((set, get) => ({
  devices: {},
  deviceStates: {},
  selectedDeviceId: null,

  fetchDevices: async () => {
    if (typeof window === 'undefined') return;
    try {
      const res = await fetch('/api/devices');
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          set((state) => {
            const nextStates = { ...state.deviceStates };
            for (const id of Object.keys(data)) {
              if (!nextStates[id]) {
                nextStates[id] = {
                  online: false,
                  lastSeen: 0,
                  power: { POWER1: false, POWER2: false },
                  sensors: {}
                };
              }
            }
            return {
              devices: data,
              deviceStates: nextStates,
              selectedDeviceId:
                state.selectedDeviceId && data[state.selectedDeviceId]
                  ? state.selectedDeviceId
                  : Object.keys(data)[0] || null
            };
          });
        }
      }
    } catch {}
  },

  addDevice: (deviceData) => {
    const id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newDevice: TasmotaDevice = {
      ...deviceData,
      id,
      addedAt: Date.now()
    };

    set((state) => ({
      devices: { ...state.devices, [id]: newDevice },
      deviceStates: {
        ...state.deviceStates,
        [id]: {
          online: false,
          lastSeen: 0,
          power: { POWER1: false },
          sensors: {}
        }
      },
      selectedDeviceId: state.selectedDeviceId ?? id
    }));

    // Server persistence
    fetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDevice)
    }).catch(() => {});

    return id;
  },

  removeDevice: (id) => {
    set((state) => {
      const { [id]: _, ...restDevices } = state.devices;
      const { [id]: __, ...restStates } = state.deviceStates;
      const remainingIds = Object.keys(restDevices);
      return {
        devices: restDevices,
        deviceStates: restStates,
        selectedDeviceId: state.selectedDeviceId === id ? (remainingIds[0] || null) : state.selectedDeviceId
      };
    });

    // Server persistence
    fetch(`/api/devices/${id}`, {
      method: 'DELETE'
    }).catch(() => {});
  },

  updateDevice: (id, partial) => {
    set((state) => {
      const existing = state.devices[id];
      if (!existing) return state;
      const updated = { ...existing, ...partial };
      return { devices: { ...state.devices, [id]: updated } };
    });

    // Server persistence
    fetch(`/api/devices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial)
    }).catch(() => {});
  },

  updateDeviceState: (id, partial) => {
    set((state) => {
      const existing = state.deviceStates[id] || {
        online: false,
        lastSeen: 0,
        power: {},
        sensors: {}
      };
      const updated: DeviceState = {
        ...existing,
        ...partial,
        power: { ...existing.power, ...(partial.power || {}) },
        sensors: { ...existing.sensors, ...(partial.sensors || {}) }
      };
      return {
        deviceStates: { ...state.deviceStates, [id]: updated }
      };
    });
  },

  setSelectedDevice: (id) => {
    set({ selectedDeviceId: id });
  }
}));
