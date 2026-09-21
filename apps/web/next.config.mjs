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

export default {
  distDir: DIST_DIR,
  env: { NEXT_PUBLIC_BUILD_STAMP: BUILD_STAMP },
  reactStrictMode: true,
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
