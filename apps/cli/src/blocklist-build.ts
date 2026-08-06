/** 平文 NG リスト → ハッシュ集合（憲法 §0.1）。平文はコミットしない */
import { NG_HASH_PATH, NG_PLAINTEXT_PATH, buildBlocklist } from './name-blocklist.js';

const n = buildBlocklist();
console.log(`${NG_PLAINTEXT_PATH} → ${NG_HASH_PATH}: ${n} 件（平文は残しません）`);
