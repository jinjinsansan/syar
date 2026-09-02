/**
 * ★カメラ（アートバイブル §9）— **C-6 を殺さないこと**
 *
 * 【なぜこの検査が要るか】
 *   > 勝負所は、プレイヤーが仕掛ける瞬間そのものです。
 *   > ゲージが隠れる／合図が見えなくなる／遷移中にフレームが落ちる、
 *   > このどれかが起きると **V-13 は通り続けたまま**、
 *   > プレイヤーには「仕掛けても何も変わらない」ゲームになります。
 *
 *   ★**そして数字のどこにも現れません。** だから機械で見ます。
 *
 * 【★この検査が言えないこと】
 *   ここが守るのは「**描画コマンドに出ているか**」だけです。
 *   「人間に見えるか」は C-6 の3種ボットが測ります（見て判断しない）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sceneAt, phaseOf, cameraFor, lanesOnScreen, SPRITE, OVERLAY_KINDS,
  type PositionModel, type SceneInput, type HorseAt, type Zoom,
} from '../src/index.js';

const DIST = 1600;
const model = (n: number): PositionModel => ({
  raceSec: 100,
  distanceMeter: DIST,
  straightMeters: 400,
  at(sec) {
    const out: HorseAt[] = [];
    for (let g = 1; g <= n; g += 1) {
      out.push({ gate: g, meters: sec * (16 + g * 0.05), staminaRatio: Math.max(0, 1 - sec / 130) });
    }
    return out;
  },
});

const input = (zoom: Zoom, follow?: number): SceneInput => ({
  model: model(18),
  viewport: { width: 1280, height: 720, trackTop: 380, laneHeight: 40 },
  camera: { zoom, ...(follow === undefined ? {} : { followGate: follow }) },
  ownGate: 5,
  silkOf: (g) => `silk-${g}`,
  gallopFrames: 6,
  // ★V-16 ①: 展開（脚質・ペース）を画面に出す。**渡さないと画面から消えます**
  strategyOf: (g) => (['nige', 'senko', 'sashi', 'oikomi'] as const)[(g - 1) % 4]!,
  pace: 'middle',
});

/**
 * ★**画面の座標系にあるものを列挙で書きません。**
 *
 *   ⚠️ 最初は `'gauge' || 'cue'` と直接書いていました。
 *      そこへ `gap`（変化の表示）を足したとき、**検査は何も言わずに通りました**。
 *      新しい重ね表示が**カメラ不変の検査を素通りできる**状態です。
 *   → `OVERLAY_KINDS` を引くようにして、**足したら自動で検査対象になる**ようにします。
 */
const overlays = (z: Zoom, sec: number) =>
  sceneAt(input(z), sec).commands.filter(
    (c) => (OVERLAY_KINDS as readonly string[]).includes(c.kind),
  );

