/**
 * ★**まだ直っていない指摘の登録簿**（★**NT-3**・2026-09-19・レビュー側の指示）
 *
 * 【🔴 ★なぜ要るか — ★監査の指摘が 5 日 そのままでした】
 *   ★`REPORT_AUDIT_20260914.md` は **22 項目**を名指しで出しました。
 *   ✔ ★2026-09-19 に突き合わせたところ、★**12 件がまだ開いていました**（`REPORT_CI6_AUDIT_SWEEP_20260919.md`）。
 *   ★そして ★**今日 直った 2 件は、★監査を読んで直したのではありません** —
 *     ★Render は CLAUDE.md を読んだとき、★unit は WK-5 で unit を探したときに、★偶然 ぶつかりました。
 *
 *   → ★★**「指摘が文書にある」は「直る」ではありません。**
 *   → ★★**文書は期限を持ちません。★5 日でも 1 か月でも、そのまま残ります。**
 *
 * 【★同じ形を、今日 3 回 見ました（★**NT-2**）】
 *   ★① `horse-repo.ts:238`「`entry-freeze` が取消にします」→ ★**あちらは見ていなかった**
 *   ★② `deploy/star-worker.service` → ★**監査が 09-14 に指摘 → 5 日 直っていない**
 *   ★③ `tool-guard.test.ts`「綺麗なチェックアウトから通りません」→ ★**除外して閉じた**（★38 → 113 件に増えた）
 *
 * 【★この簿がすること】
 *   ★`known-red.mjs` と ★**同じ形**です（★理由・担当・期限）。
 *   ★**期限が切れたら門が落ちます。**
 *   → ★★**報告書は「読まれなければ消える文書」ではなく、★期限が来たら落ちる検査になります。**
 *
 * 【⚠️ ★この簿に載せてよいもの／いけないもの】
 *   ✅ ★**直すと決まっていて、まだ直していないもの**（★理由・担当・期限つき）
 *   🔴 ★**「機械によって違う」を隠すために載せる**のは禁止（★**CI-5**）。
 *      ★機械差は ★**欠陥**であって、★載せると ★**その欠陥が仕様になります**。
 *   ⚠️ ★**「調査中」は理由ではありません**（★`known-red.mjs` と同じ）。
 *
 * 【★使い方】
 *   `node tools/verify-open-findings.mjs`（★期限だけを見ます。★検査は流しません）
 *   ★門（`tools/gate.mjs`）から呼ばれます。
 */

import { readFileSync, readdirSync } from 'node:fs';

/**
 * ★**まだ開いている指摘**。★空 ＝ 開いているものが無いこと。
 *
 * ⚠️ ★**直したら消してください。** ★消し忘れを落とす仕組みはありません
 *    （★`known-red` と違い、★「直ったか」を機械が判定できないため）。
 *    → ★**そのぶん期限を短く**してください。
 */
/**
 * ★**`stillOpen` に渡す道具**（★**NT-4**・2026-09-19）。
 *
 * ⚠️ ★述語の中で ★**自由に fs を触らせません**。★渡すのは ★**数える道具だけ**です
 *    （★述語は「まだ開いているか」を答えるもので、★何かを直すものではありません）。
 * ⚠️ ★`Date.now()` も渡しません（★時刻は `todayIso` の 1 本・憲法 4）。
 */
export function defaultHelpers() {
  return {
    /**
     * ★`packages` / `apps` / `tools` を走査し、★正規表現に当たる**ファイル数**を返す。
     * @param {string} pattern ★正規表現の文字列
     * @param {{ exclude?: RegExp }} [opts] ★除外（★自分自身を数えないため）
     */
    grepCount(pattern, opts = {}) {
      const re = new RegExp(pattern);
      let n = 0;
      const walk = (dir) => {
        let entries;
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return; // ★無いディレクトリは数えない（★投げない）
        }
        for (const e of entries) {
          const full = `${dir}/${e.name}`;
          if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
          if (e.isDirectory()) { walk(full); continue; }
          if (!/\.(ts|tsx|mjs)$/.test(e.name)) continue;
          if (opts.exclude !== undefined && opts.exclude.test(full)) continue;
          try {
            if (re.test(readFileSync(full, 'utf8'))) n += 1;
          } catch { /* ★読めないファイルは数えない */ }
        }
      };
      for (const d of ['packages', 'apps', 'tools']) walk(d);
      return n;
    },
  };
}

