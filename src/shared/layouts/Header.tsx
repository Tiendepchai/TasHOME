import React from 'react';
import { Cpu, RefreshCw, Shield, LayoutDashboard, Radio, Lock } from 'lucide-react';
import { pollScheduler } from '@/core/http/poll-scheduler';
import { useTranslation } from '@/core/i18n';
import { LanguageSelector } from '@/shared/components/LanguageSelector';

interface HeaderProps {
  currentTab: 'dashboard' | 'devices' | 'auth';
  onSelectTab: (tab: 'dashboard' | 'devices' | 'auth') => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onSelectTab, onLogout }) => {
  const [refreshing, setRefreshing] = React.useState(false);
  const { t } = useTranslation();
  const tabs = [
    { id: 'dashboard', label: t('tabDashboard'), icon: LayoutDashboard },
    { id: 'devices', label: t('tabDevices'), icon: Cpu },
    { id: 'auth', label: t('tabAuth'), icon: Shield }
  ] as const;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await pollScheduler.pollNow();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <header className="app-header sticky top-0 z-40 bg-zinc-950/95 md:backdrop-blur-md border-b border-zinc-800/80 px-4">
      <div className="max-w-7xl mx-auto w-full min-h-14 flex items-center justify-between gap-2">
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Radio className="w-4 h-4" aria-hidden="true" />
          </div>
          <h1 className="font-bold text-sm tracking-wide text-zinc-100">TasHOME</h1>
        </div>

        <nav className="app-navigation" aria-label="TasHOME">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              aria-current={currentTab === id ? 'page' : undefined}
              className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs transition-colors active:scale-[0.98] md:flex-row md:gap-1.5 md:px-3 md:py-1.5 md:rounded-lg ${
                currentTab === id
                  ? 'bg-amber-500/15 text-amber-400 font-bold md:bg-amber-500 md:text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Icon className="w-5 h-5 md:w-3.5 md:h-3.5" aria-hidden="true" />
              <span className="text-center leading-tight">{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 md:gap-2">
          <LanguageSelector />
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="min-w-11 min-h-11 flex items-center justify-center rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 transition-colors disabled:opacity-50"
            title={t('refreshAll')}
            aria-label={t('refreshAll')}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-amber-400' : ''}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="min-w-11 min-h-11 flex items-center justify-center rounded-xl bg-zinc-900/90 hover:bg-rose-950/20 border border-zinc-800/80 text-zinc-400 hover:text-rose-400 transition-colors md:px-3.5"
            title={t('lockSession')}
            aria-label={t('lockSession')}
          >
            <Lock className="w-4 h-4 md:hidden" aria-hidden="true" />
            <span className="hidden md:inline text-xs font-semibold">{t('lock')}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
