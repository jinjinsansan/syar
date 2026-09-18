/**
 * ★**編集文法の監査テスト**（指示書 §17 の 13 項目）
 *
 * ⚠️ ★測定 JSON が無いときは skip せず**落とします**（§17-13 / R-21）。
 * ⚠️ ★ここで採否は決めません。**監査が成立しているか**だけを見ます。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
// @ts-expect-error — ★道具側の部品（`.mjs`）
import { sourceHash, newestCommitISO } from '../../../tools/lib/provenance.mjs';

const OUT = path.resolve('out/2d-edit-grammar');

function load(name: string): Record<string, any> {
  const f = path.join(OUT, name);
  if (!existsSync(f)) throw new Error(`★${name} が無い。先に tools/audit-edit-grammar-* を走らせること`);
  return JSON.parse(readFileSync(f, 'utf8')) as Record<string, any>;
}

/**
 * ★**古い生成物で緑にならないようにする**（★**RD-4 ③**・2026-09-19）。
 *
 * 【🔴 ★何が起きていたか】
 *   ★この検査の題は「★seed 分類を**現 HEAD で**再確認している」です。
 *   ★ところが読んでいたのは `.gitignore` の下の ★**2026-09-12 の生成物**でした。
 *   ★その間に走路の凍結（`80c4eb3`）や ES-2〜ES-6、台本 v7/v8/v9 が入っています。
 *   🔴 ★**2 つの主張（接戦代表・独走代表）が両方とも古く**、★どちらも偽のまま緑でした。
 *   ★入力が**無い**ときは落ちます（`load` が投げる）。★**「有るが古い」ときだけ**が穴でした。
 *
 * 【★どう塞ぐか】
 *   ★道具が `_provenance.sourceHash`（★依存するソースの hash）を書きます。
 *   ★ここで ★**いまのソースの hash と突き合わせ**、★ずれていたら ★**その場で作り直します**（★12 秒）。
 *   ★平時は hash を数えるだけ（★ほぼ 0 秒）で、★render を触った後だけ作り直しが走ります。
 *
 * ⚠️ 🔴 ★**作り直せるのは `race-edl.json` だけ**です。
 *    ★`race-captures.json` / `reference-edl.json` / `comparison.json` は
 *    ★**ブラウザの撮影**が要り、★2026-08-24 のままです（★別途 報告済み）。
 */
function freshRaceEdl(): Record<string, any> {
  const f = path.join(OUT, 'race-edl.json');
  const want = sourceHash(PROVENANCE_INPUTS).hash;
  const got = existsSync(f)
    ? (JSON.parse(readFileSync(f, 'utf8')) as { _provenance?: { sourceHash?: string } })._provenance?.sourceHash
    : undefined;
  if (got === want) return load('race-edl.json');

  const why = got === undefined ? '記録が無い' : 'ソースが変わっている';
  console.log(`[edit-grammar-audit] ★race-edl.json を作り直します（${why}）…`);
  const r = spawnSync(process.execPath, [
    path.resolve('node_modules/tsx/dist/cli.mjs'), 'tools/audit-edit-grammar-race.mjs',
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`★race-edl.json を作り直せませんでした（${r.status}）: ${r.stderr?.slice(0, 400)}`);
  }
  const after = load('race-edl.json');
  const now = (after as { _provenance?: { sourceHash?: string } })._provenance?.sourceHash;
  // 🔴 ★作り直したのに合わないなら、★依存の名指しが間違っています。★黙って進めない（R-27）
  if (now !== want) {
    throw new Error('★作り直しても hash が合いません（★PROVENANCE_INPUTS の名指しを見直すこと）');
  }
  return after;
}