describe('★カメラがゲージと合図を隠さない（C-6 の前提）', () => {
  it('★倍率を変えても、ゲージと合図の位置が1画素も動かない', () => {
    // ★これが本題。寄りの最中に動いたら、プレイヤーは読めません
    for (const sec of [0, 20, 50, 80, 99]) {
      const wide = JSON.stringify(overlays(1, sec).map((c) => ({ ...c, ratio: undefined })));
      const near = JSON.stringify(overlays(2, sec).map((c) => ({ ...c, ratio: undefined })));
      expect(near).toBe(wide);
    }
  });

  it('★倍率を変えても、ゲージと合図が消えない', () => {
    for (const z of [1, 2] as Zoom[]) {
      for (const sec of [0, 20, 50, 80, 99]) {
        const kinds = overlays(z, sec).map((c) => c.kind).sort();
        // ★列挙を書き写しません。**`OVERLAY_KINDS` に足したら、ここも自動で要求されます**
        expect(kinds).toEqual([...OVERLAY_KINDS].sort());
      }
    }
  });

  it('★展開を渡さないと、画面から消える（黙って落ちないことを固定する）', () => {
    /**
     * ★`strategyOf` と `pace` は任意引数です。**渡さなければ描かれません。**
     *   V-16 ① は「全局面で画面ボット ≥ 出走表ボット」を要求しており、
     *   ★**これが無いと道中で 0.221 下回ります**（実測）。
     *   → 「消えうる」という事実を、検査として固定しておきます。
     */
    const bare = sceneAt({
      ...input(1), strategyOf: undefined, pace: undefined,
    }, 30).commands;
    expect(bare.find((c) => c.kind === 'pace')).toBeUndefined();
    const sp = bare.find((c) => c.kind === 'sprite') as { strategy?: string };
    expect(sp.strategy).toBeUndefined();
  });

  it('★対照: 馬の位置は倍率で変わる（上の検査が空振りでない）', () => {
    const wide = sceneAt(input(1), 50).commands.filter((c) => c.kind === 'sprite');
    const near = sceneAt(input(2), 50).commands.filter((c) => c.kind === 'sprite');
    expect(JSON.stringify(near)).not.toBe(JSON.stringify(wide));
  });

  it('★合図は「出ていない間」も false で出る（見落としと未到達を区別できる）', () => {
    const early = sceneAt(input(1), 5).commands.find((c) => c.kind === 'cue');
    expect(early).toBeDefined();
    expect((early as { active: boolean }).active).toBe(false);
  });

  it('★局面は残り距離で決まる（§13 の 800m / 400m）', () => {
    // ★両側（R-2）。境界のどちら側も見る
    expect(phaseOf(801)).toBe('cruise');
    expect(phaseOf(800)).toBe('spurt');
    expect(phaseOf(401)).toBe('spurt');
    expect(phaseOf(400)).toBe('straight');
  });

  it('★勝負所に入ると合図が立つ', () => {
    // 自馬（gate 5）が残り 800m を切る時刻を探す
    let seen = false;
    for (let sec = 0; sec <= 100; sec += 1) {
      const own = model(18).at(sec).find((h) => h.gate === 5)!;
      const cue = sceneAt(input(1), sec).commands.find((c) => c.kind === 'cue') as { active: boolean };
      const expected = DIST - own.meters <= 800;
      expect(cue.active).toBe(expected);
      if (expected) seen = true;
    }
    // ★一度も勝負所に入らないなら、この検査は何も見ていない
    expect(seen).toBe(true);
  });

  it('★倍率は 1 と 2 だけ（非整数はピクセルアートを壊す・D-058）', () => {
    for (const bad of [0.5, 1.5, 3, 0, -1]) {
      expect(() => sceneAt({ ...input(1), camera: { zoom: bad as Zoom } }, 10)).toThrow();
    }
  });

  it('★画面に入る段数（オーナーの判断と整合する）', () => {
    expect(SPRITE.width).toBe(220);
    expect(SPRITE.height).toBe(140);
    // 720p で 220px なら 3段、440px（2×）なら 1段
    expect(lanesOnScreen(720, 1)).toBe(3);
    expect(lanesOnScreen(720, 2)).toBe(1);
    // ★18頭は入りません。カメラで選ぶ必要がある、という事実を固定します
    expect(lanesOnScreen(720, 1)).toBeLessThan(18);
  });
});

describe('★カメラの実装が、隠せない構造になっている（メタテスト）', () => {
  it('★ゲージと合図の組み立てに、倍率もカメラ中心も使っていない', () => {
    /**
     * ★コメントではなくコードを見ます。
     *   ゲージ・合図を作っている部分に `z` や `cam` が入った瞬間、
     *   **寄りの最中に動くようになります**。
     */
    const src = readFileSync(join(process.cwd(), 'packages', 'render', 'src', 'scene.ts'), 'utf8');
    const code = src.replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), ' ').replace(new RegExp('//.*$', 'gm'), ' ');
    const start = code.indexOf("kind: 'gauge'");
    const end = code.indexOf('return { atSec: sec');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = code.slice(start, end);
    for (const forbidden of [' z ', ' z*', 'z)', 'cam']) {
      expect(block).not.toContain(forbidden);
    }
  });
});

