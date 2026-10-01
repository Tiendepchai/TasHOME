import React, { useState, useEffect } from 'react';
import { Header } from '@/shared/layouts/Header';
import { FooterConsole } from '@/shared/layouts/FooterConsole';
import { DashboardPage } from '@/features/dashboard/components/DashboardPage';
import { DeviceDetailPage } from '@/features/devices/components/DeviceDetailPage';
import { AuthSettingsPage } from '@/features/settings/components/AuthSettingsPage';
import { PinLockScreen } from '@/core/auth/PinLockScreen';
import { pollScheduler } from '@/core/http/poll-scheduler';
import { useDeviceStore } from '@/features/devices/store/device-store';
import { useDashboardStore } from '@/features/dashboard/store/dashboard-store';
import { useLanguageStore } from '@/core/i18n';
import { ToastContainer } from '@/shared/components/Toast';

export const App: React.FC = () => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<'dashboard' | 'devices' | 'auth'>('dashboard');

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/2fa');
      if (res.ok) {
        setAuthenticated(true);
      } else {
        setAuthenticated(false);
      }
    } catch {
      setAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (authenticated) {
      let isMounted = true;
      (async () => {
        try {
          await Promise.allSettled([
            useDeviceStore.getState().fetchDevices(),
            useDashboardStore.getState().fetchDashboards(),
            useLanguageStore.getState().fetchSettings()
          ]);
        } finally {
          if (isMounted) {
            setHydrated(true);
            pollScheduler.start();
          }
        }
      })();
      return () => {
        isMounted = false;
        pollScheduler.stop();
      };
    } else {
      setHydrated(false);
    }
  }, [authenticated]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setAuthenticated(false);
    setHydrated(false);
  };

  if (authenticated === null) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center text-zinc-500 font-mono text-xs">
        Khởi tạo TasHOME Dashboard...
      </div>
    );
  }

  if (!authenticated) {
    return <PinLockScreen onSuccess={() => setAuthenticated(true)} />;
  }

  if (!hydrated) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center space-y-3 text-zinc-400 font-mono text-xs">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <span>Đang đồng bộ dữ liệu từ server...</span>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500/20">
      <Header currentTab={tab} onSelectTab={setTab} onLogout={handleLogout} />
      <main className="flex-1 pb-16">
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'devices' && <DeviceDetailPage />}
        {tab === 'auth' && <AuthSettingsPage />}
      </main>
      <FooterConsole />
      <ToastContainer />
    </div>
  );
};
