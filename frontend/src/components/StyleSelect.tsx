import React from 'react';

export default function StyleSelect({
  value,
  onChange
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const styles = ['photorealistic', 'oil', 'cartoon', 'sketch'];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border p-2 rounded w-full"
      aria-label="Select style"
    >
      {styles.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