describe('★多層パララックス（アートバイブル §3「奥行きは速度差だけで作る」）', () => {
  const par = (sec: number) =>
    sceneAt(input(1), sec).commands.filter((c) => c.kind === 'parallax') as
      { role: string; offset: number; tileWidth: number }[];

  it('★層ごとに流れる速さが違う（全部同じなら平面になる）', () => {
    const a = par(20);
    const offs = a.map((c) => c.offset);
    // ★重複なし＝全層が違う速さ
    expect(new Set(offs).size).toBe(offs.length);
  });

  it('★手前ほど速い（空 < スタンド < ラチ < 芝）', () => {
    const byRole = new Map(par(40).map((c) => [c.role, c.offset]));
    const sky = byRole.get('sky')!;
    const stand = byRole.get('stand')!;
    const rail = byRole.get('rail')!;
    const turf = byRole.get('turf')!;
    expect(sky).toBeLessThan(stand);
    expect(stand).toBeLessThan(rail);
    expect(rail).toBeLessThan(turf);
  });

  it('★時間が進むと流れる（止まって見えない）', () => {
    const a = par(10);
    const b = par(30);
    for (let i = 0; i < a.length; i += 1) {
      expect(b[i]!.offset).toBeGreaterThan(a[i]!.offset);
    }
  });

  it('★オフセットは 0 以上（負の剰余はレンダラごとに挙動が違う）', () => {
    for (const sec of [0, 1, 50, 99]) {
      for (const c of par(sec)) expect(c.offset).toBeGreaterThanOrEqual(0);
    }
  });

  it('★倍率を変えても背景の層構成は変わらない（層が消えない）', () => {
    expect(par(30).length).toBe(
      (sceneAt(input(2), 30).commands.filter((c) => c.kind === 'parallax')).length,
    );
  });
});

describe('★勝負所で寄る（アートバイブル §9）— C-6 を殺さないこと', () => {
  it('★道中は引き、勝負所と直線は寄る', () => {
    expect(cameraFor(1200, 5).zoom).toBe(1);   // 道中
    expect(cameraFor(800, 5).zoom).toBe(2);    // 勝負所（境界そのもの）
    expect(cameraFor(500, 5).zoom).toBe(2);
    expect(cameraFor(400, 5).zoom).toBe(2);    // 直線（境界そのもの）
    expect(cameraFor(100, 5).zoom).toBe(2);
  });

  it('★境界の両側で切り替わる（R-2）', () => {
    expect(cameraFor(801, 5).zoom).toBe(1);
    expect(cameraFor(800, 5).zoom).toBe(2);
  });

  it('★一度寄ったら、ゴールまで引き戻さない（行ったり来たりさせない）', () => {
    // ★寄ったり引いたりを繰り返すと、プレイヤーはゲージを追えません
    let zooms = [];
    for (let left = 1600; left >= 0; left -= 10) zooms.push(cameraFor(left, 5).zoom);
    // 1 が続いたあと 2 になり、そのあと 1 に戻らないこと
    const firstTwo = zooms.indexOf(2);
    expect(firstTwo).toBeGreaterThan(0);
    expect(zooms.slice(firstTwo).every((z) => z === 2)).toBe(true);
  });

  it('★寄っても、ゲージと合図の位置が1画素も動かない（C-6 の本題）', () => {
    // 同じ時刻で倍率だけ変えて、重なりを比べる
    for (const sec of [10, 40, 70, 95]) {
      const wide = overlays(1, sec) as { at: unknown }[];
      const near = overlays(2, sec) as { at: unknown }[];
      expect(near.length).toBe(wide.length);
      // ★重ね表示は全部**画面の座標系**なので、必ず `at` を持ちます
      for (let i = 0; i < wide.length; i += 1) {
        expect(near[i]!.at).toBeDefined();
        expect(near[i]!.at).toEqual(wide[i]!.at);
      }
    }
  });

  it('★追う対象を渡さなければ、倍率だけ返す（先頭追従のまま）', () => {
    const c = cameraFor(500, undefined);
    expect(c.zoom).toBe(2);
    expect(c.followGate).toBeUndefined();
  });
});