/**
 * ⚠️ ★**道具の側と同じ並びでなければいけません**（★`tools/audit-edit-grammar-race.mjs`）。
 *    ★ずれると、★作り直しても hash が合わず、★上の検査が落ちて知らせます。
 *
 * 【🔴 ★**RD-5** — ★なぜ列挙をやめたか（2026-09-19）】
 *   ★最初は `packages/render/src` など ★**依存しそうな場所を数えて**書いていました。
 *   🔴 ★しかし ★**今日のずれを作ったのは `80c4eb3`（走路の凍結）と ES-2〜ES-6** で、
 *      ★どちらも `packages/render` の**外**です。
 *   → ★★**列挙が 1 つ足りないだけで、`_provenance` は「新しい」と嘘をつきます。**
 *     ★**古さを見る仕掛けが、古さを保証する** — ★いまより悪い状態です。
 *   → ★**既定を閉じます**（R-29）。★`packages` 全部と `apps/cli/src` を見ます。
 *   ⚠️ ★広すぎて作り直しが頻繁に走るほうが、★**嘘をつくより安い**（★12 秒）。
 */
const PROVENANCE_INPUTS = [
  'packages',
  'apps/cli/src',
  'tools/lib/race-audit-build.mjs',
  'tools/audit-edit-grammar-race.mjs',
];

const ref = load('reference-edl.json');
const race = freshRaceEdl();
const caps = load('race-captures.json');
const cmp = load('comparison.json');

const SEEDS = [42, 332, 474, 14];
/** ★§9 の主役 4 分類 */
const SUBJECTS = ['self', 'leader', 'winner', 'contenders'];

