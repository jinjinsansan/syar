/**
 * ★**小窓で本編を流す約束**（★2026-09-28・オーナー依頼「小窓でパドックからリプレイまで」・`race-strip-embed.ts`）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★帯と本編が ★別々の名前・別々の URL を書いて ★黙って繋がらなくなる（★D-052）
 *   ② 🔴 ★よその origin の知らせ・★形の違う知らせで ★帯が動く
 *   ③ 🔴 ★小窓の中で ★音が出る・★ボタンや確定カードが出る・★触ると全画面へ入る（★§5: 常設は常に無音）
 *   ④ 🔴 ★本編が ★流し始め・流し終え・失敗を ★帯へ知らせない（★「終わらない小窓」）
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  STRIP_EMBED_FAILED_NOTE, STRIP_EMBED_LEAD_SEC, isStripControlMessage, isStripEmbedMessage, stripControlMessage, stripEmbedLog, stripEmbedMessage, stripEmbedUrl, STRIP_EMBED_PARAM_VALUE,
} from '../../web/src/components/uma/race-strip-embed';
import { replayWindowNear, replayWindowOver, REPLAY_START_DELAY_MS, REPLAY_DISPLAY_MS } from '../../web/src/components/uma/race-replay';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');
const PAGE = read('apps/web/src/app/race/page.tsx');
const STRIP = read('apps/web/src/components/uma/race-strip.tsx');
const CSS = read('apps/web/src/components/uma/uma-theme.css');

describe('★読み始める時と あきらめる時', () => {
  /**
   * ★2026-09-28: ★窓（45 秒）が開いてから読み始めると ★本編の用意（★実測 24〜27 秒）が間に合わず、★オーナーの画面は簡易版のままだった。
   *   ★確定が見えたら（★窓の 75 秒前から）読み始め、★窓が閉じたら あきらめる。
   */
  it('★窓が閉じるまでは「まだ」・★閉じた瞬間から「もう」・★読めない時刻は「もう」', () => {
    const at = '2026-09-28T00:00:00Z';
    const t0 = Date.parse(at);
    expect(replayWindowOver(at, t0), '★発走の時点（★窓の前）').toBe(false);
    expect(replayWindowOver(at, t0 + REPLAY_START_DELAY_MS + REPLAY_DISPLAY_MS - 1)).toBe(false);
    expect(replayWindowOver(at, t0 + REPLAY_START_DELAY_MS + REPLAY_DISPLAY_MS)).toBe(true);
    expect(replayWindowOver('not a date', t0)).toBe(true);
  });
});