describe('★寄っても自馬が画面から消えない（C-6 の前提）', () => {
  it('★自馬は必ず先頭の段に来る（倍率によらず）', () => {
    for (const z of [1, 2] as Zoom[]) {
      const inp: SceneInput = {
        ...input(z),
        ownGate: 5,
        laneOf: (g) => (g - 1) % 3,
      };
      const cmds = sceneAt(inp, 30).commands.filter((c) => c.kind === 'sprite') as
        { silk?: string; at: { y: number } }[];
      const own = cmds.find((c) => c.silk === 'silk-5');
      expect(own).toBeDefined();
      // ★自馬の y は走路の上端そのもの（段のずれが 0）
      expect(own!.at.y).toBe(380);
    }
  });

  it('★対照: 自馬を指定しなければ、ずらさない（観戦モード）', () => {
    const inp: SceneInput = { ...input(1), ownGate: undefined, laneOf: (g) => (g - 1) % 3 };
    const cmds = sceneAt(inp, 30).commands.filter((c) => c.kind === 'sprite') as
      { silk?: string; at: { y: number } }[];
    const g1 = cmds.find((c) => c.silk === 'silk-1')!;
    const g2 = cmds.find((c) => c.silk === 'silk-2')!;
    expect(g1.at.y).toBe(380);          // 段0
    expect(g2.at.y).toBeGreaterThan(380); // 段1
  });
});

/**
 * ★**展開が画面に出ているか**（REVIEW_P4_QUALITY_VERDICT Q-P4-13）
 *
 * 【なぜこの検査が要るか】
 *   > 面白さは③予想と④当たり外れから出て、③が成立するには②（いま何が起きているか）が要る。
 *   > **いまの画面には②がありません。**
 *
 *   ★実測（`tools/verify-readable.mjs`・1200レース）:
 *     画面に**位置しか無かったとき**、勝負所で3着以内を当てる能力は **AUC 0.431**
 *     ＝**何も見ないより悪い**。逃げ馬が前にいるのは強いからではないためです。
 *
 *   → 余力（`effort`）と変化（`gap`）を出しました。**消したら検査が落ちます。**
 */
describe('★展開が画面に出ている（消したら落ちる）', () => {
  it('★★余力は既定で出さない（意味の無いものを画面に出さない）', () => {
    /**
     * ★オーナーの指摘「**馬の上の黄色の線がある**」。
     *   いま `effort` に入っている値は**余力ではありません**
     *   （`BoundaryTimes` から作れるのは進捗の言い換えで、実測 −0.518 と逆を向く）。
     *   → `emptyAtMeter` が渡るまで（Q-P4-21）、**既定で出しません**。
     */
    expect(sceneAt(input(1), 30).commands.filter((c) => c.kind === 'effort')).toHaveLength(0);
  });

  it('★求められたときは全馬ぶん出る', () => {
    const efforts = sceneAt({ ...input(1), showEffort: true }, 30).commands.filter((c) => c.kind === 'effort');
    expect(efforts.length).toBe(18);
    for (const e of efforts) {
      expect((e as { ratio: number }).ratio).toBeGreaterThanOrEqual(0);
      expect((e as { ratio: number }).ratio).toBeLessThanOrEqual(1);
    }
  });

  it('★余力は馬と同じ倍率で描かれる（寄ったとき馬から離れない）', () => {
    for (const z of [1, 2] as Zoom[]) {
      const e = sceneAt({ ...input(z), showEffort: true }, 30).commands.find((c) => c.kind === 'effort') as { scale: number };
      expect(e.scale).toBe(z);
    }
  });

  it('★変化が出ている — **順位の数字ではなく、差と詰まる速さ**', () => {
    const gap = sceneAt(input(1), 40).commands.find((c) => c.kind === 'gap') as
      { meters: number; closingMps: number; toGo: number } | undefined;
    expect(gap).toBeDefined();
    // ★「3番手」ではなく「何m前に、毎秒何m詰めている」
    expect(typeof gap!.meters).toBe('number');
    expect(typeof gap!.closingMps).toBe('number');
    expect(Number.isFinite(gap!.closingMps)).toBe(true);
    expect(gap!.toGo).toBeGreaterThanOrEqual(0);
  });

  it('★対照: 先頭にいるときは差 0・抜く必要 0（空振りでない）', () => {
    // 馬番1が最も遅い模型なので、自馬を最速（18番）にすると先頭になる
    const inp: SceneInput = { ...input(1), ownGate: 18, laneOf: (g) => (g - 1) % 3 };
    const gap = sceneAt(inp, 50).commands.find((c) => c.kind === 'gap') as
      { meters: number; toGo: number };
    expect(gap.meters).toBe(0);
    expect(gap.toGo).toBe(0);
  });

  it('★「足りる」着順の線は外から渡す（画面が発明しない）', () => {
    const g = (payLine: number) => (sceneAt({ ...input(1), payLine }, 30)
      .commands.find((c) => c.kind === 'gap') as { toGo: number }).toGo;
    // 線が広がれば、抜くべき頭数は減る
    expect(g(1)).toBeGreaterThan(g(3));
    expect(g(3)).toBeGreaterThanOrEqual(g(5));
  });
});

