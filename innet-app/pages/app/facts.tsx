import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import {
  FactGroup,
  Fact,
  loadFactGroups,
  saveFactGroups,
  createFactGroup,
  createFact,
} from '../../lib/storage';

/**
 * Facts management page. Users can create groups of facts and add/remove
 * individual facts within them. Each group has an associated color. The
 * state persists in localStorage until backend integration is added.
 */
export default function FactsPage() {
  const [groups, setGroups] = useState<FactGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#0D9488');
  const [errors, setErrors] = useState('');

  useEffect(() => {
    setGroups(loadFactGroups());
  }, []);

  const handleAddGroup = () => {
    if (!newGroupName) {
      setErrors('Укажите название группы');
      return;
    }
    const group = createFactGroup(newGroupName, newGroupColor);
    const updated = [...groups, group];
    setGroups(updated);
    saveFactGroups(updated);
    setNewGroupName('');
  };

  const handleDeleteGroup = (id: string) => {
    const updated = groups.filter((g) => g.id !== id);
    setGroups(updated);
    saveFactGroups(updated);
  };

  const handleAddFact = (groupId: string, title: string, description: string) => {
    if (!title) return;
    const updated = groups.map((g) => {
      if (g.id === groupId) {
        const newFact = createFact(title, description);
        return { ...g, facts: [...g.facts, newFact] };
      }
      return g;
    });
    setGroups(updated);
    saveFactGroups(updated);
  };

  const handleDeleteFact = (groupId: string, factId: string) => {
    const updated = groups.map((g) => {
      if (g.id === groupId) {
        return { ...g, facts: g.facts.filter((f) => f.id !== factId) };
      }
      return g;
    });
    setGroups(updated);
    saveFactGroups(updated);
  };

  return (
    <Layout>
      <div className="px-4 py-8 max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Мои факты</h1>
          {/* Add Group */}
          <div className="mb-8 p-4 bg-gray-800 rounded-xl shadow">
            <h2 className="text-xl font-semibold mb-4">Добавить группу фактов</h2>
            {errors && <p className="text-red-500 text-sm mb-2">{errors}</p>}
            <div className="flex flex-col md:flex-row md:items-end md:space-x-4 space-y-2 md:space-y-0">
              <div className="flex-1">
                <label className="block text-sm mb-1" htmlFor="groupName">Название</label>
                <input
                  id="groupName"
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm mb-1" htmlFor="groupColor">Цвет</label>
                <input
                  id="groupColor"
                  type="color"
                  value={newGroupColor}
                  onChange={(e) => setNewGroupColor(e.target.value)}
                  className="h-10 w-16 p-0 border border-gray-600 rounded-md"
                />
              </div>
              <button
                onClick={handleAddGroup}
                className="bg-primary text-background px-5 py-2 rounded-md hover:bg-secondary transition-colors"
              >
                Добавить группу
              </button>
            </div>
          </div>
          {/* List Groups */}
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.id} className="bg-gray-800 rounded-xl p-4 shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold" style={{ color: group.color }}>{group.name}</h3>
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    className="text-sm text-red-400 hover:text-red-500"
                  >
                    Удалить группу
                  </button>
                </div>
                {/* Add Fact */}
                <AddFactForm onAdd={(title, description) => handleAddFact(group.id, title, description)} />
                {/* Facts List */}
                {group.facts.length === 0 ? (
                  <p className="text-sm text-gray-400 mt-2">Нет фактов в этой группе</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {group.facts.map((fact) => (
                      <li key={fact.id} className="flex items-start justify-between bg-gray-700 p-3 rounded-md">
                        <div>
                          <p className="font-medium">{fact.title}</p>
                          {fact.description && <p className="text-sm text-gray-300">{fact.description}</p>}
                        </div>
                        <button
                          onClick={() => handleDeleteFact(group.id, fact.id)}
                          className="text-xs text-red-400 hover:text-red-500"
                        >
                          Удалить
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
      </div>
    </Layout>
  );
}

/**
 * Subcomponent for adding a fact to a group. Keeps local form state and
 * resets after submission.
 */
function AddFactForm({ onAdd }: { onAdd: (title: string, description: string) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    onAdd(title, description);
    setTitle('');
    setDescription('');
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-2 mb-4">
      <div className="flex flex-col md:flex-row md:items-end md:space-x-4 space-y-2 md:space-y-0">
        <div className="flex-1">
          <label className="block text-sm mb-1" htmlFor="factTitle">Факт</label>
          <input
            id="factTitle"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm mb-1" htmlFor="factDesc">Описание (необязательно)</label>
          <input
            id="factDesc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          className="bg-primary text-background px-4 py-2 rounded-md hover:bg-secondary transition-colors"
        >
          Добавить факт
        </button>
      </div>
    </form>
  );
}