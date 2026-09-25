/**
 * ★**登録簿の案内が嘘にならないこと**
 *   ★裁定 `REVIEW_JOCKEY_FEE_20260925.md` §5 の追加要求（2026-09-25）
 *
 * 【★なぜ要るか】
 *   ★`otherRegistriesHint()` は ★落ちたときに ★**他の簿のパスを名指し**します。
 *   ★そのパスが消えたり動いたりしたら、★案内は ★**在りもしない場所へ人を送ります**。
 *   ★案内は「親切」なので ★**間違っていても誰も落ちません** — ★だから網が要ります。
 *   ★（★同じ考え方: `canon-amounts-implemented.test.ts` の「書かれた実装が実在する」）
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { REGISTRIES, otherRegistriesHint } from './lib/registries.js';

const ROOT = path.resolve(__dirname, '../../..');

/** ★`where` の先頭がファイルのパス（★「… の CALIBRATION / EXEMPT」の前） */
function filePartOf(where: string): string {
  return where.split(' ')[0]!;
}

describe('★登録簿の案内', () => {
  it('★一覧が空でない', () => {
    expect(REGISTRIES.length, '★案内が空（★意味がない）').toBeGreaterThanOrEqual(4);
  });

  it('🔴 ★名指ししているファイルが実在する（★在りもしない場所へ送らない）', () => {
    const ghosts = REGISTRIES
      .map((r) => filePartOf(r.where))
      .filter((f) => !existsSync(path.join(ROOT, f)));
    expect(ghosts, '🔴 ★案内のパスが在りません（★動かしたか、消したか）').toEqual([]);
  });

  it('🔴 ★名指しした簿の名前が、そのファイルの中に在る', () => {
    const wrong: string[] = [];
    for (const r of REGISTRIES) {
      const file = filePartOf(r.where);
      const src = readFileSync(path.join(ROOT, file), 'utf8');
      // ★`… の A / B` の A・B を取り出して、★中に在るか見る
      const names = (r.where.split(' の ')[1] ?? '').split(' / ').map((s) => s.trim()).filter(Boolean);
      if (names.length === 0) { wrong.push(`${r.where}: 簿の名前が読めない`); continue; }
      for (const n of names) {
        if (!src.includes(n)) wrong.push(`${file}: ${n} が中に無い`);
      }
    }
    expect(wrong, '🔴 ★案内が指す簿の名前が、そのファイルに在りません').toEqual([]);
  });

  it('★どの簿にも `when`（いつ要るか）が書かれている', () => {
    const silent = REGISTRIES.filter((r) => r.when.length < 10).map((r) => r.where);
    expect(silent, '★「いつ要るか」が空（★案内にならない）').toEqual([]);
  });

  it('🔴 ★案内は自分を外す（★「自分を直せ」は既に言っている）', () => {
    const self = REGISTRIES[0]!.where;
    const hint = otherRegistriesHint(self);
    expect(hint, '🔴 ★自分が一覧に残っています').not.toContain(self);
    // ★対照: ★他のものは入っている（★全部 空になっていないこと）
    expect(hint, '★他の簿が出ていません（★案内が空）').toContain(REGISTRIES[1]!.where);
  });
});
