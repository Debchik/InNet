'use client';
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import clsx from 'clsx';

/**
 * Компонент показывает QR-код с циклично меняющимися подписями
 * (например, "Интересы", "Ценности", "Увлечения").
 * QR указывает на временную заглушку — домашнюю страницу.
 * Потом заменишь qrValue на реальный URL профиля.
 */
const toggles = [
  { label: 'Интересы' },
  { label: 'Ценности' },
  { label: 'Увлечения' },
];

export default function QRCodeToggler() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % toggles.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // TODO: заменить на реальный URL профиля пользователя
  const qrValue = '/';

  return (
    <div className="flex flex-col items-center">
      <div className="p-4 bg-gray-800 rounded-2xl shadow-lg transition-transform duration-300 hover:scale-105">
        <QRCode
          value={qrValue}
          fgColor="#0D9488"
          bgColor="#0F172A"
          style={{ width: 220, height: 220 }}
        />
      </div>

      <div className="flex space-x-2 mt-4">
        {toggles.map((t, i) => (
          <span
            key={t.label}
            className={clsx(
              'px-3 py-1 rounded-full text-xs border transition-all duration-300',
              i === index
                ? 'bg-primary text-background border-primary shadow-md'
                : 'bg-gray-700 text-gray-300 border-gray-600'
            )}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
