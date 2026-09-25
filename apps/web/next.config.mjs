/** @type {import('next').NextConfig} */
// ★Vercel は「フロントと読み取り系だけ」（正典 §14.3）。
//   ★**Route Handler に「ビジネスロジック」を置きません**（★CLAUDE.md の文言）。
//
// ⚠️ 🔴 ★**「Route Handler を作りません」と書いてありました。★事実と違います**
//    （★2026-09-19・AUDIT-NEXT-CONFIG・2026-09-14 の監査が指摘）。
//    ✔ ★実在します: ★`app/api/healthz/route.ts` ／ ★`app/api/rig-lab/[...asset]`。
//    ★どちらも ★**ビジネスロジックを持ちません**（★生存確認と、開発用の素材配信）ので、
//    ★方針には反していません。★**註記のほうが間違っていました。**
//    → ★禁じているのは ★**「作ること」ではなく「ロジックを置くこと」**です
//      （★着順・オッズ・ポイントはワーカーとサーバーが決めます・憲法 3）。
/**
 * ★**サーバーを起動した時刻**を画面に出すための値。
 *
 * 【なぜ要るか（2026-08-21 の実害）】
 *   直した内容が画面に出ているかを、オーナーと開発側で**何度も取り違えました。**
 *   ・「直った」と報告 → 実際にはブラウザが古い JS を掴んでいた
 *   ・修正 A は出ていないのに修正 D は出ている（別コミットの間で読み込まれたため）
 *   ★**どの版を見ているかが、画面から分からない**のが原因です。
 *   → デバッグのバッジに出して、**スクリーンショットから判別できる**ようにします。
 *
 * ⚠️ ★ゲームの計算には一切使いません（憲法 4 の決定論は乱数と時刻の注入の話で、
 *    これはビルドの識別子です）。表示だけに使うこと。
 */
const BUILD_STAMP = new Date().toISOString().slice(11, 19);

/**
 * 🔴 ★**門のビルドは、★別の出力先へ**（★2026-09-21・レビュー側の裁定）。
 *
 * 【★なぜ要るか】
 *   ★2026-09-21、★`/stable` に `export const revalidate = 0` を残したまま push し、
 *   ★★**Vercel のビルドが落ち続けて、★本番が 31 コミット 古い版を配信していました。**
 *   ★型検査は通ります（★型としては正しい `number`）。★門にも `build:web` が在りませんでした。
 *   → ★★**門が緑で、★本番だけが作り直せない**（★正典 **R-28** そのもの）。
 *   → ★門に `build:web` を入れます。
 *
 * 【⚠️ ★入れられなかった理由と、★その解き方】
 *   ★`next dev` と `next build` は ★**同じ `.next` を奪い合います**。
 *   ★オーナーが開発サーバーを見ている最中に門を流すと、★★**画面が落ちます**。
 *   → ★**出力先を分けます。** ★`STAR_NEXT_DIST_DIR` が在ればそこへ、★無ければ `.next`。
 *
 * ⚠️ ★**既定を変えていません。** ★Vercel はこの環境変数を設定しないので `.next` のままです
 *    （★`vercel.json` の `outputDirectory: apps/web/.next` と合っています）。
 *    ★★**本番の作り方を、★門の都合で変えない。**
 */
const DIST_DIR = process.env['STAR_NEXT_DIST_DIR'] ?? '.next';

/**
 * ★**起動時に、繋ぐ先を 1 行 出します**（★裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §14-2）。
 *
 * 🔴 ★この PC の開発サーバーは ★**本番の DB に繋がっていました**。★人が見て確かめられる形にします。
 * ⚠️ ★**書き換えた名札ではなく**、★クライアントが実際に使う `NEXT_PUBLIC_SUPABASE_URL` から出します。
 * ⚠️ ★本番の配信（`next build`）でも出ますが、★これは **Vercel のビルドログ**に出るだけで、
 *    ★利用者の画面には出ません（★帯のほうは `NODE_ENV` で止めています）。
 */
{
  const raw = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
  let host = '（未設定）';
  try { if (raw !== '') host = new URL(raw).host; } catch { host = '（読めません）'; }
  console.log(`★STAR: 繋ぎ先 ${host} ／ NODE_ENV=${process.env.NODE_ENV ?? '(未設定)'} ／ 出力先 ${DIST_DIR}`);
}

