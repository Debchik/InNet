import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import QRCode from 'react-qr-code'; // ✅ исправлено: импорт из react-qr-code
import { loadFactGroups, createContact, saveContacts, loadContacts } from '../../lib/storage';
import { v4 as uuidv4 } from 'uuid';
import dynamic from 'next/dynamic';

// ✅ исправленный динамический импорт для react-qr-scanner
const QrReader = dynamic(
  async () => {
    const mod = await import('react-qr-scanner');
    return mod.default || mod.QrReader || mod;
  },
  { ssr: false }
);

export default function QRPage() {
  const [groups, setGroups] = useState(loadFactGroups());
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<'generate' | 'scan'>('generate');
  const [scanResult, setScanResult] = useState<string>('');
  const [scannedName, setScannedName] = useState<string>('');
  const [scannedGroups, setScannedGroups] = useState<string[]>([]);

  useEffect(() => {
    setGroups(loadFactGroups());
  }, []);

  const toggleGroup = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const qrValue = selected.length > 0 ? `innet-share:${selected.join(',')}` : 'innet-share:';

  const handleScan = (data: any) => {
    if (data && data.text) {
      const result = data.text;
      if (result === scanResult) return;
      setScanResult(result);
      try {
        if (result.startsWith('innet-share')) {
          const [, payload] = result.split(':');
          const ids = payload.split(',').filter(Boolean);
          setScannedName('Новый контакт');
          setScannedGroups(ids);
        }
      } catch (e) {
        console.warn('Failed to parse QR code', e);
      }
    }
  };

  const handleError = (err: any) => {
    console.error(err);
  };

  const addContact = () => {
    if (!scannedName) return;
    const contacts = loadContacts();
    const newContact = createContact(scannedName, scannedGroups);
    saveContacts([...contacts, newContact]);
    setScanResult('');
    setScannedName('');
    setScannedGroups([]);
    alert('Контакт добавлен в вашу сеть');
  };

  return (
    <Layout>
      <div className="px-4 py-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">QR‑коды</h1>
        <div className="flex mb-6 space-x-4">
          <button
            className={`px-4 py-2 rounded-md ${mode === 'generate' ? 'bg-primary text-background' : 'bg-gray-700 text-gray-300'}`}
            onClick={() => setMode('generate')}
          >
            Сгенерировать
          </button>
          <button
            className={`px-4 py-2 rounded-md ${mode === 'scan' ? 'bg-primary text-background' : 'bg-gray-700 text-gray-300'}`}
            onClick={() => setMode('scan')}
          >
            Сканировать
          </button>
        </div>

        {mode === 'generate' && (
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-xl font-semibold mb-4">Выберите группы для обмена</h2>
              {groups.length === 0 && (
                <p className="text-sm text-gray-400 mb-4">У вас ещё нет групп фактов. Добавьте их на странице «Мои факты».</p>
              )}
              <ul className="space-y-2">
                {groups.map((g) => (
                  <li key={g.id} className="flex items-center justify-between bg-gray-800 p-3 rounded-md">
                    <span className="flex-1" style={{ color: g.color }}>{g.name}</span>
                    <input
                      type="checkbox"
                      checked={selected.includes(g.id)}
                      onChange={() => toggleGroup(g.id)}
                      className="form-checkbox h-4 w-4 text-primary rounded"
                    />
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col items-center">
              <div className="bg-gray-800 p-6 rounded-xl shadow">
                <QRCode
                  value={qrValue}
                  fgColor="#0D9488"
                  bgColor="#0F172A"
                  style={{ width: 256, height: 256 }}
                />
              </div>
              <p className="mt-4 text-sm text-gray-400 text-center">Покажите этот QR‑код другому человеку, чтобы поделиться выбранными фактами.</p>
            </div>
          </div>
        )}

        {mode === 'scan' && (
          <div className="flex flex-col items-center">
            <div className="w-full max-w-xs bg-gray-800 p-4 rounded-lg shadow">
              <QrReader
                delay={300}
                onError={handleError}
                onScan={handleScan}
                style={{ width: '100%' }}
              />
            </div>

            {scanResult && (
              <div className="mt-6 w-full max-w-sm bg-gray-800 p-4 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-2">Найден QR‑код</h3>
                <p className="text-sm text-gray-300 mb-2">Вы получите факты от пользователя. Выберите, чем поделиться в ответ, чтобы добавить контакт в сеть.</p>
                <div className="mb-4">
                  <label className="block text-sm mb-1" htmlFor="contactName">Имя контакта</label>
                  <input
                    id="contactName"
                    type="text"
                    value={scannedName}
                    onChange={(e) => setScannedName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="mb-4">
                  <p className="text-sm mb-2">Группы, которыми вы готовы поделиться:</p>
                  <ul className="space-y-1">
                    {groups.map((g) => (
                      <li key={g.id} className="flex items-center justify-between">
                        <span style={{ color: g.color }}>{g.name}</span>
                        <input
                          type="checkbox"
                          checked={selected.includes(g.id)}
                          onChange={() => toggleGroup(g.id)}
                          className="form-checkbox h-4 w-4 text-primary rounded"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
                <button onClick={addContact} className="w-full bg-primary text-background py-2 rounded-md hover:bg-secondary transition-colors">
                  Добавить {scannedName || 'контакт'} в сеть
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
