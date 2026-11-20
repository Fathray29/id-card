import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  PRESET_LIMITS,
  generatePresetId,
  sanitizeAuthorName,
  validateCardPresetPayload,
  type CardPresetRecord,
  type StudioPresetConfigData,
} from '../utils/presetSerializer';

const PRESETS_COLLECTION = 'presets';

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

export function subscribePublicPresets(
  onData: (presets: CardPresetRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, PRESETS_COLLECTION),
    where('isPublic', '==', true),
    limit(36)
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

export function subscribeUserPresets(
  ownerId: string,
  onData: (presets: CardPresetRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, PRESETS_COLLECTION),
    where('ownerId', '==', ownerId),
    limit(36)
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

export interface CreatePresetInput {
  title: string;
  description: string;
  isPublic: boolean;
  thumbnailDataUrl: string;
  config: StudioPresetConfigData;
}

export async function createUserPreset(input: CreatePresetInput): Promise<CardPresetRecord> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in with Google to save and share presets.');
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
    await setDoc(doc(db, PRESETS_COLLECTION, presetId), payload);
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

export async function deleteUserPreset(presetId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in with Google to delete presets.');
  }
  const path = `${PRESETS_COLLECTION}/${presetId}`;
  try {
    await deleteDoc(doc(db, PRESETS_COLLECTION, presetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
