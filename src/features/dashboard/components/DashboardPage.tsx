import React, { useState, useRef } from 'react';
import { useDashboardStore } from '../store/dashboard-store';
import { useDeviceStore } from '@/features/devices/store/device-store';
import { getWidgetDefinition } from '@/features/widgets/registry/widget-registry';
import { tasmotaHttp } from '@/core/http/tasmota-http-client';
import { pollScheduler } from '@/core/http/poll-scheduler';
import { QuickActionBar } from './QuickActionBar';
import { Plus, RotateCcw, X, LayoutGrid, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useToast } from '@/shared/components/Toast';
import { useTranslation } from '@/core/i18n';

export const DashboardPage: React.FC = () => {
  const {
    dashboards,
    activeDashboardId,
    addWidget,
    removeWidget,
    updateWidgetSize,
    reorderWidgets,
    resetDefaultLayout
  } = useDashboardStore();
  const { devices, deviceStates } = useDeviceStore();
  const { addToast } = useToast();
  const { t } = useTranslation();

  const activeDash = dashboards.find((d) => d.id === activeDashboardId) || dashboards[0];
  const [showAddModal, setShowAddModal] = useState(false);
  const [targetDeviceId, setTargetDeviceId] = useState<string>('');

  // Drag to resize state (invisible edge hit areas)
  const gridRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<{
    instanceId: string;
    mode: 'width' | 'height' | 'both';
    currentColSpan: 1 | 2 | 3;
    currentRowSpan: 1 | 2 | 3;
  } | null>(null);

  // Drag to reorder & delete state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [draggingInstanceId, setDraggingInstanceId] = useState<string | null>(null);
  const [isOverTrash, setIsOverTrash] = useState(false);

  const startResizing = (
    e: React.PointerEvent,
    instanceId: string,
    mode: 'width' | 'height' | 'both',
    initialColSpan: 1 | 2 | 3,
    initialRowSpan: 1 | 2 | 3
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const gridEl = gridRef.current;
    const gridWidth = gridEl ? gridEl.clientWidth : 1200;
    const colWidth = gridWidth / 3;
    const rowHeight = 280;

    let latestColSpan = initialColSpan;
    let latestRowSpan = initialRowSpan;
    setResizing({
      instanceId,
      mode,
      currentColSpan: initialColSpan,
      currentRowSpan: initialRowSpan
    });

    const handlePointerMove = (moveEv: PointerEvent) => {
      let nextCol = latestColSpan;
      let nextRow = latestRowSpan;

      if (mode === 'width' || mode === 'both') {
        const deltaX = moveEv.clientX - startX;
        let spanDelta = 0;
        if (deltaX > colWidth * 0.35) {
          spanDelta = deltaX > colWidth * 1.35 ? 2 : 1;
        } else if (deltaX < -colWidth * 0.35) {
          spanDelta = deltaX < -colWidth * 1.35 ? -2 : -1;
        }
        nextCol = Math.max(1, Math.min(3, initialColSpan + spanDelta)) as 1 | 2 | 3;
      }

      if (mode === 'height' || mode === 'both') {
        const deltaY = moveEv.clientY - startY;
        let rowDelta = 0;
        if (deltaY > rowHeight * 0.35) {
          rowDelta = deltaY > rowHeight * 1.35 ? 2 : 1;
        } else if (deltaY < -rowHeight * 0.35) {
          rowDelta = deltaY < -rowHeight * 1.35 ? -2 : -1;
        }
        nextRow = Math.max(1, Math.min(3, initialRowSpan + rowDelta)) as 1 | 2 | 3;
      }

      if (nextCol !== latestColSpan || nextRow !== latestRowSpan) {
        latestColSpan = nextCol;
        latestRowSpan = nextRow;
        setResizing({
          instanceId,
          mode,
          currentColSpan: nextCol,
          currentRowSpan: nextRow
        });
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      updateWidgetSize(instanceId, latestColSpan, latestRowSpan);
      setResizing(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleCommand = async (deviceId: string, command: string) => {
    const dev = devices[deviceId];
    if (!dev?.ipAddress) throw new Error('Không tìm thấy thiết bị');

    const res = await tasmotaHttp.sendCommand(dev.ipAddress, command);
    setTimeout(() => pollScheduler.pollNow(deviceId), 200);
    return res.data;
  };

  const getColSpanClass = (span?: 1 | 2 | 3) => {
    switch (span) {
      case 3:
        return 'md:col-span-2 lg:col-span-3';
      case 2:
        return 'md:col-span-2 lg:col-span-2';
      default:
        return 'col-span-1';
    }
  };

  const getRowSpanClass = (span?: 1 | 2 | 3) => {
    switch (span) {
      case 3:
        return 'md:row-span-3';
      case 2:
        return 'md:row-span-2';
      default:
        return 'md:row-span-1';
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold tracking-tight text-zinc-100">
              {activeDash?.name === 'Bảng Điều Khiển' || activeDash?.name === 'Bảng Điều Khiển Chính' || !activeDash?.name ? t('dashboardTitle') : activeDash.name}
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">{t('dashboardSubtitle')}</p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowAddModal(true)}
            className="min-h-[40px] flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('addWidget')}</span>
          </button>

          <button
            onClick={resetDefaultLayout}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center p-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 text-xs transition-colors active:scale-95 cursor-pointer"
            title={t('resetLayout')}
            aria-label={t('resetLayout')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Action Ribbon */}
      <QuickActionBar />

      {/* Grid of Widgets */}
      {!activeDash || activeDash.widgets.length === 0 ? (
        <div className="py-16 px-6 border border-dashed border-zinc-800/90 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 bg-zinc-950/40">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="text-zinc-200 text-sm font-bold">{t('emptyDashboardTitle')}</p>
            <p className="text-zinc-500 text-xs max-w-md">{t('emptyDashboardDesc')}</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('addWidgetNow')}</span>
          </button>
        </div>
      ) : (
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-auto md:auto-rows-[280px] grid-flow-dense">
          {activeDash.widgets.map((widgetInst, idx) => {
            const def = getWidgetDefinition(widgetInst.config.widgetType);
            if (!def) return null;

            const Component = def.component;
            const assignedDevices = widgetInst.config.deviceIds
              .map((id) => devices[id])
              .filter(Boolean);
            const devList = Object.values(devices);
            const effectiveDevices = assignedDevices.length > 0 ? assignedDevices : devList.slice(0, 1);

            const isThisResizing = resizing?.instanceId === widgetInst.instanceId;
            const activeColSpan = isThisResizing ? resizing.currentColSpan : (widgetInst.colSpan || 1);
            const activeRowSpan = isThisResizing ? resizing.currentRowSpan : (widgetInst.rowSpan || 1);
            const isDragged = dragIndex === idx;
            const isDropTarget = dropIndex === idx && dragIndex !== idx;

            return (
              <div
                key={widgetInst.instanceId}
                draggable={!isThisResizing}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', widgetInst.instanceId);
                  e.dataTransfer.effectAllowed = 'move';
                  setDragIndex(idx);
                  setDraggingInstanceId(widgetInst.instanceId);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropIndex(null);
                  setDraggingInstanceId(null);
                  setIsOverTrash(false);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dropIndex !== idx) setDropIndex(idx);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== idx) {
                    reorderWidgets(dragIndex, idx);
                    addToast(t('toastWidgetReordered'), 'info');
                  }
                  setDragIndex(null);
                  setDropIndex(null);
                  setDraggingInstanceId(null);
                }}
                className={cn(
                  'relative group transition-all duration-200 select-none rounded-2xl h-full flex flex-col cursor-grab active:cursor-grabbing',
                  getColSpanClass(activeColSpan),
                  getRowSpanClass(activeRowSpan),
                  isThisResizing && 'ring-1 ring-amber-400/50',
                  isDragged && 'opacity-60 blur-[1.5px] scale-[0.98] ring-2 ring-amber-500/50 shadow-2xl z-20',
                  isDropTarget && 'ring-2 ring-emerald-400/80 ring-offset-2 ring-offset-zinc-950'
                )}
              >
                {/* Invisible right edge resize handle (width) */}
                <div
                  onPointerDown={(e) =>
                    startResizing(e, widgetInst.instanceId, 'width', activeColSpan as 1 | 2 | 3, activeRowSpan as 1 | 2 | 3)
                  }
                  className="absolute right-0 top-0 bottom-4 w-3.5 cursor-ew-resize z-20 touch-none"
                />

                {/* Invisible bottom edge resize handle (height) */}
                <div
                  onPointerDown={(e) =>
                    startResizing(e, widgetInst.instanceId, 'height', activeColSpan as 1 | 2 | 3, activeRowSpan as 1 | 2 | 3)
                  }
                  className="absolute bottom-0 left-0 right-4 h-3.5 cursor-ns-resize z-20 touch-none"
                />

                {/* Invisible bottom-right corner resize handle (both) */}
                <div
                  onPointerDown={(e) =>
                    startResizing(e, widgetInst.instanceId, 'both', activeColSpan as 1 | 2 | 3, activeRowSpan as 1 | 2 | 3)
                  }
                  className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-20 touch-none"
                />

                <Component
                  instanceId={widgetInst.instanceId}
                  config={widgetInst.config}
                  devices={effectiveDevices}
                  deviceStates={deviceStates}
                  onCommand={handleCommand}
                  colSpan={activeColSpan as 1 | 2 | 3}
                  rowSpan={activeRowSpan as 1 | 2 | 3}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Trash Bin at bottom of screen when dragging (Icon only) */}
      {draggingInstanceId && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!isOverTrash) setIsOverTrash(true);
          }}
          onDragLeave={(e) => {
            const related = e.relatedTarget as Node | null;
            if (!e.currentTarget.contains(related)) {
              setIsOverTrash(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (draggingInstanceId) {
              removeWidget(draggingInstanceId);
              addToast(t('toastWidgetRemoved'), 'info');
            }
            setDraggingInstanceId(null);
            setIsOverTrash(false);
            setDragIndex(null);
            setDropIndex(null);
          }}
          className={cn(
            'fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center w-16 h-16 rounded-full border transition-all duration-300 shadow-2xl select-none backdrop-blur-xl animate-in fade-in zoom-in-75 duration-200',
            isOverTrash
              ? 'bg-rose-600 text-white border-rose-400 scale-125 shadow-[0_0_50px_rgba(244,63,94,0.7)] animate-bounce ring-4 ring-rose-400/40'
              : 'bg-zinc-900/90 text-zinc-400 border-zinc-700/80 hover:border-rose-500/50 hover:text-rose-400 scale-100 shadow-[0_10px_30px_rgba(0,0,0,0.8)]'
          )}
          title={t('dropToTrash')}
        >
          <Trash2
            className={cn(
              'w-7 h-7 transition-all duration-300',
              isOverTrash ? 'scale-110 rotate-[-12deg] text-white stroke-[2.2]' : 'text-zinc-400'
            )}
          />
        </div>
      )}

      {/* Add Widget Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-zinc-100">{t('addWidgetModalTitle')}</h3>
                <p className="text-xs text-zinc-400 mt-0.5">{t('addWidgetModalDesc')}</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                aria-label={t('closeAddModal')}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Device Selector */}
              {Object.keys(devices).length > 0 ? (
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    {t('selectDeviceForWidget')}
                  </label>
                  <select
                    value={targetDeviceId || Object.keys(devices)[0] || ''}
                    onChange={(e) => setTargetDeviceId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
                  >
                    {Object.values(devices).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.friendlyName} ({d.ipAddress})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-xs">
                  {t('noDevicesInList')}
                </div>
              )}

              <div className="space-y-2.5">
                {[
                  { type: 'relay-toggle', name: t('widgetRelayTitle'), desc: t('widgetRelayDesc'), defSpan: 1 },
                  { type: 'energy-monitor', name: t('widgetEnergyTitle'), desc: t('widgetEnergyDesc'), defSpan: 2 },
                  { type: 'device-info', name: t('widgetDeviceInfoTitle'), desc: t('widgetDeviceInfoDesc'), defSpan: 2 },
                  { type: 'sensor-display', name: t('widgetSensorTitle'), desc: t('widgetSensorDesc'), defSpan: 1 }
                ].map((item) => (
                  <button
                    key={item.type}
                    disabled={Object.keys(devices).length === 0}
                    onClick={() => {
                      const devId = targetDeviceId || Object.keys(devices)[0];
                      if (!devId) {
                        addToast(t('toastNeedDeviceFirst'), 'error');
                        return;
                      }
                      addWidget(item.type, [devId], item.name, item.defSpan as 1 | 2 | 3, 1);
                      setShowAddModal(false);
                      addToast(`${t('toastWidgetAdded')}: ${item.name}`, 'success');
                    }}
                    className="w-full text-left p-3.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800 hover:border-amber-500/40 transition-all flex flex-col group disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-xs text-zinc-200 group-hover:text-amber-400 transition-colors">
                      {item.name}
                    </span>
                    <span className="text-[11px] text-zinc-400 mt-0.5">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
