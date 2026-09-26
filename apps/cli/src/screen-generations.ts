/**
 * ★**画面 1 枚ずつの始末**（★捨てる／作り直す／新版へ送る／開発用）
 *   ★裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §3（2026-09-25・レビュー側の決定）
 *
 * 【🔴 ★なぜ要るか — ★オーナーの同じ苦情が何度も再発していた】
 *   ★オーナー: 「★なぜこの白の古いデザインがまだ残っているのですか。★この問題はずっと伝えています」
 *   ★私はそれまで ★**「帯が二重」だけ**を直しており、
 *   ★**画面そのものが旧世代である**ことを見ていませんでした。
 *   ★裁定: ★**「同じ役割の画面が 2 つ在ると、必ず再発する。★1 枚ずつ決めて記録する」**
 *
 * 【★測り方 — ★「行数」や「見た目」で決めていません】
 *   ★`apps/web/src/components/uma/` を読んでいるか（★R-14 の新世代の部品）で分けました。
 *   ✔ ★2026-09-25 の実測（★`/prizes`・`/races`・`/races/[id]/odds` を転送して消した後）:
 *     ★`page.tsx` **50 枚**のうち ★新世代 **15 枚**・★旧 **35 枚**。
 *     ★釘も **35** へ下げました（★下げないと次から緩みます）。
 *   🔴 ⚠️ ★**この数を 2 度 間違えました。どちらも「測らずに引き算した」ためです。**
 *      ★1 度め: ★消した後の旧を ★37 − 2 ＝ **35** と書いた（★実測 36 で検査に落ちた）。
 *      ★2 度め: ★`/training` を戻したのに ★**36 のまま**にした（★実測 37）。
 *      → ★★**釘の数は、そのつど測った数にすること。** ★引き算は「測った」ではありません。
 *   ⚠️ ★**この指標は粗いです。** ★`/race` は自前の描画を持つので「旧」に出ますが、
 *      ★**旧いデザインではありません**（★`OWN_HEADER` で帯も足していない）。
 *      → ★だから ★**1 枚ずつ書いています**（★数だけで判断しない）。
 *
 * 【🔴 ★実測で分かった、いちばん大きいこと】
 *   ★開発用の下見画面 ★**18 枚が本番で護りなしに生きています**（★実測。★目で数えて 16 と書いていました）
 *   ★（`/art-lab` `/camera` `/gait-review` `/rig-lab/*` `/still` `/race-quality-lab` …）。
 *   ★`/design-preview/odds` だけが `if (process.env.NODE_ENV !== 'development') notFound();` を持っています。
 *   → ★オーナーが「白い古いデザイン」に着ける経路は ★**ここが最有力**です。
 *   ⚠️ ★**まだ塞いでいません** — ★私自身が素材を本番で見るのに使っている可能性があり、
 *      ★塞ぐとオーナーの確認手段も消えます（★どれを残すかは ★オーナー判断・照会に出しました）。
 *
 * 【⚠️ ★画面を 1 枚 消すと、★**4 方向に波及します**】（★2026-09-25 に ★3 回 踏みました）
 *   ★① ★その画面へのリンク（★`href` を直す。★消し忘れると ★`screen-reachable` が落ちます）
 *   ★② ★その画面を ★**見張っていた検査**（★「落ちる」ではなく ★**「読み込めない」**で止まります）
 *   ★③ ★その画面だけが使っていた ★**CSS の規則**（★`mobile-css-anchors` が「黙って効かない規則」として落とします）
 *   ★④ ★**生成物**（★`.next` 系の `types/validator.ts` が消したページを参照し続けます）
 *      → ★`apps/web` の `.next` 系の `types` を消して ★型検査を流し直します（★ビルドで作り直されます）。
 *      ⚠️ ★これは ★**2 度 踏みました**。★`next build` は通るのに ★型検査だけが落ちます。
 *      ⚠️ 🔴 ★この註記を書くとき ★**`.next` の後に星と斜線を続けて書いて、★註記を閉じてしまいました**
 *         （★JSDoc の閉じ記号になる）。★経路は ★**言葉で書く**こと。
 *
 * 【★もう 1 つの経路 — ★新しい画面から旧い画面へのリンク】
 *   ✔ `app/mypage/page.tsx`（★新）→ ★`/records`・`/entry`（★旧）
 *   ✔ `app/setup/page.tsx`（★新）→ ★`/stable`（★旧）
 *   ✔ `components/uma/foal-invite.tsx`（★新）→ ★`/stable`（★旧）
 *   → ★**新しい画面を出しても、1 歩で旧い画面に落ちます。**
 */

