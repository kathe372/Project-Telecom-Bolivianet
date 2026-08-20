export interface DonutSegment {
  color:      string;
  label:      string;
  value:      number;
  dashArray:  string;
  dashOffset: number;
}

export function buildDonutSegments(
  slices: { label: string; value: number; color: string }[],
  ringRadius: number,
): DonutSegment[] {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return [];

  const circumference = 2 * Math.PI * ringRadius;

  return slices.map((slice, i) => {
    const fraction = slice.value / total;
    let offset = circumference * 0.25;
    for (let j = 0; j < i; j++) {
      offset -= (slices[j]!.value / total) * circumference;
    }
    return {
      color:      slice.color,
      label:      slice.label,
      value:      slice.value,
      dashArray:  `${fraction * circumference} ${circumference}`,
      dashOffset: offset,
    };
  });
}
