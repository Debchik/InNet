type ToggleBarProps = {
  active: boolean;
  onToggle: () => void;
  accentColor?: string;
};

export default function ToggleBar({ active, onToggle, accentColor }: ToggleBarProps) {
  return (
    <button
      onClick={onToggle}
      type="button"
      className={`flex h-8 w-14 items-center rounded-full px-1 transition duration-200 ${
        active ? 'bg-primary/80' : 'bg-slate-600'
      }`}
      style={active && accentColor ? { backgroundColor: accentColor } : undefined}
      aria-pressed={active}
    >
      <span
        className="h-7 w-7 rounded-full bg-slate-100 shadow transition-transform duration-200"
        style={{ transform: active ? 'translateX(24px)' : 'translateX(0)' }}
      />
    </button>
  );
}