/**
 * ★オーナーが画面を見て挙げた不具合（2026-08-13）— **同じことを繰り返さないための検査**
 */
describe('★見て分かった不具合を固定する', () => {
  it('★★馬が走路の外（空・スタンド）に出ない', () => {
    /**
     * ⚠️ **実際に空を走っていました。**
     *   `lane - ownLane` をそのまま使ったので、自馬が最下段のとき
     *   他の段が**負のずれ**になり、芝の上に飛び出していました。
     */
    for (const own of [1, 2, 3, 5, 12, 18]) {
      for (const z of [1, 2] as Zoom[]) {
        const inp: SceneInput = {
          ...input(z), ownGate: own, laneOf: (g) => (g - 1) % 3, laneCount: 3,
        };
        const sprites = inp.model.at(30).length > 0
          ? sceneAt(inp, 30).commands.filter((c) => c.kind === 'sprite') as { at: { y: number } }[]
          : [];
        expect(sprites.length).toBeGreaterThan(0);
        for (const sp of sprites) {
          // ★走路の上端より上には出ない
          expect(sp.at.y).toBeGreaterThanOrEqual(inp.viewport.trackTop);
        }
      }
    }
  });

  it('★★脚の回転は、送りの速さで変わらない（小走りにならない）', () => {
    /**
     * ⚠️ 距離でコマを決めていたので、道中3倍速で**脚も3倍速**になっていました。
     *   ★画面が何倍速でも、脚は馬の速さで回らなければ馬に見えません。
     */
    const frameAt = (animSec: number) =>
      (sceneAt({ ...input(1), animSec }, 30).commands
        .find((c) => c.kind === 'sprite') as { sprite: { frame: number } }).sprite.frame;
    // 1秒で 2.0〜2.6 歩 ＝ 6コマなら 12〜16 コマぶん進む
    const seen = new Set<number>();
    for (let t = 0; t < 1; t += 1 / 60) seen.add(frameAt(t));
    expect(seen.size).toBe(6);           // ★1秒で全コマを何周かする
    // ★同じ時刻なら同じコマ（決定論）
    expect(frameAt(0.4)).toBe(frameAt(0.4));
  });

  it('★全馬が同じ脚さばきにならない（行進に見えない）', () => {
    const frames = (sceneAt(input(1), 30).commands
      .filter((c) => c.kind === 'sprite') as { sprite: { frame: number } }[])
      .map((c) => c.sprite.frame);
    expect(new Set(frames).size).toBeGreaterThan(1);
  });

  it('★ハロン棒が出る（どこを走っているか分かる）', () => {
    /**
     * ★実測: 55px/m・幅1280 なので**画面に映るのは約23m**。
     *   200m ごとの標識は常には映りません。**レース全体で1本も出ないのは異常**なので、
     *   時間を通して数えます。
     */
    let total = 0;
    const seen = new Set<number>();
    for (let sec = 0; sec <= 99; sec += 0.5) {
      const poles = sceneAt({ ...input(1), poleEveryMeter: 200 }, sec).commands
        .filter((c) => c.kind === 'pole') as { metersLeft: number }[];
      total += poles.length;
      for (const p of poles) {
        expect(p.metersLeft % 200).toBe(0);       // ★残り距離は 200 の倍数
        seen.add(p.metersLeft);
      }
    }
    expect(total).toBeGreaterThan(0);
    // ★1本だけ映って終わり、ではない
    expect(seen.size).toBeGreaterThan(3);
  });

  it('★対照: 間隔を渡さなければ出ない（発明しない）', () => {
    expect(sceneAt(input(1), 30).commands.filter((c) => c.kind === 'pole')).toHaveLength(0);
  });
});

