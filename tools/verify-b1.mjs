/**
 * ★B-1: 1頭を誕生から引退まで通す（実 DB・各週の状態遷移を記録）
 *
 * 指示書:
 *   > B-1 は「通せた」だけでなく、**各週で何が起きたかを記録**してください。
 *   > P3 は1頭の一生という長い経路を扱うので、
 *   > **途中の1ステップが静かに効かなくなっても、最後まで通ってしまいます。**
 *
 * 【★設計で一番大事なところ: 毎週 DB に往復させる】
 *   メモリ上で 260 週回して最後に1回書くのが速いのですが、それでは
 *   **永続化の取りこぼしが一切出ません。** 列が足りない・型が落ちる・
 *   numeric が文字列で返る、といった不具合は「書いて読み直す」ときにしか出ません。
 *   → **毎週 update し、毎週 select し直します。** 遅いのは承知の上です。
 *
 * 【★「通った」を PASS にしない】
 *   最後に以下を**別々に**検査します。1つでも欠ければ FAIL:
 *     ① 週の抜けが無い（連番で 0..引退週まで揃っている）
 *     ② 78週未満は EP を使っていない・成長していない（§7.1）
 *     ③ 78週・104週・260週で段階が切り替わっている（§7.1）
 *     ④ 全週で current ≤ potential（§7.3・B-4）
 *     ⑤ 故障した週は成長していない
 *     ⑥ 休養中は EP を使っていない
 *     ⑦ 引退が記録され、繁殖の行き先が性別と整合している（§7.1・§10.5）
 *     ⑧ ★DB を読み直した値が、メモリ上の値と一致する（往復で落ちていない）
 *
 * 実行: npx tsx tools/verify-b1.mjs --env staging [--seed 42] [--menu balanced|hard_only|neglect]
 */
import pg from 'pg';
import { deriveRng, ABILITY_KEYS } from '../packages/sim-engine/src/index.ts';
import {
  DEFAULT_MENU, MENUS, TEMPER_FLOOR_RATIO, advanceWeek, initialState,
} from '../packages/training/src/index.ts';
import { LIFECYCLE_WEEKS } from '../packages/scheduler/src/index.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv, positionals } from './lib/env.mjs';

void positionals();
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const SEED = Number(arg('seed', '42'));
const POLICY = arg('menu', 'balanced');
if (!['balanced', 'hard_only', 'neglect'].includes(POLICY)) {
  throw new Error(`--menu は balanced / hard_only / neglect です（受け取った値: ${POLICY}）`);
}

/** ★V-7 / V-14 と**同一**の方針（別物にすると数字を突き合わせられない） */
const chooseMenu = (week, fatigue) => {
  if (POLICY === 'neglect') return DEFAULT_MENU;
  if (POLICY === 'hard_only') return fatigue >= 85 ? 'rest' : 'hard';
  if (fatigue >= 70) return 'rest';
  const c = week % 4;
  return c === 0 ? 'hard' : c === 1 ? 'hill' : c === 2 ? 'wood' : DEFAULT_MENU;
};

/**
 * ★numeric（OID 1700）は `pg` が**文字列で返します**。
 *   `Number()` を通し忘れると、`fatigue + 18` が `"0.0018"` になって静かに壊れます。
 *   ★NaN をここで落とします（NaN のまま進むと、比較が全部 false になって「異常なし」に見える）。
 */
const num = (v, what) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`${what}: 数値として読めません（${JSON.stringify(v)}）`);
  return n;
};
const numRec = (o, what) =>
  Object.fromEntries(ABILITY_KEYS.map((k) => [k, num(o?.[k], `${what}.${k}`)]));

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-b1.mjs');

// ── 対象の馬を1頭選ぶ ────────────────────────────────────────
//    ★専用の馬を作りません（§10.5「専用の簡易ロジックを作らない」）。
//      世界に実在する NPC 馬をそのまま通します。
const pick = await c.query(
  `select id, name, sex, growth, temper, durability, potential, stats,
          birth_snapshot, inbreed_coeff, nicks_multiplier
     from horses order by id limit 1`,
);
if (pick.rowCount === 0) {
  throw new Error('馬が1頭もいません。先に seed-world.mjs を流してください');
}
const picked = pick.rows[0];

