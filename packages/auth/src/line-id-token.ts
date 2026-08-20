/**
 * ★LINE の ID トークン検証 — D-076（認証は LINE ログイン）／V-19（認証が壊れたときに落ちること）
 *
 * 【この関数の責務】
 *   「この `id_token` は、我々のチャネル宛に、LINE が、いま、我々が出した nonce に対して発行したものか」だけを判定する。
 *   ユーザーの作成・セッションの発行はここではやらない（`login-flow.ts`）。
 *
 * 【★取り出すのは `sub` だけ】
 *   D-076: LINE から取得するのは `sub` のみ。表示名・アイコン・メールは**返り値の型に入れない**。
 *   コメントで禁じるのではなく、型として持ち出せない形にする（D-074 の入力と二重にならない・実在の人物名が場内に出ない）。
 *
 * 【★決定論（憲法 4）】
 *   `Date.now()` を呼ばない。現在時刻は `nowSec` で注入する。
 *   これは規約の遵守であると同時に、**期限切れを再現可能に試験できる**ということでもある（V-19 #3）。
 *
 * 【★アルゴリズムを固定する理由 — V-19 の中でも特に重い】
 *   LINE は用途で署名方式が変わる（公式ドキュメント）:
 *     - web ログイン（サーバー側の認可コードフロー・**今回の経路**）= HS256（チャネルシークレットによる HMAC）
 *     - ネイティブ SDK / LIFF = ES256（`https://api.line.me/oauth2/v2.1/certs` の公開鍵）
 *   → **ヘッダの `alg` を読んで分岐してはならない。** 分岐すれば、攻撃者がヘッダを書き換えるだけで
 *     検証経路を選べる（`alg: none` / 非対称→対称のすり替え）。**経路ごとに期待する方式を固定する。**
 *   将来 Expo（§15.4）で ES256 を足すときも、**同じ関数に分岐を足すのではなく別の入口にすること。**
 *
 * 【★検証の順序も安全性の一部】
 *   署名を確かめる**前に** payload の中身を信用しない。順序は 形 → alg → 署名 → 中身。
 */

/** ★LINE から取り出すのはこれだけ（D-076）。名前・アイコン・メールは意図的に含めない */
export interface LineIdentity {
  /** LINE のユーザー ID。**プロバイダー単位で一意**（同一プロバイダー配下ならチャネルが違っても同じ値・公式ドキュメント確認済み） */
  readonly sub: string;
}

/**
 * 失敗の理由。
 * ⚠️ **これを利用者に返さないこと** — どの検証で落ちたかは攻撃者への情報になる。
 *    呼び出し側（`login-flow.ts`）は一律のエラーに畳む。ここで細かく返すのは**試験のため**（V-19）。
 */
export type VerifyFailure =
  | 'malformed'
  | 'alg_mismatch'
  | 'bad_signature'
  | 'iss_mismatch'
  | 'aud_mismatch'
  | 'expired'
  | 'issued_in_future'
  | 'nonce_missing'
  | 'nonce_mismatch';

export type VerifyResult =
  | { readonly ok: true; readonly identity: LineIdentity }
  | { readonly ok: false; readonly reason: VerifyFailure };

export interface VerifyParams {
  /** チャネル ID。`aud` はこれと一致しなければならない */
  readonly channelId: string;
  /** チャネルシークレット（HS256 の鍵） */
  readonly channelSecret: string;
  /** ★我々が認可 URL に載せた nonce。これと一致しなければリプレイ */
  readonly expectedNonce: string;
  /** ★現在時刻（UNIX 秒）。注入する（憲法 4） */
  readonly nowSec: number;
  /** 時計のずれの許容（秒）。既定 60 */
  readonly clockSkewSec?: number;
}

/** LINE の発行者。公式ドキュメントの値 */
export const LINE_ISSUER = 'https://access.line.me';

/** ★web ログインの署名方式。ここを可変にしない（上の注記） */
const EXPECTED_ALG = 'HS256';

const DEFAULT_CLOCK_SKEW_SEC = 60;

function fail(reason: VerifyFailure): VerifyResult {
  return { ok: false, reason };
}

/** base64url → バイト列。base64url 以外の文字が混ざっていたら null（`+` `/` `=` を黙って受け入れない） */
function decodeBase64Url(part: string): Uint8Array | null {
  if (part.length === 0 || !/^[A-Za-z0-9_-]+$/.test(part)) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.length % 4 === 0 ? b64 : b64 + '='.repeat(4 - (b64.length % 4));
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function decodeJsonPart(part: string): Record<string, unknown> | null {
  const bytes = decodeBase64Url(part);
  if (bytes === null) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * ID トークンを検証し、通れば `sub` だけを返す。
 *
 * ★通らなかった理由を利用者に見せないこと（`VerifyFailure` の注記）。
 */
export async function verifyLineIdToken(idToken: string, params: VerifyParams): Promise<VerifyResult> {
  const skew = params.clockSkewSec ?? DEFAULT_CLOCK_SKEW_SEC;

  // --- ① 形 -------------------------------------------------------------
  const parts = idToken.split('.');
  if (parts.length !== 3) return fail('malformed');
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  // --- ② alg を固定で照合（署名を確かめる前に、方式のすり替えを閉じる） -----
  const header = decodeJsonPart(headerPart);
  if (header === null) return fail('malformed');
  if (header['alg'] !== EXPECTED_ALG) return fail('alg_mismatch');

  // --- ③ 署名（★payload の中身を読む前に確かめる） -------------------------
  const signature = decodeBase64Url(signaturePart);
  if (signature === null) return fail('malformed');
  const encoder = new TextEncoder();
  let signatureValid: boolean;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(params.channelSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    // WebCrypto の verify は内部で定数時間比較を行う（自前で === しない）
    signatureValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature as unknown as ArrayBufferView,
      encoder.encode(`${headerPart}.${payloadPart}`),
    );
  } catch {
    return fail('bad_signature');
  }
  if (!signatureValid) return fail('bad_signature');

  // --- ④ ここから先は「LINE が署名した中身」として読んでよい ----------------
  const payload = decodeJsonPart(payloadPart);
  if (payload === null) return fail('malformed');

  if (payload['iss'] !== LINE_ISSUER) return fail('iss_mismatch');
  if (payload['aud'] !== params.channelId) return fail('aud_mismatch');

  // 型まで確かめる（`exp` が文字列だと比較が暗黙変換で通ってしまう）
  const exp = payload['exp'];
  const iat = payload['iat'];
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return fail('malformed');
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return fail('malformed');
  if (params.nowSec > exp + skew) return fail('expired');
  if (iat > params.nowSec + skew) return fail('issued_in_future');

  // ★nonce は必ず載っている前提（我々は常に認可 URL に nonce を載せる）。
  //   「無ければ素通り」にすると、nonce を外した認可 URL を作らせるだけで検証が消える。
  const nonce = payload['nonce'];
  if (typeof nonce !== 'string' || nonce.length === 0) return fail('nonce_missing');
  if (nonce !== params.expectedNonce) return fail('nonce_mismatch');

  const sub = payload['sub'];
  if (typeof sub !== 'string' || sub.length === 0) return fail('malformed');

  // ★name / picture / email は読まない。返さない（D-076）
  return { ok: true, identity: { sub } };
}