/**
 * ★カメラは馬群を写す（オーナー指摘 ①・1996年の作品との比較）
 *
 *   > ちゃんと競馬レースのカメラワークになっている。
 *   > 開発サーバーは**1匹の主役をずっと中央に置いている**
 */
describe('★カメラが馬群を写す（1頭に固定しない）', () => {
  it('★自馬は画面の同じ場所に貼り付かない', () => {
    /**
     * ⚠️ 以前は `x = 0.35W + (m - cam)·px` で `cam = 自馬の位置` だったので、
     *    **自馬の x は常に 0.35W** でした。他馬だけが出入りして見えます。
     */
    const xs = new Set<number>();
    for (let sec = 10; sec <= 90; sec += 10) {
      const own = sceneAt(input(1), sec).commands
        .find((c) => c.kind === 'sprite' && c.silk === 'silk-5') as { at: { x: number } } | undefined;
      expect(own).toBeDefined();
      xs.add(own!.at.x);
    }
    expect(xs.size).toBeGreaterThan(1);
  });

  it('★★それでも自馬は画面から出ない（C-6 の前提）', () => {
    for (const own of [1, 5, 12, 18]) {
      for (const z of [1, 2] as Zoom[]) {
        for (let sec = 0; sec <= 99; sec += 3) {
          const sp = sceneAt({ ...input(z), ownGate: own }, sec).commands
            .find((c) => c.kind === 'sprite' && c.silk === `silk-${own}`) as { at: { x: number } };
          expect(sp.at.x).toBeGreaterThan(-SPRITE.width * z);
          expect(sp.at.x).toBeLessThan(1280);
        }
      }
    }
  });

  it('★手前の馬が奥の馬を隠す（馬群に見える順序）', () => {
    const cmds = sceneAt({ ...input(1), laneOf: (g) => (g - 1) % 6, laneCount: 6 }, 30)
      .commands.filter((c) => c.kind === 'sprite') as { at: { y: number } }[];
    // ★後に描かれるものほど手前＝y が大きい（単調非減少）
    for (let i = 1; i < cmds.length; i += 1) {
      expect(cmds[i]!.at.y).toBeGreaterThanOrEqual(cmds[i - 1]!.at.y);
    }
  });

  it('★手前のラチは、馬より後に描かれる（馬の前に来る）', () => {
    const cmds = sceneAt({ ...input(1), foregroundRail: true }, 30).commands;
    const lastSprite = cmds.map((c) => c.kind).lastIndexOf('sprite');
    const rails = cmds
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.kind === 'parallax' && x.c.role === 'rail');
    expect(rails.length).toBe(2);                      // 奥と手前
    expect(rails[1]!.i).toBeGreaterThan(lastSprite);   // ★手前は馬より後
  });

  it('★対照: 求めなければ手前のラチは出ない', () => {
    const rails = sceneAt(input(1), 30).commands
      .filter((c) => c.kind === 'parallax' && c.role === 'rail');
    expect(rails).toHaveLength(1);
  });
});

