import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import clsx from 'clsx';

/**
 * A component that cycles through a set of toggle labels every few seconds and
 * displays a QR code pointing at a placeholder URL. The toggles visually
 * indicate which group of facts would be shared. Currently the QR points
 * to the home page; replace with dynamic user profile links when backend
 * integration is ready.
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
      // randomly choose a new index different from current
      let next = Math.floor(Math.random() * toggles.length);
      while (next === index && toggles.length > 1) {
        next = Math.floor(Math.random() * toggles.length);
      }
      setIndex(next);
    }, 3000);
    return () => clearInterval(id);
  }, [index]);

  // The value encoded in the QR code. Replace with dynamic URL of
  // a generated profile when implementing backend. For now this
  // points back at the landing page.
  const qrValue = '/';

  return (
    <div className="flex flex-col items-center">
      <div className="p-4 bg-background rounded-lg shadow-lg">
  <QRCode
    value={qrValue}
    fgColor="#0D9488"
    bgColor="#0F172A"
    style={{ width: 220, height: 220 }}
  />
</div>

      <div className="flex space-x-1 mt-4">
        {toggles.map((t, i) => (
          <span
            key={t.label}
            className={clsx(
              'px-3 py-1 rounded-full text-xs border transition-colors',
              i === index
                ? 'bg-primary text-background border-primary'
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