import { PLAN_ENTITLEMENTS } from '../lib/plans';
import {
  TOKEN_PACKS,
  TOKEN_ACTIONS_LIST,
  getTokenActionMeta,
  formatTokenPrice,
  type TokenPack,
} from '../lib/tokens';

export type TariffPlan = {
  id: string;
  name: string;
  description: string;
  price: string;
  billingPeriod: string;
  features: string[];
  cta: string;
  badge?: string;
  note?: string;
};

const FREE_CONTACT_LIMIT = PLAN_ENTITLEMENTS.free.contactLimit ?? 0;
const FREE_FACT_GROUP_LIMIT = PLAN_ENTITLEMENTS.free.factGroupLimit ?? 0;
const FREE_FACTS_PER_GROUP = PLAN_ENTITLEMENTS.free.factsPerGroupLimit ?? 0;

const EXTRA_CONTACT_RULE = getTokenActionMeta('extra-contact');
const EXTRA_FACT_GROUP_RULE = getTokenActionMeta('extra-fact-group');
const EXTRA_FACT_RULE = getTokenActionMeta('extra-fact');

function buildPackFeatures(pack: TokenPack): string[] {
  const totalTokens = pack.tokens + pack.bonusTokens;
  const approxContacts =
    EXTRA_CONTACT_RULE.tokens > 0 ? Math.floor(totalTokens / EXTRA_CONTACT_RULE.tokens) : totalTokens;
  const bonusLabel = pack.bonusTokens > 0 ? `+${pack.bonusTokens} бонусов` : 'без бонусов';
  return [
    `${totalTokens} токенов (${bonusLabel}) поступают мгновенно на баланс`,
    `≈${approxContacts} новых контактов сверх лимита (по ${EXTRA_CONTACT_RULE.tokens} токена за контакт)`,
    `Новая группа фактов стоит ${EXTRA_FACT_GROUP_RULE.tokens} токенов`,
    `Новый факт сверх лимита в группе — ${EXTRA_FACT_RULE.tokens} токен`,
  ];
}

const tokenPlanCards: TariffPlan[] = TOKEN_PACKS.map((pack) => {
  const totalTokens = pack.tokens + pack.bonusTokens;
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    price: `${pack.priceRub} ₽`,
    billingPeriod: 'разовая покупка',
    features: buildPackFeatures(pack),
    cta: `Пополнить ${totalTokens} токенов`,
    badge: pack.bestFor,
    note: formatTokenPrice(pack.priceRub, totalTokens),
  };
});

const freePlan: TariffPlan = {
  id: 'free',
  name: 'InNet Start',
  description: 'Проверяйте гипотезы бесплатно: у вас всегда есть 20 контактов и 3 набора фактов.',
  price: '0 ₽',
  billingPeriod: 'навсегда',
  features: [
    `${FREE_CONTACT_LIMIT} контактов первого круга входят в бесплатную квоту`,
    `${FREE_FACT_GROUP_LIMIT} набора фактов + по ${FREE_FACTS_PER_GROUP} заметок в каждом`,
    'Динамический QR и ручное добавление заметок без ограничений',
    'Можно докупать токены и масштабироваться без подписки',
  ],
  cta: 'Создать профиль бесплатно',
};

/**
 * Тарифная сетка, которая отображается на лендинге и в юридических документах.
 * Значения по умолчанию можно безопасно заменить на актуальные перед публикацией.
 */
export const tariffPlans: TariffPlan[] = [freePlan, ...tokenPlanCards];

export const tokenEconomyExplainer = {
  title: 'Экономика токенов InNet',
  freeAllowance: {
    contacts: FREE_CONTACT_LIMIT,
    factGroups: FREE_FACT_GROUP_LIMIT,
    factsPerGroup: FREE_FACTS_PER_GROUP,
  },
  actions: TOKEN_ACTIONS_LIST.map((action) => ({
    label: action.label,
    tokens: action.tokens,
    approxRub: action.approxRub,
    description: action.description,
  })),
  notes: [
    'Токены списываются автоматически при действиях сверх бесплатных лимитов.',
    'Баланс хранится локально и синхронизируется вместе с остальными данными.',
    'В следующем релизе подключим YooKassa, пока используем заглушку и тестовые значения.',
  ],
};

export const digitalDeliveryInfo = {
  title: 'Как вы получаете доступ',
  items: [
    'Сервис полностью цифровой: после покупки токенов мы мгновенно пополняем баланс и показываем уведомление.',
    'Доступ к новым действиям появляется сразу — перезагружать страницу не нужно.',
    'Чеки и документы придут на почту после подключения настоящего эквайринга (сейчас демо-режим).',
    'Автопродлений нет: покупаете токены по мере необходимости и тратите их в своём темпе.',
  ],
};

export const legalContactInfo = {
  supportEmail: 'InnetHelp@gmail.com',
  phone: '+7 (925) 940-89-45',
  legalHolderFullName: 'Павшинский Даниил Дмитриевич',
  inn: '525716197219',
  workingHours: 'Пн–Пт с 10:00 до 19:00 (МСК)',
};

export const publicOfferMeta = {
  documentTitle: 'Публичная оферта на использование сервиса InNet',
  lastUpdated: '15.03.2026',
};

export const companyDescription = {
  brandName: 'InNet',
  shortAbout:
    'InNet делает нетворкинг таким же системным, как CRM: платите токенами только за рост базы и держите нужные связи тёплыми.',
};
