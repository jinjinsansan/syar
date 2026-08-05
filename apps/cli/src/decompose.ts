/**
 * Q-1: V-4 / V-6 を「何がどれだけ動かしたか」に分解する道具
 *
 *   npx tsx apps/cli/src/decompose.ts [--races 12000] [--seeds 42,7]
 *
 * 【なぜ要るか】
 *   P1-fix の報告書 §3-3 で、**試行回数の効果（60→200 で +1.19pp）を
 *   タイブレーク是正の効果（+0.04〜0.21pp）として記述**した。
 *   複数の条件を同時に変えて一方に帰属させたのが原因で、
 *   **分解する手段を持たずに因果を語った**ことがそもそもの誤りだった。
 *
 * 【設計】
 *   ★測定は `verify-race.ts` を**そのまま子プロセスで呼ぶ**。
 *     ここで独自に計算し直すと「本番の測定」と「分解の測定」が別物になり、
 *     分解結果が本番に当てはまらない（M-1 と同じ「記述と実装の食い違い」クラス）。
 *   基準条件から**1因子ずつ**動かし、V-4 / V-6 の差分を出す（one-factor-at-a-time）。
 *   交互作用は測れないので、**測れないことを明示する**（勝手に加法性を仮定しない）。
 */

import { execFileSync } from 'node:child_process';
import { round } from './stats.js';

function parseNumber(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

function parseText(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i < 0 ? fallback : (process.argv[i + 1] ?? fallback);
}

const RACES = parseNumber('--races', 12000);
const SEEDS = parseText('--seeds', '42,7');

/** 基準条件（現在の既定）。ここから1因子ずつ動かす */
const BASE: readonly string[] = [
  '--races',
  String(RACES),
  '--seeds',
  SEEDS,
  '--pool-generations',
  '40',
  '--pool-mares',
  '400',
];

interface Measurement {
  v4: number;
  v5: number;
  v6: number;
}

function measure(extra: readonly string[]): Measurement {
  // ★verify-race は総合 FAIL のとき非ゼロ終了する（合否をシェルから判定できるようにするため）。
  //   分解では**落ちた条件こそ測りたい**ので、例外を捕まえて stdout を使う。
  let out: string;
  try {
    out = execFileSync(
      'npx',
      ['tsx', 'apps/cli/src/verify-race.ts', ...BASE, ...extra, '--json'],
      { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (e) {
    const err = e as { stdout?: string };
    out = err.stdout ?? '';
    if (out === '') throw new Error('verify-race が出力を返さなかった');
  }
  const start = out.indexOf('{');
  if (start < 0) throw new Error('verify-race の JSON を取得できなかった');
  const json = JSON.parse(out.slice(start)) as {
    checks: { id: string; value: string }[];
  };
  const pick = (id: string): number => {
    const c = json.checks.find((x) => x.id === id);
    if (c === undefined) throw new Error(`${id} が出力に無い`);
    const m = c.value.match(/-?[0-9.]+/);
    if (m === null) throw new Error(`${id} の値を数値化できない: ${c.value}`);
    return Number(m[0]);
  };
  return { v4: pick('V-4'), v5: pick('V-5'), v6: pick('V-6') };
}

/** 動かす因子。基準からの差分を1つずつ測る */
const FACTORS: readonly { label: string; args: string[] }[] = [
  { label: '人気推定の試行数 200 → 60', args: ['--popularity-trials', '60'] },
  { label: '母集団の世代数 40 → 20', args: ['--pool-generations', '20'] },
  { label: '能力レンジの床 0.5 → 0（裾切りなし）', args: ['--field-floor', '0'] },
  { label: '能力レンジの床 0.5 → 0.7（強く締める）', args: ['--field-floor', '0.7'] },
  { label: 'K 0.26 → 0.12（正典の旧値）', args: ['--k', '0.12'] },
  { label: 'K 0.26 → 0.34', args: ['--k', '0.34'] },
  { label: 'クラス幅 6% → 100%（クラス分けなし）', args: ['--class-band', '1.0'] },
  { label: '開放率 0.55-0.85 → 0.66-0.74（狭める）', args: ['--unlock-min', '0.66', '--unlock-max', '0.74'] },
];

console.log(`基準条件: ${BASE.join(' ')}`);
console.log('');
console.log('★one-factor-at-a-time。**交互作用は測っていない**ので、');
console.log('  複数の因子を同時に動かしたときの効果は各行の和にはならない。');
console.log('');

const base = measure([]);
console.log(
  `基準: V-4 ${round(base.v4, 2)}% / V-5 ${round(base.v5, 2)}% / V-6 ${round(base.v6, 2)}%`,
);
console.log('');
const pad = (s: string | number, w: number): string => {
  const t = String(s);
  return t.length >= w ? t : ' '.repeat(w - t.length) + t;
};
console.log(
  `${'動かした因子'.padEnd(40)} ${pad('V-4', 8)} ${pad('ΔV-4', 8)} ${pad('V-6', 8)} ${pad('ΔV-6', 8)}`,
);
console.log('-'.repeat(78));
for (const f of FACTORS) {
  const m = measure(f.args);
  console.log(
    `${f.label.padEnd(40)} ${pad(round(m.v4, 2), 8)} ${pad(round(m.v4 - base.v4, 2), 8)} ` +
      `${pad(round(m.v6, 2), 8)} ${pad(round(m.v6 - base.v6, 2), 8)}`,
  );
}