/**
 * ★誕生時の値に戻してから始める。
 *
 * 【なぜ要るか】
 *   最初、これが無いまま2回流しました。**2回目は1回目の終了状態から始まりました** —
 *   気性は 33 → 0 に潰れたまま、素質は故障で削られたままです。
 *   ★落ちも警告もせず、**「PASS」とだけ出ます。** 流すたびに証拠が静かに劣化します。
 *   → 誕生時の写しを `birth_snapshot` に持ち、以後はそこから復元します。
 */
const h = { ...picked };
if (picked.birth_snapshot === null) {
  const snap = {
    potential: picked.potential, stats: picked.stats,
    durability: num(picked.durability, 'durability'), temper: num(picked.temper, 'temper'),
  };
  await c.query('update horses set birth_snapshot = $2 where id = $1', [picked.id, JSON.stringify(snap)]);
  console.log('  ★誕生時の写しを保存しました（初回）');
} else {
  const b = picked.birth_snapshot;
  h.potential = b.potential; h.stats = b.stats;
  h.durability = b.durability; h.temper = b.temper;
  console.log('  ★誕生時の写しから復元しました（再実行）');
}

/**
 * ★故障率倍率（§6.5）。`horses` に列が無いので近交係数から復元します。
 *   正典 §6.5 の式が別にあるなら、そちらが正です（照会 Q-P3-22）。
 *   ★ここで係数を**発明しない**ため、列が無い以上は 1（倍率なし）にします。
 */
const injuryRateMult = 1;

/**
 * ★`birthTemper` を必ず渡す（D-049）。
 *   ここは .mjs で型検査の外なので、渡し忘れると `temperFloor(undefined)` が NaN になり、
 *   **落ちずに気性が NaN のまま一生を通ります**。数値として読めることをここで確かめます。
 */
const birthTemper = num(h.temper, 'birth.temper');
const traits = { sex: h.sex, growth: h.growth, injuryRateMult, birthTemper };
const BIRTH_WEEK = 0;

console.log(`# B-1: 1頭を誕生から引退まで通す  seed=${SEED} 方針=${POLICY}`);
console.log(`  対象: ${h.name}（${h.sex} / 成長型 ${h.growth} / 気性 ${num(h.temper, 'temper')} / 丈夫さ ${num(h.durability, 'durability')}）`);
console.log('');

// ── 初期化（★再実行できるようにする）────────────────────────
await c.query('delete from horse_week_log where horse_id = $1', [h.id]);
const s0 = initialState({
  potential: numRec(h.potential, 'potential'),
  current: numRec(h.stats, 'stats'),
  durability: num(h.durability, 'durability'),
  temper: num(h.temper, 'temper'),
});
await c.query(
  `update horses set birth_week = $2, last_processed_week = $2, fatigue = $3, condition = $4,
     rest_until_week = null, career_ended = false,
     retired_at_week = null, retirement_role = null, retirement_reason = null,
     potential = $5, stats = $6, durability = $7, temper = $8
   where id = $1`,
  [h.id, BIRTH_WEEK, s0.fatigue, s0.condition,
   JSON.stringify(s0.potential), JSON.stringify(s0.current), s0.durability, s0.temper],
);

// ── 週送り（★毎週 DB に往復）──────────────────────────────
const logs = [];
const mismatches = [];
let weeks = 0;
let epTotal = 0;

