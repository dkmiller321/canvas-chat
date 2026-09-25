"use client";

type Props = { value: string; options: string[]; onChange: (model: string) => void; disabled?: boolean };

export function ModelPicker({ value, options, onChange, disabled }: Props) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Model</span>
      <select
        data-testid="model-picker"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </label>
  );
}
