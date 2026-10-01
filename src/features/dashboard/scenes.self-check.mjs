import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSessionToken } from '../../core/auth/index.js';

// Import server
const { server } = await import('../../../server.js');

const port = 34568;
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

try {
  const token = createSessionToken();
  const headers = {
    Cookie: `smarthome_session=${token}`,
    'Content-Type': 'application/json'
  };

  // 1. GET /api/scenes
  const getRes = await fetch(`http://127.0.0.1:${port}/api/scenes`, { headers });
  assert.equal(getRes.status, 200);
  const initialScenes = await getRes.json();
  assert.ok(Array.isArray(initialScenes));
  assert.ok(initialScenes.length >= 3);

  // 2. POST /api/scenes (Create new scene)
  const createRes = await fetch(`http://127.0.0.1:${port}/api/scenes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: 'test-custom-scene',
      name: 'Kiểm Tra Ngữ Cảnh',
      description: 'Mô tả thử nghiệm',
      icon: 'Sun',
      actions: [{ type: 'broadcast', command: 'POWER1 TOGGLE' }]
    })
  });
  assert.equal(createRes.status, 200);
  const created = await createRes.json();
  assert.equal(created.success, true);
  assert.equal(created.scene.id, 'test-custom-scene');

  // 3. POST /api/scenes/:id/execute
  const execRes = await fetch(`http://127.0.0.1:${port}/api/scenes/test-custom-scene/execute`, {
    method: 'POST',
    headers
  });
  assert.equal(execRes.status, 200);
  const execData = await execRes.json();
  assert.equal(execData.success, true);
  assert.equal(execData.sceneId, 'test-custom-scene');

  // 4. DELETE /api/scenes/:id
  const delRes = await fetch(`http://127.0.0.1:${port}/api/scenes/test-custom-scene`, {
    method: 'DELETE',
    headers
  });
  assert.equal(delRes.status, 200);
  const delData = await delRes.json();
  assert.equal(delData.success, true);
  assert.equal(delData.deletedId, 'test-custom-scene');

  console.log('PASS: P4 Scenes API verified (GET, POST, EXECUTE, DELETE, default seeding)');
} finally {
  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
}