describe('編集文法の監査', () => {
  /* ① 参考と 4 seed すべてに EDL がある */
  it('① 参考と 4 seed すべてに EDL がある', () => {
    expect(Array.isArray(ref.cuts)).toBe(true);
    expect(ref.cuts.length).toBeGreaterThan(0);
    expect(race.seeds.map((s: { seed: number }) => s.seed).sort((a: number, b: number) => a - b))
      .toEqual([...SEEDS].sort((a, b) => a - b));
    for (const s of race.seeds) expect(s.edl.length, `seed ${s.seed}`).toBeGreaterThan(0);
  });

  /* ② EDL の時間に欠落・重複がない */
  it('② EDL の時間に欠落も重複もない', () => {
    const check = (cuts: { startSec: number; endSec: number }[], label: string): void => {
      for (let i = 0; i < cuts.length; i += 1) {
        const cur = cuts[i]!;
        expect(cur.endSec, `${label} #${i} 長さが 0 以下`).toBeGreaterThan(cur.startSec);
        if (i > 0) {
          // ★前のカットの終わりと次のカットの始まりが一致（隙間も重なりも無い）
          expect(Math.abs(cur.startSec - cuts[i - 1]!.endSec), `${label} #${i} の継ぎ目`).toBeLessThan(0.01);
        }
      }
    };
    check(ref.cuts, '参考');
    for (const s of race.seeds) check(s.edl, `seed ${s.seed}`);
  });

  /* ③ 全カット時間の合計が対象映像時間と一致する */
  it('③ カット時間の合計が対象時間と一致する', () => {
    const sum = (cuts: { durationSec: number }[]): number =>
      cuts.reduce((a, c) => a + c.durationSec, 0);
    expect(Math.abs(sum(ref.cuts) - ref.race.durationSec), '参考').toBeLessThan(0.05);
    for (const s of race.seeds) {
      expect(Math.abs(sum(s.edl) - s.displaySec), `seed ${s.seed}`).toBeLessThan(0.05);
    }
  });

  /* ④ 4 seed すべてで実使用ショットを記録する */
  it('④ 4 seed すべてに実使用ショットの記録がある', () => {
    for (const s of race.seeds) {
      const used = s.shotUsage.filter((u: { count: number }) => u.count > 0);
      expect(used.length, `seed ${s.seed}`).toBeGreaterThan(0);
      // ★EDL に出てくるショットが台帳にも載っている
      for (const cut of s.edl) {
        const u = s.shotUsage.find((x: { shotId: string }) => x.shotId === cut.shotId);
        expect(u, `seed ${s.seed} の台帳に ${cut.shotId} が無い`).toBeDefined();
        expect(u.count).toBeGreaterThan(0);
      }
    }
  });

  /* ⑤ 定義済みだが未使用のショットを隠さない */
  it('⑤ 未使用ショットを隠さず、理由を付けている', () => {
    const inv = cmp.shotInventory as { shotId: string; usedInSeeds: number; unused: { reason: string } | null }[];
    // ★定義ショットを全部載せている（型定義から機械的に取っている）
    expect(inv.length).toBeGreaterThanOrEqual(19);
    const unused = inv.filter((i) => i.usedInSeeds === 0);
    expect(unused.length, '未使用が 1 つも無いのは疑わしい').toBeGreaterThan(0);
    const ALLOWED = ['台本v4から参照されない', '条件不成立', '別ショットが先に一致',
      '区間長不足', 'resolver上で到達不能', 'seed依存', '区間外（ゴール後）', 'unknown'];
    for (const i of unused) {
      expect(i.unused, `${i.shotId} に理由が無い`).not.toBeNull();
      expect(ALLOWED, `${i.shotId} の理由が分類外: ${i.unused!.reason}`).toContain(i.unused!.reason);
    }
    // ★指示書 §13 が名指しした 8 つが台帳にある
    for (const id of ['start-follow', 'backstretch-side', 'second-corner-high', 'third-corner-rear',
      'fourth-corner-high', 'homestretch-side', 'side-low', 'side-close']) {
      expect(inv.some((i) => i.shotId === id), id).toBe(true);
    }
  });

  /* ⑥ 主役 4 分類を混同しない */
  it('⑥ 主役 4 分類が別々に記録されている', () => {
    for (const s of race.seeds) {
      for (const cut of s.edl) {
        for (const k of SUBJECTS) {
          expect(cut[k], `seed ${s.seed} ${cut.cutId} の ${k}`).toBeDefined();
        }
        // ★同じ物を使い回していない（self と winner が同一オブジェクトではない）
        expect(cut.self).not.toBe(cut.winner);
      }
    }
    // ★集計側でも 4 分類が別の欄にある
    for (const a of [cmp.reference, ...cmp.race]) {
      for (const k of SUBJECTS) expect(a.subjectShare[k], `${a.label} の ${k}`).toBeDefined();
    }
  });

  /* ⑦ unknown を 0 として集計しない */
  it('⑦ unknown を 0 として数えていない', () => {
    for (const a of [cmp.reference, ...cmp.race]) {
      expect(a.unknownCounts, `${a.label}`).toBeDefined();
      expect(typeof a.unknownCounts.cameraDirection).toBe('number');
      expect(typeof a.unknownCounts.framing).toBe('number');
      // ★unknown/mixed の時間比も別枠で出している
      expect(a.timeShare.unknownOrMixedDirection).toBeDefined();
      expect(a.timeShare.unknownOrMixedFraming).toBeDefined();
    }
    // ★参考側は実際に unknown を持っている（全部埋めたことにしていない）
    expect(cmp.reference.unknownCounts.cameraDirection).toBeGreaterThan(0);
    // ★曖昧境界を「境界なし」と数えていない
    expect(ref.cutCount.maxWithAmbiguities).toBeGreaterThan(ref.cutCount.confirmed);
  });

  /* ⑧ レース進行率が単調増加する */
  it('⑧ レース進行率が単調増加する', () => {
    for (const s of race.seeds) {
      let prev = -1;
      for (const cut of s.edl) {
        expect(cut.raceProgressRatio.start, `seed ${s.seed} ${cut.cutId}`).toBeGreaterThanOrEqual(prev);
        expect(cut.raceProgressRatio.end).toBeGreaterThanOrEqual(cut.raceProgressRatio.start);
        prev = cut.raceProgressRatio.start;
      }
    }
    let p = -1;
    for (const cut of ref.cuts) {
      expect(cut.startRatio, `参考 ${cut.cutId}`).toBeGreaterThanOrEqual(p);
      p = cut.startRatio;
    }
  });

  /* ⑨ seed 分類が再確認されている */
  it('⑨ seed 分類を現 HEAD で再確認している', () => {
    for (const s of race.seeds) {
      expect(s.classification, `seed ${s.seed}`).toBeDefined();
      // ★過去と同じ 3 地点で測り直している
      for (const k of ['entry', 'mid', 'preFinish']) {
        expect(s.classification[k], `seed ${s.seed} の ${k}`).not.toBeNull();
        expect(['contest', 'solo']).toContain(s.classification[k].style);
      }
      // ★ページ自身の判定も別に持っている（取り違え防止）
      expect(['contest', 'solo']).toContain(s.classification.pageFinishStyle);
    }
    /**
     * 🔴 ★**2026-09-19・RD-3 で作り直しました。**
     *
     * 【★何が起きていたか】
     *   ★旧: `at(332) === 'contest'`（接戦代表）・`at(474) === 'solo'`（独走代表）を ★**種の番号で**固定。
     *   ★これが赤になり、★「台本 v6 が独走を消したのでは」と疑われました。
     *
     * 【✔ ★測りました（★2026-09-19・`npx tsx tools/audit-edit-grammar-race.mjs` を HEAD で流し直し）】
     *   ⚠️ 🔴 ★**この検査が読む `out/2d-edit-grammar/race-edl.json` は `.gitignore` の下**で、
     *      ★**手元に残っていた 2026-09-12 の生成物**でした。★その間に走路の凍結（`80c4eb3`）や
     *      ★ES-2〜ES-6 が入っています。★**「現 HEAD で再確認している」という題と食い違っていました。**
     *
     *   ★流し直した後の `mid`（★閾値は `broadcast-v2.ts:2920`: 2 着差 ≤ 1 馬身、または 3 着差 ≤ 2 馬身で contest）:
     *     ★seed  42 … **solo**    （2 着差 6.379m）
     *     ★seed 332 … **solo**    （2 着差 4.759m）
     *     ★seed 474 … **contest** （2 着差 1.360m）
     *     ★seed  14 … **contest** （2 着差 0.552m）
     *   → ★**どれも際どくありません**（★閾値 2.4m から 1m 以上離れている）。★丸めの差ではなく、
     *     ★**レースそのものが変わって**います。
     *
     * 【★答え — ★③ ではなく ②】
     *   ★**独走は消えていません**（★`mid` で solo が 2 つ・`preFinish` では 42・474・14 の 3 つ）。
     *   → ★**代表を差し替えます**。
     *
     * 【★なぜ「種の番号」で固定するのをやめるか】
     *   ★この検査の目的は ★**「どちらの型も代表が 1 つずつある」**ことの確認です。
     *   ★種の番号で固定すると、★**レース側が動くたびに赤になり**、★そのたびに
     *   ★「独走が消えたのか」を一から調べ直すことになります（★今回それをしました）。
     *   → ★**「両方の型が存在する」を主に見て、★代表の番号は付記として記録**します。
     */
    const styleAtMid = (seed: number): string =>
      race.seeds.find((s: { seed: number }) => s.seed === seed).classification.mid.style;
    const midStyles = (race.seeds as { seed: number }[]).map((s) => styleAtMid(s.seed));
    expect(midStyles, '★接戦の代表が 1 つも無い（★接戦の見せ方が消えた可能性）').toContain('contest');
    expect(midStyles, '★独走の代表が 1 つも無い（★独走の見せ方が消えた可能性）').toContain('solo');

    /**
     * ★付記（★2026-09-19 時点の代表。★動いたらここを更新し、★**理由を書く**）:
     *   ★独走代表 = seed 42（2 着差 6.379m）／★接戦代表 = seed 14（2 着差 0.552m）
     * ⚠️ ★ここは ★**同値ではなく「まだ代表でいるか」**を見ます。★外れたら上の 2 行が拾います。
     */
    expect(styleAtMid(42), '★独走代表（42）が変わった — 上の 2 行が緑なら代表の差し替えでよい').toBe('solo');
    expect(styleAtMid(14), '★接戦代表（14）が変わった — 上の 2 行が緑なら代表の差し替えでよい').toBe('contest');
  });

  /* ⑩ 通常 /race を実ブラウザ経路から撮っている */
  it('⑩ 通常 /race を実ブラウザから撮っている', () => {
    expect(caps.captured.length).toBeGreaterThanOrEqual(race.seeds.length);
    for (const c of caps.captured as { url: string; w: number; h: number; file: string; seed: number; seedInputValue: number }[]) {
      expect(c.url, c.file).toContain('/race?');
      expect(c.url, c.file).not.toContain('renderer=legacy');
      expect(c.url, c.file).not.toContain('cinematography');
      expect(c.w, c.file).toBe(1280);
      expect(c.h, c.file).toBe(720);
      expect(c.seedInputValue, `${c.file} の seed`).toBe(c.seed);
      expect(existsSync(path.join(OUT, '_race-shots', c.file)), c.file).toBe(true);
    }
    // ★4 seed すべてを撮っている
    const seedsSeen = [...new Set((caps.captured as { seed: number }[]).map((c) => c.seed))];
    expect(seedsSeen.sort((a, b) => a - b)).toEqual([...SEEDS].sort((a, b) => a - b));
  });

  /* ⑪ apps/web/src と packages/render/src が無変更 */
  it('⑪ 監査ツールが本番コードから参照されていない', async () => {
    const { globSync } = await import('node:fs');
    for (const root of [path.resolve('apps/web/src'), path.resolve('packages/render/src')]) {
      const hits = globSync('**/*.{ts,tsx}', { cwd: root })
        .map((f) => path.join(root, String(f)))
        .filter((f) => /edit-grammar|race-audit-build|lib\/cdp/.test(readFileSync(f, 'utf8')));
      expect(hits, root).toEqual([]);
    }
  });

  /* ⑫ 改善動画を作っていない */
  it('⑫ 改善版の動画を作っていない', async () => {
    const { globSync } = await import('node:fs');
    expect(globSync('**/*.{mp4,webm,gif}', { cwd: OUT })).toEqual([]);
  });

  /* ⑬ 測定 JSON が欠けたら skip せず失敗する ＋ 成果物がそろう */
  it('⑬ 必要な成果物がそろっている', () => {
    for (const f of ['reference-edl.json', 'reference-cuts.json', 'race-edl.json',
      'race-captures.json', 'comparison.json', 'timeline-comparison.png']) {
      expect(existsSync(path.join(OUT, f)), f).toBe(true);
    }
    // ★参考側の EDL が「人が読んだもの」だと明示されている
    expect(ref.method).toBe('manual-read');
    expect(Array.isArray(ref.limitations)).toBe(true);
    expect(ref.limitations.length).toBeGreaterThan(0);
  });

  /* ⑭ 撮影が、いまの画面のものである（★RD-4 ③・RD-5 ②） */
  it('🔴 ⑭ 撮影が、いまの画面より古くない', () => {
    /**
     * 🔴 ★**2026-09-19 に足しました。★足した時点で赤です。**
     *
     * 【★なぜ赤にするか】
     *   ★⑩「実ブラウザ経路から撮っている」は ★**2026-08-24 の撮影**を見て緑でした。
     *   ★その後 `packages/render/src` と `apps/web/src` は ★**何度も変わって**います
     *   （★台本 v6 → v7 → v8 → v9）。
     *   → ★★**これは「緑」ではなく「何も言っていない」**です。
     *     ★赤にするのは ★**すでに悪い状態を見えるようにするだけ**です（★裁定 RD-4 ③ ①）。
     *
     * 【⚠️ ★ここでは hash を使いません（★**RD-5 ②**）】
     *   ★撮影は ★**作り直せません**（★ブラウザが要り、★人の画面に窓が開きます）。
     *   ★hash の突き合わせを付けると ★**常に赤**になり、★登録簿が常時埋まった状態 ＝
     *   ★**RD-2 の意味が消えます**。
     *   → ★**「撮った後に画面が動いたか」**だけを見ます。★撮り直せば緑に戻り、★戻ったままです。
     *
     * ⚠️ ★**この検査は `tools/lib/known-red.mjs` に登録されています**（★担当・期限つき）。
     *    ★撮り直したら ★**登録を消してください**（★消し忘れは `verify:red` が落とします）。
     */
    const shot = statSync(path.join(OUT, 'race-captures.json')).mtime.toISOString();
    const src = newestCommitISO(['packages/render/src', 'apps/web/src']);
    expect(
      shot >= src,
      `★撮影 ${shot.slice(0, 10)} は、画面の最後の変更 ${src.slice(0, 10)} より古いです。`
      + '★`tools/capture-edit-grammar-race.mjs` を**オーナーの端末で**流し直してください'
      + '（★ここからは流しません — ★人の画面にブラウザの窓が開きます）',
    ).toBe(true);
  });
});
