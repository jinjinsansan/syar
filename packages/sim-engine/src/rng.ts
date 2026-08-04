/**
 * シード可能 PRNG (xoshiro128**)
 *
 * 憲法 §1-4: `Math.random()` / `Date.now()` をエンジン内で直接呼ばない。
 * 乱数は必ずこのクラスのインスタンスとして注入し、シード固定で完全再現できるようにする。
 * 正典 §8.6 も「決定的な PRNG (xoshiro128** 等)」を要求している。
 */

const TWO_POW_32 = 4294967296;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** 32bit splitmix。シード拡張とサブストリーム導出に使う */
export function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    const next = splitmix32(seed);
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    // 全状態ゼロは xoshiro の不動点なので回避する
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) {
      this.s0 = 0x9e3779b9;
    }
  }

  /** 生の 32bit 乱数 */
  nextUint32(): number {
    const result = (Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0);
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** [0, 1) の一様乱数 */
  float(): number {
    return this.nextUint32() / TWO_POW_32;
  }

  /** [min, max] の一様整数（両端含む） */
  int(minInclusive: number, maxInclusive: number): number {
    if (maxInclusive < minInclusive) {
      throw new Error(`Rng.int: 範囲が不正 (${minInclusive}..${maxInclusive})`);
    }
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(this.float() * span);
  }

  /** [min, max) の一様実数 */
  range(minInclusive: number, maxExclusive: number): number {
    return minInclusive + this.float() * (maxExclusive - minInclusive);
  }

  /** 確率 p で true */
  bool(p: number): boolean {
    return this.float() < p;
  }

  /** 正規分布（Box-Muller。キャッシュを持たないので呼び出し順=消費順が明快） */
  gaussian(mean: number, sd: number): number {
    const u1 = (this.nextUint32() + 0.5) / TWO_POW_32; // 0 を避ける
    const u2 = this.nextUint32() / TWO_POW_32;
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** 配列から1つ選ぶ */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Rng.pick: 空配列');
    }
    const value = items[this.int(0, items.length - 1)];
    if (value === undefined) {
      throw new Error('Rng.pick: 添字が範囲外');
    }
    return value;
  }

  /** Fisher-Yates（元配列を破壊しない） */
  shuffled<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = out[i];
      const b = out[j];
      if (a === undefined || b === undefined) {
        throw new Error('Rng.shuffled: 添字が範囲外');
      }
      out[i] = b;
      out[j] = a;
    }
    return out;
  }
}

/**
 * マスターシードとパス（世代番号・配合番号など）から独立したサブストリームを導出する。
 *
 * 「i 番目の配合の乱数」がループ順序や他の乱数消費に影響されなくなるため、
 * 実装を変えても再現性が壊れにくい。決定論テスト（§3.5-1）の土台。
 */
export function deriveSeed(masterSeed: number, ...path: number[]): number {
  let acc = masterSeed >>> 0;
  for (const part of path) {
    const next = splitmix32((acc ^ (part >>> 0)) >>> 0);
    acc = next();
  }
  return acc >>> 0;
}

export function deriveRng(masterSeed: number, ...path: number[]): Rng {
  return new Rng(deriveSeed(masterSeed, ...path));
}
