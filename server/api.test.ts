import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApiApp } from './app.ts';
import { SqliteRepository } from './db.ts';
import type { StudioPresetConfigData } from '../src/utils/presetValidation.ts';

function buildSampleConfig(): StudioPresetConfigData {
  return {
    activeTemplate: 'tech-vip',
    cardFinish: 'glossy',
    cardCaseEnabled: true,
    cardCaseStyle: 'matte-obsidian',
    edgePreset: 'silver',
    hardwareFinish: 'brushed-steel',
    hologramEnabled: true,
    hologramIntensity: 0.72,
    studioBackdrop: 'obsidian',
    showLanyard: true,
    front: {
      fitMode: 'cover',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      backgroundColor: '#0c1122',
      lanyardRepeat: 3,
      uploadedFileName: '',
      artworkDataUrl: '',
    },
    back: {
      fitMode: 'cover',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      backgroundColor: '#111827',
      lanyardRepeat: 3,
      uploadedFileName: '',
      artworkDataUrl: '',
    },
    lanyard: {
      fitMode: 'cover',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      backgroundColor: '#1d4ed8',
      lanyardRepeat: 4,
      uploadedFileName: '',
      artworkDataUrl: '',
    },
  };
}

async function startTestServer() {
  const repo = new SqliteRepository(':memory:');
  await repo.init();
  const app = createApiApp(repo);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function jsonFetch(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown; origin?: string } = {}
) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.origin) headers.Origin = options.origin;

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await res.json()) as Record<string, unknown>;
  return { status: res.status, headers: res.headers, data };
}

