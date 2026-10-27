import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  resolve: { alias: { '@': `${root}src` } },
  server: { middlewareMode: true, watch: null, ws: false },
  appType: 'custom'
});

try {
  const { Header } = await server.ssrLoadModule('/src/shared/layouts/Header.tsx');
  for (const currentTab of ['dashboard', 'devices', 'auth']) {
    const html = renderToStaticMarkup(createElement(Header, {
      currentTab, onSelectTab() {}, onLogout() {}
    }));
    const nav = html.match(/<nav\b[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, 'Navigation must remain available at every viewport');
    assert.equal((nav.match(/<button\b/g) || []).length, 3);
    assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
    assert.match(html, /aria-label="Khóa phiên làm việc"/);
  }

  const css = await readFile(`${root}src/index.css`, 'utf8');
  assert.match(css, /--mobile-nav-height:\s*72px/);
  assert.match(css, /@media\s*\(max-width:\s*767px\)/);
  assert.match(css, /padding-bottom:\s*calc\(var\(--mobile-nav-height\) \+ var\(--console-bar-height\)/);
  assert.match(css, /bottom:\s*calc\(var\(--mobile-nav-height\) \+ env\(safe-area-inset-bottom/);

  const relay = await readFile(`${root}src/features/widgets/built-in/relay-toggle/RelayToggleWidget.tsx`, 'utf8');
  assert.match(relay, /const showTimer = touchLayout \|\| isDivided/);
  assert.match(relay, /data-divided=\{showTimer/);
  assert.match(relay, /aria-hidden=\{!showTimer\}/);
  assert.match(relay, /<dialog[\s\S]*?ref=\{timerDialogRef\}/);
  assert.ok(relay.indexOf('if (!device) {') > relay.lastIndexOf('useEffect(() =>'), 'No device return must follow every hook');

  assert.match(relay, /onClose=\{\(\) => setCustomModalChannel\(null\)\}/);
  assert.match(relay, /if \(!isDivided \|\| customModalChannel\) return/);

  const schedule = await readFile(`${root}src/features/devices/components/DeviceTimerTab.tsx`, 'utf8');
  assert.match(schedule, /grid-cols-\[repeat\(auto-fit,minmax\(44px,1fr\)\)\]/);
  assert.match(schedule, /role="switch"[\s\S]*?aria-checked=\{isEnabled\}/);
  assert.match(schedule, /<dialog[\s\S]*?onClose=\{\(\) => setEditingTimerIndex\(null\)\}/);

  console.log('PASS: mobile navigation, safe-area spacing, touch timer, hook order, dialog close lifecycle and schedule targets');
} finally {
  await server.close();
}
