import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  MAX_PRESETS_PER_ADMIN,
  MAX_PRESETS_PER_USER,
  PRESET_LIMITS,
  generatePresetId,
  sanitizeAuthorName,
  validateCardPresetPayload,
  type CardPresetRecord,
  type StudioPresetConfigData,
} from '../utils/presetSerializer';

const PRESETS_COLLECTION = 'presets';
const USERS_COLLECTION = 'users';
const ADMINS_COLLECTION = 'admins';

export interface AdminRoleStatus {
  isAdmin: boolean;
  canListAll: boolean;
}

function timestampToMs(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'object' && val !== null && 'toMillis' in val) {
    return (val as Timestamp).toMillis();
  }
  if (typeof val === 'number') return val;
  return 0;
}

function docToPresetRecord(id: string, data: DocumentData): CardPresetRecord | null {
  if (!data || typeof data !== 'object' || !data.config) return null;
  return {
    id,
    title: typeof data.title === 'string' ? data.title : 'Untitled Badge',
    description: typeof data.description === 'string' ? data.description : '',
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
    authorName: typeof data.authorName === 'string' ? data.authorName : 'Studio Creator',
    isPublic: Boolean(data.isPublic),
    thumbnailDataUrl: typeof data.thumbnailDataUrl === 'string' ? data.thumbnailDataUrl : '',
    config: data.config as StudioPresetConfigData,
    createdAtMs: timestampToMs(data.createdAt),
    updatedAtMs: timestampToMs(data.updatedAt),
  };
}

/**
 * Checks whether the signed-in user holds the bootstrapped admin email
 * or a Console-provisioned /admins/{uid} role document.
 */