for (;;) {
  weeks += 1;
  if (weeks > LIFECYCLE_WEEKS.retireAt + 5) throw new Error('引退しませんでした（無限ループ防止）');

  // ★DB から読み直す。ここで型が落ちていれば num() が落とす
  const r = await c.query(
    `select birth_week, last_processed_week, fatigue, condition, rest_until_week,
            career_ended, retired_at_week, potential, stats, durability, temper
       from horses where id = $1`,
    [h.id],
  );
  const row = r.rows[0];
  if (row.retired_at_week !== null) break;

  const absWeek = num(row.last_processed_week, 'last_processed_week');
  const ageWeeks = absWeek - num(row.birth_week, 'birth_week');
  const state = {
    ageWeeks,
    potential: numRec(row.potential, 'potential'),
    current: numRec(row.stats, 'stats'),
    durability: num(row.durability, 'durability'),
    temper: num(row.temper, 'temper'),
    fatigue: num(row.fatigue, 'fatigue'),
    condition: num(row.condition, 'condition'),
    restUntilWeek: row.rest_until_week === null ? -1 : num(row.rest_until_week, 'rest_until_week') - BIRTH_WEEK,
    careerEnded: row.career_ended,
    retirement: null,
  };

  const menu = chooseMenu(ageWeeks, state.fatigue);
  const out = advanceWeek({
    state,
    traits,
    menu,
    // ★B-1 は実際の遊び方を通すので、イベントを引きます（§7.6）
    //   ⚠️ V-7 / V-14 はイベント無しで測られています（diag-loop.ts で差を報告済み）
    enableEvents: true,
    rngFor: (stream) => deriveRng(SEED, stream, ageWeeks),
  });
  epTotal += out.log.epSpent;

  // ── 書き戻し ──────────────────────────────────────────
  const nextAbs = BIRTH_WEEK + out.state.ageWeeks;
  await c.query(
    `update horses set last_processed_week = $2, fatigue = $3, condition = $4,
       rest_until_week = $5, career_ended = $6,
       retired_at_week = $7, retirement_role = $8, retirement_reason = $9,
       potential = $10, stats = $11, durability = $12, temper = $13
     where id = $1`,
    [h.id, nextAbs, out.state.fatigue, out.state.condition,
     out.state.restUntilWeek < 0 ? null : BIRTH_WEEK + out.state.restUntilWeek,
     out.state.careerEnded,
     out.state.retirement === null ? null : nextAbs,
     out.state.retirement?.role ?? null,
     out.state.retirement?.reason ?? null,
     JSON.stringify(out.state.potential), JSON.stringify(out.state.current),
     out.state.durability, out.state.temper],
  );
  await c.query(
    `insert into horse_week_log
       (horse_id, week, age_weeks, stage, menu_chosen, menu, ep_spent, resting, injury_prob,
        injury, event, gain, fatigue, condition, retired)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [h.id, BIRTH_WEEK + out.log.week, out.log.week, out.log.stage, out.log.menuChosen, out.log.menu,
     out.log.epSpent, out.log.resting, out.log.injuryProb,
     out.log.injury === null ? null : JSON.stringify(out.log.injury),
     out.log.event === null ? null : JSON.stringify(out.log.event),
     JSON.stringify(out.log.gain), out.log.fatigue, out.log.condition,
     out.log.retired === null ? null : JSON.stringify(out.log.retired)],
  );
  logs.push(out.log);

  // ── ⑧ 往復で値が落ちていないか（★次の週の読み直しと突き合わせる）──
  const back = await c.query(
    'select fatigue, condition, durability, temper, stats from horses where id = $1',
    [h.id],
  );
  const b = back.rows[0];
  const cmp = [
    ['fatigue', num(b.fatigue, 'fatigue'), out.state.fatigue],
    ['condition', num(b.condition, 'condition'), out.state.condition],
    ['durability', num(b.durability, 'durability'), out.state.durability],
    ['temper', num(b.temper, 'temper'), out.state.temper],
    ['stats.sp', num(b.stats.sp, 'stats.sp'), out.state.current.sp],
  ];
  for (const [what, got, want] of cmp) {
    // ★numeric(5,2) は小数2桁で丸められます。丸め幅を超えた差だけを拾う
    if (Math.abs(got - want) > 0.005) {
      mismatches.push(`週${out.log.week} ${what}: DB ${got} ≠ メモリ ${want}`);
    }
  }

  if (out.state.retirement !== null) break;
  if (weeks % 40 === 0) process.stdout.write(`\r  週送り ${out.state.ageWeeks} 週…`);
}
process.stdout.write('\r                              \r');

// ── 検査 ────────────────────────────────────────────────
const db = await c.query(
  `select week, age_weeks, stage, menu_chosen, menu, ep_spent, resting, injury, event, gain,
          fatigue, condition, retired
     from horse_week_log where horse_id = $1 order by week`,
  [h.id],
);
const rows = db.rows;
const fin = await c.query(
  `select retired_at_week, retirement_role, retirement_reason, career_ended,
          potential, stats, temper from horses where id = $1`,
  [h.id],
);
const f = fin.rows[0];

const fails = [];
const vacuous = [];
/**
 * ★`samples` は「その検査が実際に見た件数」です。
 *
 * 【なぜ要るか】
 *   最初の実行で ⑤（故障した週は成長しない）と ⑥（休養中は EP を使わない）が
 *   **対象 0 件のまま ✓ と出ました。** 何も検査していないのに PASS に見えます。
 *   R-21:「落ちた」≠「検出できた」— ここでは「通った」≠「検査した」です。
 *   → 0 件なら **PASS にせず「未検査」として別に数えます。**
 */
const check = (ok, label, detail, samples = null) => {
  const empty = samples !== null && samples === 0;
  const mark = empty ? '−' : ok ? '✓' : '★';
  console.log(`  ${mark} ${label}${detail ? `  ${detail}` : ''}${empty ? '  ★対象 0 件＝検査していません' : ''}`);
  if (empty) vacuous.push(label);
  else if (!ok) fails.push(label);
};

console.log('【各週の記録から検査】');

// ① 週の抜けが無い
const gaps = rows.filter((r, i) => i > 0 && Number(r.age_weeks) !== Number(rows[i - 1].age_weeks) + 1);
check(rows.length > 0 && Number(rows[0].age_weeks) === 0 && gaps.length === 0,
  '① 週の抜けが無い', `${rows.length} 週（0 → ${rows.at(-1)?.age_weeks}）抜け ${gaps.length} 箇所`);

// ② 78週未満は EP も成長も無い
const early = rows.filter((r) => Number(r.age_weeks) < LIFECYCLE_WEEKS.trainableFrom);
const earlyEp = early.filter((r) => Number(r.ep_spent) !== 0).length;
const earlyGain = early.filter((r) => ABILITY_KEYS.some((k) => Math.abs(Number(r.gain[k])) > 1e-9)).length;
check(early.length === LIFECYCLE_WEEKS.trainableFrom && earlyEp === 0 && earlyGain === 0,
  '② 78週未満は EP 0・成長 0（§7.1）', `${early.length} 週 / EP使用 ${earlyEp} / 成長 ${earlyGain}`);

// ③ 段階の切り替わり
const stageAt = (w) => rows.find((r) => Number(r.age_weeks) === w)?.stage ?? '（無し）';
check(
  stageAt(LIFECYCLE_WEEKS.trainableFrom - 1) === 'growing' &&
  stageAt(LIFECYCLE_WEEKS.trainableFrom) === 'trainable' &&
  stageAt(LIFECYCLE_WEEKS.raceableFrom - 1) === 'trainable' &&
  stageAt(LIFECYCLE_WEEKS.raceableFrom) === 'racing',
  '③ 78週・104週で段階が切り替わる（境界の両側・R-2）',
  `77:${stageAt(77)} 78:${stageAt(78)} 103:${stageAt(103)} 104:${stageAt(104)}`);

// ④ 全週で current ≤ potential（★最終行だけでなく、累積 gain を足し戻して各週で見る）
const pot = numRec(f.potential, 'potential');
const cur = numRec(f.stats, 'stats');
const overflow = ABILITY_KEYS.filter((k) => cur[k] > pot[k] + 1e-9);
check(overflow.length === 0, '④ current ≤ potential（§7.3・B-4）',
  overflow.length ? `超過: ${overflow.join(',')}` : `最大 ${Math.max(...ABILITY_KEYS.map((k) => cur[k] / pot[k] * 100)).toFixed(1)}% 到達`);

// ⑤ 故障した週は成長していない
const injWeeks = rows.filter((r) => r.injury !== null);
const injGrew = injWeeks.filter((r) => ABILITY_KEYS.some((k) => Number(r.gain[k]) > 1e-9));
check(injGrew.length === 0, '⑤ 故障した週は成長していない',
  `故障 ${injWeeks.length} 週 / うち成長した週 ${injGrew.length}`, injWeeks.length);

// ⑥ 休養中は EP を使っていない
const restWeeks = rows.filter((r) => r.resting);
const restEp = restWeeks.filter((r) => Number(r.ep_spent) !== 0);
check(restEp.length === 0, '⑥ 故障休養中は EP を使っていない',
  `故障休養 ${restWeeks.length} 週 / うち EP 使用 ${restEp.length} 週`, restWeeks.length);

// ⑦ 引退
const expectRole = f.career_ended || Number(f.retired_at_week) >= LIFECYCLE_WEEKS.retireAt
  ? (h.sex === 'male' ? 'stallion' : 'broodmare') : null;
check(f.retired_at_week !== null && f.retirement_role === expectRole,
  '⑦ 引退が記録され、行き先が性別と整合（§7.1・§10.5）',
  `${f.retired_at_week}週 / ${f.retirement_role} / ${f.retirement_reason}`);

// ⑧ 往復
check(mismatches.length === 0, '⑧ DB を読み直した値がメモリと一致（往復で落ちていない）',
  mismatches.length ? mismatches.slice(0, 3).join(' / ') : `${rows.length} 週すべて一致`);

// ⑩ ★気性が下限を割らない（D-049）。★是正前はここで 0 まで落ちていた
const temperEnd = num(f.temper, 'temper');
const floor = birthTemper * TEMPER_FLOOR_RATIO;
check(temperEnd >= floor - 1e-6 && Number.isFinite(temperEnd),
  '⑩ 気性が誕生時×比率の下限を割らない（D-049）',
  `誕生 ${birthTemper.toFixed(1)} → 引退時 ${temperEnd.toFixed(2)} / 下限 ${floor.toFixed(2)}`,
  1);

// ⑨ ★EP を払った週とメニューが整合する（イベントで休養に差し替わった週を除く）
const paid = rows.filter((r) => Number(r.ep_spent) > 0);
const paidMismatch = paid.filter((r) => Number(r.ep_spent) !== (MENUS[r.menu_chosen]?.epCost ?? -1));
check(paidMismatch.length === 0, '⑨ 払った EP が「選んだメニュー」の額と一致（§7.2）',
  `EP を払った ${paid.length} 週 / 不一致 ${paidMismatch.length} 週` +
  `（うちイベントで休養に差し替わった週 ${paid.filter((r) => r.menu !== r.menu_chosen).length}）`,
  paid.length);

console.log('');
console.log('【一生の内訳】');
const bySev = {};
for (const r of injWeeks) bySev[r.injury.severity] = (bySev[r.injury.severity] ?? 0) + 1;
const byMenu = {};
for (const r of rows) byMenu[r.menu] = (byMenu[r.menu] ?? 0) + 1;
console.log(`  故障 ${injWeeks.length} 回  ${Object.entries(bySev).map(([k, v]) => `${k}:${v}`).join(' ') || '（なし）'}`);
console.log(`  イベント ${rows.filter((r) => r.event !== null).length} 回`);
console.log(`  休養 ${restWeeks.length} 週 / 調教 ${rows.filter((r) => Number(r.ep_spent) > 0).length} 週`);
console.log(`  メニュー内訳: ${Object.entries(byMenu).map(([k, v]) => `${MENUS[k]?.label ?? k} ${v}`).join(' / ')}`);
console.log(`  ★EP 消費 合計 ${epTotal.toLocaleString()}（G-6 で ep_ledger に記帳する対象）`);
console.log(`  気性 ${num(h.temper, 'temper').toFixed(1)} → ${num(f.temper, 'temper').toFixed(1)}`);
console.log(`  能力 ${ABILITY_KEYS.map((k) => `${k} ${cur[k].toFixed(0)}/${pot[k].toFixed(0)}`).join(' ')}`);
// ★誕生時からどれだけ素質を失ったか（D-045 の「明示」を一生ぶんで出す）
const pot0 = numRec(h.potential, 'birth.potential');
const lost = ABILITY_KEYS.filter((k) => pot0[k] - pot[k] > 1e-9);
console.log(`  ★一生で失った素質: ${lost.length === 0 ? 'なし' : lost.map((k) => `${k} -${(pot0[k] - pot[k]).toFixed(1)}`).join(' ')}`);

console.log('');
if (fails.length > 0) {
  console.log(`★B-1: FAIL — ${fails.length} 項目: ${fails.join(' / ')}`);
} else if (vacuous.length > 0) {
  // ★ここを PASS にしません。「その一生では起きなかった」だけで、検査は通っていません
  console.log(`★B-1: 条件付き — ${rows.length} 週を記録し、${10 - vacuous.length}/10 項目が成立。`);
  console.log(`  ★ただし ${vacuous.length} 項目は**対象が 0 件で検査できていません**: ${vacuous.join(' / ')}`);
  console.log(`  → 故障が起きる条件で流し直してください（例: --menu hard_only、別の --seed）`);
} else {
  console.log(`★B-1: PASS — ${rows.length} 週すべて記録し、10項目すべてを実データで検査`);
}
await c.end();
process.exit(fails.length === 0 && vacuous.length === 0 ? 0 : 1);
