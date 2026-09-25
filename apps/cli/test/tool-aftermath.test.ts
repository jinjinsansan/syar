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
import { STATE_CHANGING, SOURCE_MUTATING } from '../../../tools/lib/classification.mjs';
import { TOOL_AFTERMATH } from '../../../tools/lib/tool-aftermath.mjs';
import { OPEN_FINDINGS } from '../../../tools/lib/open-findings.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const MODES = ['restores', 'consumes', 'pending'] as const;

/**
 * 🔴 ★**後始末を要求する母集合**（★2026-09-25・裁定 `REVIEW_OWNER_SCOPE_AND_STUD_FEE_20260925.md` §8 ②）
 *
 * 【★なぜ ★`SOURCE_MUTATING` も入れるか】
 *   ★`SOURCE_MUTATING` は ★「★DB には触れないが ★**本番ソースを一時的に書き換える**」道具です。
 *   ⚠️ ★あの簿は ★**自分でこう書いていました**: ★「★『必ず戻す』ことを検査で固定してはいません。
 *      ★戻し漏れは ★`git status` が汚れる形で出ます」。
 *   🔴 ★**それが 2 回 起きました**（★2026-09-21 と 2026-09-25・簿 `NEXT-BUILD-REWRITES-TRACKED-FILES`）。
 *     ★しかも ★2 回目は ★**未コミット 56 件の山に混ざり**、★人が気づくまで出ませんでした。
 *   🔴 ★この戻し漏れの行き先は ★**ただの汚れではありません** — ★`tsconfig.json` を commit すると
 *     ★**Vercel が使う `.next` ではない道を指します**（★本番を壊す形）。
 *   → ★だから ★**「3 回目が出たら」を前倒し**して、★いま後始末を要求します。
 *
 * 【⚠️ ★簿を 2 つに割らない】
 *   ★第 2 の簿を作ると、★次は ★**「どちらに載せるか」で漏れます**。
 *   → ★`TOOL_AFTERMATH` ★1 つのまま、★**鍵の母集合だけ**を広げます（★`missing` も `ghosts` も同じ union）。
 */
const NEEDS_AFTERMATH: readonly string[] = [
  ...STATE_CHANGING,
  ...SOURCE_MUTATING.map((e) => e.file),
];

