import React, { useState, useMemo } from 'react';
import { useDeviceStore } from '../store/device-store';
import { tasmotaHttp } from '@/core/http/tasmota-http-client';
import { pollScheduler } from '@/core/http/poll-scheduler';
import {
  Plus,
  Trash2,
  Cpu,
  Wifi,
  Activity,
  RefreshCw,
  Layers,
  Server,
  Zap,
  Tag,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Search,
  Power,
  RotateCcw,
  Check,
  X,
  Gauge,
  Sliders,
  Radio,
  SlidersHorizontal,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useToast } from '@/shared/components/Toast';
import { useTranslation } from '@/core/i18n';
import { formatUptime } from '@/shared/utils/tasmota-parsers';
import { DeviceTimerTab } from './DeviceTimerTab';

type TabType = 'controls' | 'timers' | 'network' | 'gpio' | 'settings';

export const DeviceDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const { devices, deviceStates, addDevice, removeDevice, updateDevice, updateDeviceState } =
    useDeviceStore();
  const { addToast } = useToast();

  const deviceList = useMemo(() => Object.values(devices), [devices]);

  // Master List state
  const [selectedId, setSelectedId] = useState<string>(deviceList[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

  // Detail Tab
  const [activeTab, setActiveTab] = useState<TabType>('controls');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanSubnet, setScanSubnet] = useState('');
  const [discoveredDevices, setDiscoveredDevices] = useState<Array<{
    ipAddress: string;
    friendlyName: string;
    macAddress?: string;
    module?: string;
    hardware?: string;
    firmwareVersion?: string;
    alreadyAdded: boolean;
  }>>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmRestartId, setConfirmRestartId] = useState<string | null>(null);

  // Auto-discovery scanner
  const handleStartScan = async (targetSubnet?: string) => {
    setScanLoading(true);
    const sub = targetSubnet !== undefined ? targetSubnet : scanSubnet;
    const query = sub.trim() ? `?subnet=${encodeURIComponent(sub.trim())}` : '';
    try {
      const res = await fetch(`/api/devices/discover${query}`);
      if (res.ok) {
        const data = await res.json();
        setDiscoveredDevices(data.devices || []);
        if (data.subnet && !scanSubnet) {
          setScanSubnet(data.subnet);
        }
        addToast(`Tìm thấy ${data.count || 0} thiết bị Tasmota trên mạng`, 'info');
      } else {
        addToast('Không thể quét mạng LAN', 'error');
      }
    } catch {
      addToast('Lỗi khi gửi yêu cầu quét mạng', 'error');
    } finally {
      setScanLoading(false);
    }
  };

  const handleAddDiscovered = (dev: typeof discoveredDevices[0]) => {
    const id = addDevice({
      ipAddress: dev.ipAddress,
      friendlyName: dev.friendlyName || `Tasmota ${dev.ipAddress}`,
      macAddress: dev.macAddress,
      module: dev.module,
      hardware: dev.hardware,
      firmwareVersion: dev.firmwareVersion,
      mqttTopic: 'tasmota',
      addedVia: 'manual'
    });
    pollScheduler.pollNow(id);
    setDiscoveredDevices((prev) =>
      prev.map((d) => (d.ipAddress === dev.ipAddress ? { ...d, alreadyAdded: true } : d))
    );
    addToast(`Đã thêm thiết bị ${dev.friendlyName} (${dev.ipAddress})`, 'success');
  };

  // Add Device Form state
  const [newIp, setNewIp] = useState('');
  const [newName, setNewName] = useState('');
  const [testPingState, setTestPingState] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testPingMsg, setTestPingMsg] = useState('');

  // Page Action loading states
  const [syncing, setSyncing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Settings tab form state
  const activeDevice = devices[selectedId] || (deviceList.length > 0 ? deviceList[0] : undefined);
  const activeState = activeDevice ? deviceStates[activeDevice.id] : undefined;

  const [editName, setEditName] = useState('');
  const [editRelay1, setEditRelay1] = useState('');
  const [editRelay2, setEditRelay2] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Sync inputs when activeDevice changes
  React.useEffect(() => {
    if (activeDevice) {
      setEditName(activeDevice.friendlyName || '');
      setEditRelay1(activeDevice.relayLabels?.POWER1 || '');
      setEditRelay2(activeDevice.relayLabels?.POWER2 || '');
    }
  }, [activeDevice?.id]);

  // Filtered devices for sidebar
  const filteredDevices = useMemo(() => {
    return deviceList.filter((dev) => {
      const st = deviceStates[dev.id];
      const matchesSearch =
        dev.friendlyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev.ipAddress.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'online') return !!st?.online;
      if (statusFilter === 'offline') return !st?.online;
      return true;
    });
  }, [deviceList, deviceStates, searchQuery, statusFilter]);

  const onlineCount = useMemo(
    () => deviceList.filter((d) => !!deviceStates[d.id]?.online).length,
    [deviceList, deviceStates]
  );
  const offlineCount = deviceList.length - onlineCount;

  // Test ping device before adding
  const handleTestPing = async () => {
    const cleanIp = newIp.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!cleanIp) return;

    setTestPingState('testing');
    setTestPingMsg('Đang gửi truy vấn...');
    try {
      const res = await tasmotaHttp.getStatus(cleanIp, 0, null, 3000);
      if (res.ok) {
        setTestPingState('success');
        const devName = res.data?.Status?.DeviceName || res.data?.StatusNET?.Hostname || '';
        setTestPingMsg(`Kết nối thành công! ${devName ? `(${devName})` : ''}`);
        if (!newName && devName) setNewName(devName);
      } else {
        setTestPingState('failed');
        setTestPingMsg('Thiết bị phản hồi lỗi');
      }
    } catch {
      setTestPingState('failed');
      setTestPingMsg('Không thể phản hồi (Timeout/Offline)');
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIp = newIp.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!cleanIp) return;

    // Check duplicate
    const exists = deviceList.some((d) => d.ipAddress === cleanIp);
    if (exists) {
      addToast(`IP ${cleanIp} đã tồn tại trong danh sách!`, 'error');
      return;
    }

    const id = addDevice({
      ipAddress: cleanIp,
      friendlyName: newName.trim() || `Tasmota ${cleanIp}`,
      mqttTopic: 'tasmota_node',
      addedVia: 'manual'
    });

    setNewIp('');
    setNewName('');
    setTestPingState('idle');
    setTestPingMsg('');
    setShowAddModal(false);
    setSelectedId(id);
    pollScheduler.pollNow(id);
    addToast(`Đã thêm thiết bị ${cleanIp}`, 'success');
  };

  // Sync Status 0
  const handleSync = async () => {
    if (!activeDevice?.ipAddress || syncing) return;
    setSyncing(true);
    try {
      await pollScheduler.pollNow(activeDevice.id);
      addToast(`Đồng bộ ${activeDevice.friendlyName} thành công`, 'success');
    } catch {
      addToast('Lỗi khi kết nối tới thiết bị', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Restart Device
  const handleRestart = async () => {
    if (!activeDevice) return;
    setActionLoading('restart');
    try {
      await tasmotaHttp.sendCommand(activeDevice.ipAddress, 'Restart 1');
      addToast(`Đang khởi động lại ${activeDevice.friendlyName}...`, 'info');
      setConfirmRestartId(null);
      setTimeout(() => pollScheduler.pollNow(activeDevice.id), 5000);
    } catch {
      addToast('Không thể gửi lệnh khởi động lại', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Delete Device
  const handleDelete = () => {
    if (!confirmDeleteId) return;
    const target = devices[confirmDeleteId];
    removeDevice(confirmDeleteId);
    if (selectedId === confirmDeleteId) {
      const remaining = deviceList.filter((d) => d.id !== confirmDeleteId);
      setSelectedId(remaining[0]?.id || '');
    }
    setConfirmDeleteId(null);
    addToast(`Đã xóa thiết bị ${target?.friendlyName || ''}`, 'info');
  };

  // Direct Toggle Relay
  const handleToggleRelay = async (relayIndex: number) => {
    if (!activeDevice) return;
    const key = `POWER${relayIndex}`;
    const currentStatus = !!activeState?.power?.[key];
    const newStatus = !currentStatus;

    // Optimistic UI update
    updateDeviceState(activeDevice.id, {
      power: { ...activeState?.power, [key]: newStatus }
    });

    try {
      await tasmotaHttp.togglePower(activeDevice.ipAddress, relayIndex);
      addToast(
        `${activeDevice.relayLabels?.[key] || `Relay ${relayIndex}`}: ${newStatus ? 'BẬT (ON)' : 'TẮT (OFF)'}`,
        'success'
      );
      setTimeout(() => pollScheduler.pollNow(activeDevice.id), 250);
    } catch {
      // Revert optimistic update
      updateDeviceState(activeDevice.id, {
        power: { ...activeState?.power, [key]: currentStatus }
      });
      addToast(`Lỗi khi chuyển trạng thái Relay ${relayIndex}`, 'error');
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDevice) return;
    setSavingSettings(true);

    try {
      const trimmedName = editName.trim() || activeDevice.friendlyName;
      updateDevice(activeDevice.id, {
        friendlyName: trimmedName,
        relayLabels: {
          POWER1: editRelay1.trim(),
          POWER2: editRelay2.trim()
        }
      });

      // Synchronize to Tasmota hardware if online
      if (activeState?.online) {
        await tasmotaHttp.sendCommand(
          activeDevice.ipAddress,
          `Backlog DeviceName ${trimmedName}; FriendlyName1 ${editRelay1.trim() || trimmedName}; FriendlyName2 ${editRelay2.trim() || 'Relay 2'}`
        );
      }
      addToast('Đã lưu cấu hình thiết bị', 'success');
    } catch {
      addToast('Đã lưu cục bộ nhưng lỗi khi gửi tới vi điều khiển', 'info');
    } finally {
      setSavingSettings(false);
    }
  };

  const getGpioBadge = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('relay')) {
      return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
    }
    if (t.includes('serial') || t.includes('tuya')) {
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
    }
    if (t.includes('btn') || t.includes('switch')) {
      return 'bg-sky-500/15 text-sky-300 border-sky-500/40';
    }
    if (t.includes('led')) {
      return 'bg-amber-400/15 text-amber-300 border-amber-400/40';
    }
    if (t.includes('unused')) {
      return 'bg-zinc-800/60 text-zinc-500 border-zinc-700/50';
    }
    return 'bg-purple-500/15 text-purple-300 border-purple-500/40';
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800/60">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600/30 to-amber-400/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-md shadow-amber-500/10">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                {t('devicesManagementTitle')}
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-zinc-800/80 border border-zinc-700/70 text-zinc-400 font-mono">
                  {deviceList.length} {t('tabDevices')}
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {t('devicesManagementSubtitle')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setShowScanModal(true);
              if (discoveredDevices.length === 0) {
                handleStartScan();
              }
            }}
            className="min-h-[44px] flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-zinc-700/80 shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Radio className="w-4 h-4 text-amber-400" />
            <span>{t('scanNetworkBtn')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAddModal(true);
              setNewIp('');
              setNewName('');
              setTestPingState('idle');
              setTestPingMsg('');
            }}
            className="min-h-[44px] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>{t('addDeviceBtn')}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Sidebar (35%) + Detail Cockpit (65%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* SIDEBAR: Search, Filters & Device List */}
        <div className="lg:col-span-4 space-y-3.5">
          {/* Search & Filter Bar */}
          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3 shadow-md space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchDevicePlaceholder')}
                className="w-full bg-zinc-950/80 border border-zinc-800 focus:border-amber-500/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter Chips */}
            <div className="flex items-center gap-1.5 p-0.5 bg-zinc-950/60 rounded-xl border border-zinc-850 text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={cn(
                  'flex-1 py-1 px-2 rounded-lg font-medium text-[11px] transition-all text-center',
                  statusFilter === 'all'
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                {t('filterAll')} ({deviceList.length})
              </button>
              <button
                onClick={() => setStatusFilter('online')}
                className={cn(
                  'flex-1 py-1 px-2 rounded-lg font-medium text-[11px] transition-all flex items-center justify-center gap-1',
                  statusFilter === 'online'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-zinc-400 hover:text-emerald-400'
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {t('filterOnline')} ({onlineCount})
              </button>
              <button
                onClick={() => setStatusFilter('offline')}
                className={cn(
                  'flex-1 py-1 px-2 rounded-lg font-medium text-[11px] transition-all flex items-center justify-center gap-1',
                  statusFilter === 'offline'
                    ? 'bg-zinc-800 text-zinc-300 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                {t('filterOffline')} ({offlineCount})
              </button>
            </div>
          </div>

          {/* Device Cards List */}
          <div className="space-y-2">
            {filteredDevices.length === 0 ? (
              <div className="p-8 bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-800 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800/80 mx-auto flex items-center justify-center text-zinc-500">
                  <Radio className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-zinc-300">Không tìm thấy thiết bị nào</p>
                  <p className="text-[11px] text-zinc-500">
                    {searchQuery ? 'Thử tìm với từ khóa khác' : 'Bấm "Thêm Thiết Bị" để bắt đầu'}
                  </p>
                </div>
              </div>
            ) : (
              filteredDevices.map((dev) => {
                const st = deviceStates[dev.id];
                const isSelected = activeDevice && dev.id === activeDevice.id;

                return (
                  <div
                    key={dev.id}
                    role="button"
                    tabIndex={0}
                    aria-selected={isSelected}
                    onClick={() => setSelectedId(dev.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(dev.id);
                      }
                    }}
                    className={cn(
                      'group relative p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:outline-offset-2',
                      isSelected
                        ? 'bg-gradient-to-r from-zinc-900 to-zinc-900/90 border-amber-500/80 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30'
                        : 'bg-zinc-900/60 hover:bg-zinc-900 border-zinc-800/80 hover:border-zinc-700/80'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border transition-colors',
                            st?.online
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                              : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-500'
                          )}
                        >
                          <Cpu className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-xs text-zinc-100 truncate">
                              {dev.friendlyName}
                            </h4>
                            <span
                              className={cn(
                                'w-1.5 h-1.5 rounded-full shrink-0',
                                st?.online ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                              )}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-zinc-500 truncate block">
                            {dev.ipAddress}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(dev.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-all"
                          title="Xóa thiết bị"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight
                          className={cn(
                            'w-4 h-4 text-zinc-600 transition-transform',
                            isSelected && 'text-amber-400 translate-x-0.5'
                          )}
                        />
                      </div>
                    </div>

                    {/* Bottom Metadata bar */}
                    <div className="mt-2.5 pt-2 border-t border-zinc-850/80 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span className="flex items-center gap-1 text-zinc-400">
                        <Wifi className="w-3 h-3 text-zinc-500" />
                        {st?.wifi?.signal !== undefined ? `${st.wifi.signal}%` : 'N/A'}
                      </span>
                      {st?.latency !== undefined && (
                        <span className="px-1.5 py-0.2 rounded bg-zinc-950 border border-zinc-800 text-emerald-400">
                          {st.latency}ms
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* DETAIL COCKPIT: Header + Tabs */}
        <div className="lg:col-span-8 space-y-4">
          {activeDevice ? (
            <div className="bg-gradient-to-b from-zinc-900/95 via-zinc-900/90 to-zinc-950 border border-zinc-800/90 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5">
              {/* Cockpit Header with Quick Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="font-bold text-lg text-zinc-100 tracking-tight">
                      {activeDevice.friendlyName}
                    </h3>
                    {activeState?.online ? (
                      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {t('online')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                        {t('offline')}
                      </span>
                    )}
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-400">
                      {activeDevice.hardware || 'ESP8266'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono">
                    <span>IP: {activeDevice.ipAddress}</span>
                    {activeDevice.macAddress && (
                      <>
                        <span className="text-zinc-600">•</span>
                        <span>MAC: {activeDevice.macAddress}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Quick Action Button Group */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                    title="Status 0"
                  >
                    <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin text-amber-400')} />
                    <span>{t('syncNetwork')}</span>
                  </button>

                  <a
                    href={`http://${activeDevice.ipAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-all active:scale-95 shadow-sm"
                    title={t('openWebUi')}
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                    <span>Web UI</span>
                  </a>

                  <button
                    onClick={() => setConfirmRestartId(activeDevice.id)}
                    disabled={actionLoading === 'restart' || !activeState?.online}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-amber-500/20 text-zinc-200 hover:text-amber-300 text-xs font-semibold border border-zinc-700 hover:border-amber-500/40 transition-all active:scale-95 disabled:opacity-40 shadow-sm"
                    title={t('restartDeviceBtn')}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t('restartDeviceBtn')}</span>
                  </button>

                  <button
                    onClick={() => setConfirmDeleteId(activeDevice.id)}
                    className="p-2 rounded-xl bg-zinc-800/90 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 border border-zinc-700 hover:border-rose-500/40 transition-all active:scale-95"
                    title={t('deleteDeviceBtn')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-1 border-b border-zinc-800/80 pb-2 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('controls')}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0',
                    activeTab === 'controls'
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                  )}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{t('tabControls')}</span>
                </button>

                <button
                  onClick={() => setActiveTab('timers')}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0',
                    activeTab === 'timers'
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                  )}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>{t('tabTimers')}</span>
                </button>

                <button
                  onClick={() => setActiveTab('network')}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0',
                    activeTab === 'network'
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                  )}
                >
                  <Wifi className="w-3.5 h-3.5" />
                  <span>{t('tabNetwork')}</span>
                </button>

                <button
                  onClick={() => setActiveTab('gpio')}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0',
                    activeTab === 'gpio'
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                  )}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{t('tabGpio')}</span>
                </button>

                <button
                  onClick={() => setActiveTab('settings')}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0',
                    activeTab === 'settings'
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                  )}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{t('tabSettings')}</span>
                </button>
              </div>

              {/* TAB 1: CONTROLS & RELAYS */}
              {activeTab === 'controls' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Power className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('relayControl')}</span>
                    </h4>
                    <span className="text-[11px] text-zinc-500">1CH - 2CH</span>
                  </div>

                  {/* Relay Direct Switch Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Relay 1 */}
                    <div
                      className={cn(
                        'p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between space-y-3',
                        activeState?.power?.POWER1
                          ? 'bg-gradient-to-br from-amber-500/15 via-zinc-900 to-zinc-950 border-amber-500/50 shadow-lg shadow-amber-500/5'
                          : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700/80'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-xl flex items-center justify-center transition-colors border',
                              activeState?.power?.POWER1
                                ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-500/20'
                                : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                            )}
                          >
                            <Zap className="w-4 h-4 fill-current" />
                          </div>
                          <div>
                            <h5 className="font-bold text-xs text-zinc-100">
                              {activeDevice.relayLabels?.POWER1 || `${t('channelLabel')} 1`}
                            </h5>
                            <span className="text-[10px] font-mono text-zinc-500">{t('gpioPin')}: POWER1</span>
                          </div>
                        </div>

                        <span
                          className={cn(
                            'px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border',
                            activeState?.power?.POWER1
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                              : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                          )}
                        >
                          {activeState?.power?.POWER1 ? t('btnOn') : t('btnOff')}
                        </span>
                      </div>

                      <button
                        onClick={() => handleToggleRelay(1)}
                        disabled={!activeState?.online}
                        className={cn(
                          'w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer',
                          activeState?.power?.POWER1
                            ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-md shadow-amber-500/20'
                            : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-zinc-700'
                        )}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{activeState?.power?.POWER1 ? t('btnOff') : t('btnOn')}</span>
                      </button>
                    </div>

                    {/* Relay 2 (Chuông / Tải phụ) */}
                    <div
                      className={cn(
                        'p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between space-y-3',
                        activeState?.power?.POWER2
                          ? 'bg-gradient-to-br from-amber-500/15 via-zinc-900 to-zinc-950 border-amber-500/50 shadow-lg shadow-amber-500/5'
                          : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700/80'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-xl flex items-center justify-center transition-colors border',
                              activeState?.power?.POWER2
                                ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-500/20'
                                : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                            )}
                          >
                            <Zap className="w-4 h-4 fill-current" />
                          </div>
                          <div>
                            <h5 className="font-bold text-xs text-zinc-100">
                              {activeDevice.relayLabels?.POWER2 || `${t('channelLabel')} 2`}
                            </h5>
                            <span className="text-[10px] font-mono text-zinc-500">{t('gpioPin')}: POWER2</span>
                          </div>
                        </div>

                        <span
                          className={cn(
                            'px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border',
                            activeState?.power?.POWER2
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                              : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                          )}
                        >
                          {activeState?.power?.POWER2 ? t('btnOn') : t('btnOff')}
                        </span>
                      </div>

                      <button
                        onClick={() => handleToggleRelay(2)}
                        disabled={!activeState?.online}
                        className={cn(
                          'w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer',
                          activeState?.power?.POWER2
                            ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-md shadow-amber-500/20'
                            : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-zinc-700'
                        )}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{activeState?.power?.POWER2 ? t('btnOff') : t('btnOn')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Energy Telemetry Grid (if sensor attached) */}
                  {activeState?.energy && (
                    <div className="space-y-2.5 pt-3 border-t border-zinc-800/80">
                      <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t('energyTelemetryTitle')}</span>
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="bg-zinc-950/70 p-3 rounded-xl border border-zinc-850">
                          <span className="text-[10px] text-zinc-500 uppercase font-semibold">{t('voltage')}</span>
                          <div className="mt-1 font-mono text-amber-400 font-bold text-sm">
                            {activeState.energy.voltage} V
                          </div>
                        </div>
                        <div className="bg-zinc-950/70 p-3 rounded-xl border border-zinc-850">
                          <span className="text-[10px] text-zinc-500 uppercase font-semibold">{t('current')}</span>
                          <div className="mt-1 font-mono text-amber-400 font-bold text-sm">
                            {activeState.energy.current} A
                          </div>
                        </div>
                        <div className="bg-zinc-950/70 p-3 rounded-xl border border-zinc-850">
                          <span className="text-[10px] text-zinc-500 uppercase font-semibold">{t('activePower')}</span>
                          <div className="mt-1 font-mono text-emerald-400 font-bold text-sm">
                            {activeState.energy.power} W
                          </div>
                        </div>
                        <div className="bg-zinc-950/70 p-3 rounded-xl border border-zinc-850">
                          <span className="text-[10px] text-zinc-500 uppercase font-semibold">{t('today')}</span>
                          <div className="mt-1 font-mono text-zinc-200 font-bold text-sm">
                            {activeState.energy.today} kWh
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: TIMERS & SCHEDULE */}
              {activeTab === 'timers' && (
                <DeviceTimerTab device={activeDevice} state={activeState} />
              )}

              {/* TAB 2: NETWORK & TELEMETRY */}
              {activeTab === 'network' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {/* Wi-Fi Signal Meter */}
                    <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80 space-y-1">
                      <span className="text-[10px] uppercase text-zinc-500 font-semibold flex items-center gap-1.5">
                        <Wifi className="w-3.5 h-3.5 text-amber-400" /> {t('wifiSignalMeter')}
                      </span>
                      <div className="mt-1 font-mono text-zinc-100 font-bold text-base flex items-baseline gap-1">
                        {activeState?.wifi?.signal !== undefined ? `${activeState.wifi.signal}%` : 'N/A'}
                        {activeState?.wifi?.rssi !== undefined && (
                          <span className="text-[10px] text-zinc-500 font-normal">
                            ({activeState.wifi.rssi} dBm)
                          </span>
                        )}
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden mt-1.5">
                        <div
                          className="bg-amber-400 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, activeState?.wifi?.signal || 0))}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-500 truncate block mt-1">
                        SSID: {activeState?.wifi?.ssid || 'Default'}
                      </span>
                    </div>

                    {/* Standardized Uptime */}
                    <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80 space-y-1">
                      <span className="text-[10px] uppercase text-zinc-500 font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" /> {t('uptime')}
                      </span>
                      <div className="mt-1 font-mono text-zinc-100 font-bold text-sm truncate">
                        {formatUptime(activeState?.uptime)}
                      </div>
                      <span className="text-[10px] text-zinc-500 block">{t('uptimeLabel')}</span>
                    </div>

                    {/* Hardware Info */}
                    <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80 space-y-1">
                      <span className="text-[10px] uppercase text-zinc-500 font-semibold flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-amber-400" /> {t('hardwareArch')}
                      </span>
                      <div className="mt-1 font-mono text-zinc-100 font-bold text-sm truncate">
                        {activeDevice.hardware || 'ESP8266'}
                      </div>
                      <span className="text-[10px] text-zinc-500 block">SoC Architecture</span>
                    </div>

                    {/* Network Latency */}
                    <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80 space-y-1">
                      <span className="text-[10px] uppercase text-zinc-500 font-semibold flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> {t('connectionStatus')}
                      </span>
                      <div className="mt-1 font-mono text-zinc-100 font-bold text-sm">
                        {activeState?.latency ? `${activeState.latency} ms` : 'LAN Direct'}
                      </div>
                      <span className="text-[10px] text-emerald-400 block">{t('reverseProxyActive')}</span>
                    </div>
                  </div>

                  {/* Wi-Fi Details list */}
                  {activeState?.wifi && (
                    <div className="bg-zinc-950/70 p-4 rounded-xl border border-zinc-800/80 space-y-2 text-xs">
                      <div className="font-bold text-zinc-300 text-xs">{t('wifiDetailsTitle')}</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] text-zinc-400">
                        <div>
                          <span className="text-zinc-500">SSID:</span> {activeState.wifi.ssid}
                        </div>
                        {activeState.wifi.channel && (
                          <div>
                            <span className="text-zinc-500">{t('wifiChannel')}:</span>{' '}
                            {activeState.wifi.channel}
                          </div>
                        )}
                        {activeState.wifi.bssid && (
                          <div>
                            <span className="text-zinc-500">BSSID:</span> {activeState.wifi.bssid}
                          </div>
                        )}
                        {activeState.wifi.linkCount !== undefined && (
                          <div>
                            <span className="text-zinc-500">{t('wifiReconnectCount')}:</span>{' '}
                            {activeState.wifi.linkCount}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: GPIO MAPPING */}
              {activeTab === 'gpio' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-zinc-300 font-bold flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('gpioMappingTitle')}</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">{t('gpioQueryHint')}</span>
                  </div>

                  {activeState?.gpioConfig && activeState.gpioConfig.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {activeState.gpioConfig.map((item) => (
                        <div
                          key={item.gpioPin}
                          className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800/80 text-xs flex flex-col justify-between space-y-1.5 hover:border-zinc-700 transition-colors"
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-mono text-zinc-400 font-bold">GPIO {item.gpioPin}</span>
                            <span
                              className={cn(
                                'px-1.5 py-0.2 rounded uppercase font-bold text-[9px] border',
                                getGpioBadge(item.entityType)
                              )}
                            >
                              {item.entityType}
                            </span>
                          </div>
                          <div className="font-bold text-zinc-200 truncate">{item.gpioName}</div>
                          <div className="text-[10px] font-mono text-zinc-500">Key: {item.entityKey}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 bg-zinc-950/60 rounded-xl border border-dashed border-zinc-800 text-center space-y-3">
                      <p className="text-xs text-zinc-400">{t('gpioNotLoaded')}</p>
                      <button
                        onClick={handleSync}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700 font-semibold"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t('syncNowBtn')}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: SETTINGS & LABELS */}
              {activeTab === 'settings' && (
                <form onSubmit={handleSaveSettings} className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('settingsDeviceTitle')}</span>
                    </h4>
                    <p className="text-[11px] text-zinc-500">
                      {t('settingsDeviceDesc')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center justify-between">
                        <span>{t('deviceNameLabel')}</span>
                        <span className="text-[10px] text-zinc-500 font-normal">{t('deviceNameCmdHint')}</span>
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Vd: Công Tắc Ban Công..."
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none font-medium transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center justify-between">
                        <span>{t('relay1Label')}</span>
                        <span className="text-[10px] text-zinc-500 font-normal">FriendlyName1</span>
                      </label>
                      <input
                        type="text"
                        value={editRelay1}
                        onChange={(e) => setEditRelay1(e.target.value)}
                        placeholder="Vd: Đèn trần, Máy bơm..."
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none font-medium transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center justify-between">
                        <span>{t('relay2Label')}</span>
                        <span className="text-[10px] text-zinc-500 font-normal">FriendlyName2</span>
                      </label>
                      <input
                        type="text"
                        value={editRelay2}
                        onChange={(e) => setEditRelay2(e.target.value)}
                        placeholder="Vd: Chuông cửa..."
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none font-medium transition-colors"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-850 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      {savingSettings ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      )}
                      <span>{t('saveConfigBtn')}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-zinc-500 text-xs bg-zinc-950/40 border border-dashed border-zinc-800 rounded-2xl space-y-2">
              <Cpu className="w-8 h-8 mx-auto text-zinc-600" />
              <p>{t('selectDevicePromptDetailed')}</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Thêm Thiết Bị Mới */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleAddSubmit}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-zinc-100">{t('addDeviceModalTitle')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1"
                aria-label={t('close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  {t('deviceIpLabel')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newIp}
                    onChange={(e) => {
                      setNewIp(e.target.value);
                      setTestPingState('idle');
                    }}
                    placeholder="192.168.1.140"
                    className="flex-1 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handleTestPing}
                    disabled={!newIp.trim() || testPingState === 'testing'}
                    className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-all disabled:opacity-40"
                  >
                    {testPingState === 'testing' ? t('testingIpBtn') : t('testIpBtn')}
                  </button>
                </div>

                {/* Ping Feedback Badge */}
                {testPingState !== 'idle' && (
                  <div
                    className={cn(
                      'mt-2 text-[11px] p-2 rounded-xl flex items-center gap-1.5 font-medium',
                      testPingState === 'success'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : testPingState === 'failed'
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        : 'bg-zinc-800 text-zinc-400'
                    )}
                  >
                    {testPingState === 'success' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : testPingState === 'failed' ? (
                      <AlertCircle className="w-3.5 h-3.5" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    )}
                    <span>{testPingMsg}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  {t('friendlyNameLabel')}
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Relay Phòng Khách..."
                  className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={!newIp.trim()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-40"
              >
                {t('addDeviceBtn')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Xác nhận Xóa Thiết Bị (Thay thế native confirm) */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-rose-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <h4 className="font-bold text-sm text-zinc-100">{t('confirmDeleteTitle')}?</h4>
              <p className="text-xs text-zinc-400">
                {t('confirmDeleteQuestion')}{' '}
                <span className="font-bold text-zinc-200">
                  "{devices[confirmDeleteId]?.friendlyName}"
                </span>{' '}
                {t('fromManagerList')}
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 transition-all active:scale-95"
              >
                {t('deletePermanentlyBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Xác nhận Khởi Động Lại (Restart 1) */}
      {confirmRestartId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <RotateCcw className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <h4 className="font-bold text-sm text-zinc-100">{t('confirmRestartQuestion')}</h4>
              <p className="text-xs text-zinc-400">
                {t('confirmRestartWarning')}
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRestartId(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleRestart}
                disabled={actionLoading === 'restart'}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center gap-1.5"
              >
                {actionLoading === 'restart' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('restartDeviceBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Quét Mạng LAN (P3 Auto-Discovery) */}
      {showScanModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-100">{t('scanLanModalTitle')}</h3>
                  <p className="text-[11px] text-zinc-500">{t('scanLanModalDesc')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScanModal(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500 hover:text-zinc-200 rounded-xl"
                aria-label={t('close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Subnet Input & Scan Controls */}
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  {t('scanSubnetLabel')}
                </label>
                <input
                  type="text"
                  value={scanSubnet}
                  onChange={(e) => setScanSubnet(e.target.value)}
                  placeholder="192.168.1"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none"
                />
              </div>
              <div className="self-end">
                <button
                  type="button"
                  onClick={() => handleStartScan()}
                  disabled={scanLoading}
                  className="min-h-[40px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', scanLoading && 'animate-spin')} />
                  <span>{scanLoading ? t('scanningBtn') : t('scanNowBtn')}</span>
                </button>
              </div>
            </div>

            {/* Scan Progress / Status banner */}
            {scanLoading ? (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3 text-amber-300 text-xs">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400 flex-none" />
                <span>{t('scanningNotice')}</span>
              </div>
            ) : (
              <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>{t('scanResultCount')} <strong className="text-zinc-200">{discoveredDevices.length}</strong> {t('devicesUnit')}</span>
                {scanSubnet && <span className="font-mono text-zinc-500">{scanSubnet}.0/24</span>}
              </div>
            )}

            {/* Discovered Device List */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-[160px] max-h-[340px] pr-1">
              {discoveredDevices.length === 0 && !scanLoading ? (
                <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl space-y-1">
                  <Radio className="w-6 h-6 mx-auto text-zinc-600 mb-2" />
                  <p>{t('noDevicesDiscovered')}</p>
                  <p className="text-[10px] text-zinc-600">{t('clickScanPrompt')}</p>
                </div>
              ) : (
                discoveredDevices.map((dev) => (
                  <div
                    key={dev.ipAddress}
                    className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-zinc-100 truncate">{dev.friendlyName}</span>
                        <span className="font-mono text-[11px] text-amber-400 font-semibold">{dev.ipAddress}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400">
                        {dev.module && <span className="truncate">{dev.module}</span>}
                        {dev.hardware && <span className="px-1.5 py-0.5 rounded bg-zinc-850 font-mono">{dev.hardware}</span>}
                        {dev.macAddress && <span className="font-mono text-zinc-500">{dev.macAddress}</span>}
                      </div>
                    </div>

                    <div className="flex items-center">
                      {dev.alreadyAdded ? (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-zinc-800 text-zinc-400">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          {t('alreadyAdded')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddDiscovered(dev)}
                          className="min-h-[44px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>{t('addDeviceBtn')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowScanModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                {t('closeModal')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
