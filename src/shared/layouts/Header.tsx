import React from 'react';
import { Cpu, RefreshCw, Shield, LayoutDashboard, Radio } from 'lucide-react';
import { useDeviceStore } from '@/features/devices/store/device-store';
import { pollScheduler } from '@/core/http/poll-scheduler';

interface HeaderProps {
  currentTab: 'dashboard' | 'devices' | 'auth';
  onSelectTab: (tab: 'dashboard' | 'devices' | 'auth') => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onSelectTab, onLogout }) => {
  const devices = useDeviceStore((s) => s.devices);
  const deviceStates = useDeviceStore((s) => s.deviceStates);
  const [refreshing, setRefreshing] = React.useState(false);

  const deviceList = Object.values(devices);
  const onlineCount = deviceList.filter((d) => deviceStates[d.id]?.online).length;

  const handleRefresh = async () => {
    setRefreshing(true);
    await pollScheduler.pollNow();
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur border-b border-zinc-800/80 px-4 h-14 flex items-center justify-between">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <Radio className="w-4 h-4" />
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-wide text-zinc-100">
            TasHOME
          </h1>
        </div>
      </div>

      {/* Nav Tabs */}
      <nav className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800 text-xs">
        <button
          onClick={() => onSelectTab('dashboard')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
            currentTab === 'dashboard'
              ? 'bg-amber-500 text-zinc-950 font-bold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => onSelectTab('devices')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
            currentTab === 'devices'
              ? 'bg-amber-500 text-zinc-950 font-bold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Thiết bị</span>
        </button>

        <button
          onClick={() => onSelectTab('auth')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
            currentTab === 'auth'
              ? 'bg-amber-500 text-zinc-950 font-bold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Bảo mật 2FA</span>
        </button>
      </nav>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
          title="Làm mới trạng thái"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
        </button>

        <button
          onClick={onLogout}
          className="px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-rose-400 bg-zinc-900 hover:bg-rose-950/30 border border-zinc-800 hover:border-rose-900/50 rounded-lg transition-colors"
        >
          Khóa
        </button>
      </div>
    </header>
  );
};