export const OPEN_FINDINGS = [
  // ───────── 2026-09-14 の監査（`REPORT_AUDIT_20260914.md`）で開いているもの ─────────
  {
    id: 'M-4',
    what: '⚠️ ★**格下げ**（★2026-09-19）: ★`STAR_SEED_SECRET` が無くても警告だけで起動する（`apps/worker/src/main.ts:84-87`）',
    why: '🔴 ★**監査 M-4 は「起きない害」でした**（★レビュー側 `REVIEW_M4_M8_WIRING_VERDICT_20260919.md`）。'
      + '✔ ★`pg-store.ts:189-196` — ★`seed_commit` と `server_seed` は ★**同じ 1 本の insert**（原子的）。'
      + '✔ ★`fairness.ts:102` — ★検証は `sha256(reveal) === commit` で、★**両方とも行から読む。秘密を使わない**。'
      + '→ ★**秘密が毎回 変わっても公正性の検証は通り、★過去のレースは壊れません。**'
      + '★註記の「保存前に落ちたレースは reveal を出せない」は、★**そのレースが存在しない**（同じ insert）。'
      + '🔴 ★そして ★**fail-closed にすると止まるのは本番ではなく staging** です — '
      + '✔ ★私も数えました: ★`STAR_SEED_SECRET` は ★**staging にも本番にも在りません**（両方 0 件）。'
      + '⚠️ ★残すのは ★**`.env.example` と `deploy/README.md` に変数が無い**という記載の穴だけ。★急ぎません',
    owner: 'dev',
    until: '2026-10-31',
  },
  {
    id: 'M-9',
    what: '★調子の値域の食い違い（育成 0..5 ／ `race-engine` の `CONDITION_MIN: 1`・`balance.ts:489`）',
    why: '★**調子 0 と 1 が同じ補正**になる。🔴 ★**着順に入る**ので、直すと較正が動く。'
      + '→ ★**AL-11 と同じ扱い**（★前後を測ってから入れる）。★レビュー側の指示',
    owner: 'dev',
    until: '2026-09-30',
  },
  {
    id: 'AUDIT-TLS',
    what: '★DB 接続で TLS 証明書を検証していない（`apps/worker/src/main.ts:62` ／ `tools/migrate.mjs:106`）',
    why: '★`rejectUnauthorized: false`。🔴 ★**本番の接続に触る**ので、'
      + '★CA（Supabase）を確かめずに `true` にすると**ワーカーが起動しなくなります**。'
      + '→ ★**WK-5（staging の常駐）待ち**。★staging で確かめてから',
    owner: 'dev',
    until: '2026-10-03',
  },
  {
    id: 'AUDIT-SERVICE-ROLE',
    what: '★worker が使っていない `SUPABASE_SERVICE_ROLE_KEY` を**必須**にしている（`apps/worker/src/env.ts:49`）',
    why: '✔ ★`serviceRoleKey` は `env.ts` の**外で 1 度も読まれない**（走査で確認）。'
      + '★必須から外すと ★**露出が減ります**（★RLS を素通りする鍵を、要らない場所に置かない）。★軽い',
    owner: 'dev',
    until: '2026-09-22',
  },
  {
    id: 'AUDIT-RANDOM-K',
    what: '★`packages/sim-engine/src/balance.ts:78` の `RACE_RANDOM_K: 0.12`（★較正値は race-engine 側の 0.22）',
    why: '🔴 ★**0.12 は D-016 が「1番人気 51.6%」と実測した頃の値**（★D-021 で 0.22 に再較正）。'
      + '★**写しが残っている**（D-052）。⚠️ ★**どちらが生きているかを先に数えること** — '
      + '★消す前に、★`sim-engine` 側の 0.12 を読んでいる経路が無いことを確かめる',
    owner: 'dev',
    until: '2026-09-22',
  },
  {
    id: 'AUDIT-NEXT-CONFIG',
    what: '★`apps/web/next.config.mjs` の「Route Handler を作りません」が事実と違う',
    why: '✔ ★`apps/web/src/app/api/` に **`healthz`** と **`rig-lab`** が実在する。'
      + '★CLAUDE.md も「Route Handler にビジネスロジックを書かない」と書いており、'
      + '★**「作らない」と「ロジックを書かない」がずれている**。★註記を事実に合わせる',
    owner: 'dev',
    until: '2026-09-26',
  },
  {
    id: 'AUDIT-ENV-ANON',
    what: '★`.env.example` の `SUPABASE_ANON_KEY` と、Web が読む `NEXT_PUBLIC_SUPABASE_ANON_KEY` が食い違う',
    why: '★手順どおりに `.env` を作ると ★**Web が鍵を読めません**。★書き写す人が 1 度 詰まる',
    owner: 'dev',
    until: '2026-09-26',
  },
  {
    id: 'AUDIT-WAV',
    what: '★`.gitignore` がルートの `*.wav` を除外していない',
    why: '✔ ★いま未追跡の wav は **0 本**なので**即座の危険はない**。'
      + '★ただし `git add -A` を打った日に入ります（★CLAUDE.md が `git add -A` を禁じているのも同じ理由）',
    owner: 'dev',
    until: '2026-09-26',
  },
  {
    id: 'AUDIT-ZIP',
    what: '★ルートの zip 2 本が追跡されたまま',
    why: '🔴 ★**開発側では消しません** — ★オーナーが置いた可能性があり、'
      + '★版管理から消すのは**戻しにくい操作**です。★**オーナーの判断**',
    owner: 'owner',
    until: '2026-10-03',
  },
  {
    id: 'AUDIT-CLAUDE-MD',
    what: '★`CLAUDE.md:10`「現在のフェーズ: **P0**」が古い（★いま P4 のブランチで作業している）',
    why: '🔴 ★**開発側では書き換えません** — ★`CLAUDE.md` は**この作業ツリーの指示書**で、'
      + '★開発側が伝令の求めで書き換える文書ではありません。★**オーナーの判断**',
    owner: 'owner',
    until: '2026-10-03',
  },
  {
    id: 'AUDIT-CANON-0.26',
    what: '★正典 §13.1 の `RACE_RANDOM_K 0.26` が実装（0.22）と食い違う',
    why: '✔ ★検査の題は直っている（「再較正値 0.22（正典 §13.1 は 0.26・改訂依頼中）」）。'
      + '★残っているのは**正典側**。★**正典の改訂はレビュー側／オーナー**',
    owner: 'review',
    until: '2026-10-03',
  },

  {
    id: 'M-9-ledger',
    what: '🔴 ★`packages/betting/src/point-flow.ts` は ★**門が読んでいない第二の帳簿**（★D-052）',
    why: '✔ ★呼び手を数えました（★**AU-1**）: ★製品コード **0** ／ 門・ツール **0** ／ 自分の検査だけ。'
      + '★**本物の V-11 は `tools/verify-v11-synthetic.mjs:353`** で、'
      + '★`check(ppIssued > 0 && ppConsumed > 0, …)` と ★**最初から fail-closed**。'
      + '→ ★**配線するなら `ppNetHealth()`（3 状態）を使うこと。** '
      + '🔴 ★`isPpNetHealthy`（後方互換の別名）に配線すると、★**そのとき初めて M-8 の穴が開きます**',
    owner: 'dev',
    until: '2026-10-31',
    /**
     * ★**NT-4**: ★機械が確かめられる述語（★任意）。★**偽になったら「消し忘れ」として落とします**。
     *
     * ⚠️ 🔴 ★**`() => true` を置かないこと。** ★それは「通るだけの述語」で、
     *    ★**今日ずっと見てきた「緑の理由が違う」の作り方そのもの**です。
     *    → ★書けないなら ★**書かない**（★この欄は任意です）。
     *
     * ★ここでは ★**「`point-flow.ts` の関数を、製品コードも門も呼んでいない」**を数えます。
     *   ★呼ばれ始めたら ★**この指摘は別のもの**（★配線された）になるので、★簿を書き直す必要があります。
     */
    stillOpen: ({ grepCount }) => grepCount('isPpNetHealthy|ppNetHealth|isPpNetNotUnhealthy', {
      exclude: /point-flow\.(ts|test\.ts)$|open-findings/,
    }) === 0,
  },

  // ───────── 2026-09-19 に見つけて、まだ塞いでいないもの ─────────
  {
    id: 'DS-5 ④',
    what: '★組成 → 発走（12 分）の間に引退した馬が、まだ取消にならない',
    why: '✔ ★**登録 → 組成**は 2026-09-19 に塞いだ（`scratchRetiredEntries`）。'
      + '🔴 ★**組成 → 発走は残る** — ★その馬は凍結を持っているので `entry-freeze` は外し、'
      + '★**D-111 ④（D-056 の安全網）も「凍結が無い」を見るので拾わない**。'
      + '★形は「発走の直前にもう 1 度 見る」（★DS-5 ⑤）。⚠️ ★**人を迎える前に**（★いま利用者 0 人）',
    owner: 'dev',
    until: '2026-10-03',
  },
  {
    id: 'GB-1 画面',
    what: '★「前より○○できるようになった」を、★**画面にまだ出していない**',
    why: '✔ ★行に基準を持ち（移行 `0053`）、★ワーカーが数えるところまでは入った。'
      + '★`growthTellsOf` は**能力の名前**を返すだけで、★言葉にするのは画面（D-116 ②）。'
      + '⚠️ ★**「配線した」と読まないこと。** ★検査が「画面に出していない」ことを固定している',
    owner: 'dev',
    until: '2026-10-03',
  },
  {
    id: 'CC-1 ⑤ 配備',
    what: '★キャリア 24 → 40 の効き（成立率 98.93%）は ★**合成でしか測っていない**',
    why: '✔ ★合成 3,000（8 シード）と ★D の素質の分布（8 シード）で一致（0.92σ）。'
      + '🔴 ★**配備の集団で実際に走らせた数は無い**（★VP-2 の形）。→ ★**WK-5 待ち**',
    owner: 'dev',
    until: '2026-10-03',
  },
];

