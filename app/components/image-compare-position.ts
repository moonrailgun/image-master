const DEFAULT_POSITION = 50;
const positions = new Map<string, number>();

export function readImageComparePosition(persistKey?: string): number {
  return persistKey
    ? positions.get(persistKey) ?? DEFAULT_POSITION
    : DEFAULT_POSITION;
}

export function writeImageComparePosition(
  persistKey: string | undefined,
  position: number
): void {
  if (persistKey) {
    positions.set(persistKey, position);
  }
}
