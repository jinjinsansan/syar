/** @type {import('next').NextConfig} */
// ★Vercel は「フロントと読み取り系だけ」（正典 §14.3）。
//   API Routes にビジネスロジックを置かないため、Route Handler を作りません。
export default {
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