/**
 * ★**期限が切れている指摘**と、★**書き漏れ**を返す。
 *
 * @param {string} todayIso ★今日（★`Date.now()` を中で呼ばない・憲法 4）
 * @param {readonly object[]} registry ★登録簿。★差し替えられる形にしてある
 *   （★そうしないと、★簿が健全な間は「落ちる側」を 1 度も試せません）
 */
export function diffOpenFindings(todayIso, registry = OPEN_FINDINGS, helpers = defaultHelpers()) {
  const expired = [];
  const missingFields = [];
  const OWNERS = new Set(['dev', 'review', 'owner']);
  for (const e of registry) {
    const label = e.id ?? '(id なし)';
    if (typeof e.id !== 'string' || e.id === '') missingFields.push(`${label}: id が無い`);
    if (typeof e.what !== 'string' || e.what.length < 10) missingFields.push(`${label}: what が短い`);
    /** ⚠️ ★「調査中」は理由ではありません（★`known-red` と同じ） */
    if (typeof e.why !== 'string' || e.why.length < 20) missingFields.push(`${label}: why が短い`);
    if (!OWNERS.has(e.owner)) missingFields.push(`${label}: owner が dev/review/owner でない`);
    if (typeof e.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.until)) {
      missingFields.push(`${label}: until が ISO の日付でない`);
      continue;
    }
    if (e.until < todayIso) expired.push(`${label}（期限 ${e.until}）: ${e.what}`);
  }
  /**
   * 🔴 ★**NT-4**: ★`stillOpen` が**偽**なら、★**もう開いていない**（★消し忘れ）。
   *
   * ⚠️ ★**全行に強制しません。** ★書けない指摘のほうが多く、
   *    ★無理に書かせると ★**「通るだけの述語」**が置かれます（★レビュー側の但し書き）。
   * ⚠️ ★述語が投げたら ★**書き漏れ**として扱います（★黙って真にしない・R-21）。
   */
  const closed = [];
  for (const e of registry) {
    if (typeof e.stillOpen !== 'function') continue;
    try {
      if (e.stillOpen(helpers) === false) {
        closed.push(`${e.id}: ★もう開いていません（★簿から消してください）`);
      }
    } catch (err) {
      missingFields.push(`${e.id}: stillOpen が投げました（${String(err).slice(0, 120)}）`);
    }
  }

  /** ★同じ id を 2 回 載せない（★片方だけ消して「直した」になる） */
  const seen = new Set();
  for (const e of registry) {
    if (seen.has(e.id)) missingFields.push(`${e.id}: id が重複している`);
    seen.add(e.id);
  }
  return { expired, missingFields, closed };
}
