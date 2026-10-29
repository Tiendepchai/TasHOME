import React, { useEffect, useId, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/core/i18n';
import { LanguageSelector } from '@/shared/components/LanguageSelector';

interface PinLockScreenProps {
  onSuccess: () => void;
  sessionExpired?: boolean;
}

function retryDelaySeconds(value: unknown, header: string | null): number | null {
  const valid = (seconds: number) => seconds >= 0 && Number.isSafeInteger(Date.now() + Math.ceil(seconds) * 1000);
  if (typeof value === 'number' && valid(value)) return Math.ceil(value);
  if (header?.trim()) {
    const seconds = /^\d+$/.test(header.trim())
      ? Number(header)
      : /[a-z]/i.test(header) ? (Date.parse(header) - Date.now()) / 1000 : NaN;
    if (Number.isFinite(seconds)) {
      const delay = Math.max(0, Math.ceil(seconds));
      if (valid(delay)) return delay;
    }
  }
  return null;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({ onSuccess, sessionExpired = false }) => {
  const { t } = useTranslation();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<{ controller: AbortController; timeout: ReturnType<typeof setTimeout> } | null>(null);
  const cooldownUntil = useRef(0);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [remaining, setRemaining] = useState(0);
  const coolingDown = remaining > 0;
  const invalid = error === 'authCodeFormat' || error === 'wrongTotpCode';

  useEffect(() => () => {
    const pending = request.current;
    request.current = null;
    if (pending) {
      clearTimeout(pending.timeout);
      pending.controller.abort();
    }
  }, []);

  useEffect(() => {
    if (!coolingDown) return;
    const interval = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((cooldownUntil.current - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [coolingDown]);

  const focusCode = () => {
    input.current?.focus();
    input.current?.select();
  };

  const verify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (request.current || cooldownUntil.current > Date.now()) return;
    const pin = code.replace(/\s/g, '');
    if (!/^[0-9]{6}$/.test(pin)) {
      setError('authCodeFormat');
      focusCode();
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (request.current?.controller !== controller) return;
      request.current = null;
      controller.abort();
      setLoading(false);
      setError('authTimeout');
    }, 10000);
    request.current = { controller, timeout };
    setLoading(true);
    setError(null);
    let authenticated = false;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
        signal: controller.signal
      });
      const body: unknown = await res.json().catch(() => null);
      if (request.current?.controller !== controller) return;
      const data = body && typeof body === 'object' && !Array.isArray(body)
        ? body as Record<string, unknown> : null;
      if (res.ok && data?.success === true) {
        authenticated = true;
      } else if (res.status === 429 || data?.code === 'RATE_LIMITED' || (data?.code === 'INVALID_TOTP' && typeof data.retryAfter === 'number' && data.retryAfter > 0)) {
        const seconds = retryDelaySeconds(data?.retryAfter, res.headers.get('Retry-After'));
        if (seconds === null) {
          setError('authServerError');
        } else {
          cooldownUntil.current = Date.now() + seconds * 1000;
          setRemaining(seconds);
          setError('authRateLimited');
        }
      } else if (data?.code === 'INVALID_TOTP' && res.status < 500) {
        setError('wrongTotpCode');
        focusCode();
      } else {
        setError('authServerError');
      }
    } catch {
      if (request.current?.controller !== controller) return;
      setError('serverAuthError');
    } finally {
      clearTimeout(timeout);
      if (request.current?.controller === controller) {
        request.current = null;
        setLoading(false);
      }
    }
    if (authenticated) onSuccess();
  };

  const message = error === 'authRateLimited' && !coolingDown
    ? t('authCanRetry') : error ? t(error) : loading ? t('authVerifying') : '';

  return (
    <main
      className="min-h-[100dvh] flex flex-col bg-zinc-950 text-zinc-100 selection:bg-amber-500/20"
      style={{
        paddingTop: 'max(16px, env(safe-area-inset-top, 0px))',
        paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))'
      }}
    >
      <header className="flex w-full items-center justify-between gap-3">
        <span className="font-mono text-xs font-bold tracking-widest text-zinc-400">{t('appTitle')}</span>
        <LanguageSelector />
      </header>

      <section aria-labelledby={`${id}-title`} className="mx-auto my-auto w-full max-w-sm py-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-2xl sm:p-7">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 id={`${id}-title`} className="text-xl font-bold tracking-tight">{t('totpAuthTitle')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t('totpAuthSubtitle')}</p>
          {sessionExpired && (
            <p role="status" className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
              {t('authSessionExpired')}
            </p>
          )}

          <form onSubmit={verify} noValidate aria-busy={loading} aria-labelledby={`${id}-title`} className="mt-6">
            <label htmlFor={`${id}-code`} className="mb-2 block text-sm font-semibold text-zinc-200">{t('authCodeLabel')}</label>
            <input
              ref={input}
              id={`${id}-code`}
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              spellCheck={false}
              autoCapitalize="off"
              enterKeyHint="go"
              required
              value={code}
              readOnly={loading}
              aria-invalid={invalid}
              aria-describedby={`${id}-hint${message ? ` ${id}-message` : ''}`}
              onChange={(event) => {
                setCode(event.target.value.replace(/\s/g, ''));
                if (error !== 'authRateLimited') setError(null);
              }}
              placeholder="000000"
              className={`h-14 min-w-0 w-full rounded-xl border bg-zinc-950 px-3 text-center font-mono text-2xl tracking-[0.25em] text-amber-300 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25 read-only:opacity-60 ${invalid ? 'border-rose-400' : 'border-zinc-700'}`}
            />
            <p id={`${id}-hint`} className="mt-2 text-xs leading-relaxed text-zinc-400">{t('authCodeHint')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={loading || coolingDown}
                className="min-h-11 min-w-0 flex-1 rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? t('authVerifying') : t('authUnlock')}
              </button>
              <button
                type="button"
                disabled={loading || !code}
                onClick={() => {
                  setCode('');
                  if (!coolingDown) setError(null);
                  input.current?.focus();
                }}
                className="min-h-11 rounded-xl border border-zinc-700 px-3 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('clearAll')}
              </button>
            </div>
          </form>

          <div id={`${id}-message`} role="status" aria-live="polite" aria-atomic="true" className={`mt-3 text-sm leading-relaxed ${invalid || (error && error !== 'authRateLimited') ? 'text-rose-300' : 'text-amber-200'}`}>
            {message}
          </div>
          {coolingDown && (
            <p role="timer" aria-live="off" className="mt-1 font-mono text-xs text-zinc-400">
              {t('authRetryCountdown').replace('{seconds}', String(remaining))}
            </p>
          )}

          <details className="mt-5 border-t border-zinc-800 pt-3 text-sm text-zinc-400">
            <summary className="min-h-11 cursor-pointer py-3 font-medium text-zinc-300">{t('authHelpTitle')}</summary>
            <p className="pb-3 text-xs leading-relaxed">{t('authHelpBody')}</p>
          </details>
        </div>
      </section>
    </main>
  );
};