describe('★小窓で本編を流す約束', () => {
  it('🔴 ② ★知らせの形を確かめる（★形が違えば無視）', () => {
    expect(isStripEmbedMessage(stripEmbedMessage('playing', 'r1'))).toBe(true);
    expect(isStripEmbedMessage(stripEmbedMessage('ended', null))).toBe(true);
    expect(isStripEmbedMessage({ source: 'other', type: 'playing', raceId: 'r1' })).toBe(false);
    expect(isStripEmbedMessage({ source: 'star-race', type: 'go', raceId: 'r1' })).toBe(false);
    expect(isStripEmbedMessage({ source: 'star-race', type: 'ended', raceId: 1 })).toBe(false);
    expect(isStripEmbedMessage('playing')).toBe(false);
    expect(isStripEmbedMessage(null)).toBe(false);
  });

  it('🔴 ① ★帯と本編が ★同じ約束を import する（★URL と名前を 自分で書かない）', () => {
    expect(stripEmbedUrl('a b')).toBe(`/race?race=a%20b&embed=${STRIP_EMBED_PARAM_VALUE}`);
    expect(STRIP).toContain("from './race-strip-embed'");
    expect(STRIP).toContain('src={stripEmbedUrl(embed.id)}');
    expect(STRIP, '★帯が URL を自分で書いている').not.toMatch(/embed=strip/);
    expect(PAGE).toContain("from '../../components/uma/race-strip-embed'");
    expect(PAGE).toContain('const EMBED_STRIP = QS?.get(\'embed\') === STRIP_EMBED_PARAM_VALUE;');
  });

  it('🔴 ② ★帯は ★同じ origin の知らせだけ受け、★いま開いているレースの知らせだけ受ける', () => {
    expect(STRIP).toContain('if (event.origin !== window.origin || !isStripEmbedMessage(event.data)) return;');
    expect(STRIP).toContain('if (event.data.raceId !== embedId) return;');
    /** ★本編は ★同じ origin にだけ送る（★`*` に送らない） */
    expect(PAGE).toContain('window.parent.postMessage(stripEmbedMessage(type, raceId, detail), window.location.origin);');
    expect(PAGE).not.toMatch(/postMessage\([^)]*'\*'\)/);
  });

  it('🔴 ③ ★小窓の中は ★無音・★ボタンなし・★確定カードなし・★触っても全画面へ入らない・★いつもステージ', () => {
    expect(PAGE).toMatch(/const SOUND_ON_AT_START = typeof window !== 'undefined' && !EMBED_STRIP/);
    expect(PAGE).toContain('{!EMBED_STRIP && <div');
    expect(PAGE).toContain('{stageFinished && !EMBED_STRIP && (');
    expect(PAGE).toMatch(/onPointerDown=\{\(\) => \{[\s\S]{0,200}if \(EMBED_STRIP\) return;/);
    expect(PAGE).toContain('if (smallScreen || EMBED_STRIP) setStageFull(true);');
    /** ★小窓の箱は ★触れない（★帯の「詳細」「拡大」を塞がない） */
    expect(CSS).toMatch(/\.u-race-strip-embed \{[^}]*pointer-events: none;/);
  });

  it('🔴 ④ ★本編は ★流し始め・流し終え・失敗を ★帯へ知らせる（★帯は ★打ち切り秒でも閉じる）', () => {
    expect(PAGE).toContain("tellStrip('playing', real?.raceId ?? null);");
    expect(PAGE).toContain("if (stageFinished) tellStrip('ended', real?.raceId ?? null);");
    expect(PAGE).toContain("if (err !== null) tellStrip('error', real?.raceId ?? null, err);");
    /** ★読む層で止まったとき（★未ログイン・欠けた枠 等） */
    expect(PAGE.match(/tellStrip\('error', raceId, message\);/g)?.length).toBe(2);
    expect(STRIP).toContain('window.setTimeout(() => { setEmbed(null); }, STRIP_EMBED_GIVE_UP_SEC * 1000);');
    /** ★流れ始めたら見せ、★それ以外の知らせで閉じる */
    expect(STRIP).toContain("if (event.data.type === 'playing') { setEmbed((e) => (e === null ? e : { ...e, live: true })); return; }");
  });

  /**
   * 🔴 ⑤ ★**出せなかったら 理由を 1 行出す**（★2026-09-28）。★黙って簡易版に戻ると ★原因を誰も見られない
   *   （★オーナーの画面で 本編が出ないまま「何も変わっていない」になり、★理由を取る手が無かった）。
   */
  /** 🔴 ⑥ ★帯の停止スイッチで ★本編も止まる（★資料 §5-7）。★知らせは ★親から・★同じ origin だけ受ける */
  it('🔴 ⑥ ★停止スイッチ → 本編へ「止めて」／「続けて」（★帯が止めたものだけ再開）', () => {
    expect(isStripControlMessage(stripControlMessage('pause'))).toBe(true);
    expect(isStripControlMessage(stripControlMessage('resume'))).toBe(true);
    expect(isStripControlMessage({ source: 'star-race', type: 'pause' }), '★向きの違う知らせ').toBe(false);
    expect(isStripControlMessage({ source: 'star-strip', type: 'stop' })).toBe(false);
    expect(PAGE).toContain('if (event.source !== window.parent || event.origin !== window.location.origin || !isStripControlMessage(event.data)) return;');
    expect(PAGE).toContain('setPlaying((p) => { if (p) stripPausedRef.current = true; return false; });');
    expect(PAGE).toMatch(/\} else if \(stripPausedRef\.current\) \{\s*stripPausedRef\.current = false;\s*setPlaying\(true\);/);
  });

  /**
   * ★2026-09-28 デザイナー R-19 回答 Q5: ★1 行は 1 通り・★理由は画面に出さず ★ログにだけ（★利用者には意味が無く ★開発用の語が漏れる）。
   *   ★「簡易表示にしています」は ★簡易版を帯から外したので ★付けない（★嘘になる）。
   */
  /**
   * 🔴 ⑦ ★小窓では ★文字を消す（★2026-09-28・デザイナー R-19 回答 Q1「字幕・順位表・馬名プレート・パドックの札・オッズ・着順ボードは消す」）。
   *   ★2 割の大きさでは読めない。★代わりに ★帯が映像の左上に「録画」札を 1 つ重ねる。
   */
  it('🔴 ⑦ ★小窓では 字幕・HUD・パドックの札・出馬表・長い録画札を ★出さない（★帯が「録画」札を重ねる）', () => {
    expect(PAGE).toContain("get('cutin') === 'off') || EMBED_STRIP;");
    expect(PAGE).toContain('const hud = EMBED_STRIP ? { gauge: false, standings: false, calls: false, result: false }');
    /** ★2026-09-29: ★拡大の間は 札を描く（★帯から expand が届く） */
    expect(PAGE).toContain('{ cards: !EMBED_STRIP || stripExpanded });');
    expect(PAGE).toContain('drawRaceHeadlineChip(ctx, FONT, {'.replace('drawRaceHeadlineChip', '!EMBED_STRIP) drawRaceHeadlineChip'));
    expect(PAGE).toContain('!EMBED_STRIP) drawCourseSectionTag(');
    expect(PAGE).toContain('!replay.active && !cutInActive && !EMBED_STRIP) {');
    expect(PAGE).toContain("intro.stage === 'gate-hold' && !EMBED_STRIP) {");
    expect(PAGE).toContain('if (!EMBED_STRIP) drawEntryBoard(');
    expect(PAGE).toContain('if (replay.active && !EMBED_STRIP) {');
    expect(PAGE).toContain('{real !== null && !EMBED_STRIP && <div style={REPLAY_BADGE_STYLE}>');
    expect(STRIP).toContain('{big && embedLive && !expanded && <span className="u-race-strip-stage-rec" aria-hidden>録画</span>}');
  });

  it('🔴 ⑤ ★出せなかったら ★1 通りの 1 行を出し、★理由はログにだけ', () => {
    expect(STRIP_EMBED_FAILED_NOTE).toBe('録画を出せませんでした');
    expect(STRIP_EMBED_FAILED_NOTE, '★簡易版は出していない').not.toContain('簡易');
    expect(stripEmbedLog('error', 'ログインしてください', 0)).toBe('録画を出せませんでした: ログインしてください');
    expect(stripEmbedLog('late', null, 118)).toBe('録画の用意が間に合いませんでした（118 秒）');
    expect(isStripEmbedMessage(stripEmbedMessage('error', 'r1', '理由'))).toBe(true);
    expect(isStripEmbedMessage({ source: 'star-race', type: 'error', raceId: 'r1', detail: 3 })).toBe(false);
    /** ★画面に出すのは 定数だけ（★理由の文を出さない） */
    expect(STRIP.match(/setEmbedNote\(STRIP_EMBED_FAILED_NOTE\);/g)?.length).toBe(2);
    expect(STRIP).not.toMatch(/setEmbedNote\((?!STRIP_EMBED_FAILED_NOTE|null)/);
    expect(STRIP.match(/console\.warn\(`\[race-strip\] \$\{stripEmbedLog\(/g)?.length).toBe(2);
    expect(STRIP).toContain("{size === 'big' && embedNote !== null && <span className=\"u-race-strip-error\" role=\"status\">{embedNote}</span>}");
  });
});

/**
 * 🔴 ★**小窓の本編を軽くする・★開く時間を窓の近くに・★子でも「動きを減らす」**（★2026-09-28・レビュー側の決定 1〜5）。
 *   ★実測（本番・390px・キャッシュ無効・見本のレース）: ★playing まで 17.29MB のうち ★歩きのコマ 10.17MB・★音 0.93MB（★流れてから +1.54MB）。
 */
describe('★小窓の本編の重さと時間', () => {
  it('🔴 ★小窓では 音を読まない・★歩きのコマは読む（★2026-09-29 オーナー「パドックが勝手に軽い走りになった」→ 小窓でも歩く）', () => {
    expect(PAGE).toContain("const walkA = bakedLibs === undefined ? await loadNativeSet('horse-jockey-side-walk-v1') : undefined;");
    expect(PAGE).toContain('const bakedWalk = bakedLibs === undefined');
    expect(PAGE).toMatch(/if \(EMBED_STRIP\) return undefined;\s*audioRef\.current = createRaceAudio\(\);/);
    /** ★パドックは ★歩きが無ければ 走りのコマで描く（★場面を消さない） */
    /** ★3 頭を 歩く → 軽く走る → 歩く（★歩きが無ければ走り） */
    expect(PAGE).toContain('(idx % 2 === 0 ? art.sideWalkHighQuality?.[pick.gate - 1] : undefined) ?? art.sideHighQuality[pick.gate - 1]');
  });

  it('🔴 ★本編を開くのは ★窓が開く 40 秒前から 窓が閉じるまで', () => {
    const at = '2026-09-28T00:00:00Z';
    const start = Date.parse(at) + REPLAY_START_DELAY_MS;
    const lead = STRIP_EMBED_LEAD_SEC * 1000;
    expect(STRIP_EMBED_LEAD_SEC).toBe(40);
    expect(replayWindowNear(at, start - lead - 1, lead), '★確定を見ただけ（★窓の 75 秒前）では開かない').toBe(false);
    expect(replayWindowNear(at, start - lead, lead)).toBe(true);
    expect(replayWindowNear(at, start + REPLAY_DISPLAY_MS - 1, lead)).toBe(true);
    expect(replayWindowNear(at, start + REPLAY_DISPLAY_MS, lead), '★窓の外で開かない').toBe(false);
    expect(STRIP).toContain('if (openSoon && recentId !== null && embeddedIdRef.current !== recentId) {');
  });

  it('🔴 ★子（本編）でも「動きを減らす」を守り、★帯は 黙って閉じる（★経路が違っても同じ結果）', () => {
    expect(PAGE).toContain("if (EMBED_STRIP && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { tellStrip('declined', real?.raceId ?? null); return; }");
    expect(PAGE).toContain("const onChange = (): void => { if (reduce.matches) { setPlaying(false); tellStrip('declined', real?.raceId ?? null); } };");
    expect(isStripEmbedMessage(stripEmbedMessage('declined', 'r1'))).toBe(true);
    /** ★declined は ★「出せませんでした」を出さない（★error のときだけ） */
    expect(STRIP).toMatch(/if \(event\.data\.type === 'error'\) \{[\s\S]{0,200}setEmbedNote\(STRIP_EMBED_FAILED_NOTE\);\s*\}\s*setEmbed\(null\);/);
  });
});

/**
 * 🔴 ★**小窓の本編の安い削り 2 つ**（★2026-09-28・レビュー側の決定・★実測 6.19MB → 目安 5MB）。
 *   ① ★斜め前の馬（diag-front・1.72MB）は ★小窓では読まず ★真横の素材で描く（★`?directional=side` と同じ・カット数は変わらない）
 *   ② ★ダートの 3 層（dirt-far/mid/near・PNG 64 万 B）は ★WebP を作って追跡し ★読み込みの除外から外す
 */
describe('★小窓の本編の削り', () => {
  it('🔴 ① ★小窓では 斜め前の馬を 焼いた経路でも原版でも読まない（★欠けた扱いで全部落ちない）', () => {
    expect(PAGE).toContain("const EMBED_SKIP_ROLES: ReadonlySet<string> = new Set(EMBED_STRIP ? ['diag-front-v2'] : []);");
    expect(PAGE).toContain('const baseRoles = [...neededAssets.filter((role) => !EMBED_SKIP_ROLES.has(role)),');
    expect(PAGE, '★焼いた経路の「全部そろったか」から外さないと 原版に落ちて もっと重くなる').toContain('.filter((role) => setByRole.has(role) && !EMBED_SKIP_ROLES.has(role))');
    expect(PAGE).toContain("const frontV3 = EMBED_STRIP ? undefined : await loadNativeSet(frontSetName, 'horse-jockey-diag-front-v3');");
    expect(PAGE).toContain('const diagFrontHighQuality = EMBED_STRIP ? [] : ');
    expect(PAGE, '★空のときは 真横に回る').toContain("'diag-front-v2': libraryOr(art.diagFrontHighQuality),");
    expect(PAGE).toContain('EMBED_STRIP ? { rear: bakedLibs !== undefined || rearV4 !== undefined, front: false }');
  });

  it('🔴 ② ★ダートの 3 層は WebP が在り、★読み込みの除外に入っていない', () => {
    const dir = path.join(ROOT, 'apps/web/public/art/parallax/backstretch-side-v1');
    for (const n of ['dirt-far', 'dirt-mid', 'dirt-near']) expect(existsSync(path.join(dir, `${n}.webp`)), `★${n}.webp が無い`).toBe(true);
    expect(PAGE, '★ダートがまだ除外に入っている（★PNG を直に読む）').not.toMatch(/dirt-\(\?:far\|mid\|near\)/);
  });
});