/**
 * ★影（馬が芝に貼った絵に見えないこと）
 */
describe('★影', () => {
  it('★全馬に影が出て、馬より先に描かれる', () => {
    const cmds = sceneAt(input(1), 30).commands;
    const shadows = cmds.filter((c) => c.kind === 'shadow');
    expect(shadows.length).toBe(18);
    // ★各馬について、影がその馬より前にある
    const firstShadow = cmds.findIndex((c) => c.kind === 'shadow');
    const firstSprite = cmds.findIndex((c) => c.kind === 'sprite');
    expect(firstShadow).toBeLessThan(firstSprite);
  });

  it('★宙に浮く局面では影が薄く小さい（跳んでいることの表現）', () => {
    const seen = new Set<number>();
    for (let t = 0; t < 1; t += 1 / 60) {
      const sh = sceneAt({ ...input(1), animSec: t }, 30).commands
        .find((c) => c.kind === 'shadow') as { strength: number };
      seen.add(sh.strength);
    }
    // ★2種類（接地・宙）が出る
    expect(seen.size).toBe(2);
    expect(Math.min(...seen)).toBeLessThan(Math.max(...seen));
  });

  it('★影は馬と同じ倍率（寄っても足元から離れない）', () => {
    for (const z of [1, 2] as Zoom[]) {
      const sh = sceneAt(input(z), 30).commands.find((c) => c.kind === 'shadow') as { scale: number };
      expect(sh.scale).toBe(z);
    }
  });
});

/**
 * ★レースの終わり（決勝線・着順）と実況
 */
describe('★レースの終わりと実況', () => {
  it('★決勝線が、ゴールに近づくと画面に出る', () => {
    let seen = false;
    for (let sec = 0; sec <= 99; sec += 1) {
      const fl = sceneAt(input(1), sec).commands.find((c) => c.kind === 'finishLine');
      if (fl !== undefined) { seen = true; break; }
    }
    // ★一度も出ないなら「どこで終わるか」が分かりません
    expect(seen).toBe(true);
  });

  it('★★着順はレース中に出ない（結果を先に見せない）', () => {
    // 渡さなければ出ない
    expect(sceneAt(input(1), 50).commands.filter((c) => c.kind === 'result')).toHaveLength(0);
    // 渡せば出る（空振りでない）
    const withResult = sceneAt({
      ...input(1),
      result: [{ place: 1, gate: 5, margin: '' }, { place: 2, gate: 3, margin: 'クビ' }],
    }, 99).commands.find((c) => c.kind === 'result') as { entries: readonly unknown[] };
    expect(withResult.entries).toHaveLength(2);
  });

  it('★着順は渡された順のまま（画面が並べ替えない）', () => {
    const given = [{ place: 1, gate: 9, margin: '' }, { place: 2, gate: 2, margin: '1/2馬身' }];
    const r = sceneAt({ ...input(1), result: given }, 99).commands
      .find((c) => c.kind === 'result') as { entries: readonly { gate: number }[] };
    expect(r.entries.map((e) => e.gate)).toEqual([9, 2]);
  });

  it('★実況は「変化」を言う（順位の数字を持たない）', () => {
    const kinds = new Set<string>();
    for (let sec = 0; sec <= 99; sec += 1) {
      const c = sceneAt(input(1), sec).commands.find((x) => x.kind === 'callout') as
        { event: { kind: string } } | undefined;
      if (c !== undefined) kinds.add(c.event.kind);
    }
    expect(kinds.size).toBeGreaterThan(0);
    // ★「順位」という概念を持たないこと
    for (const k of kinds) expect(['start', 'leadTaken', 'closing', 'fading', 'straight', 'finish']).toContain(k);
  });

  it('★対照: 実況を切れば出ない', () => {
    for (let sec = 0; sec <= 99; sec += 10) {
      expect(sceneAt({ ...input(1), callouts: false }, sec).commands
        .filter((c) => c.kind === 'callout')).toHaveLength(0);
    }
  });
});
