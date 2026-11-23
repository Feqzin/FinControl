import { useId } from "react";

type Choice = { value: string; label: string };

export function FilterChoiceGroup({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
}) {
  const name = useId();
  return <fieldset className="min-w-0 space-y-1">
    <legend className="mb-1 text-sm font-medium">{label}</legend>
    {options.map(option => <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted/50">
      <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="h-4 w-4 shrink-0 accent-primary" />
      <span>{option.label}</span>
    </label>)}
  </fieldset>;
}

export function FilterToggle({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted/50">
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 shrink-0 accent-primary" />
    <span>{label}</span>
  </label>;
}
