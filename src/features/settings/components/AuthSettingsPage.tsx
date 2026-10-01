import React, { useState, useEffect } from 'react';
import { Key, ShieldAlert, Copy, Check, RefreshCw, Clock } from 'lucide-react';

export const AuthSettingsPage: React.FC = () => {
  const [data, setData] = useState<{
    secret?: string;
    formatted?: string;
    currentCode?: string;
    remaining?: number;
    otpauth?: string;
  }>({});
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const fetchAuthInfo = async () => {
    try {
      const res = await fetch('/api/auth/2fa');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {}
  };

  useEffect(() => {
    fetchAuthInfo();
    const interval = setInterval(fetchAuthInfo, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = () => {
    if (data.secret) {
      navigator.clipboard.writeText(data.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRevoke = async () => {
    if (!confirm('CẢNH BÁO: Thu hồi khóa 2FA sẽ hủy quyền truy cập của mã cũ. Bạn có chắc muốn tạo khóa mới?')) {
      return;
    }
    setRevoking(true);
    try {
      const res = await fetch('/api/auth/revoke-key', { method: 'POST' });
      if (res.ok) {
        await fetchAuthInfo();
      }
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Cấu hình Bảo mật 2FA (RFC 6238)</h2>
        <p className="text-xs text-zinc-400">Quản lý mã xác thực hai lớp và thời hạn phiên làm việc</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6 shadow-sm">
        {/* Secret Key Display */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" />
            <span>Khóa bí mật Base32 (Secret Key)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={data.formatted || data.secret || 'Đang tải...'}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-amber-400"
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg flex items-center gap-1.5 border border-zinc-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">
            Thêm khóa này vào Google Authenticator / 1Password / Authy để nhận mã 6 số.
          </p>
        </div>

        {/* Live TOTP Verification Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-zinc-800">
          <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-zinc-500 block">Mã hiện tại trên máy chủ</span>
              <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
                {data.currentCode || '------'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-zinc-500 block flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3 text-zinc-400" /> Còn lại
              </span>
              <span className="text-lg font-bold font-mono text-zinc-300 mt-1 block">
                {data.remaining ?? 0}s
              </span>
            </div>
          </div>

          <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex flex-col justify-between">
            <span className="text-xs text-zinc-500">Thời hạn phiên làm việc</span>
            <span className="text-sm font-semibold text-zinc-200 mt-1">24 giờ (Tự động thu hồi khi hết hạn)</span>
            <span className="text-[10px] text-zinc-600 mt-1">HMAC-SHA256 Cookie ký an toàn</span>
          </div>
        </div>

        {/* Revoke Action */}
        <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
          <div className="text-xs text-zinc-500">
            Khóa bị lộ hoặc muốn tạo mới?
          </div>
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-900/60 rounded-lg text-xs font-semibold transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${revoking ? 'animate-spin' : ''}`} />
            <span>Thu hồi & Tạo khóa mới</span>
          </button>
        </div>
      </div>
    </div>
  );
};
