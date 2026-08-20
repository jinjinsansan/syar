/**
 * ★ログインの往復（コールバック処理）— D-076 ／ V-19 #4・#9・#11
 *
 * 【なぜ検証ロジックと分けるか】
 *   V-19 #9 の裁定:
 *     > Edge Function は service_role で**任意のユーザーのセッションを作れます**。
 *     > そのエンドポイントの認可が緩ければ、**トークン検証がすべて正しくても全口座が抜けます**。
 *
 *   つまり守るべきものは2つある:
 *     ① `id_token` が本物か（`line-id-token.ts`）
 *     ② **①を通っていないものが、セッション発行に到達しないこと**（この関数）
 *   ①が完璧でも②が緩ければ被害は同じなので、**②を独立に試験できる形**にしておく。
 *
 * 【★依存を注入する理由（V-19 #11）】
 *   「本番経路で固定する」— `verifyLineIdToken()` の単体テストが全部通っても、
 *   **呼び出し側が検証を飛ばす形に書き換えて全緑になるなら防御はゼロ**（I-3 / I-4 / L-1 で3度踏んだ罠）。
 *   → 依存を注入可能にし、**「失敗するどの経路でも `issueSession` が呼ばれないこと」を直接観測する。**
 *      検証の呼び忘れ・結果の握り潰しは、この観測で必ず落ちる。
 *
 * 【★state は「確認」ではなく「消費」する】
 *   `consumeState` は一度きり。同じ `state` での2回目は null を返す実装であること。
 *   確認するだけだと、傍受した callback URL をそのまま再送できる。
 */

import type { LineIdentity, VerifyResult } from './line-id-token.js';

export interface LineCallbackInput {
  readonly code: string;
  readonly state: string;
}

export interface LoginFlowDeps<TSession> {
  /** ★一度きりの消費。未知・使用済みなら null（V-19 #4） */
  readonly consumeState: (state: string) => Promise<{ readonly nonce: string } | null>;
  /** 認可コードを LINE のトークンエンドポイントで交換する。失敗なら null */
  readonly exchangeCode: (code: string) => Promise<{ readonly idToken: string } | null>;
  /** `verifyLineIdToken` を束ねたもの（チャネル ID・シークレット・現在時刻は呼び出し側が閉じ込める） */
  readonly verifyIdToken: (idToken: string, expectedNonce: string) => Promise<VerifyResult>;
  /** ★ここに到達してよいのは、上の検証をすべて通った場合だけ */
  readonly issueSession: (identity: LineIdentity) => Promise<TSession>;
}

/**
 * 失敗の理由。
 * ⚠️ 利用者に返すのは「ログインできませんでした」だけにすること。
 *    どの段で落ちたかは攻撃者への情報になる（`VerifyFailure` と同じ理由）。
 */
export type LoginFailure =
  | 'bad_request'
  | 'state_rejected'
  | 'code_rejected'
  | 'token_rejected';

export type LoginResult<TSession> =
  | { readonly ok: true; readonly session: TSession }
  | { readonly ok: false; readonly reason: LoginFailure };

function fail<TSession>(reason: LoginFailure): LoginResult<TSession> {
  return { ok: false, reason };
}

/**
 * LINE からのコールバックを処理し、通ればセッションを発行する。
 *
 * ★不変条件（V-19 #9）: **`issueSession` は、`verifyIdToken` が ok を返した後にしか呼ばれない。**
 */
export async function handleLineCallback<TSession>(
  input: LineCallbackInput,
  deps: LoginFlowDeps<TSession>,
): Promise<LoginResult<TSession>> {
  if (input.code.length === 0 || input.state.length === 0) return fail('bad_request');

  // ① state を消費する（CSRF ＋ callback の再送）
  const stateEntry = await deps.consumeState(input.state);
  if (stateEntry === null) return fail('state_rejected');

  // ② 認可コードを交換
  const exchanged = await deps.exchangeCode(input.code);
  if (exchanged === null) return fail('code_rejected');

  // ③ ID トークンを検証（★nonce は「その state に紐づいたもの」で照合する。
  //    リクエストから来た nonce を使ってはいけない — 攻撃者が両方を揃えられる）
  const verified = await deps.verifyIdToken(exchanged.idToken, stateEntry.nonce);
  if (!verified.ok) return fail('token_rejected');

  // ④ ★ここまで来たものだけがセッションを持てる
  const session = await deps.issueSession(verified.identity);
  return { ok: true, session };
}
