interface Slice { label: string; value: number; color: string; }

export default function DonutChart({ slices, size, label }: {
  slices: Slice[]; size: number; label?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);

  let acc = 0;
  const stops = total === 0
    ? `#e5e7eb 0 100%`
    : slices.map(s => {
        const from = (acc / total) * 100;
        acc += s.value;
        const to = (acc / total) * 100;
        return `${s.color} ${from}% ${to}%`;
      }).join(', ');

  const thickness = Math.round(size * 0.22);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full"
        style={{ width: size, height: size, background: `conic-gradient(${stops})` }}
      />
      <div
        className="absolute rounded-full bg-white flex flex-col items-center justify-center"
        style={{
          inset: thickness,
        }}
      >
        <span className="text-sm font-bold text-gray-900">{total.toLocaleString()}</span>
        {label && <span className="text-[10px] text-gray-400">{label}</span>}
      </div>
    </div>
  );
}
