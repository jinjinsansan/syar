/** @type {import('next').NextConfig} */
// ★Vercel は「フロントと読み取り系だけ」（正典 §14.3）。
//   API Routes にビジネスロジックを置かないため、Route Handler を作りません。
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

export default {
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
