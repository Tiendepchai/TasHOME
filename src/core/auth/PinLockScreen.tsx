import React, { useState } from 'react';
import { ShieldCheck, Delete } from 'lucide-react';
import { useTranslation } from '@/core/i18n';
import { LanguageSelector } from '@/shared/components/LanguageSelector';

interface PinLockScreenProps {
  onSuccess: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({ onSuccess }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDigit = (d: string) => {
    if (code.length < 6) {
      const next = code + d;
      setCode(next);
      if (next.length === 6) {
        verify(next);
      }
    }
  };

  const handleDelete = () => {
    setCode((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setCode('');
    setError(null);
  };

  const verify = async (pinCode: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinCode })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        setError(data.error || t('wrongTotpCode'));
        setCode('');
      }
    } catch {
      setError(t('serverAuthError'));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-amber-500/20">
      <div className="absolute top-4 right-4 z-10">
        <LanguageSelector />
      </div>

      <div className="w-full max-w-sm bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-6 sm:p-7 shadow-2xl backdrop-blur-xl flex flex-col items-center">
        {/* Header Icon */}
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-inner">
          <ShieldCheck className="w-8 h-8" />
        </div>

        <h2 className="text-lg font-bold text-zinc-100">{t('totpAuthTitle')}</h2>
        <p className="text-xs text-zinc-400 mt-1 text-center">
          {t('totpAuthSubtitle')}
        </p>

        {/* 6 Digit Display */}
        <div className="flex items-center gap-2.5 my-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-10 h-12 rounded-xl border flex items-center justify-center font-mono text-xl font-bold transition-all ${
                code[i]
                  ? 'border-amber-400/80 bg-amber-500/15 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.15)] scale-105'
                  : 'border-zinc-800 bg-zinc-950/70 text-zinc-600'
              }`}
            >
              {code[i] || '•'}
            </div>
          ))}
        </div>

        {error && (
          <div className="text-xs text-rose-400 bg-rose-950/30 border border-rose-900/50 px-3.5 py-2 rounded-xl mb-4 text-center font-medium animate-in fade-in duration-150">
            {error}
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[280px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={loading}
              onClick={() => handleDigit(digit)}
              className="h-13 rounded-xl bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800/80 text-lg font-semibold text-zinc-200 active:scale-95 transition-all cursor-pointer shadow-sm hover:border-zinc-700 disabled:opacity-50"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-13 rounded-xl bg-zinc-950/40 hover:bg-zinc-800 text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer active:scale-95 border border-transparent hover:border-zinc-800"
          >
            {t('clearAll')}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleDigit('0')}
            className="h-13 rounded-xl bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800/80 text-lg font-semibold text-zinc-200 active:scale-95 transition-all cursor-pointer shadow-sm hover:border-zinc-700 disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            aria-label={t('deleteOne')}
            className="h-13 rounded-xl bg-zinc-950/40 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95 border border-transparent hover:border-zinc-800"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
