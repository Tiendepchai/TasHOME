import React, { useState, useEffect, useCallback } from 'react';
import { useDeviceStore } from '@/features/devices/store/device-store';
import { pollScheduler } from '@/core/http/poll-scheduler';
import { useToast } from '@/shared/components/Toast';
import {
  Bell,
  Check,
  Coffee,
  Moon,
  Plus,
  Power,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  X,
  ZapOff
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export interface SceneAction {
  type: 'broadcast' | 'device';
  command: string;
  deviceId?: string;
  ipAddress?: string;
}

export interface Scene {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  actions: SceneAction[];
}

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Power,
  ZapOff,
  Bell,
  Sparkles,
  Sun,
  Moon,
  Coffee,
  Shield
};

export const QuickActionBar: React.FC = () => {
  const { devices, deviceStates } = useDeviceStore();
  const { addToast } = useToast();
  const deviceList = Object.values(devices);
  const onlineDevices = deviceList.filter((d) => deviceStates[d.id]?.online);

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [executingSceneId, setExecutingSceneId] = useState<string | null>(null);

  // Scene management modal state
  const [showSceneModal, setShowSceneModal] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [newSceneDesc, setNewSceneDesc] = useState('');
  const [newSceneIcon, setNewSceneIcon] = useState('Sparkles');
  const [newSceneCommand, setNewSceneCommand] = useState('POWER1 TOGGLE');
  const [savingScene, setSavingScene] = useState(false);

  // Count active relays across all online devices
  const activeRelayCount = onlineDevices.filter((d) => deviceStates[d.id]?.power?.POWER1).length;

  const fetchScenes = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/scenes', { signal });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setScenes(data);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchScenes(controller.signal);
    return () => controller.abort();
  }, [fetchScenes]);

  const handleExecuteScene = async (scene: Scene) => {
    if (executingSceneId || onlineDevices.length === 0) return;
    setExecutingSceneId(scene.id);

    try {
      const res = await fetch(`/api/scenes/${encodeURIComponent(scene.id)}/execute`, {
        method: 'POST'
      });
      if (res.ok) {
        setTimeout(() => pollScheduler.pollNow(), 300);
        addToast(`Đã kích hoạt ngữ cảnh "${scene.name}"`, 'success');
      } else {
        addToast(`Không thể thực thi ngữ cảnh "${scene.name}"`, 'error');
      }
    } catch {
      addToast('Lỗi kết nối khi gửi lệnh ngữ cảnh', 'error');
    } finally {
      setTimeout(() => setExecutingSceneId(null), 600);
    }
  };

  const handleQuickSync = async () => {
    if (loadingAction) return;
    setLoadingAction('sync');
    try {
      await pollScheduler.pollNow();
      addToast('Đã đồng bộ trạng thái toàn mạng', 'info');
    } finally {
      setTimeout(() => setLoadingAction(null), 500);
    }
  };

  const handleCreateScene = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSceneName.trim() || savingScene) return;
    setSavingScene(true);

    try {
      const res = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSceneName.trim(),
          description: newSceneDesc.trim(),
          icon: newSceneIcon,
          actions: [{ type: 'broadcast', command: newSceneCommand.trim() }]
        })
      });

      if (res.ok) {
        addToast(`Đã tạo ngữ cảnh "${newSceneName.trim()}"`, 'success');
        setNewSceneName('');
        setNewSceneDesc('');
        setNewSceneCommand('POWER1 TOGGLE');
        await fetchScenes();
      } else {
        addToast('Lỗi khi lưu ngữ cảnh', 'error');
      }
    } catch {
      addToast('Không thể kết nối máy chủ để lưu ngữ cảnh', 'error');
    } finally {
      setSavingScene(false);
    }
  };

  const handleDeleteScene = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/scenes/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setScenes((prev) => prev.filter((s) => s.id !== id));
        addToast(`Đã xóa ngữ cảnh "${name}"`, 'info');
      } else {
        addToast('Không thể xóa ngữ cảnh', 'error');
      }
    } catch {
      addToast('Lỗi khi xóa ngữ cảnh', 'error');
    }
  };

  if (deviceList.length === 0) return null;

  return (
    <>
      <div className="bg-gradient-to-r from-zinc-900/95 via-zinc-900/80 to-zinc-900/95 border border-zinc-800/80 rounded-2xl p-4 shadow-lg backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        {/* Overview Status Chips */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-400">Trực tuyến:</span>
            <span className="font-bold text-zinc-100 font-mono">
              {onlineDevices.length}/{deviceList.length}
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs">
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                activeRelayCount > 0 ? 'bg-amber-400' : 'bg-zinc-600'
              )}
            />
            <span className="text-zinc-400">Đang bật:</span>
            <span className="font-bold text-amber-400 font-mono">
              {activeRelayCount} tải
            </span>
          </div>
        </div>

        {/* Scenes & Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {scenes.map((scene) => {
            const Icon = ICON_MAP[scene.icon || 'Sparkles'] || Sparkles;
            const isRunning = executingSceneId === scene.id;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => handleExecuteScene(scene)}
                disabled={onlineDevices.length === 0 || !!executingSceneId}
                className={cn(
                  'min-h-[44px] flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-40 cursor-pointer border',
                  scene.id === 'scene-all-on'
                    ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30 hover:border-amber-500/50'
                    : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 border-zinc-700/80'
                )}
                title={scene.description || scene.name}
              >
                <Icon className={cn('w-4 h-4', isRunning && 'animate-spin text-amber-400')} />
                <span>{scene.name}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowSceneModal(true)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/80 text-xs transition-colors cursor-pointer"
            title="Quản lý Ngữ Cảnh & Presets"
            aria-label="Quản lý Ngữ Cảnh & Presets"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleQuickSync}
            disabled={!!loadingAction}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/80 text-xs transition-colors active:scale-95 cursor-pointer"
            title="Đồng bộ toàn mạng"
            aria-label="Đồng bộ toàn mạng"
          >
            <RefreshCw
              className={cn('w-4 h-4', loadingAction === 'sync' && 'animate-spin text-amber-400')}
            />
          </button>
        </div>
      </div>

      {/* MODAL: Quản lý Ngữ Cảnh & Presets */}
      {showSceneModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-100">Quản lý Ngữ Cảnh & Presets</h3>
                  <p className="text-[11px] text-zinc-500">Tạo lệnh kịch bản 1-chạm gửi tới toàn bộ thiết bị</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSceneModal(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500 hover:text-zinc-200 rounded-xl"
                aria-label="Đóng cửa sổ"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Existing Scenes List */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Ngữ cảnh hiện tại ({scenes.length})
              </span>
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {scenes.map((sc) => {
                  const Icon = ICON_MAP[sc.icon || 'Sparkles'] || Sparkles;
                  return (
                    <div
                      key={sc.id}
                      className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-zinc-850 flex items-center justify-center text-amber-400 flex-none">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs text-zinc-100 truncate">{sc.name}</h4>
                          <span className="text-[10px] text-zinc-500 font-mono block truncate">
                            {sc.actions?.[0]?.command || '—'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteScene(sc.id, sc.name)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="Xóa ngữ cảnh"
                        aria-label={`Xóa ngữ cảnh ${sc.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Create Scene Form */}
            <form onSubmit={handleCreateScene} className="space-y-3 pt-3 border-t border-zinc-800">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Thêm Ngữ Cảnh Mới
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Tên ngữ cảnh *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSceneName}
                    onChange={(e) => setNewSceneName(e.target.value)}
                    placeholder="Vd: Chế độ ban đêm"
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Biểu tượng
                  </label>
                  <select
                    value={newSceneIcon}
                    onChange={(e) => setNewSceneIcon(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none"
                  >
                    <option value="Sparkles">Sparkles (Mặc định)</option>
                    <option value="Power">Power (Nguồn)</option>
                    <option value="ZapOff">ZapOff (Tắt nguồn)</option>
                    <option value="Bell">Bell (Chuông)</option>
                    <option value="Sun">Sun (Ban ngày)</option>
                    <option value="Moon">Moon (Ban đêm)</option>
                    <option value="Coffee">Coffee (Thư giãn)</option>
                    <option value="Shield">Shield (Bảo vệ)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Lệnh Tasmota gửi tới thiết bị *
                </label>
                <input
                  type="text"
                  required
                  value={newSceneCommand}
                  onChange={(e) => setNewSceneCommand(e.target.value)}
                  placeholder="Backlog POWER1 OFF; POWER2 OFF"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  Ví dụ: <code className="text-amber-400">POWER1 ON</code>, <code className="text-amber-400">Backlog POWER1 OFF; Delay 5; POWER2 OFF</code>
                </span>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={!newSceneName.trim() || savingScene}
                  className="min-h-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {savingScene ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  )}
                  <span>Thêm Ngữ Cảnh</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
