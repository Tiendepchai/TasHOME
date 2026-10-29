import React, { useState, useEffect, useRef } from 'react';
import { Header } from '@/shared/layouts/Header';
import { FooterConsole } from '@/shared/layouts/FooterConsole';
import { DashboardPage } from '@/features/dashboard/components/DashboardPage';
import { DeviceDetailPage } from '@/features/devices/components/DeviceDetailPage';
import { AuthSettingsPage } from '@/features/settings/components/AuthSettingsPage';
import { PinLockScreen } from '@/core/auth/PinLockScreen';
import { pollScheduler } from '@/core/http/poll-scheduler';
import { sessionFetch, isSessionRequired, advanceSession, getSessionEpoch, isSessionActive, SESSION_EXPIRED_EVENT } from '@/core/http/session-fetch';
import { useDeviceStore } from '@/features/devices/store/device-store';
import { useDashboardStore } from '@/features/dashboard/store/dashboard-store';
import { useLanguageStore, useTranslation } from '@/core/i18n';
import { ToastContainer } from '@/shared/components/Toast';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [logoutState, setLogoutState] = useState<'idle' | 'pending' | 'error'>('idle');
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<'dashboard' | 'devices' | 'auth'>('dashboard');
  const authRequest = useRef<AbortController | null>(null);

  const checkAuth = async () => {
    authRequest.current?.abort();
    const controller = new AbortController();
    authRequest.current = controller;
    const epoch = getSessionEpoch();
    const current = () => authRequest.current === controller && epoch === getSessionEpoch();
    const deadline = setTimeout(() => controller.abort(), 10000);
    setAuthError(false);
    try {
      const res = await sessionFetch('/api/auth/session', { signal: controller.signal, cache: 'no-store' });
      if (!current()) return;
      if (isSessionRequired(res)) {
        advanceSession(false);
        setAuthenticated(false);
      } else {
        if (!res.ok || (await res.json()).authenticated !== true) throw new Error('Session check failed');
        if (!current()) return;
        advanceSession(true);
        setAuthenticated(true);
      }
    } catch {
      if (current()) setAuthError(true);
    } finally {
      clearTimeout(deadline);
      if (authRequest.current === controller) authRequest.current = null;
    }
  };

  useEffect(() => {
    const expire = () => {
      if (!isSessionActive()) return;
      advanceSession(false);
      pollScheduler.stop();
      authRequest.current?.abort();
      authRequest.current = null;
      setSessionExpired(true);
      setHydrated(false);
      setAuthenticated(false);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expire);
    checkAuth();
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, expire);
      authRequest.current?.abort();
      authRequest.current = null;
      advanceSession(false);
      pollScheduler.stop();
    };
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let isMounted = true;
    const epoch = getSessionEpoch();
    (async () => {
      await Promise.allSettled([
        useDeviceStore.getState().fetchDevices(),
        useDashboardStore.getState().fetchDashboards(),
        useLanguageStore.getState().fetchSettings()
      ]);
      if (isMounted && isSessionActive() && epoch === getSessionEpoch()) {
        setHydrated(true);
        pollScheduler.start();
      }
    })();
    return () => {
      isMounted = false;
      pollScheduler.stop();
    };
  }, [authenticated]);

  const handleLogout = async () => {
    if (authRequest.current) return;
    advanceSession(false);
    pollScheduler.stop();
    setHydrated(false);
    setAuthenticated(null);
    setLogoutState('pending');
    const controller = new AbortController();
    authRequest.current = controller;
    const deadline = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await sessionFetch('/api/auth/logout', { method: 'POST', signal: controller.signal });
      if (authRequest.current !== controller) return;
      if (!res.ok) throw new Error('Logout failed');
      setSessionExpired(false);
      setLogoutState('idle');
      setAuthenticated(false);
    } catch {
      if (authRequest.current === controller) setLogoutState('error');
    } finally {
      clearTimeout(deadline);
      if (authRequest.current === controller) authRequest.current = null;
    }
  };

  if (authenticated === null) {
    const failed = logoutState === 'error' || authError;
    return (
      <main className="min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center gap-4 p-4 text-center text-zinc-300">
        <p role="status" aria-live="polite">
          {logoutState === 'error' ? t('authLogoutError') : logoutState === 'pending' ? t('authLoggingOut') : authError ? t('authConnectionError') : t('authCheckingSession')}
        </p>
        {failed && <button type="button" onClick={logoutState === 'error' ? handleLogout : checkAuth} className="min-h-11 rounded-xl bg-amber-500 px-6 font-semibold text-zinc-950 hover:bg-amber-400">{t('authRetry')}</button>}
      </main>
    );
  }

  if (!authenticated) {
    return <PinLockScreen sessionExpired={sessionExpired} onSuccess={() => {
      advanceSession(true);
      setSessionExpired(false);
      setAuthError(false);
      setAuthenticated(true);
    }} />;
  }

  if (!hydrated) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center p-4 text-center text-zinc-400" role="status">
        {t('authLoadingDashboard')}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500/20">
      <Header currentTab={tab} onSelectTab={setTab} onLogout={handleLogout} />
      <main className="app-main flex-1">
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'devices' && <DeviceDetailPage />}
        {tab === 'auth' && <AuthSettingsPage />}
      </main>
      <FooterConsole />
      <ToastContainer />
    </div>
  );
};
