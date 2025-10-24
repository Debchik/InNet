export interface FactCategoryConfig {
  id: string;
  label: string;
  color: string;
}

export const FACT_CATEGORY_CONFIG: FactCategoryConfig[] = [
  { id: 'work', label: 'Работа', color: '#0D9488' },
  { id: 'study', label: 'Учёба', color: '#6366F1' },
  { id: 'hobbies', label: 'Хобби', color: '#F97316' },
  { id: 'fun', label: 'Забавные факты', color: '#EC4899' },
  { id: 'personal', label: 'Личное', color: '#22D3EE' },
];

export const FACT_CATEGORY_LABELS = FACT_CATEGORY_CONFIG.reduce<Record<string, string>>(
  (acc, config) => {
    acc[config.id] = config.label;
    return acc;
  },
  {}
);

export const FACT_CATEGORY_COLORS = FACT_CATEGORY_CONFIG.reduce<Record<string, string>>(
  (acc, config) => {
    acc[config.id] = config.color;
    return acc;
  },
  {}
);
