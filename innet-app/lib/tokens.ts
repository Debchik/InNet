export type TokenActionId = 'extra-contact' | 'extra-fact-group' | 'extra-fact';

export type TokenActionMeta = {
  id: TokenActionId;
  label: string;
  description: string;
  tokens: number;
  approxRub: number;
};

export type TokenPack = {
  id: string;
  name: string;
  description: string;
  tokens: number;
  bonusTokens: number;
  priceRub: number;
  bestFor: string;
};

export type TokenPurchaseReceipt =
  | { ok: true; pack: TokenPack; creditedTokens: number; balance: number }
  | { ok: false; message: string };

export type TokenChargeResult =
  | { ok: true; action: TokenActionId; cost: number; balance: number }
  | { ok: false; action: TokenActionId; cost: number; balance: number; deficit: number };

const TOKEN_STORAGE_KEY = 'innet_token_balance';
const TOKEN_BALANCE_EVENT = 'innet-token-balance-updated';
const DEFAULT_TOKEN_BALANCE = 12;

const TOKEN_ACTIONS: TokenActionMeta[] = [
  {
    id: 'extra-contact',
    label: 'Новый контакт сверх лимита',
    description: 'Списываемся, когда бесплатные 20 контактов закончились.',
    tokens: 2,
    approxRub: 10,
  },
  {
    id: 'extra-fact-group',
    label: 'Новый набор фактов',
    description: 'Открывает дополнительную группу сверх базовых трёх.',
    tokens: 6,
    approxRub: 30,
  },
  {
    id: 'extra-fact',
    label: 'Факт сверх лимита в группе',
    description: 'Добавляет одну заметку поверх 5 бесплатных в группе.',
    tokens: 1,
    approxRub: 5,
  },
];

export const TOKEN_ACTION_MAP: Record<TokenActionId, TokenActionMeta> = TOKEN_ACTIONS.reduce(
  (acc, action) => {
    acc[action.id] = action;
    return acc;
  },
  {} as Record<TokenActionId, TokenActionMeta>
);

export const TOKEN_ACTIONS_LIST = TOKEN_ACTIONS;

export const TOKEN_PACKS: TokenPack[] = [
  {
    id: 'starter-40',
    name: 'Стартовый 40',
    description: 'Первые гипотезы: хватит на ~10 дополнительных контактов.',
    tokens: 40,
    bonusTokens: 0,
    priceRub: 190,
    bestFor: 'точечные мероприятия',
  },
  {
    id: 'networker-120',
    name: 'Сетевой 120',
    description: '+10% бонусов, если знакомитесь каждую неделю.',
    tokens: 120,
    bonusTokens: 12,
    priceRub: 490,
    bestFor: 'регулярные питчи и демо',
  },
  {
    id: 'scale-360',
    name: 'Агент влияния 360',
    description: 'Самая низкая цена токена: хватит на квартал нетворкинга.',
    tokens: 360,
    bonusTokens: 60,
    priceRub: 1190,
    bestFor: 'ивенты, туры и активные продажи',
  },
];

let memoryBalance = DEFAULT_TOKEN_BALANCE;

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function dispatchBalanceEvent(next: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOKEN_BALANCE_EVENT, { detail: { balance: next } }));
}

function normalizeBalance(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function getTokenBalance(): number {
  const storage = getStorage();
  if (!storage) {
    return memoryBalance;
  }
  const raw = storage.getItem(TOKEN_STORAGE_KEY);
  if (raw == null) {
    storage.setItem(TOKEN_STORAGE_KEY, String(DEFAULT_TOKEN_BALANCE));
    return DEFAULT_TOKEN_BALANCE;
  }
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    storage.setItem(TOKEN_STORAGE_KEY, String(DEFAULT_TOKEN_BALANCE));
    return DEFAULT_TOKEN_BALANCE;
  }
  return normalizeBalance(parsed);
}

export function setTokenBalance(next: number): number {
  const normalized = normalizeBalance(next);
  const storage = getStorage();
  if (!storage) {
    memoryBalance = normalized;
    return normalized;
  }
  storage.setItem(TOKEN_STORAGE_KEY, String(normalized));
  dispatchBalanceEvent(normalized);
  return normalized;
}

export function addTokens(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    return getTokenBalance();
  }
  const current = getTokenBalance();
  return setTokenBalance(current + Math.floor(amount));
}

export function canAffordAction(action: TokenActionId, quantity = 1): boolean {
  const rule = TOKEN_ACTION_MAP[action];
  if (!rule) return false;
  const cost = Math.max(1, rule.tokens * Math.max(1, quantity));
  return getTokenBalance() >= cost;
}

export function spendTokensForAction(action: TokenActionId, quantity = 1): TokenChargeResult {
  const rule = TOKEN_ACTION_MAP[action];
  if (!rule) {
    return { ok: false, action, cost: 0, balance: getTokenBalance(), deficit: 0 };
  }
  const units = Math.max(1, quantity);
  const cost = rule.tokens * units;
  const current = getTokenBalance();
  if (current < cost) {
    return { ok: false, action, cost, balance: current, deficit: cost - current };
  }
  const balance = setTokenBalance(current - cost);
  return { ok: true, action, cost, balance };
}

export function subscribeToTokenBalance(listener: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const handler = () => listener();
  const storageHandler = (event: StorageEvent) => {
    if (!event.key || event.key === TOKEN_STORAGE_KEY) {
      listener();
    }
  };
  window.addEventListener(TOKEN_BALANCE_EVENT, handler as EventListener);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(TOKEN_BALANCE_EVENT, handler as EventListener);
    window.removeEventListener('storage', storageHandler);
  };
}

export function getTokenActionMeta(action: TokenActionId): TokenActionMeta {
  return TOKEN_ACTION_MAP[action];
}

export function simulateTokenPurchase(packId: string): TokenPurchaseReceipt {
  const pack = TOKEN_PACKS.find((item) => item.id === packId);
  if (!pack) {
    return { ok: false, message: 'Неизвестный пакет токенов' };
  }
  const creditedTokens = pack.tokens + pack.bonusTokens;
  const balance = addTokens(creditedTokens);
  return { ok: true, pack, creditedTokens, balance };
}

export function formatTokenPrice(priceRub: number, tokens: number): string {
  if (!tokens) return '—';
  const value = priceRub / tokens;
  return `${value.toFixed(1)} ₽/токен`;
}
