/**
 * ★STAR の認証 — D-076（LINE ログイン・自前実装）／V-19
 *
 * 純粋 TypeScript（依存ゼロ・WebCrypto のみ）。Supabase Edge Function から呼ぶ。
 * ⚠️ セッションの発行そのものは Supabase Auth に行わせる（★自前で JWT を作らない・D-076 の制約1）。
 *    このパッケージは「誰であるかを確かめる」ところまでで、確かめたあとの仕組みには触れない。
 */

export {
  LINE_ISSUER,
  verifyLineIdToken,
  type LineIdentity,
  type VerifyFailure,
  type VerifyParams,
  type VerifyResult,
} from './line-id-token.js';

export {
  handleLineCallback,
  type LineCallbackInput,
  type LoginFailure,
  type LoginFlowDeps,
  type LoginResult,
} from './login-flow.js';

export {
  resolveUserId,
  type IdentityStoreDeps,
  type ResolveResult,
} from './resolve-identity.js';
