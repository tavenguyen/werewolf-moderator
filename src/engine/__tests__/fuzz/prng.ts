/**
 * Bộ sinh số giả ngẫu nhiên tất định Mulberry32 phục vụ Property-Based Testing & Fuzzing.
 * Cùng một seed luôn cho kết quả giống hệt nhau để tái hiện lỗi trong < 1 giây.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(minInclusive: number, maxInclusive: number): number {
    if (maxInclusive <= minInclusive) return minInclusive;
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }

  public chance(probability: number): boolean {
    return this.next() < probability;
  }

  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty array');
    }
    return items[Math.floor(this.next() * items.length)];
  }

  public pickMany<T>(items: readonly T[], count: number): T[] {
    return this.shuffle(items).slice(0, Math.max(0, Math.min(count, items.length)));
  }

  public shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }
}
