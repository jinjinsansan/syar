/**
 * ★**V-13 の測り方**（★2026-09-16・正典 **D-112 ③**・裁定 `REVIEW_GAME_BODY_5_VERDICT_20260916.md` §3）
 *
 * 【★見ている壊れ方】
 *   ① ★**早仕掛けの地点が 2 か所に書かれて離れる**（★`GATES` と測定条件・D-052 の二重帳簿）
 *   ② ★**平均どうしの引き算に戻る**（★対標本でないと「馬の差」が「仕掛けの差」に混ざる）
 *   ③ ★**効果量だけ／有意性だけ**で合否を出す（★どちらか片方だと壊れた状態が通る）
 *   ④ ★測定条件が較正定数として扱われる（★通すために動かせる値に見える）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { V13_MEASUREMENT } from '../src/measurement.js';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = readFileSync(path.join(ROOT, 'apps/cli/src/verify-race.ts'), 'utf8');
/** ★コメントを空白にしてから見る（★註記の語を拾わない） */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('★V-13 の測り方（D-112 ③）', () => {
  it('① ★早仕掛けの地点が 1 か所（★`GATES` と測定条件が同じ値）', () => {
    /** ★`GATES.V13_EARLY_FACTOR` のリテラルを読み、測定条件と突き合わせる */
    const m = /V13_EARLY_FACTOR:\s*([\d.]+)/.exec(CODE);
    expect(m, '★GATES に V13_EARLY_FACTOR が無い').not.toBeNull();
    expect(Number(m![1]), '★測定条件と GATES が食い違っている').toBe(V13_MEASUREMENT.earlyFactor);
  });

  it('② ★対標本の差で測る（★平均どうしの引き算で合否を出さない）', () => {
    /** ★同じ馬・同じレースで取った差の列がある */
    expect(CODE).toMatch(/v13PairedGaps/);
    expect(CODE).toMatch(/v13PairedGaps\.push\(opt\.interventionMult - early\.interventionMult\)/);
    /** ★合否は対標本の平均から出す（★`optMult - earlyMult` は参考値としてだけ残す） */
    expect(CODE).toMatch(/const v13Gap = v13Gaps\.length === 0 \? 0 : mean\(v13Gaps\)/);
    expect(CODE).toMatch(/const v13GapOld = optMult - earlyMult/);
  });

  it('③ ★効果量と有意性の両方で合否を出す', () => {
    expect(CODE).toMatch(/pass: v13Gap >= GATES\.V13_MIN_GAP && v13Sigma >= MC\.V13_MEASUREMENT\.minSigma/);
    /**
     * ★SE を出している（★散り具合を持っている）。
     * ⚠️ ★**不偏**（÷ (n−1)）の `standardError` を使うこと — ★`sd`（母標準偏差・÷ n）を
     *    ★そのまま使うと、★少ない標本で SE を過小に報告します。
     */
    expect(CODE).toMatch(/const v13Se = standardError\(v13Gaps\)/);
    expect(CODE).toMatch(/const v13Sigma/);
    /**
     * ★散らないときは効果量だけで見る（★0 割りで落ちない）。
     * ⚠️ ★**「SE が 0 ちょうどか」では駄目**でした（★2026-09-16 に実行で踏みました）。
     *    ★同じ計算をした値どうしでも**丸め残り**（5.8×10⁻¹⁷）が残り、
     *    ★`0.2 ÷ 5.8e-17` で **3.46×10¹⁵ σ** という無意味な数字が出力に出ました。
     *    ★この検査も「0 ちょうど」を固定しており、★**古い書き方を守ってしまっていました**。
     * → ★**「無視できるほど小さいか」**で見る形を固定します。
     */
    expect(CODE).toMatch(/const V13_SE_FLOOR = 1e-12/);
    expect(CODE).toMatch(/const v13Spread = v13Se < V13_SE_FLOOR/);
    expect(CODE).toMatch(/const v13Sigma = v13Spread \? Infinity : v13Gap \/ v13Se/);
    /** ★表示も「散らない」に倒す（★桁あふれした σ を並べない） */
    expect(CODE).toMatch(/v13Spread \? '散らない'/);
  });

  it('④ ★測定条件は「通すために動かせる値」ではない（★中身の主張）', () => {
    expect(V13_MEASUREMENT.sampleUnit).toBe('race_paired');
    expect(V13_MEASUREMENT.minGap).toBe(0.03);
    expect(V13_MEASUREMENT.minSigma).toBeGreaterThan(0);
    /** ★早仕掛けは「遅すぎ」ではなく「早すぎ」側（★1 より大きい倍率） */
    expect(V13_MEASUREMENT.earlyFactor).toBeGreaterThan(1);
  });
});