/** ★その画面をどうするか */
export type ScreenVerdict =
  /** ★新世代。★そのまま */
  | 'new'
  /** ★新版が在る → ★**転送して消した**（★`next.config.mjs` の `SUPERSEDED_SCREENS`） */
  | 'redirected'
  /** ★要るが旧世代 → ★**デザイナーに作り直しを依頼する**（★開発側で見た目を作らない） */
  | 'rebuild'
  /** ★開発用の下見。★利用者の導線に無い */
  | 'dev-only'
  /** ★旧世代だがデザインの問題ではない（★自前の描画・自前の LP） */
  | 'keep-as-is';

export interface ScreenRecord {
  /** ★経路（★`/` から） */
  readonly route: string;
  readonly verdict: ScreenVerdict;
  /** ★なぜそう決めたか（★空欄禁止） */
  readonly why: string;
}

/**
 * ⚠️ ★**足すときは `verdict` と `why` を必ず書くこと。**
 *    ★`screen-generations.test.ts` が ★`app/**\/page.tsx` の実物と突き合わせます
 *    （★簿に無い画面が在ったら落ちます ＝ ★黙って画面を増やせません）。
 */
export const SCREENS: readonly ScreenRecord[] = [
  // ── 新世代（R-14・`components/uma`）────────────────────────────
  { route: '/', verdict: 'new', why: '★玄関の LP（★馬物語）' },
  { route: '/home', verdict: 'new', why: '★ダッシュボード' },
  { route: '/mypage', verdict: 'new', why: '★わたしの馬。⚠️ ★ここから `/records`・`/entry`（旧）へ出ます' },
  { route: '/vote', verdict: 'new', why: '★レースと投票' },
  { route: '/odds/[id]', verdict: 'new', why: '★1 レースのオッズ' },
  { route: '/train', verdict: 'new', why: '★育てる（★`/training` の新版）' },
  { route: '/exchange', verdict: 'new', why: '★交換（★`/prizes` の新版）' },
  { route: '/earn', verdict: 'new', why: '★ポイントを稼ぐ（★2026-09-25 にデイリー EP を繋いだ）' },
  { route: '/howto', verdict: 'new', why: '★遊び方' },
  { route: '/watch-race', verdict: 'new', why: '★中継の入口' },
  { route: '/login', verdict: 'new', why: '★ログイン' },
  { route: '/signup', verdict: 'new', why: '★口座の登録（★メール＋パスワード・D-113）' },
  { route: '/setup', verdict: 'new', why: '★初回の設定。⚠️ ★ここから `/stable`（旧）へ出ます' },
  { route: '/forgot-password', verdict: 'new', why: '★パスワードの再設定の入口' },
  { route: '/reset-password', verdict: 'new', why: '★パスワードの再設定' },

  // ── そのまま（★旧世代の判定が粗いだけ）────────────────────────
  {
    route: '/race',
    verdict: 'keep-as-is',
    why: '★レースの中継。★自前の描画（キャンバス）で `components/uma` を使わないので「旧」に出るだけ。'
      + '★`OWN_HEADER` なので帯も足していない。★**旧いデザインではない**',
  },
  {
    route: '/lp-preview',
    verdict: 'keep-as-is',
    why: '★馬物語の LP の見本。★自前の `ms-nav` を持つ（★`OWN_HEADER`）。★`/` と同じ中身',
  },

  // ── 新版へ送った（★消した）────────────────────────────────────
  // ⚠️ ★ここに行を残すのは ★**「昔在った」を記録するため**です。
  //    ★`route` のファイルは在りません（★転送は `next.config.mjs`）。
  {
    route: '/prizes',
    verdict: 'redirected',
    why: '🔴 ★`/exchange` が在るのに残っていた（★222 行・旧世代）。★2026-09-25 に消して `/exchange` へ転送。'
      + '✔ ★送り先が繋がっていることを確かめた（`exchangePrize` / `loadPrizeScreen` / `setError`）',
  },

  // ── 作り直す（★要るが旧世代・★デザイナーへ）──────────────────
  // ⚠️ ★**開発側で見た目を作りません**（★2026-09-15 オーナー指示）。★依頼は `requests/` へ。
  {
    route: '/training',
    verdict: 'rebuild',
    why: '🔴 ⚠️ ★**`/train` へ転送してはいけません**（★2026-09-25 に一度やって戻しました）。'
      + '★`/train` は「まだ見た目だけ」で（★その画面の註記が自分でそう書いている）、'
      + '★`rpc(` も `Repo` も呼びません。★一方 ここは ★**`rpc(\'set_training_order\')` を呼ぶ唯一の画面**です。'
      + '★転送すると ★**調教の指示を出す口が消え、育成のループが止まります**。'
      + '→ ★`/train` を先に繋いでから送ること（★網: `screen-generations.test.ts` の「送り先がサーバーを呼んでいる」）',
  },
  { route: '/entry', verdict: 'rebuild', why: '★出走登録。★導線に在る（`/mypage` から）。★2026-09-25 に登録が動くようにした' },
  { route: '/stable', verdict: 'rebuild', why: '★厩舎の一覧。★`/setup` と `foal-invite` から来る' },
  { route: '/stable/[horseId]', verdict: 'rebuild', why: '★1 頭の詳細' },
  { route: '/stable/breed', verdict: 'rebuild', why: '★配合。★血統ループの本体' },
  { route: '/stable/foal', verdict: 'rebuild', why: '★最初の 1 頭の生産（★案 A・D-120）' },
  { route: '/stable/name', verdict: 'rebuild', why: '★仔の命名' },
  { route: '/stable/roles', verdict: 'rebuild', why: '★引退後の役割' },
  { route: '/stable/retired', verdict: 'rebuild', why: '★引退馬の一覧' },
  { route: '/stable/market', verdict: 'rebuild', why: '✅ ★2026-09-26 に ★**実データへ繋ぎました**（★`market-screen`）。'
    + '★D-122 ④「空の店へ送らない」は ★満たしました（★出品が 0 のときは そう言います）。'
    + '🔴 ★**見た目は仮**（★依頼 R-17）— ★値段 14 通り × ほぼ 1 頭で ★旧い「帯 × 3 口」の前提が崩れている' },
  { route: '/records', verdict: 'rebuild', why: '★戦績。★`/mypage` から来る' },
  /**
   * ★以下の 5 枚は ★**裁定の手順（§6）を流して決めました**（2026-09-25）。
   *   ★① 依存を測る → ★② 入口を数える → ★③ 片方が見本なら本物を残して転送
   *   → ★④ 両方本物なら役割の違いを 1 行で書けるか → ★⑤ 結果を簿に書いてから着手
   *
   * ★測った値（`npx tsx tools/measure-screen-deps.mjs`）:
   *   `/races` = format+supabase ・ `/vote` = bet-screen ・ `/races/[id]/bet` = bet-screen+format+game-demo
   *   `/races/[id]/odds` = supabase ・ `/odds/[id]` = odds-demo+supabase ・ `/odds` = supabase
   *   → ★**どれも本物**（★見本だけのものは一つも無い）。→ ★④ へ進む。
   *
   * ★入口（実測）: `/races` ← `/race`・`/stable`（旧） ・ `/vote` ← `/home`（新・本線）
   *   ⚠️ ★`components/uma/race-strip.tsx`（★**新世代の部品**）が ★`/races/${id}` を指しています。
   *      ★つまり ★**新しい画面から 1 歩で旧い画面に落ちます**。
   */
  {
    route: '/races',
    verdict: 'redirected',
    why: '★**一覧の役割が `/vote` と二重**。★`/vote` は新世代で `/home`（本線）から来る。'
      + '★`/races` の入口は旧い画面からだけ。→ ★2026-09-25 に消して `/vote` へ転送。'
      + '✔ ★送り先が繋がっていることを確かめた（`bet-screen`）',
  },
  {
    route: '/races/[id]',
    verdict: 'rebuild',
    why: '🔴 ★**新版がありません**（`/vote` はレースを指定できない — ★いま売っているレースを読む）。'
      + '⚠️ ★**新世代の `race-strip` がここを指している**ので、★作り直しの優先度が高い。'
      + '🔴 ★**`/odds/[id]` へ転送してはいけません**（★2026-09-25 に比べました）: ★重なるのは'
      + '★枠・人気・オッズだけで、★**着順・照合（Provably Fair）・締切まで**は ★新版に在りません。'
      + '★転送すると消えます。★**見た目の作り直しはデザイナー待ち**（★開発側で作らない）',
  },
  {
    route: '/races/[id]/bet',
    verdict: 'rebuild',
    why: '⚠️ ★**手順では決まりません（★オーナー判断へ）**。'
      + '★`/vote` は「いま売っているレースに投票」、★ここは「指定したレースに投票」。'
      + '★役割の違いは 1 行で書けますが、★**「今以外のレースに買いたいか」は遊びの手触り**です'
      + '（★サイクルは 6 分なので、★売っているレースは常に 1 本）。★照会に出しました',
  },
  {
    route: '/races/[id]/odds',
    verdict: 'redirected',
    why: '★**同じ役割が `/odds/[id]` に在る**（★どちらも「1 レースのオッズ」）。'
      + '★`/odds/[id]` は新世代で `/vote` から来る。→ ★2026-09-25 に消して転送。'
      + '✔ ★送り先は DB を引いている（`odds-demo` は `?demo=1` のときだけ）',
  },
  {
    route: '/odds',
    verdict: 'rebuild',
    why: '★オッズの**一覧**。★`/odds/[id]` は**1 レース**なので ★役割が違います'
      + '（★手順 ④ で 1 行で書けた）。★新版は無し。★入口は `components/ui.tsx` から 1 つ',
  },

  // ── 開発用（★利用者の導線に無い）──────────────────────────────
  // 🔴 ⚠️ ★**下の 18 枚は、いま本番で開けます**（★`/design-preview/odds` だけ護りあり）。
  //    ★塞ぐかは ★オーナー判断（★素材の確認に使っている可能性があるため）。
  { route: '/art-lab', verdict: 'dev-only', why: '★素材の下見' },
  { route: '/camera', verdict: 'dev-only', why: '★カメラの下見' },
  { route: '/course', verdict: 'dev-only', why: '★走路の下見' },
  { route: '/design-check', verdict: 'dev-only', why: '★デザインの確認（★旧世代の殻を使う唯一の画面）' },
  { route: '/design-preview/odds', verdict: 'dev-only', why: '✅ ★**本番で 404 にする護りを持つ唯一の画面**' },
  { route: '/gait-review', verdict: 'dev-only', why: '★歩様の確認（★710 行）' },
  { route: '/lp-arcade', verdict: 'dev-only', why: '★旧いアーケードの LP。★`/` が新版。★捨てる候補' },
  { route: '/race-next', verdict: 'dev-only', why: '★次の中継の試作（★915 行）' },
  { route: '/race-quality-lab', verdict: 'dev-only', why: '★映像の質の下見' },
  { route: '/race-world-lab', verdict: 'dev-only', why: '★世界の下見' },
  { route: '/rig-lab', verdict: 'dev-only', why: '★リグの下見' },
  { route: '/rig-lab/blender', verdict: 'dev-only', why: '★リグの下見（Blender 由来の資産）' },
  { route: '/rig-lab/compare', verdict: 'dev-only', why: '★リグの下見（案の比較）' },
  { route: '/rig-lab/explore', verdict: 'dev-only', why: '★リグの下見（探索）' },
  { route: '/rig-lab/race', verdict: 'dev-only', why: '★リグの下見（レースの動き）' },
  { route: '/rig-lab/rig', verdict: 'dev-only', why: '★リグの下見（骨格）' },
  { route: '/rig-lab/sprite', verdict: 'dev-only', why: '★リグの下見（スプライト化）' },
  { route: '/still', verdict: 'dev-only', why: '★静止画の確認' },
  { route: '/watch', verdict: 'dev-only', why: '★本番と同じエンジンで確定 → 描画までを検分する画面' },
];

/**
 * ★**旧世代の上限**（★2026-09-25 の ★**実測**）。
 *
 * ⚠️ ★**増やせません。** ★減らすのは歓迎（★作り直す／捨てるたびに下げる）。
 * 🔴 ★最初 ★引き算で `35` と書いて ★**検査に落ちました**（★実測 36）。
 *    ★**釘の数は測った数にすること。** ★計算で出すと、★測っていない前提が釘になります。
 */
export const OLD_GENERATION_MAX = 35;
