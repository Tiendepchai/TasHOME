export function renderDashboardHtml(host = '192.168.1.140') {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#080d1a">
  <title>ASTRA - Tasmota Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      background: radial-gradient(circle at top, #141e33 0%, #080d1a 100%);
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      overflow-x: hidden;
    }
    .container {
      width: 100%;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .card {
      background: rgba(19, 27, 46, 0.75);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 32px;
      padding: 32px 24px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.65), 0 0 35px rgba(56, 189, 248, 0.06);
      position: relative;
      overflow: hidden;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      font-size: 0.8rem;
    }
    .brand-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(56, 189, 248, 0.1);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.25);
      padding: 5px 12px;
      border-radius: 9999px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .latency-tag {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 5px 10px;
      border-radius: 9999px;
      color: #94a3b8;
      font-family: ui-monospace, monospace;
      font-size: 0.75rem;
    }
    .status-banner {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      padding: 8px 20px;
      border-radius: 9999px;
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 36px;
      background: rgba(30, 41, 59, 0.8);
      color: #94a3b8;
      border: 1px solid rgba(255, 255, 255, 0.08);
      transition: all 0.3s ease;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #64748b;
      transition: all 0.3s ease;
    }
    .status-banner.on {
      background: rgba(16, 185, 129, 0.12);
      color: #34d399;
      border-color: rgba(16, 185, 129, 0.3);
    }
    .status-banner.on .status-dot {
      background: #10b981;
      box-shadow: 0 0 14px #10b981;
      animation: pulseAnim 2s infinite;
    }
    .status-banner.off {
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.25);
    }
    .status-banner.off .status-dot {
      background: #ef4444;
    }
    @keyframes pulseAnim {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.3); opacity: 0.75; }
    }

    /* Tactile 3D Circular Switch */
    .switch-wrapper {
      position: relative;
      width: 170px;
      height: 170px;
      margin: 0 auto 36px;
    }
    .glow-ring {
      position: absolute;
      inset: -12px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(16, 185, 129, 0.35) 0%, transparent 70%);
      opacity: 0;
      transition: opacity 0.4s ease;
      pointer-events: none;
    }
    .glow-ring.active {
      opacity: 1;
    }
    .btn-power {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.1);
      background: linear-gradient(145deg, #1e293b, #0f172a);
      color: #64748b;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 20px 30px -10px rgba(0, 0, 0, 0.6), inset 0 2px 4px rgba(255, 255, 255, 0.1);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      outline: none;
    }
    .btn-power:active {
      transform: scale(0.93);
    }
    .btn-power.active {
      background: linear-gradient(145deg, #10b981, #059669);
      border-color: rgba(255, 255, 255, 0.4);
      color: #ffffff;
      box-shadow: 0 0 50px rgba(16, 185, 129, 0.5), inset 0 2px 6px rgba(255, 255, 255, 0.3);
    }
    .btn-power svg {
      width: 48px;
      height: 48px;
      stroke-width: 2.3;
      transition: transform 0.3s ease;
    }
    .btn-power.active svg {
      transform: scale(1.08);
      filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.6));
    }
    .power-label {
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    /* Action Grid */
    .action-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .btn-action {
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      padding: 12px 14px;
      color: #f1f5f9;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.15s ease;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .btn-action:active {
      background: rgba(56, 189, 248, 0.15);
      border-color: rgba(56, 189, 248, 0.4);
      transform: scale(0.96);
    }
    .btn-action svg {
      width: 18px;
      height: 18px;
      stroke-width: 2;
    }

    /* Device Info Drawer */
    .info-card {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 20px;
      padding: 16px 20px;
      font-size: 0.8rem;
      color: #94a3b8;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .info-val {
      color: #f8fafc;
      font-family: ui-monospace, monospace;
      font-weight: 500;
    }
    .info-val a {
      color: #38bdf8;
      text-decoration: none;
    }
    .footer-bar {
      display: flex;
      justify-content: space-between;
      padding: 0 4px;
      font-size: 0.75rem;
      color: #64748b;
    }
    .footer-bar a {
      color: #94a3b8;
      text-decoration: none;
      transition: color 0.15s;
    }
    .footer-bar a:hover {
      color: #f8fafc;
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(4, 8, 16, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      z-index: 100;
    }
    .modal-content {
      background: rgba(19, 27, 46, 0.96);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 28px;
      padding: 24px;
      width: 100%;
      max-width: 360px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      animation: modalFadeIn 0.2s ease-out;
    }
    @keyframes modalFadeIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header-bar">
        <span class="brand-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          ASTRA · Tasmota
        </span>
        <span class="latency-tag" id="latency-tag">⚡ -- ms</span>
      </div>

      <div class="status-banner" id="status-banner">
        <span class="status-dot"></span>
        <span id="status-text">Đang tải trạng thái...</span>
      </div>

      <div class="switch-wrapper">
        <div class="glow-ring" id="glow-ring"></div>
        <button class="btn-power" id="btn-power" onclick="handleToggle()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 3v9"/>
          </svg>
          <span class="power-label" id="power-label">--</span>
        </button>
      </div>

      <div class="action-grid">
        <button class="btn-action" onclick="handleChime()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Thử Chuông
        </button>
        <button class="btn-action" onclick="fetchStatus(true)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
          Đồng Bộ
        </button>
      </div>

      <div class="info-card">
        <div class="info-row">
          <span>Phần cứng</span>
          <span class="info-val">STM32F103 + ESP-01</span>
        </div>
        <div class="info-row">
          <span>Chuông âm báo</span>
          <span class="info-val" style="color: #38bdf8;">Westminster 8-nốt</span>
        </div>
        <div class="info-row">
          <span>Địa chỉ IP</span>
          <span class="info-val">
            <a href="http://${host}/" target="_blank" id="host-link">${host}</a>
          </span>
        </div>
        <div class="info-row">
          <span>Giao thức</span>
          <span class="info-val" id="protocol-text">Tasmota (TuyaMCU)</span>
        </div>
        <div class="info-row">
          <span>WiFi / RSSI</span>
          <span class="info-val" id="wifi-text">--</span>
        </div>
      </div>
    </div>

    <div class="footer-bar">
      <span>ASTRA Architecture · TuyaMCU</span>
      <div style="display: flex; gap: 14px;">
        <a href="#" onclick="open2FAModal(event)" style="color: #38bdf8;">🔑 Cài đặt 2FA</a>
        <a href="#" onclick="handleLogout(event)">Đăng xuất</a>
      </div>
    </div>
  </div>

  <!-- 2FA Modal -->
  <div id="modal-2fa" class="modal-overlay" style="display: none;">
    <div class="modal-content">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="font-size: 1.15rem; color: #f8fafc; font-weight: 700;">Xác thực 2FA (Google Auth)</h2>
        <button onclick="close2FAModal()" style="background: none; border: none; color: #94a3b8; font-size: 1.4rem; cursor: pointer; padding: 4px;">&times;</button>
      </div>

      <div style="text-align: center; margin-bottom: 16px;">
        <img id="qr-img" src="" alt="QR Code" style="width: 170px; height: 170px; border-radius: 14px; background: white; padding: 8px; margin: 0 auto; display: block; box-shadow: 0 4px 20px rgba(0,0,0,0.4);" onerror="this.style.display='none'">
      </div>

      <div style="background: rgba(15, 23, 42, 0.7); border-radius: 14px; padding: 12px; margin-bottom: 14px; border: 1px solid rgba(255,255,255,0.06);">
        <div style="font-size: 0.72rem; color: #94a3b8; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Mã hiện tại (Server kiểm tra)</div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span id="live-code" style="font-size: 1.6rem; font-weight: 700; color: #38bdf8; font-family: ui-monospace, monospace; letter-spacing: 3px;">------</span>
          <span id="live-timer" style="font-size: 0.8rem; color: #e2e8f0; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 12px; padding: 3px 8px;">--s</span>
        </div>
      </div>

      <div style="background: rgba(15, 23, 42, 0.7); border-radius: 14px; padding: 12px; margin-bottom: 14px; border: 1px solid rgba(255,255,255,0.06);">
        <div style="font-size: 0.72rem; color: #94a3b8; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Khóa bí mật (Setup Key)</div>
        <div id="secret-text" style="font-family: ui-monospace, monospace; font-size: 0.82rem; color: #f8fafc; word-break: break-all; margin-bottom: 8px;">------</div>
        <div style="display: flex; gap: 8px;">
          <button onclick="copy2FASecret()" id="btn-copy-secret" style="flex: 1; padding: 8px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.3); background: rgba(56, 189, 248, 0.1); color: #38bdf8; font-size: 0.8rem; font-weight: 600; cursor: pointer;">
            Sao chép khóa
          </button>
          <button onclick="revoke2FAKey()" id="btn-revoke-key" style="padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(248, 113, 113, 0.3); background: rgba(248, 113, 113, 0.1); color: #f87171; font-size: 0.8rem; font-weight: 600; cursor: pointer;">
            Thu hồi &amp; Đổi khóa
          </button>
        </div>
      </div>

      <div style="font-size: 0.72rem; color: #64748b; text-align: center; margin-bottom: 12px; line-height: 1.4;">
        🔒 Phiên đăng nhập tự động thu hồi sau 24 giờ (1 ngày).
      </div>

      <a id="btn-open-app" href="#" style="display: block; text-align: center; padding: 10px; border-radius: 12px; background: #38bdf8; color: #04101e; font-size: 0.85rem; font-weight: 700; text-decoration: none; margin-bottom: 8px;">
        Thêm vào ứng dụng Authenticator
      </a>
    </div>
  </div>

  <script>
    const btnPower = document.getElementById('btn-power');
    const glowRing = document.getElementById('glow-ring');
    const statusBanner = document.getElementById('status-banner');
    const statusText = document.getElementById('status-text');
    const powerLabel = document.getElementById('power-label');
    const latencyTag = document.getElementById('latency-tag');
    const protocolText = document.getElementById('protocol-text');
    const wifiText = document.getElementById('wifi-text');
    let currentState = 'UNKNOWN';
    let isActing = false;

    const audioCtx = (window.AudioContext || window.webkitAudioContext) ? new (window.AudioContext || window.webkitAudioContext)() : null;
    function playClickSound(freq = 800) {
      if (!audioCtx) return;
      try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.045);
      } catch (e) {}
    }

    function updateUI(state, latency, protocol, wifi) {
      currentState = state;
      const isON = (state === 'ON');
      const isOFF = (state === 'OFF');

      btnPower.className = 'btn-power ' + (isON ? 'active' : '');
      glowRing.className = 'glow-ring ' + (isON ? 'active' : '');
      statusBanner.className = 'status-banner ' + (isON ? 'on' : (isOFF ? 'off' : ''));

      statusText.innerText = isON ? 'ĐANG BẬT (ON)' : (isOFF ? 'ĐANG TẮT (OFF)' : 'MẤT KẾT NỐI');
      powerLabel.innerText = isON ? 'TẮT' : 'BẬT';
      btnPower.disabled = (state === 'UNKNOWN');

      if (latency !== undefined) latencyTag.innerText = '⚡ ' + latency + ' ms';
      if (protocol) protocolText.innerText = protocol;
      if (wifi?.ssid) wifiText.innerText = wifi.ssid + ' (' + wifi.signal + ' dBm)';
    }

    async function fetchStatus(force = false) {
      try {
        const res = await fetch('/api/status' + (force ? '?sync=1' : ''));
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        const data = await res.json();
        updateUI(data.state, data.latency, data.protocol, data.wifi);
      } catch (err) {
        updateUI('UNKNOWN');
      }
    }

    async function handleToggle() {
      if (isActing || currentState === 'UNKNOWN') return;
      isActing = true;
      playClickSound(currentState === 'ON' ? 600 : 900);

      const prev = currentState;
      const next = prev === 'ON' ? 'OFF' : 'ON';
      updateUI(next);

      try {
        const res = await fetch('/api/toggle', { method: 'POST' });
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        const data = await res.json();
        if (data.success) {
          updateUI(data.state, data.latency, data.protocol, data.wifi);
        } else {
          updateUI(prev);
        }
      } catch (e) {
        updateUI(prev);
      } finally {
        isActing = false;
      }
    }

    async function handleChime() {
      if (isActing) return;
      isActing = true;
      playClickSound(1200);
      try {
        const res = await fetch('/api/chime', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          updateUI(data.state, data.latency, data.protocol, data.wifi);
        }
      } catch (e) {
      } finally {
        isActing = false;
      }
    }

    async function handleLogout(e) {
      e.preventDefault();
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.reload();
    }

    let twoFATimer = null;
    let current2FAData = null;

    async function open2FAModal(e) {
      if (e) e.preventDefault();
      document.getElementById('modal-2fa').style.display = 'flex';
      await refresh2FA();
      if (twoFATimer) clearInterval(twoFATimer);
      twoFATimer = setInterval(refresh2FA, 1000);
    }

    function close2FAModal() {
      document.getElementById('modal-2fa').style.display = 'none';
      if (twoFATimer) {
        clearInterval(twoFATimer);
        twoFATimer = null;
      }
    }

    async function refresh2FA() {
      try {
        const res = await fetch('/api/auth/2fa');
        if (!res.ok) return;
        const data = await res.json();
        current2FAData = data;
        document.getElementById('live-code').innerText = data.currentCode.slice(0, 3) + ' ' + data.currentCode.slice(3);
        document.getElementById('live-timer').innerText = data.remaining + 's';
        document.getElementById('secret-text').innerText = data.formatted;
        document.getElementById('btn-open-app').href = data.otpauth;
        const qrImg = document.getElementById('qr-img');
        const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=0&data=' + encodeURIComponent(data.otpauth);
        if (qrImg.src !== qrUrl) qrImg.src = qrUrl;
      } catch {}
    }

    function copy2FASecret() {
      if (!current2FAData) return;
      navigator.clipboard.writeText(current2FAData.secret).then(() => {
        const btn = document.getElementById('btn-copy-secret');
        const orig = btn.innerText;
        btn.innerText = 'Đã sao chép!';
        btn.style.color = '#4ade80';
        setTimeout(() => {
          btn.innerText = orig;
          btn.style.color = '#38bdf8';
        }, 2000);
      });
    }

    async function revoke2FAKey() {
      if (!confirm('Bạn có chắc muốn THU HỒI khóa 2FA hiện tại? Bạn sẽ cần quét lại mã QR mới trong ứng dụng Authenticator.')) return;
      try {
        const res = await fetch('/api/auth/revoke-key', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert('Đã thu hồi khóa thành công! Vui lòng quét mã QR mới hiển thị.');
          refresh2FA();
        }
      } catch (e) {
        alert('Lỗi: ' + e.message);
      }
    }

    fetchStatus();
    setInterval(() => {
      if (document.visibilityState === 'visible' && !isActing) {
        fetchStatus();
      }
    }, 3000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchStatus(true);
    });
  </script>
</body>
</html>`;
}