describe('TL-1 状態を変える道具の後始末', () => {
  it('★走査が空振りしていない（R-21）', () => {
    expect(STATE_CHANGING.length, '★`STATE_CHANGING` が空').toBeGreaterThan(20);
    expect(Object.keys(TOOL_AFTERMATH).length, '★分類簿が空').toBeGreaterThan(20);
  });

  it('① 🔴 ★★状態を変える道具は、1 つ残らず分類されている（★黙って足せない）', () => {
    const classified = new Set(Object.keys(TOOL_AFTERMATH));
    const missing = NEEDS_AFTERMATH.filter((f) => !classified.has(f));
    expect(missing, `🔴 ★後始末の作法が書かれていません: ${missing.join(' / ')}`).toEqual([]);
    /** ★対照: ★簿に、もう無い道具が残っていない */
    const live = new Set<string>(NEEDS_AFTERMATH);
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
      /**
       * 🔴 ★**語の一覧で見ない**（★**R-29**: ★列挙は必ず漏れる）。
       *
       * ⚠️ ★2026-09-19、★この検査は `verify-a2.mjs` を ★**誤って落としました** —
       *    ★あの道具は `left !== 0 || after !== before` で exit 1 していますが、
       *    ★**語の一覧にその言い回しが無かった**だけでした。
       * → ★**語を足すのではなく、★簿の側に ★`countedBy`（★引用）を持たせます**。
       *    ★AU-7 と同じ形: ★**主張には引用を付ける**。★コードが変われば ★**引用が壊れて落ちます**。
       *
       * 【🔴 ★`countedBy` を選ぶときの 2 段の条件】（★2026-09-26・裁定 §9 で 2 度 選び直したあと）
       *   ★① ★**ファイル内で 1 か所**であること（★でないと、その行を消しても緑）
       *     ⚠️ ★実例: ★`mutation/gates.mjs` に ★`process.exit(2);` は ★**7 か所**ありました。
       *   ★② 🔴 ★**その行が「名乗っている性質そのもの」を数えていること**（★①だけでは足りません）
       *     ⚠️ ★実例: ★同じ道具で ★`前回の作業ツリーを消せません` を引用しました。★1 か所ですが、
       *        ★これは ★**「片付けが失敗したら止まる」証拠**で、★**「本体を汚していない」証拠ではありません**。
       *        ✔ ★対照で実証: ★汚れの照合（`:332-340`）を ★**丸ごと消しても この文は残り**、★緑のままでした。
       *        → ★`if (after !== dirty) {`（★開始時の `git status` と突き合わせる行）に替えました。
       *
       * 【⚠️ ★対照の数え方】★このループは ★**最初の失敗で止まります**。
       *   ★2 本 同時に壊すと ★**後ろの 1 本は出ません**（★2026-09-25 に隠れました）。
       *   → ★★**「対照を流した」ではなく「何本ぶん名指しで落ちたか」を数えること。**★1 本ずつ壊します。
       */
      /**
       * ★**同格に扱う仕掛け**（★どちらも「戻ったことを数える」ところまで含んでいます）:
       *   ★`beginSandbox` … ★SB-3 が ★`txid_current` を突き合わせる（★DB 側）
       *   ★`withNextRewritesRestored` … ★写しと ★`finally` の書き戻し＋★戻した一覧を返す（★ソース側・2026-09-25）
       */
      const counted = src.includes('beginSandbox')
        || src.includes('withNextRewritesRestored')
        || (e.countedBy !== undefined && src.includes(e.countedBy));
      expect(
        counted,
        `🔴 ${f}: restores と名乗っているのに、戻したことを数えた証拠がありません。`
          + `★`+`sandboxTx を使うか、★簿の ` + `countedBy に ★**その行の写し**を書いてください`,
      ).toBe(true);
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
    // 🔴 ★2026-09-19に **16 → 0**。★状態を変える道具 47 本が、★全部 自分の片付けを数えるようになった。⚠️ ★**戻さない**（★新しい道具は最初から数えること）。🔴 ★下げたら戻さない
    const PENDING_RATCHET = 0;
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
      /**
       * ⚠️ ★**片付けているだけでは `pending` とは言えません**（★2026-09-19 に緩めました）。
       *
       * 🔴 ★`verify-v11-synthetic` は ★**自分が作った行を `clean()` で戻しながら**、
       *    ★**集団全体の週送り（8 週）を消費**します。★**両方ありえます。**
       * → ★片付けの形跡がある `consumes` には、★**「何が戻らないか」を簿に書かせます**。
       * ⚠️ ★この語の一覧は ★**簿（自分で書く文）に対するもの**です —
       *    ★任意の源に対する列挙ではないので、★R-29 の漏れ方とは別です。
       */
      /**
       * 🔴 ★**文を grep しない**（★2026-09-19 に直しました）。
       *   ⚠️ ★最初は `why` に「戻せません」等があるかを見ていましたが、
       *   ★`seed-world` の「戻す手段は**ありません**」が当たらず落ちました（★R-29 の漏れ）。
       * → ★**語を増やさず、★`notRestored` という欄を置きます**（★宣言させる・AU-7）。
       */
      const declaresLoss = typeof e.notRestored === 'string' && e.notRestored.length > 0;
      if (/delete from|clean\s*\(|cleanup\s*\(/.test(src) && !declaresLoss) wrong.push(f);
    }
    // ⚠️ ★文の中にバッククォートを書かない（★テンプレート文字列が閉じる・★今日 2 度目）
    expect(wrong, `★consumes で片付けの形跡があるのに、★notRestored（★何が戻らないか）が書かれていません: ${wrong.join(' / ')}`)
      .toEqual([]);
  });
});
