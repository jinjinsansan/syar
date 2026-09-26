/**
 * ★**作り直す前に、いま何を呼んでいるかを釘付けする**
 *   ★裁定 `REVIEW_SCREEN_GENERATIONS_20260925.md`（★「rebuild の 15 枚も 1 枚ずつ・網を先に」）
 *
 * 【🔴 ★なぜ「網を先に」なのか — ★2026-09-25 の実害】
 *   ★`/training` を `/train` へ転送して消したところ、
 *   ★★**`rpc('set_training_order')` を呼ぶ唯一の画面が消えました**（★`/train` は見た目だけ）。
 *   ★旧い画面が無くなると、★**誰も「前は出来た」と言えません。**
 *   → ★作り直す前に ★**いま呼んでいる口を書き留めます。**
 *     ★作り直したものがこの表より減っていたら、★検査が落ちます。
 *
 * 【★この表は「実測して書いた」ものです】
 *   ★`npx tsx tools/measure-screen-deps.mjs` の出力から写しました（★2026-09-25）。
 *   ⚠️ ★**手で数えていません。** ★引き算もしていません（★今日 2 度 間違えたので）。
 *
 * 【⚠️ ★この釘が言えること・言えないこと】
 *   ★✅ 言える: ★「前は `lib/breed-screen` を読んでいたのに、作り直した版は読んでいない」
 *   ★🔴 言えない: ★「同じ体験ができるか」。★そこは人が見ます（★オーナーとデザイナー）。
 *   ★`../../components/uma/...` のような ★共有の部品は辿っていません（★`screen-deps.ts` の註記）。
 *
 * 【★減らしてよいとき】
 *   ★作り直しで ★**意図して**口が変わることは在ります（★例: `game-demo` を捨てて本物に繋ぐ）。
 *   → ★そのときは ★**この表を直し、★なぜ減らしたかを書く**こと。★黙って減らさない。
 */

export interface RebuildPin {
  /** ★呼んでいる RPC（★サーバーの口） */
  readonly rpcs: readonly string[];
  /** ★読んでいる `lib/` */
  readonly libs: readonly string[];
  /** ★この画面で特に落としてはいけないもの（★人が読むための註記） */
  readonly note?: string;
}

/**
 * ★`verdict: 'rebuild'` の画面の釘。
 * ⚠️ ★`screen-generations.test.ts` が ★**実測と突き合わせます**。
 */