export async function checkUserAdminRole(user: User | null): Promise<AdminRoleStatus> {
  if (!user || !user.emailVerified) {
    return { isAdmin: false, canListAll: false };
  }
  if ((user.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
    return { isAdmin: true, canListAll: true };
  }
  try {
    const snap = await getDoc(doc(db, ADMINS_COLLECTION, user.uid));
    if (snap.exists()) {
      return { isAdmin: true, canListAll: false };
    }
  } catch {
    // Non-admin or unavailable: treat cleanly as standard user
  }
  return { isAdmin: false, canListAll: false };
}

/**
 * Single-document link-only preset fetch (?preset=<id>).
 * Public presets can be opened on any device without signing in;
 * private drafts are readable only by their owner or an admin.
 */
export async function fetchPresetById(presetId: string): Promise<CardPresetRecord | null> {
  if (
    !presetId ||
    presetId.length > PRESET_LIMITS.idMaxLength ||
    !PRESET_LIMITS.idPattern.test(presetId)
  ) {
    return null;
  }

  const path = `${PRESETS_COLLECTION}/${presetId}`;
  try {
    const snap = await getDoc(doc(db, PRESETS_COLLECTION, presetId));
    if (!snap.exists()) return null;
    return docToPresetRecord(snap.id, snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Subscribes to the signed-in user's own saved presets (ownerId == uid).
 * Public scraping via collection-wide listing is blocked by firestore.rules.
 */
export function subscribeUserPresets(
  ownerId: string,
  onData: (presets: CardPresetRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, PRESETS_COLLECTION),
    where('ownerId', '==', ownerId),
    limit(100)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: CardPresetRecord[] = [];
      snapshot.forEach((docSnap) => {
        const rec = docToPresetRecord(docSnap.id, docSnap.data());
        if (rec) items.push(rec);
      });
      items.sort((a, b) => (b.updatedAtMs || b.createdAtMs) - (a.updatedAtMs || a.createdAtMs));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, PRESETS_COLLECTION);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/**
 * Bootstrapped-admin-only subscription listing presets across all users for moderation & takedown.
 */
export function subscribeAdminAllPresets(
  onData: (presets: CardPresetRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, PRESETS_COLLECTION), limit(60));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: CardPresetRecord[] = [];
      snapshot.forEach((docSnap) => {
        const rec = docToPresetRecord(docSnap.id, docSnap.data());
        if (rec) items.push(rec);
      });
      items.sort((a, b) => (b.updatedAtMs || b.createdAtMs) - (a.updatedAtMs || a.createdAtMs));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, PRESETS_COLLECTION);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/**
 * Subscribes to the user's atomic preset quota document (/users/{userId}).
 */
export function subscribeUserQuota(
  userId: string,
  onCount: (count: number) => void
): Unsubscribe {
  const ref = doc(db, USERS_COLLECTION, userId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onCount(0);
        return;
      }
      const data = snap.data();
      const count = typeof data?.presetCount === 'number' && Number.isFinite(data.presetCount)
        ? Math.max(0, Math.floor(data.presetCount))
        : 0;
      onCount(count);
    },
    () => {
      // Fallback silently to 0; server rules enforce exact count atomically
      onCount(0);
    }
  );
}

export interface CreatePresetInput {
  title: string;
  description: string;
  isPublic: boolean;
  thumbnailDataUrl: string;
  config: StudioPresetConfigData;
}

/**
 * Atomically creates /presets/{presetId} and increments /users/{uid}.presetCount in a single
 * Firestore writeBatch, enforcing the per-user preset cap server-side via getAfter()/existsAfter().
 */
export async function createUserPreset(
  input: CreatePresetInput,
  isAdmin = false
): Promise<CardPresetRecord> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in with Google to save and share presets.');
  }

  const maxAllowed = isAdmin ? MAX_PRESETS_PER_ADMIN : MAX_PRESETS_PER_USER;
  const userQuotaRef = doc(db, USERS_COLLECTION, user.uid);
  let quotaSnap;
  try {
    quotaSnap = await getDoc(userQuotaRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${USERS_COLLECTION}/${user.uid}`);
  }

  const currentCount = quotaSnap.exists()
    ? Math.max(0, Math.floor(Number(quotaSnap.data()?.presetCount ?? 0)))
    : 0;

  if (currentCount >= maxAllowed) {
    throw new Error(
      `Preset limit reached (${currentCount}/${maxAllowed}). Delete an older preset before saving a new one.`
    );
  }

  const presetId = generatePresetId();
  const title = input.title.trim().slice(0, PRESET_LIMITS.titleMaxLength);
  const description = input.description.trim().slice(0, PRESET_LIMITS.descriptionMaxLength);
  const authorName = sanitizeAuthorName(user.displayName);

  const payload = {
    title,
    description,
    ownerId: user.uid,
    authorName,
    isPublic: Boolean(input.isPublic),
    thumbnailDataUrl: input.thumbnailDataUrl || '',
    config: input.config,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Validate strictly against firebase-blueprint.json limits before hitting Firestore
  const validation = validateCardPresetPayload(payload);
  if (!validation.valid) {
    throw new Error(validation.errors[0] || 'Preset data failed validation.');
  }

  const path = `${PRESETS_COLLECTION}/${presetId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, PRESETS_COLLECTION, presetId), payload);

    const nextQuotaPayload = {
      presetCount: currentCount + 1,
      lastPresetId: presetId,
      updatedAt: serverTimestamp(),
    };
    if (quotaSnap.exists()) {
      batch.update(userQuotaRef, nextQuotaPayload);
    } else {
      batch.set(userQuotaRef, nextQuotaPayload);
    }

    await batch.commit();
    const now = Date.now();
    return {
      id: presetId,
      title,
      description,
      ownerId: user.uid,
      authorName,
      isPublic: Boolean(input.isPublic),
      thumbnailDataUrl: input.thumbnailDataUrl || '',
      config: input.config,
      createdAtMs: now,
      updatedAtMs: now,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserPreset(
  presetId: string,
  input: CreatePresetInput
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in with Google to update presets.');
  }

  const title = input.title.trim().slice(0, PRESET_LIMITS.titleMaxLength);
  const description = input.description.trim().slice(0, PRESET_LIMITS.descriptionMaxLength);

  const validation = validateCardPresetPayload({
    title,
    description,
    ownerId: user.uid,
    authorName: sanitizeAuthorName(user.displayName),
    isPublic: Boolean(input.isPublic),
    thumbnailDataUrl: input.thumbnailDataUrl || '',
    config: input.config,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (!validation.valid) {
    throw new Error(validation.errors[0] || 'Preset update failed validation.');
  }

  const path = `${PRESETS_COLLECTION}/${presetId}`;
  try {
    await updateDoc(doc(db, PRESETS_COLLECTION, presetId), {
      title,
      description,
      isPublic: Boolean(input.isPublic),
      thumbnailDataUrl: input.thumbnailDataUrl || '',
      config: input.config,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Deletes a preset (owner delete or admin takedown) and atomically decrements
 * the creator's /users/{ownerId}.presetCount when a quota doc exists.
 */
export async function deleteUserPreset(presetId: string, ownerId?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in with Google to delete presets.');
  }

  const targetOwnerId = ownerId || user.uid;
  const path = `${PRESETS_COLLECTION}/${presetId}`;
  const presetRef = doc(db, PRESETS_COLLECTION, presetId);

  try {
    const quotaRef = doc(db, USERS_COLLECTION, targetOwnerId);
    let quotaSnap = null;
    try {
      quotaSnap = await getDoc(quotaRef);
    } catch {
      quotaSnap = null;
    }

    const currentCount =
      quotaSnap && quotaSnap.exists()
        ? Math.max(0, Math.floor(Number(quotaSnap.data()?.presetCount ?? 0)))
        : 0;

    if (quotaSnap && quotaSnap.exists() && currentCount >= 1) {
      const batch = writeBatch(db);
      batch.delete(presetRef);
      batch.update(quotaRef, {
        presetCount: currentCount - 1,
        lastPresetId: presetId,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await deleteDoc(presetRef);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
