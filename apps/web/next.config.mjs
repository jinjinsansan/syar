/** @type {import('next').NextConfig} */
// ★Vercel は「フロントと読み取り系だけ」（正典 §14.3）。
//   API Routes にビジネスロジックを置かないため、Route Handler を作りません。
export default { reactStrictMode: true, transpilePackages: ['@star/betting', '@star/scheduler'] };
