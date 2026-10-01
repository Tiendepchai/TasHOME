import React, { useState } from 'react';
import { ShieldCheck, Delete } from 'lucide-react';

interface PinLockScreenProps {
  onSuccess: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({ onSuccess }) => {
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
        setError(data.error || 'Mã 2FA không chính xác');
        setCode('');
      }
    } catch (err: any) {
      setError('Lỗi kết nối máy chủ xác thực');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center">
        {/* Header Icon */}
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-inner">
          <ShieldCheck className="w-8 h-8" />
        </div>

        <h2 className="text-lg font-bold text-zinc-100">Xác thực 2FA TOTP</h2>
        <p className="text-xs text-zinc-400 mt-1 text-center">
          Nhập mã 6 chữ số từ ứng dụng Google Authenticator
        </p>

        {/* 6 Digit Display */}
        <div className="flex items-center gap-2.5 my-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-10 h-12 rounded-xl border flex items-center justify-center font-mono text-xl font-bold transition-all ${
                code[i]
                  ? 'border-amber-400 bg-amber-500/10 text-amber-300 shadow-sm'
                  : 'border-zinc-800 bg-zinc-950/60 text-zinc-600'
              }`}
            >
              {code[i] || '•'}
            </div>
          ))}
        </div>

        {error && (
          <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/50 px-3 py-1.5 rounded-lg mb-4 text-center">
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
              className="h-13 rounded-xl bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800/80 text-lg font-semibold text-zinc-200 active:scale-95 transition-all"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-13 rounded-xl bg-zinc-950/40 hover:bg-zinc-800 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Xóa hết
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleDigit('0')}
            className="h-13 rounded-xl bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800/80 text-lg font-semibold text-zinc-200 active:scale-95 transition-all"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="h-13 rounded-xl bg-zinc-950/40 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
