import type { FactGroup } from './storage';
import type { ShareGroup } from './share';

export function groupToShare(group: FactGroup): ShareGroup {
  return {
    id: group.id,
    name: group.name,
    color: group.color,
    facts: group.facts.map((fact) => ({
      id: fact.id,
      text: fact.text,
    })),
  };
}

export function syncSelection(current: string[], source: FactGroup[]): string[] {
  const ids = source.map((group) => group.id);
  if (!current.length) return ids;
  const merged = current.filter((id) => ids.includes(id));
  ids.forEach((id) => {
    if (!merged.includes(id)) merged.push(id);
  });
  return merged;
}
