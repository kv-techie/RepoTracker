'use client';

interface CustomToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
}

/** Compact switch in the monochrome system: ink when on, silver when off. */
export default function CustomToggle({ checked, onChange, label, id }: CustomToggleProps) {
  return (
    <label className="switch-field" htmlFor={id}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch${checked ? ' switch--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" />
      </button>
      {label && <span className="switch-label">{label}</span>}
    </label>
  );
}
