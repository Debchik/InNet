const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (Number.isNaN(diff)) {
    return new Date(timestamp).toLocaleString();
  }

  if (diff < MINUTE) {
    return 'только что';
  }
  if (diff < HOUR) {
    const minutes = Math.round(diff / MINUTE);
    return pluralize(minutes, 'минуту', 'минуты', 'минут') + ' назад';
  }
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR);
    return pluralize(hours, 'час', 'часа', 'часов') + ' назад';
  }
  if (diff < 7 * DAY) {
    const days = Math.round(diff / DAY);
    return pluralize(days, 'день', 'дня', 'дней') + ' назад';
  }
  return new Date(timestamp).toLocaleDateString();
}

function pluralize(value: number, one: string, two: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} ${two}`;
  return `${value} ${many}`;
}
