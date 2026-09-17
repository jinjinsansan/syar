/**
 * ★**デザイナーのカードを配信先へ写す**（★2026-09-17・オーナー指示
 *   ★「★デザイナーが作った全てのページをログイン認証なしで開発サーバーで見れるように」）
 *
 * 【★なぜ写すのか】
 *   ★正本は `design/hud-ds/components/<名>/index.html` ですが、★`design/` は
 *   ★**Next の配信対象外**で URL が付きません。★`apps/web/public/` に置いて初めて
 *   ★`http://localhost:3210/ds/<名>/index.html` で開けます。
 *
 * ⚠️ ★**写しは古くなります。** ★デザイナーがカードを更新したら ★**これを流し直してください**:
 *      npm run sync:ds
 *    ★`/design-check` の一覧が正本とズレていないかは
 *    ★`apps/web/test/design-check.test.ts` が見張ります。
 *
 * ⚠️ ★カードは `../../styles.css` を見ます。★`public/ds/<名>/index.html` から見ると
 *    ★`public/styles.css` なので、★**そこにも置きます**（★両方に要ります）。
 * ⚠️ ★中身の空いたカード（★デザイナーが枠だけ作った所）は ★**写しません**。
 *    ★空の枠を並べても確認になりません。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'design/hud-ds');
const DST = path.join(ROOT, 'apps/web/public/ds');

if (!existsSync(SRC)) throw new Error(`★正本が見つかりません: ${SRC}`);

/** ★古い写しを消してから入れ直します（★消えたカードが残らないように） */
if (existsSync(DST)) rmSync(DST, { recursive: true, force: true });
mkdirSync(DST, { recursive: true });

cpSync(path.join(SRC, 'styles.css'), path.join(DST, 'styles.css'));
cpSync(path.join(SRC, 'styles.css'), path.join(ROOT, 'apps/web/public/styles.css'));

const comps = path.join(SRC, 'components');
let copied = 0;
const empty = [];
for (const name of readdirSync(comps)) {
  const dir = path.join(comps, name);
  if (!statSync(dir).isDirectory()) continue;
  const html = path.join(dir, 'index.html');
  if (!existsSync(html)) { empty.push(name); continue; }
  mkdirSync(path.join(DST, name), { recursive: true });
  cpSync(html, path.join(DST, name, 'index.html'));
  copied += 1;
}

console.log(`★写したカード: ${copied} 枚 → apps/web/public/ds/`);
if (empty.length > 0) {
  console.log(`⚠️ ★中身が空で写さなかったもの: ${empty.length} 件（${empty.join(', ')}）`);
}
console.log('★開き方: http://localhost:3210/design-check');