test('Email/password auth, link-only presets, 10-preset cap, ownership, and admin takedown', async () => {
  const srv = await startTestServer();
  try {
    // 1. Health check & rayyan29.eu.org CORS header
    const health = await jsonFetch(srv.baseUrl, '/api/health', {
      origin: 'https://rayyan29.eu.org',
    });
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);
    assert.equal(health.headers.get('access-control-allow-origin'), 'https://rayyan29.eu.org');

    // Unlisted origin must NOT receive CORS allow header
    const badOrigin = await jsonFetch(srv.baseUrl, '/api/health', {
      origin: 'https://evil.example.com',
    });
    assert.equal(badOrigin.headers.get('access-control-allow-origin'), null);

    // 2. Weak password rejected
    const weakReg = await jsonFetch(srv.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'short', displayName: 'Alice' },
    });
    assert.equal(weakReg.status, 400);

    // 3. Valid registration -> 201 + Bearer token
    const reg1 = await jsonFetch(srv.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'StrongPassword1!', displayName: 'Alice' },
    });
    assert.equal(reg1.status, 201);
    const aliceToken = reg1.data.token as string;
    const aliceUser = reg1.data.user as { uid: string; role: string; email: string };
    assert.ok(aliceToken.length > 20);
    assert.equal(aliceUser.role, 'user');

    // Duplicate email -> 409
    const dupReg = await jsonFetch(srv.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { email: 'ALICE@example.com', password: 'StrongPassword1!', displayName: 'Alice2' },
    });
    assert.equal(dupReg.status, 409);

    // Wrong password -> 401; right password -> 200
    const badLogin = await jsonFetch(srv.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'WrongPassword1!' },
    });
    assert.equal(badLogin.status, 401);

    const goodLogin = await jsonFetch(srv.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'StrongPassword1!' },
    });
    assert.equal(goodLogin.status, 200);

    // 4. Unauthenticated protected endpoints return 401
    assert.equal((await jsonFetch(srv.baseUrl, '/api/presets/mine')).status, 401);
    assert.equal((await jsonFetch(srv.baseUrl, '/api/presets/admin')).status, 401);
    assert.equal(
      (
        await jsonFetch(srv.baseUrl, '/api/presets', {
          method: 'POST',
          body: {
            title: 'Unauth',
            description: '',
            isPublic: true,
            thumbnailDataUrl: '',
            config: buildSampleConfig(),
          },
        })
      ).status,
      401
    );

    // 5. Alice creates a public link-only preset & a private preset
    const pubCreate = await jsonFetch(srv.baseUrl, '/api/presets', {
      method: 'POST',
      token: aliceToken,
      body: {
        title: 'Summit VIP',
        description: 'Link-only badge',
        isPublic: true,
        thumbnailDataUrl: '',
        config: buildSampleConfig(),
      },
    });
    assert.equal(pubCreate.status, 201);
    const pubId = (pubCreate.data.preset as { id: string }).id;

    // Anyone with link can fetch public preset without auth
    const pubFetch = await jsonFetch(srv.baseUrl, `/api/presets/${pubId}`);
    assert.equal(pubFetch.status, 200);
    assert.equal((pubFetch.data.preset as { title: string }).title, 'Summit VIP');

    const privCreate = await jsonFetch(srv.baseUrl, '/api/presets', {
      method: 'POST',
      token: aliceToken,
      body: {
        title: 'Secret Draft',
        description: 'Private only',
        isPublic: false,
        thumbnailDataUrl: '',
        config: buildSampleConfig(),
      },
    });
    assert.equal(privCreate.status, 201);
    const privId = (privCreate.data.preset as { id: string }).id;

    // Anonymous fetch of private preset returns 404, owner fetch returns 200
    assert.equal((await jsonFetch(srv.baseUrl, `/api/presets/${privId}`)).status, 404);
    assert.equal(
      (await jsonFetch(srv.baseUrl, `/api/presets/${privId}`, { token: aliceToken })).status,
      200
    );

    // 6. Quota cap enforcement: Alice already has 2; create 8 more -> 10 total; 11th -> 403
    for (let i = 3; i <= 10; i++) {
      const res = await jsonFetch(srv.baseUrl, '/api/presets', {
        method: 'POST',
        token: aliceToken,
        body: {
          title: `Badge #${i}`,
          description: '',
          isPublic: true,
          thumbnailDataUrl: '',
          config: buildSampleConfig(),
        },
      });
      assert.equal(res.status, 201);
    }
    const eleventh = await jsonFetch(srv.baseUrl, '/api/presets', {
      method: 'POST',
      token: aliceToken,
      body: {
        title: 'Badge #11 Over Cap',
        description: '',
        isPublic: true,
        thumbnailDataUrl: '',
        config: buildSampleConfig(),
      },
    });
    assert.equal(eleventh.status, 403);

    // 7. Second standard user Bob cannot modify/delete Alice's preset or list admin queue
    const bobReg = await jsonFetch(srv.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { email: 'bob@example.com', password: 'BobPassword123!', displayName: 'Bob' },
    });
    assert.equal(bobReg.status, 201);
    const bobToken = bobReg.data.token as string;

    assert.equal(
      (await jsonFetch(srv.baseUrl, '/api/presets/admin', { token: bobToken })).status,
      403
    );
    assert.equal(
      (
        await jsonFetch(srv.baseUrl, `/api/presets/${pubId}`, {
          method: 'PUT',
          token: bobToken,
          body: {
            title: 'Hijacked',
            description: '',
            isPublic: true,
            thumbnailDataUrl: '',
            config: buildSampleConfig(),
          },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await jsonFetch(srv.baseUrl, `/api/presets/${pubId}`, {
          method: 'DELETE',
          token: bobToken,
        })
      ).status,
      403
    );

    // 8. Admin (fathray29@gmail.com) can list moderation queue & take down Alice's preset
    const adminReg = await jsonFetch(srv.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: {
        email: 'fathray29@gmail.com',
        password: 'AdminPassword123!',
        displayName: 'Rayyan Admin',
      },
    });
    assert.equal(adminReg.status, 201);
    assert.equal((adminReg.data.user as { role: string }).role, 'admin');
    const adminToken = adminReg.data.token as string;

    const adminList = await jsonFetch(srv.baseUrl, '/api/presets/admin', { token: adminToken });
    assert.equal(adminList.status, 200);
    assert.equal((adminList.data.presets as unknown[]).length, 10);

    const takedown = await jsonFetch(srv.baseUrl, `/api/presets/${pubId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(takedown.status, 200);
    assert.equal((await jsonFetch(srv.baseUrl, `/api/presets/${pubId}`)).status, 404);
  } finally {
    await srv.close();
  }
});
