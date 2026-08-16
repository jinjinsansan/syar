/**
 * ★ゲージ（D-072）— **エンジンの内部状態をそのまま出していること**
 *
 * 【なぜこの検査が要るか】
 *   ゲージは §12.6 の「自馬の唯一の読み取り」で、**C-6 の判断材料**です。
 *   ⚠️ ★一度、描画層で近似式を作って**符号が逆**になりました
 *      （残り200m で 余力と着順の順位相関 −0.653 ＝ **勝つ馬ほどバテて見えていた**）。
 *      裁定: 「これは『精度が足りない』ではなく『符号が逆』です」。
 *
 *   → ★**近似を作らない**ことを、ここで固定します。
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INTERVENTION_BALANCE as IB,
  initialStamina,
  resolveIntervention,
  staminaAtMeter,
  staminaTrackOf,
  boundaryTimesOf,
  staminaGaugeOf,
  staminaAt,
  PHASE_METERS,
  type InterventionHorse,
  type InterventionPlan,
  type RunPosition,
} from '../src/index.js';

const HORSE: InterventionHorse = { iq: 500, gt: 500, st: 600, condition: 3, fatigue: 20 };
const PLAN: InterventionPlan = {
  startErrorMs: 0, spurtAtMeter: 495, driveTapsPerSec: 10, position: 'middle',
};
const POSITIONS: readonly RunPosition[] = ['front', 'middle', 'back'];

/**
 * ★**旧実装をここに書き写してあります**（秒で計算する形）。
 *
 * ⚠️ ★これは「同じものを2度書いた」のではありません。**捨てた式を残してある**のです。
 *    D-072 で 1m あたりに直したとき、**平均速度が約分で消えました**。
 *    「消えても値は変わらない」を、★**消える前の式と突き合わせて**確かめます。
 */
function oldStaminaLeft(
  horse: InterventionHorse, plan: InterventionPlan, speedMps: number, distanceMeter: number,
): number {
  const stamina0 = initialStamina(horse.st, horse.condition, horse.fatigue, IB);
  const earlySpurt = plan.spurtAtMeter > IB.EARLY_SPURT_METER;
  const raceSec = distanceMeter / speedMps;
  const unit = IB.STAMINA_BASE_DRAIN / raceSec;
  const spurtStart = Math.min(Math.max(0, plan.spurtAtMeter), distanceMeter);
  const cruiseMeter = Math.max(0, distanceMeter - spurtStart);
  const cruiseRate = unit * IB.STAMINA_POSITION_MULT[plan.position];
  const spurtRate = cruiseRate * IB.STAMINA_SPURT_DRAIN * (earlySpurt ? IB.EARLY_SPURT_DRAIN_MULT : 1);
  return stamina0 - (cruiseMeter / speedMps) * cruiseRate - (spurtStart / speedMps) * spurtRate;
}

describe('★ゲージは内部状態の露出であって、作り直しではない', () => {
  it('★★旧式と1ミリも違わない（露出のために値を動かしていない）', () => {
    for (const dist of [1200, 1600, 2000, 2400, 3200]) {
      for (const spurtAt of [0, 300, 495, 800, 1000, 1500]) {
        for (const position of POSITIONS) {
          for (const st of [100, 400, 700, 1000]) {
            for (const speed of [14, 16.5, 18]) {
              const horse = { ...HORSE, st };
              const plan = { ...PLAN, spurtAtMeter: spurtAt, position };
              const track = staminaTrackOf(horse, plan, dist, IB);
              expect(staminaAtMeter(track, 0)).toBeCloseTo(
                oldStaminaLeft(horse, plan, speed, dist), 9,
              );
            }
          }
        }
      }
    }
  });

  /**
   * ⚠️ ★**「平均速度を変えても結果が動かない」検査は消しました。**
   *    Q-P4-45 の裁定で**引数そのものを消した**ので、
   *    ★**渡しようがなく、検査として成り立ちません。**
   *
   *   ★同じことは上の「旧式と1ミリも違わない」で押さえてあります —
   *     旧式は**速度を使う形のまま**残してあり、
   *     3通りの速度すべてで新しい値と一致することを確かめています。
   */
  it('★★速度を使う旧式と、速度を使わない今の式が一致する（1080通り）', () => {
    // ★上の検査が本体。ここは「消した検査の代わりがあること」を明示するための目印
    expect(staminaAtMeter(staminaTrackOf(HORSE, PLAN, 1600, IB), 0))
      .toBeCloseTo(oldStaminaLeft(HORSE, PLAN, 16.5, 1600), 9);
  });

  it('★D-017 は生きている（総消費が距離によらない）', () => {
    const left = [1200, 1600, 2000, 2400, 3200].map(
      (d) => staminaAtMeter(staminaTrackOf(HORSE, { ...PLAN, spurtAtMeter: d * 0.25 }, d, IB), 0),
    );
    for (const v of left) expect(v).toBeCloseTo(left[0]!, 9);
  });
});

