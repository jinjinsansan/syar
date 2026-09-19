/**
 * ★**まだ直っていない指摘の登録簿**（★**NT-3**・2026-09-19・レビュー側の指示）
 *
 * 【🔴 ★なぜ要るか】
 *   ★`REPORT_AUDIT_20260914.md` は **22 項目**を名指しで出し、★**12 件が 5 日 そのまま**でした。
 *   ★そして今日 直った 2 件は ★**監査を読んで直したのではなく、別件でぶつかって**直りました。
 *   → ★★**報告書は期限を持ちません。★期限を持たせ、切れたら門で落とします。**
 *
 * 【★見ている壊れ方】
 *   ① ★簿が空（★「開いているものが無い」ふりをする）
 *   ② ★期限が切れているのに通る
 *   ③ ★理由・担当が書かれていないのに通る（★「調査中」は理由ではない）
 *   ④ ★同じ id を 2 回 載せる（★片方だけ消して「直した」になる）
 *   ⑤ 🔴 ★**「機械によって違う」を隠すために載せる**（★**CI-5**）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { OPEN_FINDINGS, defaultHelpers, diffOpenFindings } from '../../../tools/lib/open-findings.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const TODAY = '2026-09-19';

describe('NT-3 開いている指摘の登録簿', () => {
  it('① ★簿が空でない（★「開いているものが無い」ふりをしない・R-21）', () => {
    expect(OPEN_FINDINGS.length, '★簿が空です').toBeGreaterThan(5);
  });

  it('★いまの簿は通る（★期限内・書き漏れ無し）', () => {
    const d = diffOpenFindings(TODAY);
    expect(d.expired, `★期限が切れています: ${d.expired.join(' / ')}`).toEqual([]);
    expect(d.missingFields, `★書き漏れ: ${d.missingFields.join(' / ')}`).toEqual([]);
  });

  it('② 🔴 ★★期限が切れたら落ちる（★これが無いと、簿は文書と同じ）', () => {
    const past = diffOpenFindings('2027-01-01');
    expect(past.expired.length, '🔴 ★未来の日付でも 1 件も落ちない（★期限が効いていない）')
      .toBe(OPEN_FINDINGS.length);
    /** ★対照: ★遠い過去なら 1 件も切れていない */
    expect(diffOpenFindings('2026-01-01').expired).toEqual([]);
  });

  it('③ ★★理由・担当が無いと落ちる（★「調査中」は理由ではない）', () => {
    const bad = [
      { id: 'X', what: '★何かが壊れている', why: '調査中', owner: 'dev', until: '2026-12-31' },
    ];
    expect(diffOpenFindings(TODAY, bad).missingFields.some((m) => m.includes('why')),
      '★短い理由を通している').toBe(true);

    const noOwner = [
      { id: 'Y', what: '★何かが壊れている', why: '★十分に長い理由をここに書いています', until: '2026-12-31' },
    ];
    expect(diffOpenFindings(TODAY, noOwner).missingFields.some((m) => m.includes('owner')),
      '★担当が無いのを通している').toBe(true);

    const badDate = [
      { id: 'Z', what: '★何かが壊れている', why: '★十分に長い理由をここに書いています', owner: 'dev', until: '9/26' },
    ];
    expect(diffOpenFindings(TODAY, badDate).missingFields.some((m) => m.includes('until')),
      '★日付でないものを通している').toBe(true);
  });

  it('④ ★★同じ id を 2 回 載せると落ちる（★片方だけ消して「直した」になる）', () => {
    const dup = [
      { id: 'D', what: '★何かが壊れている', why: '★十分に長い理由をここに書いています', owner: 'dev', until: '2026-12-31' },
      { id: 'D', what: '★別の何か', why: '★十分に長い理由をここに書いています', owner: 'dev', until: '2026-12-31' },
    ];
    expect(diffOpenFindings(TODAY, dup).missingFields.some((m) => m.includes('重複')),
      '★重複を通している').toBe(true);
  });

  it('⑤ 🔴 ★★「機械によって違う」を理由にしていない（★CI-5）', () => {
    /**
     * 🔴 ★レビュー側 **CI-5**: ★**機械で結果が変わることが欠陥**で、
     *    ★登録簿に「どの機械で赤か」を足すと ★**その欠陥が仕様になります**。
     * ★**物の理由**（★「この生成物はブラウザが要る」）なら載せてよく、
     * ★**機械の理由**（★「CI では通らない」）は載せてはいけません。
     */
    for (const e of OPEN_FINDINGS) {
      expect(e.why, `🔴 ★${e.id}: ★「機械が違うから」を理由にしています`)
        .not.toMatch(/機械が違う|CI では通らない|手元では緑/);
    }
  });

  it('🔴 ★★NT-4: ★`stillOpen` が偽になったら落ちる（★消し忘れを捕まえる）', () => {
    const fake = { grepCount: () => 0 };
    const closedOne = [
      { id: 'C', what: '★もう直っているはずの何か', why: '★十分に長い理由をここに書いています',
        owner: 'dev', until: '2026-12-31', stillOpen: () => false },
    ];
    expect(diffOpenFindings(TODAY, closedOne, fake).closed.length, '★偽なのに落ちない').toBe(1);
    /** ★対照: ★真なら落ちない */
    const openOne = [{ ...closedOne[0]!, stillOpen: () => true }];
    expect(diffOpenFindings(TODAY, openOne, fake).closed).toEqual([]);
    /** ★述語が無い行は対象外（★全行に強制しない） */
    const noPred = [{ id: 'N', what: '★述語の無い指摘', why: '★十分に長い理由をここに書いています', owner: 'dev', until: '2026-12-31' }];
    expect(diffOpenFindings(TODAY, noPred, fake).closed).toEqual([]);
  });

  it('★★`stillOpen` が投げたら「書き漏れ」にする（★黙って真にしない・R-21）', () => {
    const throws = [
      { id: 'T', what: '★投げる述語', why: '★十分に長い理由をここに書いています',
        owner: 'dev', until: '2026-12-31', stillOpen: () => { throw new Error('boom'); } },
    ];
    const d = diffOpenFindings(TODAY, throws, { grepCount: () => 0 });
    expect(d.missingFields.some((m) => m.includes('stillOpen')), '★投げたのに素通りした').toBe(true);
    expect(d.closed, '★投げたのに「もう開いていない」にした').toEqual([]);
  });

  it('🔴 ★★`grepCount` が本当に数えている（★「通るだけの述語」を置いていない）', () => {
    /**
     * 🔴 ★レビュー側の但し書き: ★**無理に述語を書かせると「通るだけの述語」が置かれます**。
     *    → ★いま簿に在る述語が、★**数えた結果 0 なのか、何も見ていないから 0 なのか**を分けます。
     */
    const h = defaultHelpers();
    /** ★除外を外せば、★自分自身（`point-flow.ts` など）が数えられるはず */
    const withoutExclude = h.grepCount('isPpNetHealthy|ppNetHealth|isPpNetNotUnhealthy');
    expect(withoutExclude, '★何も数えていません（★走査が壊れている）').toBeGreaterThan(0);
    /**
     * ★在りえない語なら 0。
     * ⚠️ 🔴 ★**語を字面で書くと、★この検査ファイル自身が数えられて 1 になります**
     *    （★2026-09-19 に実際そうなりました）。→ ★**その場で組み立てます**。
     */
    const impossible = ['ZZZ', 'NO', 'SUCH', 'SYMBOL'].join('_');
    expect(h.grepCount(impossible), '★在りえない語を数えています').toBe(0);
  });

  it('★担当は dev / review / owner のどれか（★宛先の無い指摘を作らない）', () => {
    for (const e of OPEN_FINDINGS) {
      expect(['dev', 'review', 'owner'], `★${e.id} の担当が ${e.owner}`).toContain(e.owner);
    }
  });

  it('🔴 ★★門が呼んでいる（★作っただけで終わらせない・LR-9）', () => {
    const gate = readFileSync(path.join(ROOT, 'tools/gate.mjs'), 'utf8');
    expect(gate, '★門が `verify:open` を呼んでいない').toContain("'verify:open'");
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as
      { scripts?: Record<string, string> };
    expect(pkg.scripts?.['verify:open'], '★`verify:open` が package.json に無い')
      .toContain('verify-open-findings.mjs');
  });

  it('★監査から来た指摘が、★**開いている間は簿に居る**（★この簿を作った理由そのもの）', () => {
    /**
     * ⚠️ ★**件数ではなく名前で見ます**（★数だけだと、別のものを足して埋められます）。
     * ⚠️ ★**この一覧は減ります。** ★直したら簿から外し、★ここからも外します。
     *    ★それが「直った」の記録です（★`known-red` と違い、機械が判定できないため）。
     */
    const ids = new Set(OPEN_FINDINGS.map((e) => e.id));
    /**
     * ⚠️ ★**`M-9` は 2026-09-19 に外しました**（★下の `settled` へ移動）。
     *    ★この一覧から外すときは ★**`settled` に「どう片付けたか」を書くこと** —
     *    ★**両方から消すと、★黙って落としたのと同じ**になります。
     */
    for (const id of ['M-4', 'AUDIT-TLS', 'AUDIT-ZIP', 'AUDIT-CLAUDE-MD']) {
      expect(ids.has(id), `★監査の ${id} が簿にありません`).toBe(true);
    }
  });

  it('🔴 ★★片付いたものが簿に戻ってきていない（★「直した」の記録）', () => {
    /**
     * 🔴 ★**戻ってきたら、それは直っていないということ**です。
     *    ★どれも ★**2026-09-19 に、理由を分けて**片付けました:
     */
    const ids = new Set(OPEN_FINDINGS.map((e) => e.id));
    const settled: Readonly<Record<string, string>> = {
      /** ★直した（★3 状態に）。⚠️ ★ただし実害は元から無かった（★呼び手 0・本物の V-11 は別） */
      'M-8': '★`ppNetHealth` の 3 状態。★実体は `verify-v11-synthetic.mjs:353` が塞いでいた',
      /** ★直した（★必須から外した） */
      'AUDIT-SERVICE-ROLE': '★`WorkerConfig` から外した（★`supabaseUrl` も同じく読み手 0 だった）',
      /** 🔴 ★**取り下げ** — ★監査の主張が誤りだった */
      'AUDIT-CANON-0.26': '🔴 ★取り下げ。★正典 §13.1:1560 は **0.22** で一致していた（★0.26 は D-016 の経緯の行・AU-2）',
      /** ★消した（★合っていない写しは、無い写しより悪い） */
      'AUDIT-RANDOM-K-COPY': '★`sim-engine` の `RACE_RANDOM_K: 0.12` を削除',
      /** ★直した（★雛形どおりで Web が動くように） */
      'AUDIT-ENV-ANON': '★`.env.example` を `NEXT_PUBLIC_` 付きに',
      /** ★直した（★註記のほうが事実と違った） */
      'AUDIT-NEXT-CONFIG': '★`next.config.mjs` の註記を事実に（★禁じているのは「作ること」でなく「ロジックを置くこと」）',
      /** ★直した（★ルート直下だけ） */
      'AUDIT-WAV': '★`.gitignore` に `/*.wav`（★製品の音を巻き込まない）',
      /**
       * ★直した ＋ ★**測った**（★コードだけでなく、★効かないことまで確かめた）。
       * ★`4cefcdc` で `CONDITION_MIN: 1 → 0`（★正典 §7.4 と `@star/training` と
       * ★`growth.ts:131` の 3 つとも 0..5 だった。★外れていたのは race-engine だけ）。
       * ★`6635e23` で 8 シード × 15,000 レースを測り、★前後の差 **−0.045pp ± 0.087（−0.52 SE）**。
       */
      'M-9': '★`CONDITION_MIN: 0` に（`4cefcdc`）＋ ★8 シードで測った（`6635e23`・差は −0.52 SE ＝ 0 と区別できない）',
      /**
       * ⚠️ ★**監査から来たものではありません**（★D-117 / DS-5 の便）。★ここに置くのは
       * ★**簿から落としたものが、★黙って戻ってこないようにする**ためです。
       */
      'DS-5 ④': '★`9f7f36a`: ★確定の直前に `scratchRetiredBeforeStart`。★実 DB 15 件 全通・★検査 5 件。'
        + '★残る限界（★発走から確定までの表示の遅れ）は ★正典 §10.4 の「承知している限界」へ',
    };
    for (const [id, how] of Object.entries(settled)) {
      expect(ids.has(id), `★${id} が簿に戻っています（★${how}）`).toBe(false);
    }
  });
});
