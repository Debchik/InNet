import type { Contact } from './storage';

const GREETINGS = [
  'Привет',
  'Хей',
  'Салют',
  'Доброе утро',
  'Добрый вечер',
];

const MEETING_INVITES = [
  'Может, выпьем по кофе на неделе?',
  'Как насчёт короткого созвона?',
  'Давай пересечёмся на 15 минут — хочу услышать, что нового?',
  'Есть идея для совместного проекта, поделюсь при встрече.',
];

const FOLLOW_UPS = [
  'Поймал себя на мысли о нашей прошлой встрече',
  'Увидел сегодня штуку, которая напомнила о нашем разговоре',
  'Сделал заметку про наш предыдущий чат и хочу продолжить мысль',
  'Как поживает то, о чём мы говорили в прошлый раз?',
];

function pickRandom<T>(list: T[], seed?: number): T {
  if (!list.length) throw new Error('Cannot pick from empty list');
  if (typeof seed === 'number') {
    const index = Math.abs(Math.floor(seed)) % list.length;
    return list[index];
  }
  return list[Math.floor(Math.random() * list.length)];
}

function firstNameFrom(contactName: string): string {
  const trimmed = (contactName ?? '').trim();
  if (!trimmed) return 'друг';
  return trimmed.split(/\s+/)[0];
}

export type AiSuggestion = {
  id: string;
  text: string;
  tone: 'friendly' | 'catch-up' | 'meetup';
  title: string;
};

export function buildAiSuggestions(contact: Contact): AiSuggestion[] {
  const now = Date.now();
  const baseSeed = contact.id.split('-').reduce((acc, part) => acc + part.charCodeAt(0), 0);
  const name = firstNameFrom(contact.name);
  const lastInteraction = contact.lastUpdated || contact.connectedAt;
  const daysSince = Math.max(1, Math.round((now - lastInteraction) / (1000 * 60 * 60 * 24)));

  const friendly = `${pickRandom(GREETINGS, baseSeed)}, ${name}! Уже ${daysSince} дн. не пересекались, как ты?`;
  const followUp = `${pickRandom(FOLLOW_UPS, baseSeed + 3)}. Расскажешь, как продвигается?`;
  const invite = `${name}, ${pickRandom(MEETING_INVITES, baseSeed + 7)} ${daysSince > 14 ? 'Соскучился по апдейтам!' : ''}`.trim();

  return [
    {
      id: `${contact.id}-friendly`,
      text: friendly,
      tone: 'friendly',
      title: 'Мягкое касание',
    },
    {
      id: `${contact.id}-follow-up`,
      text: followUp,
      tone: 'catch-up',
      title: 'Продолжить разговор',
    },
    {
      id: `${contact.id}-meetup`,
      text: invite,
      tone: 'meetup',
      title: 'Предложить встречу',
    },
  ];
}
