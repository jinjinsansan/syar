/**
 * V-19（認証が壊れたときに落ちること）— ID トークン検証の部分。
 *
 * 【★このファイルの書き方の規律（R-14・V-19 #12）】
 *   トークンは**この試験の中で独立に組み立てる**。実装の関数を一切呼ばない。
 *   実装を参照して期待値を作ると同語反復になり、実装が間違っていても緑になる。
 *   組み立ての根拠は LINE の公式ドキュメント（`iss` = https://access.line.me ／ `aud` = チャネル ID ／
 *   web ログインは HS256 ／ `nonce` は認可 URL で指定した値が載る）。
 *
 * 【★数えるのは「壊して落ちること」だけ（裁定 §3）】
 *   「正しいトークンで入れる」は V-19 に数えない。
 *   ただし**対照として1件だけ置く** — これが無いと「常に false を返す実装」が
 *   下の全項目を通ってしまい、ゲートが空になる。**対照は防御ではなく、ゲートを空にしないための足場。**
 */

import { describe, expect, it } from 'vitest';
import { verifyLineIdToken, type VerifyParams } from '../src/index.js';

// ---------------------------------------------------------------------------
// 試験用のトークン生成（実装から独立）
// ---------------------------------------------------------------------------
const CHANNEL_ID = '1234567890';
const CHANNEL_SECRET = 'test-channel-secret-do-not-use-in-production';
const NONCE = 'nonce-abcdef0123456789';
const SUB = 'U0123456789abcdef0123456789abcdef';
const NOW = 1_760_000_000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeJson(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

/** LINE が web ログインで返すのと同じ形の payload */
function payloadOf(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'https://access.line.me',
    sub: SUB,
    aud: CHANNEL_ID,
    exp: NOW + 3600,
    iat: NOW,
    nonce: NONCE,
    ...over,
  };
}

/** 署名まで含めて組み立てる。`secret` を変えれば「他人が署名したトークン」になる */
async function mint(
  payload: Record<string, unknown>,
  opts: { readonly secret?: string; readonly alg?: string } = {},
): Promise<string> {
  const header = encodeJson({ typ: 'JWT', alg: opts.alg ?? 'HS256' });
  const body = encodeJson(payload);
  const signature = await hmacSha256(opts.secret ?? CHANNEL_SECRET, `${header}.${body}`);
  return `${header}.${body}.${toBase64Url(signature)}`;
}

const params: VerifyParams = {
  channelId: CHANNEL_ID,
  channelSecret: CHANNEL_SECRET,
  expectedNonce: NONCE,
  nowSec: NOW,
};

// ---------------------------------------------------------------------------
describe('V-19 対照（★防御ではない。ゲートを空にしないための足場）', () => {
  it('正しいトークンは通り、sub が取れる', async () => {
    const r = await verifyLineIdToken(await mint(payloadOf()), params);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.identity.sub).toBe(SUB);
  });

  it('★LINE から取り出すのは sub だけ（D-076）— 名前・アイコン・メールを持ち出さない', async () => {
    const token = await mint(payloadOf({ name: '山田 太郎', picture: 'https://example.test/a.png', email: 'a@example.test' }));
    const r = await verifyLineIdToken(token, params);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // ★返り値に載っていないこと。載せてしまうと D-074 の入力と二重になり、実在の人物名が場内に出る
      expect(Object.keys(r.identity)).toEqual(['sub']);
      expect(JSON.stringify(r.identity)).not.toContain('山田');
      expect(JSON.stringify(r.identity)).not.toContain('example.test');
    }
  });
});

