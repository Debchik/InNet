import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export type QuickEngagementRecord = {
  id: string;
  createdAt: string;
  mode: 'existing' | 'quick-signup';
  contactId: string | null;
  receiver: { email?: string | null; name?: string | null };
  shareOwner: { id?: string | null; name?: string | null };
  groupsSummary: Array<{ id: string; name: string; facts: number }>;
};

const DATA_FILE = path.join(process.cwd(), 'data', 'quick-engagements.json');
let writeQueue: Promise<void> = Promise.resolve();

export function appendQuickEngagement(
  record: Omit<QuickEngagementRecord, 'id' | 'createdAt'>
): Promise<void> {
  const entry: QuickEngagementRecord = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    ...record,
  };

  writeQueue = writeQueue.then(() => persistEntry(entry)).catch((error) => {
    console.error('[quick-engagement-store] Failed to append entry', error);
  });

  return writeQueue;
}

async function persistEntry(entry: QuickEngagementRecord): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });

  let current: QuickEngagementRecord[] = [];
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      current = parsed as QuickEngagementRecord[];
    }
  } catch (error) {
    if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[quick-engagement-store] Failed to read existing entries', error);
    }
  }

  current.push(entry);
  await fs.writeFile(DATA_FILE, JSON.stringify(current, null, 2), 'utf8');
}

