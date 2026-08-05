/**
 * テスト用の `HashProvider`：**依存ゼロの本物の SHA-256 / HMAC-SHA256**。
 *
 * ★玩具ハッシュ（FNV 等）にしなかった理由:
 *   Provably Fair の検証は「衝突しないこと」「1bit 変えれば全体が変わること」に
 *   依存している。弱いハッシュを注入すると、**テストが緑でも本番の主張は成立しない**。
 *   「テストで守られている」という誤った安心を作らないため（M-1 の教訓）、
 *   本物を実装し、`apps/cli/test/node-hash.test.ts` で
 *   **Node の `crypto` と全一致すること**を固定している。
 *
 * 実装は FIPS 180-4 / RFC 2104 のそのまま。
 */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** バイト列 → SHA-256 のバイト列 */
function sha256Bytes(input: Uint8Array): Uint8Array {
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
  ];

  // パディング（FIPS 180-4 §5.1.1）
  const bitLen = input.length * 8;
  // ★「len+1+8 を64の倍数へ切り上げ」。最小パディングでなければならない（余分な
  //   ゼロブロックを足すとダイジェストが変わる）。当初 `((len+9)>>6 + 1)<<6` と書き、
  //   len ≡ 55 (mod 64) のときだけ1ブロック余計になっていた。
  //   ——`apps/cli/test/node-hash.test.ts` の55文字ケースが検出した。
  const padded = new Uint8Array(((input.length + 9 + 63) >> 6) << 6);
  padded.set(input);
  padded[input.length] = 0x80;
  // 長さは 64bit ビッグエンディアン。JS の安全整数範囲で足りる
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0) as number;
    }
    let [a, b, c, d, e, f, g, hh] = h as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (hh + S1 + ch + (K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = ((h[0] ?? 0) + a) >>> 0;
    h[1] = ((h[1] ?? 0) + b) >>> 0;
    h[2] = ((h[2] ?? 0) + c) >>> 0;
    h[3] = ((h[3] ?? 0) + d) >>> 0;
    h[4] = ((h[4] ?? 0) + e) >>> 0;
    h[5] = ((h[5] ?? 0) + f) >>> 0;
    h[6] = ((h[6] ?? 0) + g) >>> 0;
    h[7] = ((h[7] ?? 0) + hh) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i] ?? 0, false);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function sha256Hex(message: string): string {
  return toHex(sha256Bytes(utf8(message)));
}

/** HMAC-SHA256（RFC 2104。ブロック長64バイト） */
export function hmacSha256Hex(key: string, message: string): string {
  const blockSize = 64;
  let keyBytes = utf8(key);
  if (keyBytes.length > blockSize) keyBytes = sha256Bytes(keyBytes);
  const padded = new Uint8Array(blockSize);
  padded.set(keyBytes);

  const inner = new Uint8Array(blockSize);
  const outer = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    const k = padded[i] ?? 0;
    inner[i] = k ^ 0x36;
    outer[i] = k ^ 0x5c;
  }

  const msg = utf8(message);
  const innerInput = new Uint8Array(blockSize + msg.length);
  innerInput.set(inner);
  innerInput.set(msg, blockSize);
  const innerHash = sha256Bytes(innerInput);

  const outerInput = new Uint8Array(blockSize + 32);
  outerInput.set(outer);
  outerInput.set(innerHash, blockSize);
  return toHex(sha256Bytes(outerInput));
}

/**
 * ★名前は実体に合わせること。当初 `fnvHashProvider` と名付けたが、中身は FNV ではなく
 *   本物の SHA-256 だった。**名前が中身と食い違うと、次に読む人が「弱いハッシュで
 *   テストしている」と誤解する** — M-1（存在しない防御をコードに書かない）の裏返しの形。
 */
export const pureHashProvider = {
  sha256: sha256Hex,
  hmacSha256: hmacSha256Hex,
};
