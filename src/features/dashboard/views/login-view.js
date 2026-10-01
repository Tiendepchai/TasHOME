export function renderLoginHtml() {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#080d1a">
  <title>Smart Home - Mở Khóa ASTRA</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      background: radial-gradient(circle at top, #141e33 0%, #080d1a 100%);
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      overflow: hidden;
    }
    .card {
      background: rgba(19, 27, 46, 0.8);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 32px;
      padding: 36px 28px;
      width: 100%;
      max-width: 360px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.65), 0 0 40px rgba(56, 189, 248, 0.08);
    }
    .shield-icon {
      width: 52px;
      height: 52px;
      margin: 0 auto 16px;
      padding: 12px;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 20px;
      color: #38bdf8;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.2);
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 6px;
    }
    p {
      font-size: 0.875rem;
      color: #94a3b8;
      margin-bottom: 28px;
    }
    .dots-container {
      display: flex;
      justify-content: center;
      gap: 14px;
      margin-bottom: 32px;
    }
    .dot {
      width: 15px;
      height: 15px;
      border-radius: 50%;
      border: 2px solid #334155;
      background: transparent;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .dot.filled {
      background: #38bdf8;
      border-color: #38bdf8;
      transform: scale(1.15);
      box-shadow: 0 0 14px rgba(56, 189, 248, 0.7);
    }
    .keypad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      max-width: 270px;
      margin: 0 auto;
    }
    .key {
      aspect-ratio: 1;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(30, 41, 59, 0.6);
      backdrop-filter: blur(8px);
      color: #f8fafc;
      font-size: 1.45rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      transition: all 0.12s ease;
    }
    .key:active {
      background: #38bdf8;
      color: #04101e;
      transform: scale(0.92);
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
    }
    .key.fn {
      font-size: 0.92rem;
      font-weight: 500;
      color: #94a3b8;
      background: rgba(15, 23, 42, 0.4);
    }
    .key.fn:active {
      background: #334155;
      color: #f8fafc;
    }
    .err-msg {
      color: #f87171;
      font-size: 0.85rem;
      font-weight: 500;
      min-height: 22px;
      margin-top: 20px;
    }
    .shake {
      animation: shakeAnim 0.35s ease-in-out;
    }
    @keyframes shakeAnim {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-8px); }
      40%, 80% { transform: translateX(8px); }
    }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="shield-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    </div>
    <h1>ASTRA Dashboard</h1>
    <p>Nhập mã 2FA xác thực (6 số)</p>

    <div class="dots-container" id="dots">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>

    <div class="keypad">
      <button class="key" onclick="press('1')">1</button>
      <button class="key" onclick="press('2')">2</button>
      <button class="key" onclick="press('3')">3</button>
      <button class="key" onclick="press('4')">4</button>
      <button class="key" onclick="press('5')">5</button>
      <button class="key" onclick="press('6')">6</button>
      <button class="key" onclick="press('7')">7</button>
      <button class="key" onclick="press('8')">8</button>
      <button class="key" onclick="press('9')">9</button>
      <button class="key fn" onclick="clearAll()">Xóa</button>
      <button class="key" onclick="press('0')">0</button>
      <button class="key fn" onclick="del()">⌫</button>
    </div>

    <div class="err-msg" id="err"></div>
    <div style="margin-top: 10px; font-size: 0.75rem; color: #64748b; line-height: 1.4;">
      Google Authenticator / Authy (6 số)<br>
      Khóa phiên tự động thu hồi sau 24h
    </div>
  </div>

  <script>
    let pin = '';
    const dots = document.querySelectorAll('.dot');
    const errEl = document.getElementById('err');
    const cardEl = document.getElementById('card');

    function update() {
      dots.forEach((d, i) => d.classList.toggle('filled', i < pin.length));
    }

    function press(n) {
      if (pin.length >= 6) return;
      pin += n;
      update();
      errEl.innerText = '';
      if (pin.length === 6) submit();
    }

    function del() {
      pin = pin.slice(0, -1);
      update();
    }

    function clearAll() {
      pin = '';
      update();
    }

    async function submit() {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          window.location.reload();
        } else {
          cardEl.classList.add('shake');
          setTimeout(() => cardEl.classList.remove('shake'), 380);
          errEl.innerText = data.error || 'Mã 2FA không đúng';
          clearAll();
        }
      } catch (e) {
        errEl.innerText = 'Lỗi kết nối máy chủ';
        clearAll();
      }
    }

    window.addEventListener('keydown', (e) => {
      if (e.key >= '0' && e.key <= '9') press(e.key);
      if (e.key === 'Backspace') del();
      if (e.key === 'Escape') clearAll();
    });
  </script>
</body>
</html>`;
}
