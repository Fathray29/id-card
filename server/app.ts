import express, { type NextFunction, type Request, type Response } from 'express';
import {
  AuthRateLimiter,
  extractBearerToken,
  generateUserId,
  hashPassword,
  isAdminEmail,
  isValidEmail,
  normalizeEmail,
  signSessionToken,
  validatePassword,
  verifyPassword,
  verifySessionToken,
} from './auth.ts';
import { getPresetRepository, type DbUser, type PresetRepository } from './db.ts';
import {
  MAX_PRESETS_PER_ADMIN,
  MAX_PRESETS_PER_USER,
  PRESET_LIMITS,
  generatePresetId,
  isCustomDomainHost,
  sanitizeAuthorName,
  validatePresetMutationInput,
  type CardPresetRecord,
  type StudioPresetConfigData,
} from '../src/utils/presetValidation.ts';

export interface PublicUserDto {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
}

interface AuthenticatedRequest extends Request {
  authUser?: DbUser;
}

function toPublicUser(user: DbUser): PublicUserDto {
  return {
    uid: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function isAllowedOrigin(origin: string, hostHeader: string | undefined): boolean {
  try {
    const parsed = new URL(origin);
    if (isCustomDomainHost(parsed.hostname)) return true;
    if (hostHeader && parsed.host.toLowerCase() === hostHeader.toLowerCase()) return true;
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true;
    if (parsed.hostname.endsWith('.vercel.app') || parsed.hostname.endsWith('.run.app')) return true;
    return false;
  } catch {
    return false;
  }
}

export function createApiApp(repoOverride?: PresetRepository): express.Express {
  const app = express();
  const repo = repoOverride || getPresetRepository();
  const authLimiter = new AuthRateLimiter(30, 15 * 60 * 1000);

  app.set('trust proxy', 1);

  // Baseline security headers & origin validation (no wildcard CORS on authenticated endpoints)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const origin = req.headers.origin;
    if (typeof origin === 'string' && isAllowedOrigin(origin, req.headers.host)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Strict JSON body limit (enough for compressed base64 card/lanyard layers, bounded against DoS)
  app.use(express.json({ limit: '1mb' }));

  // Helper to resolve optional or required authenticated user from Bearer token
  async function resolveAuthUser(req: Request): Promise<DbUser | null> {
    const token = extractBearerToken(req.headers.authorization);
    const claims = verifySessionToken(token);
    if (!claims) return null;
    const user = await repo.findUserById(claims.uid);
    return user;
  }

  async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await resolveAuthUser(req);
      if (!user) {
        res.status(401).json({ error: 'Authentication required. Please sign in.' });
        return;
      }
      req.authUser = user;
      next();
    } catch {
      res.status(500).json({ error: 'Authentication verification failed.' });
    }
  }

  // Health endpoint
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      await repo.init();
      res.json({ ok: true, driver: repo.driver });
    } catch {
      res.status(500).json({ ok: false, error: 'Database unavailable.' });
    }
  });

  // Email & Password Registration
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const ipKey = `register:${getClientIp(req)}`;
      if (!authLimiter.check(ipKey)) {
        res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const rawEmail = typeof body?.email === 'string' ? body.email : '';
      const rawPassword = typeof body?.password === 'string' ? body.password : '';
      const rawDisplayName = typeof body?.displayName === 'string' ? body.displayName : '';

      const email = normalizeEmail(rawEmail);
      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }

      const passwordErr = validatePassword(rawPassword);
      if (passwordErr) {
        res.status(400).json({ error: passwordErr });
        return;
      }

      const existing = await repo.findUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
        return;
      }

      const displayName = sanitizeAuthorName(rawDisplayName || email.split('@')[0]);
      const passwordHash = await hashPassword(rawPassword);
      const role: 'user' | 'admin' = isAdminEmail(email) ? 'admin' : 'user';
      const user: DbUser = {
        id: generateUserId(),
        email,
        displayName,
        passwordHash,
        role,
        createdAtMs: Date.now(),
      };

      await repo.createUser(user);
      const token = signSessionToken({
        uid: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      });

      res.status(201).json({
        token,
        user: toPublicUser(user),
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === '23505' || String(err).includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
        return;
      }
      console.error('Register error:', err);
      res.status(500).json({ error: 'Unable to create account right now.' });
    }
  });

  // Email & Password Sign In
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const ipKey = `login:${getClientIp(req)}`;
      if (!authLimiter.check(ipKey)) {
        res.status(429).json({ error: 'Too many sign-in attempts. Please wait a few minutes.' });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const rawEmail = typeof body?.email === 'string' ? body.email : '';
      const rawPassword = typeof body?.password === 'string' ? body.password : '';
      const email = normalizeEmail(rawEmail);

      if (!isValidEmail(email) || !rawPassword) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const user = await repo.findUserByEmail(email);
      const ok = await verifyPassword(rawPassword, user?.passwordHash ?? null);
      if (!user || !ok) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const token = signSessionToken({
        uid: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      });

      res.json({
        token,
        user: toPublicUser(user),
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Unable to sign in right now.' });
    }
  });

  // Verify current session
  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    res.json({ user: toPublicUser(user) });
  });

  // List authenticated user's own presets + quota count (anti-scraping: owner-only)
  app.get('/api/presets/mine', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const [presets, quotaCount] = await Promise.all([
        repo.listPresetsByOwner(user.id, 100),
        repo.countPresetsByOwner(user.id),
      ]);
      const quotaMax = user.role === 'admin' ? MAX_PRESETS_PER_ADMIN : MAX_PRESETS_PER_USER;
      res.json({ presets, quotaCount, quotaMax });
    } catch (err) {
      console.error('List mine error:', err);
      res.status(500).json({ error: 'Unable to load your saved presets.' });
    }
  });

  // Admin moderation list (admin role only)
  app.get('/api/presets/admin', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      if (user.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required.' });
        return;
      }
      const presets = await repo.listAllPresets(60);
      res.json({ presets });
    } catch (err) {
      console.error('Admin list error:', err);
      res.status(500).json({ error: 'Unable to load moderation queue.' });
    }
  });

  // Link-only single preset fetch (?preset=<id>)
  app.get('/api/presets/:id', async (req: Request, res: Response) => {
    try {
      const presetId = String(req.params.id || '').trim();
      if (
        !presetId ||
        presetId.length > PRESET_LIMITS.idMaxLength ||
        !PRESET_LIMITS.idPattern.test(presetId)
      ) {
        res.status(400).json({ error: 'Invalid preset ID.' });
        return;
      }

      const preset = await repo.getPresetById(presetId);
      if (!preset) {
        res.status(404).json({ error: 'Preset not found.' });
        return;
      }

      if (!preset.isPublic) {
        const caller = await resolveAuthUser(req);
        if (!caller || (caller.id !== preset.ownerId && caller.role !== 'admin')) {
          res.status(404).json({ error: 'Preset not found or is private.' });
          return;
        }
      }

      res.json({ preset });
    } catch (err) {
      console.error('Fetch preset error:', err);
      res.status(500).json({ error: 'Unable to load preset.' });
    }
  });

  // Create preset (enforces strict validation & per-user cap server-side)
  app.post('/api/presets', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const maxAllowed = user.role === 'admin' ? MAX_PRESETS_PER_ADMIN : MAX_PRESETS_PER_USER;
      const currentCount = await repo.countPresetsByOwner(user.id);
      if (currentCount >= maxAllowed) {
        res.status(403).json({
          error: `Preset limit reached (${currentCount}/${maxAllowed}). Delete an older preset before saving a new one.`,
        });
        return;
      }

      const validation = validatePresetMutationInput(req.body);
      if (!validation.valid) {
        res.status(400).json({ error: validation.errors[0] || 'Invalid preset payload.' });
        return;
      }

      const body = req.body as {
        title: string;
        description: string;
        isPublic: boolean;
        thumbnailDataUrl: string;
        config: StudioPresetConfigData;
      };

      const now = Date.now();
      const record: CardPresetRecord = {
        id: generatePresetId(),
        title: body.title.trim().slice(0, PRESET_LIMITS.titleMaxLength),
        description: body.description.trim().slice(0, PRESET_LIMITS.descriptionMaxLength),
        ownerId: user.id,
        authorName: sanitizeAuthorName(user.displayName),
        isPublic: Boolean(body.isPublic),
        thumbnailDataUrl: body.thumbnailDataUrl || '',
        config: body.config,
        createdAtMs: now,
        updatedAtMs: now,
      };

      await repo.createPreset(record);
      res.status(201).json({
        preset: record,
        quotaCount: currentCount + 1,
        quotaMax: maxAllowed,
      });
    } catch (err) {
      console.error('Create preset error:', err);
      res.status(500).json({ error: 'Unable to save preset right now.' });
    }
  });

  // Update existing preset (owner only)
  app.put('/api/presets/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const presetId = String(req.params.id || '').trim();
      if (
        !presetId ||
        presetId.length > PRESET_LIMITS.idMaxLength ||
        !PRESET_LIMITS.idPattern.test(presetId)
      ) {
        res.status(400).json({ error: 'Invalid preset ID.' });
        return;
      }

      const existing = await repo.getPresetById(presetId);
      if (!existing) {
        res.status(404).json({ error: 'Preset not found.' });
        return;
      }
      if (existing.ownerId !== user.id) {
        res.status(403).json({ error: 'You can only update your own presets.' });
        return;
      }

      const validation = validatePresetMutationInput(req.body);
      if (!validation.valid) {
        res.status(400).json({ error: validation.errors[0] || 'Invalid preset payload.' });
        return;
      }

      const body = req.body as {
        title: string;
        description: string;
        isPublic: boolean;
        thumbnailDataUrl: string;
        config: StudioPresetConfigData;
      };
      const updatedAtMs = Date.now();
      const title = body.title.trim().slice(0, PRESET_LIMITS.titleMaxLength);
      const description = body.description.trim().slice(0, PRESET_LIMITS.descriptionMaxLength);

      await repo.updatePreset(presetId, user.id, {
        title,
        description,
        isPublic: Boolean(body.isPublic),
        thumbnailDataUrl: body.thumbnailDataUrl || '',
        config: body.config,
        updatedAtMs,
      });

      res.json({
        preset: {
          ...existing,
          title,
          description,
          isPublic: Boolean(body.isPublic),
          thumbnailDataUrl: body.thumbnailDataUrl || '',
          config: body.config,
          updatedAtMs,
        },
      });
    } catch (err) {
      console.error('Update preset error:', err);
      res.status(500).json({ error: 'Unable to update preset right now.' });
    }
  });

  // Delete preset (owner delete OR admin takedown)
  app.delete('/api/presets/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const presetId = String(req.params.id || '').trim();
      if (
        !presetId ||
        presetId.length > PRESET_LIMITS.idMaxLength ||
        !PRESET_LIMITS.idPattern.test(presetId)
      ) {
        res.status(400).json({ error: 'Invalid preset ID.' });
        return;
      }

      const existing = await repo.getPresetById(presetId);
      if (!existing) {
        res.status(404).json({ error: 'Preset not found.' });
        return;
      }

      if (existing.ownerId !== user.id && user.role !== 'admin') {
        res.status(403).json({ error: 'You do not have permission to delete this preset.' });
        return;
      }

      await repo.deletePreset(presetId);
      const quotaCount = await repo.countPresetsByOwner(user.id);
      res.json({ deleted: true, quotaCount });
    } catch (err) {
      console.error('Delete preset error:', err);
      res.status(500).json({ error: 'Unable to delete preset right now.' });
    }
  });

  return app;
}