describe('★描画層は「線で結ぶ」だけでよい', () => {
  const DIST = 1600;

  it('★★節目の間を線で結ぶと、元の式と厳密に一致する', () => {
    for (const spurtAt of [300, 495, 700, 1000]) {
      const plan = { ...PLAN, spurtAtMeter: spurtAt };
      const track = staminaTrackOf(HORSE, plan, DIST, IB);
      const times = boundaryTimesOf(
        { horseId: '1', finishPosition: 1, timeSec: 96 } as never, DIST, 1, 'senko', 'middle',
      );
      const gauge = staminaGaugeOf(track, times, DIST, 'senko', 'middle');
      for (let m = DIST; m >= 0; m -= 7) {
        // ★線で結んだ値 == 元の式（0 で止めたもの）
        expect(staminaAt(gauge, m).left).toBeCloseTo(Math.max(0, staminaAtMeter(track, m)), 9);
      }
    }
  });

  it('★★率が変わる点が節目に入っている（勝負所と直線の間で仕掛けても再現できる）', () => {
    // ★仕掛けが 800m と 400m の**間**にある場合。境界4つだけだと線がずれる
    const plan = { ...PLAN, spurtAtMeter: 600 };
    const track = staminaTrackOf(HORSE, plan, DIST, IB);
    const times = boundaryTimesOf(
      { horseId: '1', finishPosition: 1, timeSec: 96 } as never, DIST, 1, 'senko', 'middle',
    );
    const gauge = staminaGaugeOf(track, times, DIST, 'senko', 'middle');
    expect(gauge.knots.map((k) => k.metersLeft)).toContain(600);
    expect(staminaAt(gauge, 500).left).toBeCloseTo(Math.max(0, staminaAtMeter(track, 500)), 9);
  });

  it('★時刻は境界時刻と同じ変換で出ている（ゲージだけ別の時間軸で動かない）', () => {
    const track = staminaTrackOf(HORSE, PLAN, DIST, IB);
    const times = boundaryTimesOf(
      { horseId: '1', finishPosition: 1, timeSec: 96 } as never, DIST, 1, 'nige', 'high',
    );
    const gauge = staminaGaugeOf(track, times, DIST, 'nige', 'high');
    const at = (m: number) => gauge.knots.find((k) => k.metersLeft === m)?.sec;
    expect(at(DIST)).toBe(0);
    expect(at(PHASE_METERS.SPURT)).toBeCloseTo(times.spurtSec, 9);
    expect(at(PHASE_METERS.STRAIGHT)).toBeCloseTo(times.straightSec, 9);
    expect(at(0)).toBeCloseTo(times.finishSec, 9);
  });

  it('★★棒が裏返らない（残量は 0 未満にならない・減る一方）', () => {
    // 尽きる馬（スタミナが低く、後方から早仕掛け）
    const weak = { ...HORSE, st: 100, condition: 1, fatigue: 90 };
    const plan = { ...PLAN, spurtAtMeter: 1500, position: 'back' as const };
    const track = staminaTrackOf(weak, plan, DIST, IB);
    const times = boundaryTimesOf(
      { horseId: '1', finishPosition: 8, timeSec: 100 } as never, DIST, 1, 'oikomi', 'high',
    );
    const gauge = staminaGaugeOf(track, times, DIST, 'oikomi', 'high');
    let prev = Infinity;
    for (let m = DIST; m >= 0; m -= 5) {
      const left = staminaAt(gauge, m).left;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(prev + 1e-9);   // ★増えない
      prev = left;
    }
    expect(staminaAt(gauge, 0).left).toBe(0);          // ★この馬は尽きている
  });
});

describe('★★ゲージの向きが正しい（ここが逆だと仕掛けを毎回裏切る）', () => {
  const DIST = 1600;
  /**
   * ⚠️ ★**0 で止めない生の値**で見ます。
   *    止めた値で比べたら「0 が 0 より小さいこと」を要求してしまい、当然落ちました。
   *    ★**標準的な馬はゴール前にゲージを使い切ります**（st=600・最適な仕掛けで −17.1）。
   *    → 順序を見たいのはここではなく、**使い切るまでの余力**です。
   */
  const rawAt = (h: InterventionHorse, p: InterventionPlan, m: number) =>
    staminaAtMeter(staminaTrackOf(h, p, DIST, IB), m);

  it('★スタミナが高い馬ほど、同じ乗り方なら余力が多い', () => {
    for (const m of [800, 400, 0]) {
      const low = rawAt({ ...HORSE, st: 200 }, PLAN, m);
      const high = rawAt({ ...HORSE, st: 900 }, PLAN, m);
      expect(high).toBeGreaterThan(low);
    }
  });

  it('★早く仕掛けるほど余力が減る（早仕掛けの罰と同じ向き）', () => {
    const late = rawAt(HORSE, { ...PLAN, spurtAtMeter: 400 }, 0);
    const early = rawAt(HORSE, { ...PLAN, spurtAtMeter: 1200 }, 0);
    expect(early).toBeLessThan(late);
  });

  it('★前で運ぶほど余力が減る（ポジション係数と同じ向き）', () => {
    const front = rawAt(HORSE, { ...PLAN, position: 'front' }, 0);
    const back = rawAt(HORSE, { ...PLAN, position: 'back' }, 0);
    expect(front).toBeLessThan(back);
  });

  it('★★「バテ」の判定がゲージと一致する（別々に持っていない）', () => {
    for (const spurtAt of [400, 800, 1200, 1500]) {
      for (const st of [100, 500, 900]) {
        const horse = { ...HORSE, st, fatigue: 80 };
        const plan = { ...PLAN, spurtAtMeter: spurtAt, position: 'front' as const };
        const out = resolveIntervention(horse, plan, DIST, IB);
        // ★直線に入る前に 0 になっていること ⇔ ranEmpty
        const emptyBeforeStraight = rawAt(horse, plan, PHASE_METERS.STRAIGHT) <= 0;
        expect(out.ranEmpty).toBe(emptyBeforeStraight);
      }
    }
  });
});