export const REBUILD_PINS: ReadonlyMap<string, RebuildPin> = new Map([
  ['/training', {
    rpcs: ['set_training_order'],
    libs: ['game-demo', 'stable', 'stable-repo', 'supabase'],
    note: '🔴 ★**`set_training_order` を呼ぶ唯一の画面**。★これを落とすと育成のループが止まります。'
      + '★2026-09-25 に転送で一度 落としました（★戻しました）',
  }],
  ['/entry', {
    rpcs: [],
    libs: ['entry-repo', 'entry-screen', 'game-demo', 'stable'],
    note: '★登録の実体は `entry-screen.ts`（★`entry-repo.ts` を直して「直した」と誤報した先）。'
      + '★`enter_race` は `entry-repo` の中から呼ばれます',
  }],
  ['/stable', { rpcs: [], libs: ['stable', 'stable-repo'] }],
  ['/stable/[horseId]', {
    // ✅ ★2026-09-25 に ★**本物へ繋ぎました**（★裁定 `REVIEW_DISCOVERY_AXES_20260925.md` §5）
    rpcs: [], libs: ['discovery-screen', 'stable', 'stable-repo'],
    note: '🔴 ★それまで ★**`demoStableRepo`**（見本のデータ）を読んでいました。'
      + '★`supabaseStableRepo.horse(id)` は ★**最初から在りました**（`stable-repo.ts:187`）。'
      + '⚠️ ★殻（`page.tsx`・サーバー部品）と ★中身（`horse-detail-view.tsx`・`use client`）に分けてあります。'
      + '★`revalidate` を ★**中身に書かないこと**（★2026-09-21 に同じことで Vercel のビルドが 31 コミット止まった）',
  }],
  ['/stable/breed', {
    rpcs: [], libs: ['breed-screen', 'stable-repo'],
    note: '★血統ループの本体（★配合の依頼）',
  }],
  ['/stable/foal', {
    rpcs: [], libs: ['initial-breed-screen', 'onboarding', 'stable-repo'],
    note: '★最初の 1 頭（★案 A・D-120）',
  }],
  ['/stable/name', {
    rpcs: [], libs: ['name-screen', 'stable-repo'],
    note: '★命名（★禁止名の検査はサーバー側）',
  }],
  ['/stable/roles', {
    rpcs: [], libs: ['retired-screen', 'stable-repo', 'story-tone'],
    note: '★引退後の役割（★種牡馬・繁殖牝馬・功労馬）',
  }],
  ['/stable/retired', {
    // ✅ ★2026-09-25 に ★**見本を 1 つも残さず本物へ繋ぎました**
    rpcs: [], libs: ['discovery-screen', 'retired-screen', 'stable-repo', 'story-tone'],
    note: '✅ ★引退馬の一覧は `retired-screen`（`my_retired_horses()`・`0075`）、'
      + '★生涯の記録は `loadHorseStory`（★公開の view `horse_story_event_public`）、'
      + '★他の牧場の引退馬は `retired_horses_public`（`0083`・★正典 LR-6・★牧場名まで）、'
      + '★発見は `discovery-screen`（`my_horse_discovery_runs`・`0084`）から。'
      + '✅ ★`horse-story-demo` は ★**外れました**（★裁定 `REVIEW_DISCOVERY_AXES_20260925.md` §4 条件 5）。'
      + '🔴 ★それまで「判明した能力」は ★**見本**で、しかも ★**軸が正典と違っていました**'
      + '（★能力 4 つ。★正典 **D-116** は「距離・馬場・脚質・気性」）。'
      + '⚠️ ★気性の軸は ★**出していません**（★`RUNAWAY_BASE` が 0 で永久に「？？？」になるため。'
      + '★戻る条件は ★**D-112 が入ったら**）',
  }],
  ['/stable/market', {
    rpcs: [], libs: ['market-screen', 'stable-repo'],
    note: '✅ ★**2026-09-26 に実データへ繋ぎました**（★オーナー指示）。'
      + '★`market-screen` が ★`horse_market_listing_public`（`0085`）を読み、★`buy_horse`（`0025`）を呼びます。'
      + '⚠️ ★旧は ★`lib[game-demo]`（★見本の値段を並べるだけ）でした。'
      + '★釘は ★`npx tsx tools/measure-screen-deps.mjs` の ★**実測**で更新しています（★引き算していません）。'
      + '🔴 ★見た目は ★**仮**です（★依頼 R-17）— ★実データは ★値段 14 通り × ほぼ 1 頭で、'
      + '★旧い「帯 × 3 口」の前提が ★崩れています（★本番で実測）',
  }],
  ['/records', {
    rpcs: [], libs: ['records-screen'],
    note: '⚠️ ★`page.tsx` は `records-view.tsx` に渡すだけ。★実体は子部品（★辿って測っています）',
  }],
  // ⚠ ★`/races`（一覧）と `/races/[id]/odds` は ★2026-09-25 に転送して消しました（★釘から外した）
  ['/races/[id]', {
    rpcs: [], libs: ['format', 'supabase'],
    note: '🔴 ⚠️ ★**`/odds/[id]` へ転送してはいけません**（★2026-09-25 に比べて確かめました）。'
      + '★重なるのは ★枠・人気・オッズだけで、★ここには ★**新版に無いもの**が在ります:'
      + '★**着順**（確定した結果）・★**照合**（Provably Fair の突き合わせ）・★**締切まで**・★厩舎・★発走。'
      + '★転送すると ★**それらが消えます**（★`/training` → `/train` で一度やった過ちと同じ形）。'
      + '⚠️ ★**新世代の `components/uma/race-strip.tsx` がここを指しています** — '
      + '★つまり ★新しい画面から 1 歩で旧い見た目に落ちます。★作り直しの優先度は高いですが、'
      + '★**見た目はデザイナーの仕事**です（★2026-09-15 オーナー指示）。★開発側で作り直しません',
  }],
  ['/races/[id]/bet', { rpcs: [], libs: ['bet-screen', 'format', 'game-demo'] }],
  ['/odds', { rpcs: [], libs: ['supabase'] }],
]);
