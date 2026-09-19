/**
 * ★**状態を変える道具の「後始末の作法」を、全数 分類する**（★**TL-1**・2026-09-19）
 *
 * 【🔴 ★なぜ要るか】★共有の staging を 2 回 汚しました:
 *   ★① `verify-ds7-cancel` … ★`rollback` したつもりで ★**内側の `commit` が外側を確定**させた
 *   ★② `verify-v11-synthetic` … ★**生きたレースを消費**した（★設計どおり）
 *
 * 【🔴 ★線は「片付けるか」ではない】
 *   ✔ ★`verify-a2` も `verify-cancel` も `clean()` を**呼んでいます**。★呼んだだけ。
 *   ✔ ★`verify-unlock-daily` は ★**⑤b で巻き戻しを数えており**、★無事でした。
 *   → ★★**「片付けたことを確かめているか」**が、★汚したものと汚さなかったものを分けました。
 *
 * 【★見ている壊れ方】
 *   ① ★新しい道具を、分類せずに `STATE_CHANGING` に足す
 *   ② ★`restores` と名乗りながら、★**戻したことを数えていない**
 *   ③ ★`consumes` と名乗りながら、★**何を消費するか書いていない**
 *   ④ 🔴 ★`pending` を ★**3 つ目の正しい状態**として放置する（★空にするのが目標）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { STATE_CHANGING } from '../../../tools/lib/classification.mjs';
import { TOOL_AFTERMATH } from '../../../tools/lib/tool-aftermath.mjs';
import { OPEN_FINDINGS } from '../../../tools/lib/open-findings.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const MODES = ['restores', 'consumes', 'pending'] as const;

describe('TL-1 状態を変える道具の後始末', () => {
  it('★走査が空振りしていない（R-21）', () => {
    expect(STATE_CHANGING.length, '★`STATE_CHANGING` が空').toBeGreaterThan(20);
    expect(Object.keys(TOOL_AFTERMATH).length, '★分類簿が空').toBeGreaterThan(20);
  });

  it('① 🔴 ★★状態を変える道具は、1 つ残らず分類されている（★黙って足せない）', () => {
    const classified = new Set(Object.keys(TOOL_AFTERMATH));
    const missing = STATE_CHANGING.filter((f) => !classified.has(f));
    expect(missing, `🔴 ★後始末の作法が書かれていません: ${missing.join(' / ')}`).toEqual([]);
    /** ★対照: ★簿に、もう無い道具が残っていない */
    const live = new Set<string>(STATE_CHANGING);
    const ghosts = Object.keys(TOOL_AFTERMATH).filter((f) => !live.has(f));
    expect(ghosts, `★STATE_CHANGING に無いものが簿に残っています: ${ghosts.join(' / ')}`).toEqual([]);
  });

  it('★どれか 1 つの作法を名乗っている（★「どれでもない」を作れない・FK-6 の形）', () => {
    for (const [f, e] of Object.entries(TOOL_AFTERMATH)) {
      expect(MODES, `${f}: mode が ${String(e.mode)}`).toContain(e.mode);
      expect(e.why.length, `${f}: 理由が短い`).toBeGreaterThan(5);
    }
  });

  it('② 🔴 ★★`restores` は、★戻したことを**数えている**', () => {
    /**
     * 🔴 ★ここが TL-1 の核です。★`rollback` を**呼んだ**だけでは足りません
     *    （★`verify-ds7-cancel` は呼んでいて、★それでも汚しました — ★内側の `commit`）。
     * → ★`sandboxTx`（SB-3 が `txid_current` を突き合わせる）か、★自前の照合が要ります。
     */
    for (const [f, e] of Object.entries(TOOL_AFTERMATH)) {
      if (e.mode !== 'restores') continue;
      const src = readFileSync(path.join(ROOT, 'tools', f), 'utf8');
      const counted = src.includes('beginSandbox')
        || /巻き戻|restored|戻りました|片付いた|残っていない/.test(src);
      expect(counted, `🔴 ${f}: restores と名乗っているのに、戻したことを数えていません`).toBe(true);
    }
  });

  it('③ ★`consumes` は、★**何を消費するか**が書いてある（★黙って消費しない・R-27）', () => {
    for (const [f, e] of Object.entries(TOOL_AFTERMATH)) {
      if (e.mode !== 'consumes') continue;
      expect(e.why.length, `${f}: 何を消費するか書かれていません`).toBeGreaterThan(5);
    }
  });

  it('④ 🔴 ★★`pending` は「まだ直っていない」印であって、作法ではない', () => {
    /**
     * 🔴 ★**空にするのが目標**です。★増えたら落とします。
     * ⚠️ ★本体は `open-findings` の **TL-1**（★期限つき）。★ここはその一覧です。
     */
    /**
     * 🔴 ★**ラチェット**（★2026-09-19・レビュー側の指摘）。
     *
     * ★`<=` にすると ★**「増やさない」だけで「減らす」力がありません** —
     *   ★いまが 20 なので、★**永久に 20 のままでも門は緑**です（★`known-red` と同じ弱さ）。
     * → ★**`toBe`（一致）にします。**
     *   ★1 本 直したら ★**この数も下げないと落ちます**（★下げ忘れが見える）。
     *   ★増やそうとしても落ちます。★**戻すには、ここを上げる編集が要る**ので、★差分に残ります。
     * ⚠️ 🔴 ★**この数を上げてはいけません。** ★上げるのは「直せなかった」ことの宣言です。
     */
    const pending = Object.entries(TOOL_AFTERMATH).filter(([, e]) => e.mode === 'pending');
    const PENDING_RATCHET = 20;
    expect(pending.length, `🔴 ★pending が ${pending.length} 本（★ラチェットは ${PENDING_RATCHET}）。`
      + '★減らしたなら、この数も下げてください。★増やしたなら、戻してください')
      .toBe(PENDING_RATCHET);
    /** 🔴 ★期限つきの簿に載っていること（★ここだけで閉じない・NT-2） */
    const ids = new Set(OPEN_FINDINGS.map((e) => e.id));
    expect(ids.has('TL-1'), '🔴 ★`pending` が在るのに、`open-findings` に TL-1 がありません')
      .toBe(pending.length > 0);
  });

  it('★★分類が実態と合っている（★字面の宣言だけにしない）', () => {
    /**
     * 🔴 ★`consumes` と名乗っているのに ★**片付けの形跡がある**なら、
     *    ★それは `pending`（★片付けるが数えていない）の可能性が高い。
     *    → ★**宣言と中身が食い違っていたら落とします。**
     */
    const wrong: string[] = [];
    for (const [f, e] of Object.entries(TOOL_AFTERMATH)) {
      if (e.mode !== 'consumes') continue;
      const src = readFileSync(path.join(ROOT, 'tools', f), 'utf8');
      if (/delete from|clean\s*\(|cleanup\s*\(/.test(src)) wrong.push(f);
    }
    expect(wrong, `★consumes と名乗っているのに片付けの形跡があります（★pending では？）: ${wrong.join(' / ')}`)
      .toEqual([]);
  });
});