describe('V-19 #1 署名', () => {
  it('★別の鍵で署名されたトークンを拒否する', async () => {
    const token = await mint(payloadOf(), { secret: 'attacker-secret' });
    const r = await verifyLineIdToken(token, params);
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('★署名部だけ差し替えたトークンを拒否する', async () => {
    const token = await mint(payloadOf());
    const [h, p] = token.split('.');
    const forged = `${h}.${p}.${toBase64Url(new Uint8Array(32))}`;
    const r = await verifyLineIdToken(forged, params);
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('★payload を書き換えると（署名はそのまま）拒否される — sub の詐称が通らないこと', async () => {
    const token = await mint(payloadOf());
    const [h, , s] = token.split('.');
    const swapped = `${h}.${encodeJson(payloadOf({ sub: 'U-someone-else' }))}.${s}`;
    const r = await verifyLineIdToken(swapped, params);
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });
});

describe('V-19 ★アルゴリズムのすり替え（LINE は用途で HS256/ES256 が変わるため特に重い）', () => {
  it('★alg: none を拒否する', async () => {
    const header = encodeJson({ typ: 'JWT', alg: 'none' });
    const body = encodeJson(payloadOf());
    const r = await verifyLineIdToken(`${header}.${body}.`, params);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('alg_mismatch');
  });

  it('★alg: ES256 を名乗るトークンを拒否する（web ログインの経路は HS256 固定）', async () => {
    const token = await mint(payloadOf(), { alg: 'ES256' });
    const r = await verifyLineIdToken(token, params);
    expect(r).toEqual({ ok: false, reason: 'alg_mismatch' });
  });

  it('★alg を小文字にした回避を拒否する', async () => {
    const token = await mint(payloadOf(), { alg: 'hs256' });
    const r = await verifyLineIdToken(token, params);
    expect(r).toEqual({ ok: false, reason: 'alg_mismatch' });
  });
});

describe('V-19 #8 iss（★照会本文に書きながらゲート項目から落としていた項目）', () => {
  it('★別の発行者を拒否する', async () => {
    const token = await mint(payloadOf({ iss: 'https://access.line.me.attacker.test' }));
    const r = await verifyLineIdToken(token, params);
    expect(r).toEqual({ ok: false, reason: 'iss_mismatch' });
  });

  it('★iss が無いトークンを拒否する', async () => {
    const p = payloadOf();
    delete p['iss'];
    const r = await verifyLineIdToken(await mint(p), params);
    expect(r).toEqual({ ok: false, reason: 'iss_mismatch' });
  });
});

describe('V-19 #2 aud', () => {
  it('★別チャネル宛のトークンを拒否する（他サービスで取得したトークンの持ち込み）', async () => {
    const token = await mint(payloadOf({ aud: '9999999999' }));
    const r = await verifyLineIdToken(token, params);
    expect(r).toEqual({ ok: false, reason: 'aud_mismatch' });
  });
});

describe('V-19 #3 有効期限（★時刻を注入しているので再現可能に試験できる）', () => {
  it('★期限切れを拒否する', async () => {
    const token = await mint(payloadOf({ exp: NOW - 3600 }));
    const r = await verifyLineIdToken(token, params);
    expect(r).toEqual({ ok: false, reason: 'expired' });
  });

  it('★未来に発行されたトークンを拒否する', async () => {
    const token = await mint(payloadOf({ iat: NOW + 3600, exp: NOW + 7200 }));
    const r = await verifyLineIdToken(token, params);
    expect(r).toEqual({ ok: false, reason: 'issued_in_future' });
  });

  it('★exp を文字列にした回避を拒否する（暗黙の型変換で比較が通らないこと）', async () => {
    const token = await mint(payloadOf({ exp: '99999999999' }));
    const r = await verifyLineIdToken(token, params);
    expect(r).toEqual({ ok: false, reason: 'malformed' });
  });

  it('時計のずれの範囲内なら通る（許容が効いていること）', async () => {
    const token = await mint(payloadOf({ exp: NOW - 30 }));
    const r = await verifyLineIdToken(token, { ...params, clockSkewSec: 60 });
    expect(r.ok).toBe(true);
  });
});

describe('V-19 #7 nonce（★state とは別の攻撃＝リプレイ。照会では完全に欠落していた）', () => {
  it('★別の nonce を持つトークンを拒否する', async () => {
    const token = await mint(payloadOf({ nonce: 'nonce-from-another-session' }));
    const r = await verifyLineIdToken(token, params);
    expect(r).toEqual({ ok: false, reason: 'nonce_mismatch' });
  });

  it('★nonce が無いトークンを拒否する（「無ければ素通り」にしない）', async () => {
    const p = payloadOf();
    delete p['nonce'];
    const r = await verifyLineIdToken(await mint(p), params);
    expect(r).toEqual({ ok: false, reason: 'nonce_missing' });
  });

  it('★一度使ったトークンを別セッションで再送しても通らない（リプレイ）', async () => {
    const token = await mint(payloadOf());
    // 同じトークンを、別セッション（＝別の nonce を期待している）に投げる
    const r = await verifyLineIdToken(token, { ...params, expectedNonce: 'nonce-of-a-different-session' });
    expect(r).toEqual({ ok: false, reason: 'nonce_mismatch' });
  });
});

describe('V-19 形の異常', () => {
  it.each([
    ['空文字', ''],
    ['ドットが足りない', 'aaa.bbb'],
    ['ドットが多い', 'aaa.bbb.ccc.ddd'],
    ['base64url でない文字', 'aa+a.bbb.ccc'],
    ['JSON でないヘッダ', `${toBase64Url(new TextEncoder().encode('not json'))}.bbb.ccc`],
  ])('★%s を拒否する', async (_label, token) => {
    const r = await verifyLineIdToken(token, params);
    expect(r.ok).toBe(false);
  });

  it('★sub が空のトークンを拒否する', async () => {
    const r = await verifyLineIdToken(await mint(payloadOf({ sub: '' })), params);
    expect(r).toEqual({ ok: false, reason: 'malformed' });
  });
});
