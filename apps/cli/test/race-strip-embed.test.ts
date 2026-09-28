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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  isStripEmbedMessage, stripEmbedMessage, stripEmbedUrl, STRIP_EMBED_PARAM_VALUE,
} from '../../web/src/components/uma/race-strip-embed';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');
const PAGE = read('apps/web/src/app/race/page.tsx');
const STRIP = read('apps/web/src/components/uma/race-strip.tsx');
const CSS = read('apps/web/src/components/uma/uma-theme.css');

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
    expect(PAGE).toContain('window.parent.postMessage(stripEmbedMessage(type, raceId), window.location.origin);');
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
    expect(PAGE).toContain("if (err !== null) tellStrip('error', real?.raceId ?? null);");
    /** ★読む層で止まったとき（★未ログイン・欠けた枠 等） */
    expect(PAGE.match(/tellStrip\('error', raceId\);/g)?.length).toBe(2);
    expect(STRIP).toContain('window.setTimeout(() => { setEmbed(null); }, STRIP_EMBED_GIVE_UP_SEC * 1000);');
    /** ★流れ始めたら見せ、★それ以外の知らせで閉じる */
    expect(STRIP).toContain("if (event.data.type === 'playing') setEmbed({ id: embedId, live: true });");
  });
});