/**
 * 🔴 ★**同じ役割の画面を 2 つ残さない**（★2026-09-25・裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §3）
 *
 * 【★なぜ要るか — ★オーナーの苦情が何度も再発していた】
 *   ★オーナー: 「★なぜこの白の古いデザインがまだ残っているのですか。★この問題はずっと伝えています」
 *   ★私はそれまで ★**「帯が二重」だけ**を直しており、★**画面そのものが旧世代である**ことを
 *   ★見ていませんでした。
 *   ★`/training` は ★**`/train` が在る**のに残っており、★`/prizes` は ★**`/exchange` が在る**のに残っていました。
 *   → ★★**どちらを直したか分からなくなるので、必ず再発します。**
 *
 * 【★なぜ画面の中で `redirect()` を呼ばないのか】
 *   ★旧い画面のファイルを「中身が転送だけの殻」にすると、★**画面の数が減りません**。
 *   ★`screen-reachable` や旧世代の網が ★その殻を数え続けます。
 *   → ★**ここ（設定）で送り、★ファイルは消します。** ★履歴には git が残します。
 *
 * ⚠️ ★`permanent: false`（307）にします。★恒久（308）はブラウザが強く覚えるので、
 *    ★行き先を変えたときに ★**古い転送が残った端末**が出ます。
 */
const SUPERSEDED_SCREENS = [
  // ★旧: /prizes（222 行・旧世代）→ ★新: /exchange（R-14 の画面）
  //   ✔ ★`/exchange` は ★**繋がっています**（`exchangePrize` / `loadPrizeScreen` / `setError`）。
  { source: '/prizes', destination: '/exchange', permanent: false },
  /**
   * ★**レース一覧**（★2026-09-25・裁定 `REVIEW_DISCOVERY_AXES_20260925.md` §6 の手順）。
   *   ★一覧の役割が ★`/vote`（新世代・`/home` から来る）と二重でした。
   *   ★`/races` の入口は ★旧い画面（`/race`・`/stable`）からだけでした。
   *   ✔ ★送り先が繋がっていることを確かめた（`bet-screen`）。
   * ⚠️ ★`/races/[id]`（★1 レース）は ★**残します** — ★`/vote` はレースを指定できません。
   */
  { source: '/races', destination: '/vote', permanent: false },
  /**
   * ★**1 レースのオッズ**（★同上）。
   *   ★`/odds/[id]`（新世代・`/vote` から来る）と ★同じ役割でした。
   *   ✔ ★送り先は DB を引いています（★`odds-demo` は `?demo=1` のときだけ）。
   * ⚠️ ★引数は ★**`:id`** と書きます（★`[id]` は Next の ★ファイル名の書き方で、★転送の書き方ではない）。
   */
  { source: '/races/:id/odds', destination: '/odds/:id', permanent: false },
  /**
   * 🔴 ⚠️ ★**`/training` → `/train` は 採りません**（★2026-09-25 に一度入れて、★戻しました）。
   *
   * 【★何をしかけたか】
   *   ★裁定 §3 の「★新版が在るものはまず新版へ送る」に従って転送を入れ、★旧い画面を消しました。
   *   🔴 ★しかし ★**`/train` は「まだ見た目だけ」**でした（★その画面の註記 15 行目が自分でそう書いている）。
   *     ★`/train` … ★`rpc(` も `Repo` も ★**呼びません**
   *     ★`/training` … ★`supabaseStableRepo.stable()` で実データを読み、
   *                    ★★**`rpc('set_training_order')` を呼んでいました**
   *   → ★★**転送は「調教の指示を出す唯一の口」を消していました。** ★育成のループが止まります。
   *
   * 【★何が捕まえたか】
   *   ★消したページを見張っていた検査 3 本が ★**読み込めなくなって**落ちました。
   *   ★そこで「★新しい画面は旧い画面と同じ性質を満たすか」を測り、★繋がっていないことが分かりました。
   *   → ★網は ★`screen-generations.test.ts` の「★送り先がサーバーを呼んでいる」に入れました。
   *
   * ⚠️ ★**新版が「在る」ことと「働く」ことは別です。** ★見た目が揃っただけで送らない。
   */
];

export default {
  distDir: DIST_DIR,
  env: { NEXT_PUBLIC_BUILD_STAMP: BUILD_STAMP },
  reactStrictMode: true,
  redirects: async () => SUPERSEDED_SCREENS,
  transpilePackages: ['@star/betting', '@star/scheduler', '@star/race-engine', '@star/render', '@star/sim-engine'],
  /**
   * ★`packages/` は「純粋 TypeScript をそのまま」置いており（正典 §14）、
   *   ESM の作法どおり **import に `.js` を書いて `.ts` を指しています**。
   *   ⚠️ webpack は `.js` をそのまま探すので `Can't resolve './types.js'` になります。
   *   → 拡張子の読み替えを教えます。**ビルド設定だけで、コードは変えません。**
   */
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
  },
};
