// ワーカーのログを周ごとに区切り、追いつき中の周と、追いつきが終わった後の周の所要（％）を分けて出す。
// 使い方: node analyze-worker-log.mjs <ログ>
// 周の区切り: `[worker] cycle=N ... 周=Xs(Y%)` の行。その後に出る週送り・配合・失敗の行を、その周に付ける。
// 追いつき中: その周の週送りか配合が 2 週以上を処理した周。
import { readFileSync } from 'node:fs';

const raw = readFileSync(process.argv[2]);
// PowerShell の Tee-Object は UTF-16LE で書くことがある
let text = raw[0] === 0xff && raw[1] === 0xfe ? raw.toString('utf16le') : raw.toString('utf8');
/**
 * PowerShell がワーカーの UTF-8 を cp932 として読んで化けた場合は、cp932 に戻して UTF-8 として読み直す。
 * 逆向きの対応表は TextDecoder('shift_jis') で 1〜2 バイトの並びを全部読ませて作る。
 * 化けたときに失われたバイト（'・' に置き換わったもの）は戻らない。英数字の部分は影響を受けない。
 */
if (!text.includes('[worker] 起動') && /襍ｷ蜍|蜻ｨ|騾ｱ/.test(text)) {
  const dec = new TextDecoder('shift_jis', { fatal: true });
  const map = new Map();
  for (let x = 0; x < 0x100; x += 1) {
    try { const ch = dec.decode(Uint8Array.of(x)); if (!map.has(ch)) map.set(ch, [x]); } catch { /* 2 バイトの先頭 */ }
  }
  for (let hi = 0x81; hi <= 0xfc; hi += 1) {
    for (let lo = 0x40; lo <= 0xfc; lo += 1) {
      try { const ch = dec.decode(Uint8Array.of(hi, lo)); if ([...ch].length === 1 && !map.has(ch)) map.set(ch, [hi, lo]); } catch { /* 無効 */ }
    }
  }
  const bytes = [];
  let lost = 0;
  for (const ch of text) {
    const bs = map.get(ch);
    if (bs === undefined) { lost += 1; bytes.push(...Buffer.from(ch, 'utf8')); } else bytes.push(...bs);
  }
  text = Buffer.from(bytes).toString('utf8');
  console.log(`（文字化けを cp932 から戻しました・対応の無い文字 ${lost} 個）`);
}
const cycles = [];
let cur = null;
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/cycle=(\d+) phase=(\S+).*周=([\d.]+)s\(([\d.]+)%\)/);
  if (m) {
    cur = { cycle: Number(m[1]), phase: m[2], sec: Number(m[3]), pct: Number(m[4]), trainWeeks: 0, breedWeeks: 0, born: 0, fails: [], wholeSec: null, wholePct: null };
    cycles.push(cur);
    continue;
  }
  if (cur === null) continue;
  const t = line.match(/週送り 週=([\d,]+)/);
  if (t) cur.trainWeeks += t[1].split(',').filter(Boolean).length;
  const b = line.match(/配合 週=([^\s]+) 生まれた(\d+)頭/);
  if (b) { cur.breedWeeks += b[1] === 'なし' ? 0 : b[1].split(',').length; cur.born += Number(b[2]); }
  if (/失敗/.test(line)) cur.fails.push(line.trim().slice(0, 160));
  // ★周の全体（★週送り・配合を含む・2026-09-23 に足した行）。★無ければ null のまま
  const w = line.match(/周の全体=([\d.]+)s\(([\d.]+)%\)/);
  if (w) { cur.wholeSec = Number(w[1]); cur.wholePct = Number(w[2]); }
}
// 週送りの行が無い周は、追いつき中か後かを言えない（途中で止まった・週が進まなかった）ので別に数える
const noWeekly = cycles.filter((c) => c.trainWeeks === 0);
const catching = cycles.filter((c) => c.trainWeeks > 1 || c.breedWeeks > 1);
const steady = cycles.filter((c) => c.trainWeeks === 1 && c.breedWeeks <= 1);
const stat = (a) => {
  if (a.length === 0) return '—';
  const part = `レースの段 平均 ${(a.reduce((x, c) => x + c.pct, 0) / a.length).toFixed(1)}% / 最大 ${Math.max(...a.map((c) => c.pct)).toFixed(1)}%`;
  const w = a.filter((c) => c.wholePct !== null);
  const whole = w.length === 0 ? '全体 —（★行が無い）' : `全体 平均 ${(w.reduce((x, c) => x + c.wholePct, 0) / w.length).toFixed(1)}% / 最大 ${Math.max(...w.map((c) => c.wholePct)).toFixed(1)}%`;
  return `${a.length} 周 / ${part} / ${whole}`;
};
console.log(`周 ${cycles.length}（週送りの行がある周 ${cycles.filter((c) => c.trainWeeks > 0).length} / 配合の行がある周 ${cycles.filter((c) => c.breedWeeks > 0 || c.born > 0).length}）`);
console.log(`追いつき中: ${stat(catching)}`);
console.log(`追いつきの後: ${stat(steady)}`);
console.log(`週送りの行が無い周（判定不能）: ${stat(noWeekly)}`);
console.log(`失敗の行: ${cycles.reduce((x, c) => x + c.fails.length, 0)} 件`);
for (const c of cycles) {
  console.log(`  cycle=${c.cycle} ${c.phase} ${c.sec}s ${c.pct}% 全体${c.wholePct ?? '—'}% 週送り${c.trainWeeks}週 配合${c.breedWeeks}週 生まれた${c.born}${c.fails.length ? ` 失敗${c.fails.length}` : ''}`);
}
for (const c of cycles) for (const f of c.fails) console.log(`  失敗 cycle=${c.cycle}: ${f}`);
