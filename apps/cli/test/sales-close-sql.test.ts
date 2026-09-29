/**
 * ★**投票の締切（★発走の何秒前か）を SQL と TS で 1 つにする**（★2026-09-29・`0096`・正典 §9.6・レビュー側 cd46add）
 *
 * 【★なぜ】
 *   ★`place_bet`（`0045`）は ★`scheduled_at <= now()` だけを見て ★**発走の瞬間まで受けていた**。
 *   ★TS の表（`cycle.ts` の `PHASE_OFFSET_MS.salesClose`）は ★発走の 1 分前に締め切る。★2 つが食い違っていた。
 *   ★SQL は ★余裕を 1 か所（`sales_close_lead_seconds()`）に置き、★ここで TS との一致を見る（★`ep-grant-sql` と同じ作法）。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★SQL と TS の余裕が ずれる
 *   ② 🔴 ★place_bet が ★余裕を見ずに 発走まで受ける（★旧の形に戻る）
 *   ③ 🔴 ★place_bet が ★60 を直書きする（★値が 2 か所に散る）
 */
import { describe, expect, it } from 'vitest';
import { CYCLE_MS, PHASE_OFFSET_MS } from '@star/scheduler';
import { lastFunctionBody, stripSqlComments } from './lib/sql-source.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from './lib/ts-blocks.js';
import { SALES_CLOSE_LEAD_MS, salesCloseAtMs, salesClosedAt, salesLeftText } from '../../web/src/lib/sales-close';
import { CLAIM_SALES_CLOSED } from '../../web/src/lib/claims';

const ROOT = path.resolve(__dirname, '../../..');

