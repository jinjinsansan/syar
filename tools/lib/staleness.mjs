/**
 * ★**「誰も見ていない期間」を作らない仕掛け**（★共通部品・2026-09-20）
 *
 * 【🔴 ★なぜ 1 つにまとめるか】
 *   ★今日 見つけた 4 件は、★別々の話に見えて ★**同じ 1 つの形**でした:
 *   ```
 *   ① 起きたことを記録する  ② その記録が古びたら落ちる
 *   ```
 *   ★`O-6`（★稼働中のビルド識別子）で ★**既に作っていました**。
 *   → ★**増やさず、★揃えます**（★**D-052**: ★同じ仕組みを 2 つ持たない）。
 *
 * 【★この部品が持つもの／持たないもの】
 *   ✅ ★持つ … ★記録の置き場・★書き方・★**古さの測り方**
 *   🔴 ★持たない … ★**中身の妥当性**（★「本番の SHA が一致したか」などは、★各道具の仕事）
 *   → ★★**古さ**だけを見ます。★それ以上を持つと、★また 1 つの検査に 4 つの意味が入ります。
 *
 * 【⚠️ ★記録は手で書き換えられます】
 *   ★リポジトリのファイルなので、★偽れます。★**それでよい**と考えています:
 *   ★この部品が守るのは ★**「走らせたか」**であって、★「結果が正しいか」ではありません。
 *   ★結果のほうは ★**次に走らせれば分かります**（★F-3 の本体は再計算そのもの）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/** ★記録の置き場（★形を揃える） */
export function recordPath(what) {
  return `evidence/${what}/last-check.json`;
}

/**
 * ★**見に行った事実**を残す。
 *
 * 🔴 ★**`ok: false` でも書きます。** ★記録の中身は「見に行った」ことであって、
 *    ★「通った」ことではありません。★**食い違いを隠すために記録を止めさせない。**
 *
 * @param nowIso ★時刻は**渡します**（★`Date.now()` を中で呼ばない・憲法 §1-4）
 */
export function writeCheck({ what, env = null, ok, detail = {}, nowIso }) {
  if (typeof what !== 'string' || what.length === 0) throw new Error('staleness: what が要ります');
  if (typeof nowIso !== 'string') throw new Error('staleness: nowIso を渡してください（決定論）');
  const path = recordPath(what);
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ checkedAt: nowIso, what, env, ok, detail }, null, 2)}\n`, 'utf8');
  return path;
}

/** ★記録を読む（★無ければ `null`） */
export function readCheck(what) {
  const path = recordPath(what);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * ★**古さ（日）**。★記録が無ければ `null`。
 *
 * 🔴 ★**未来の日付は受け付けません**（★時計をずらして黙らせられないように）。
 *    ★1 時間ぶんは時計のずれとして許します。
 */
export function ageDays(record, nowMs) {
  if (record === null || typeof record.checkedAt !== 'string') return null;
  const at = Date.parse(record.checkedAt);
  if (!Number.isFinite(at)) return null;
  if (at > nowMs + 3_600_000) return Number.NaN; // ★未来 ＝ 判定不能（★R-3）
  return (nowMs - at) / 86_400_000;
}

/**
 * ★**見張る対象の登録簿**。
 *
 * ★`maxAgeDays` … ★これを過ぎたら落ちる
 * ★`pending`    … ★**まだ仕掛けが動いていない**もの（★理由と期限が要る）
 *
 * 🔴 ★**`pending` は「言い訳の置き場」になりえます。** ★だから `until` を必須にし、
 *    ★**その日を過ぎたら落ちる**ようにしてあります（★`open-findings` と同じ作法）。
 */
export const STALENESS = [
  {
    what: 'prod-build',
    label: '★本番で動いているビルドの版（O-6 / DP-1）',
    maxAgeDays: 7,
    how: 'npx tsx tools/verify-deployed-build.mjs --base https://star-two-chi.vercel.app --record',
    why: '✔ ★根拠は 3 件の実測（★8 日 / 13 日 / 1 か月）。★**いちばん短い 8 日より短く**',
  },
  {
    what: 'race-recompute',
    label: '★着順を再計算して照合（F-3 案③）',
    maxAgeDays: 2,
    pending: true,
    until: '2026-10-11',
    how: 'npx tsx tools/verify-race-recompute.mjs --env <env> --record',
    why: '⏸ ★**まだ動かせません**: ★本番は `entrant_snapshot` が 0 件で ★**1 本も照合できず**、'
      + '★staging は ★**版の記録が無い**ので食い違いを「書き換え」と区別できません'
      + '（★`F3-RECOMPUTE-NEEDS-VERSION`）。★**版の列が入ってから**動かします。'
      + '★頻度 1 日 1 回・★2 日 で落とす、は裁定済み（★費用 1 秒 / 露出 240 本）',
  },
  {
    what: 'refund',
    label: '★障害時の全額返還が動く（O-4）',
    maxAgeDays: 30,
    pending: true,
    until: '2026-10-31',
    how: 'npx tsx tools/verify-cancel.mjs --env staging --record',
    why: '⏸ ★道具は既に **6 項目**で確かめます（★「EP が全額戻った」を含む）。'
      + '★足りないのは ★**「いつ通ったか」**だけ。'
      + '🔴 ★ただし ★**DB の状態を変える**ので staging でしか流せません — '
      + '★★**「本番で確かめた」とは永久に言えません**（★そう書き残すこと・R-21）。'
      + '⚠️ ★いま staging のワーカーが止まっている（`WORKER-STALL-0916`）ので流せません。'
      + '★★**「やっていない」ではなく「できない」**',
  },
  {
    what: 'liveness',
    label: '★ワーカーが生きている（O-2）',
    maxAgeDays: 1,
    pending: true,
    until: '2026-10-31',
    how: '★（未実装）ワーカーが毎周 心拍を書き、★`/api/healthz` から読む',
    why: '🔴 ★**仕組みごとありません**（★`heartbeat` / `liveness` が 0 件）。'
      + '★これが `WORKER-STALL-0916` を 3 日 見逃した理由です。'
      + '⏸ ★**ワーカーに手を入れる**ので、★**配備と同じ便**（★二度 手を入れない）。'
      + '⚠️ ★閾値は ★**`CYCLE_MS × 2`**（★数字を書かない）。★ここだけ実時間ではなく ★**サイクル**です'
      + '（★測る対象がワーカーの周期だから。★他の 3 件は人の操作なので実時間）',
  },
];