describe('★投票の締切を SQL と TS で 1 つにする', () => {
  it('🔴 ① sales_close_lead_seconds() ＝ CYCLE_MS − PHASE_OFFSET_MS.salesClose（秒）', () => {
    const { body } = lastFunctionBody('sales_close_lead_seconds');
    const all = [...stripSqlComments(body).matchAll(/select\s+(\d+)\s*;/gi)];
    expect(all.length, '★select の数が 1 つでない').toBe(1);
    expect(Number(all[0]![1])).toBe((CYCLE_MS - PHASE_OFFSET_MS.salesClose) / 1000);
  });

  it('🔴 ② ③ place_bet は 余裕の関数で閉じる（★発走の瞬間で閉じない・★秒を直書きしない）', () => {
    const { file, body } = lastFunctionBody('place_bet');
    const code = stripSqlComments(body);
    expect(code, `★${file}: 締切を見ていない`).toMatch(/scheduled_at\s*-\s*make_interval\(\s*secs\s*=>\s*sales_close_lead_seconds\(\)\s*\)\s*<=\s*now\(\)/);
    expect(code, `★${file}: 発走の瞬間で閉じる旧の形`).not.toMatch(/scheduled_at\s*<=\s*now\(\)/);
    expect(code, `★${file}: 秒を直書きしている`).not.toMatch(/interval\s*'\d+\s*(sec|second|seconds|min|minute)/i);
  });

  it('★画面の「締め切った」（`salesClosedAt`）は 同じ余裕で・★境目どおり・★分からなければ 締め切らない', () => {
    const start = Date.parse('2026-09-29T12:00:00Z');
    const close = start - SALES_CLOSE_LEAD_MS;
    expect(SALES_CLOSE_LEAD_MS).toBe(CYCLE_MS - PHASE_OFFSET_MS.salesClose);
    expect(salesClosedAt(start, close - 1000), '★締切の 1 秒前').toBe(false);
    expect(salesClosedAt(start, close), '★締切ちょうど（★SQL も <= now() で拒む）').toBe(true);
    expect(salesClosedAt(start, close + 1000), '★締切の 1 秒後').toBe(true);
    expect(salesClosedAt(null, close + 1000), '★発走が分からない').toBe(false);
    expect(salesClosedAt(start, null), '★時計がまだ無い').toBe(false);
  });

  it('🔴 ★画面は「登録締切」と「発売締切」を分けて出し、★発売締切の時刻は salesCloseAtMs から（★2026-09-29・「締切 03:06」を読み違えた）', () => {
    const start = Date.parse('2026-09-29T12:00:00Z');
    expect(salesCloseAtMs(start)).toBe(start - SALES_CLOSE_LEAD_MS);
    const strip = stripComments(readFileSync(path.join(ROOT, 'apps/web/src/components/uma/race-strip.tsx'), 'utf8'));
    const at = strip.indexOf('function focusLine(');
    expect(at, '★focusLine が見つからない').toBeGreaterThan(0);
    const focus = strip.slice(at, strip.indexOf('\n}\n', at));
    expect(focus.length).toBeGreaterThan(200);
    expect(focus).toContain('salesCloseAtMs(startMs)');
    expect(focus).toContain('${LABEL_SALES_CLOSE} ${clock(salesClose)}');
    expect(focus).toContain('${LABEL_ENTRY_CLOSE} ${clock(row.entry_deadline_at)}');
    expect(focus, '★登録の締切を ただの「締切」と出している').not.toMatch(/`締切 \$\{clock\(row\.entry_deadline_at\)\}/);
    const detail = stripComments(readFileSync(path.join(ROOT, 'apps/web/src/app/races/[id]/page.tsx'), 'utf8'));
    expect(detail, '★レース詳細の「発売締切まで」が 発売の締切へ数えていない').toContain("<Countdown untilIso={new Date(salesCloseAtMs(Date.parse(String(r['scheduled_at'])))).toISOString()}");
    expect(detail).toContain('{LABEL_SALES_CLOSE}まで');
    expect(detail, '★「締切まで」が 発走へ数えている旧の形').not.toContain("<Countdown untilIso={String(r['scheduled_at'])}");
  });

  it('🔴 ★極小の帯（/vote）に ★発売締切までの残り・★過ぎたら「投票は締め切りました」・★/vote は締切後に押せない（★2026-09-29）', () => {
    const start = Date.parse('2026-09-29T12:00:00Z');
    const close = salesCloseAtMs(start);
    expect(salesLeftText('2026-09-29T12:00:00Z', close - 125_000)).toBe('発売締切まで 2:05');
    expect(salesLeftText('2026-09-29T12:00:00Z', close - 500)).toBe('発売締切まで 0:00');
    expect(salesLeftText('2026-09-29T12:00:00Z', close), '★締切ちょうど').toBe(CLAIM_SALES_CLOSED);
    expect(salesLeftText('not-a-date', close), '★発走が読めない').toBeNull();
    const strip = stripComments(readFileSync(path.join(ROOT, 'apps/web/src/components/uma/race-strip.tsx'), 'utf8'));
    const at = strip.indexOf("<strong>{next ? `${clock(next.scheduled_at)} ${status}` : status}</strong>");
    expect(at, '★極小の行が見つからない').toBeGreaterThan(0);
    /** ★描く要素そのものを見る（★条件の中の呼び出しだけでは 描いていなくても通る・2026-09-29 に変異で気づいた） */
    expect(strip.slice(at, at + 500), '★極小の行に 残り時間を描いていない').toContain('<span className="u-race-strip-recent">{salesLeftText(next.scheduled_at, nowMs)}</span>');
    const vote = stripComments(readFileSync(path.join(ROOT, 'apps/web/src/app/vote/page.tsx'), 'utf8'));
    expect(vote).toContain('const salesClosed = useSalesClosed(race?.scheduledAt ?? null);');
    expect(vote, '★締切後も押せる').toMatch(/const blocked = salesClosed \|\|/);
  });

  it('★対照: 表の締切は 発走より前（★0 以下なら この網の前提が崩れている）', () => {
    expect(CYCLE_MS - PHASE_OFFSET_MS.salesClose).toBeGreaterThan(0);
  });
});
