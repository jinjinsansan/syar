/**
 * ★カメラ（Layer C・PR2）
 *
 * 【★この検査が守るもの】
 *   PR2 の完了条件は「**カメラ設定を変えると見え方が変わる／着順は不変**」。
 *   ★後者が本体です。カメラは**見え方だけ**を変えます。
 */
import { describe, it, expect } from 'vitest';
import {
  ovalCourse, posOf, courseToScreen, worldToScreen, cutsFor, cutAt, blendCamera, focusOf,
  HORSE_LENGTH_M, segmentAt, type CameraPose, type CameraState,
} from '../src/index.js';

const course = ovalCourse(1600);
const VP = { width: 1280, height: 720 };
const base: CameraState = {
  targetMode: 'PACK_CENTROID', zoom: 16, angle: 'SIDE', tilt: 0.25,
  xCompression: 1, followLerp: 0.15, spriteScale: 1,
};
const poseAt = (s: number, st: CameraState = base): CameraPose => {
  const p = posOf(course, s, course.widthM / 2);
  return { state: st, centre: { x: p.x, y: p.y }, heading: p.heading };
};

describe('★ワールド → スクリーン', () => {
  it('★注視点は必ず画面の中央', () => {
    for (const s of [100, 500, 900, 1300, 1600]) {
      const pose = poseAt(s);
      const scr = worldToScreen(pose, VP, pose.centre);
      expect(scr.x).toBeCloseTo(VP.width / 2, 6);
      expect(scr.y).toBeCloseTo(VP.height / 2, 6);
    }
  });

  it('★★進行方向が画面の右向きになる（コーナーでも）', () => {
    /**
     * ⚠️ これが無いと、コーナーで**馬群が斜めや縦に流れます**。
     *   中継はどの局面でも走路が横に流れて見えます。
     */
    for (const s of [50, 300, 700, 1000, 1400]) {
      const pose = poseAt(s);
      const ahead = courseToScreen(course, pose, VP, s + 20, course.widthM / 2);
      expect(ahead.x).toBeGreaterThan(VP.width / 2 + 10);
      // ★縦のずれは小さい（走路が横に流れる）
      expect(Math.abs(ahead.y - VP.height / 2)).toBeLessThan(40);
    }
  });

  it('★内と外が縦に分かれる（tilt が効いている）', () => {
    const pose = poseAt(700);
    const inner = courseToScreen(course, pose, VP, 700, 2);
    const outer = courseToScreen(course, pose, VP, 700, 18);
    expect(Math.abs(outer.y - inner.y)).toBeGreaterThan(10);
  });

  it('★tilt=0 なら縦が潰れる／tilt=1 なら真俯瞰', () => {
    const flat = poseAt(700, { ...base, tilt: 0 });
    const over = poseAt(700, { ...base, tilt: 1 });
    const a = courseToScreen(course, flat, VP, 700, 18);
    const b = courseToScreen(course, over, VP, 700, 18);
    expect(Math.abs(a.y - VP.height / 2)).toBeLessThan(1e-6);
    expect(Math.abs(b.y - VP.height / 2)).toBeGreaterThan(50);
  });

  it('★望遠圧縮は横だけを詰める', () => {
    const wide = poseAt(700, { ...base, xCompression: 1 });
    const tele = poseAt(700, { ...base, xCompression: 0.5 });
    const a = courseToScreen(course, wide, VP, 760, 10);
    const b = courseToScreen(course, tele, VP, 760, 10);
    expect(Math.abs(b.x - VP.width / 2)).toBeLessThan(Math.abs(a.x - VP.width / 2));
  });

  it('★純粋関数（同じ入力から同じ出力）', () => {
    const pose = poseAt(500);
    expect(JSON.stringify(courseToScreen(course, pose, VP, 520, 7)))
      .toBe(JSON.stringify(courseToScreen(course, pose, VP, 520, 7)));
  });
});

describe('★カット表', () => {
  const cuts = cutsFor(course);

  it('★残り距離が減るほど、後ろのカットになる', () => {
    const seen: string[] = [];
    for (let left = 1600; left >= 0; left -= 50) {
      const { cut } = cutAt(cuts, left);
      if (seen[seen.length - 1] !== cut.label) seen.push(cut.label);
    }
    // ★逆戻りしない
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen[0]).toBe('発走');
    expect(seen[seen.length - 1]).toBe('追い比べ');
  });

  it('★直線に入ったら「直線」のカットになる', () => {
    expect(cutAt(cuts, 401).cut.label).not.toBe('直線');
    expect(cutAt(cuts, 400).cut.label).toBe('直線');
  });

  it('★★スプライトの拡大率は補間しない（整数のみ・D-058）', () => {
    /**
     * ⚠️ 補間すると 1.5 倍になり、**ピクセルアートが壊れます**。
     *   `zoom`（走路の縮尺）は連続でよいが、**スプライトは整数**。
     */
    const a: CameraState = { ...cuts[0]!.state, spriteScale: 1 };
    const b: CameraState = { ...cuts[0]!.state, spriteScale: 2 };
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const m = blendCamera(a, b, t);
      expect([1, 2]).toContain(m.spriteScale);
      expect(Number.isInteger(m.spriteScale)).toBe(true);
    }
  });

  it('★zoom と tilt は連続に補間される', () => {
    const a = cuts[0]!.state;
    const b = cuts[cuts.length - 1]!.state;
    const mid = blendCamera(a, b, 0.5);
    expect(mid.zoom).toBeCloseTo((a.zoom + b.zoom) / 2, 6);
    expect(mid.tilt).toBeCloseTo((a.tilt + b.tilt) / 2, 6);
  });
});

describe('★注視点', () => {
  const horses = [
    { gate: 1, s: 900 }, { gate: 2, s: 898 }, { gate: 3, s: 880 },
    { gate: 4, s: 830 }, { gate: 5, s: 700 },
  ];

  it('★先頭・自馬・ゲート', () => {
    expect(focusOf('LEADER', horses, 3, HORSE_LENGTH_M)).toBe(900);
    expect(focusOf('OWN_HORSE', horses, 4, HORSE_LENGTH_M)).toBe(830);
    expect(focusOf('GATE', horses, 1, HORSE_LENGTH_M)).toBe(700);
  });

  it('★叩き合いは「先頭から1馬身以内」の平均', () => {
    // 900 と 898 が該当（1馬身 = 2.4m）
    expect(focusOf('CONTENDERS', horses, 1, HORSE_LENGTH_M)).toBeCloseTo(899, 6);
  });

  it('★★該当が無ければ先頭に落とす（画面が空にならない）', () => {
    const strung = [{ gate: 1, s: 900 }, { gate: 2, s: 500 }];
    expect(focusOf('CONTENDERS', strung, 1, HORSE_LENGTH_M)).toBe(900);
    expect(focusOf('OWN_HORSE', strung, 99, HORSE_LENGTH_M)).toBe(900);
  });

  it('★馬群の重心は、離れすぎた馬を数えない', () => {
    const withTail = [...horses, { gate: 9, s: 100 }];
    // ★100m 後方の馬は「馬群」ではない
    expect(focusOf('PACK_CENTROID', withTail, 1, HORSE_LENGTH_M))
      .toBe(focusOf('PACK_CENTROID', horses, 1, HORSE_LENGTH_M));
  });

  it('★馬がいなければ落ちない', () => {
    expect(focusOf('LEADER', [], undefined, HORSE_LENGTH_M)).toBe(0);
  });
});

describe('★★カメラは着順に触れない（PR2 の完了条件）', () => {
  it('★カメラをどう変えても、コース幾何の出力は1ビットも変わらない', () => {
    /**
     * ★カメラは `posOf` の**結果を受け取るだけ**で、引数に入りません。
     *   型として**触れないようになっています**（拒否ではなく不在）。
     */
    const before = JSON.stringify(posOf(course, 777, 7));
    for (const st of cutsFor(course).map((c) => c.state)) {
      const p = posOf(course, 777, 7);
      worldToScreen({ state: st, centre: { x: 0, y: 0 }, heading: 0 }, VP, p);
      expect(JSON.stringify(posOf(course, 777, 7))).toBe(before);
    }
  });
});

describe('★★カットの切り替え位置はコースから読む（書き写さない）', () => {
  it('★カットの名前と、実際にいる区間が一致する', () => {
    /**
     * ⚠️ 最初は切り替え位置を手で書いていて、**名前と区間がずれました**
     *    （「向正面」のカットで実際は 3角、「3角」で実際は 4角）。
     *    ★俯瞰図のラベルでも同じ間違いをしたので、**2度目**です。
     */
    for (const d of [1200, 1600, 2000, 2400]) {
      const c = ovalCourse(d);
      for (const cut of cutsFor(c)) {
        if (!['向正面', '3角', '4角', '直線'].includes(cut.label)) continue;
        // ★そのカットに入った直後の地点
        const s = d - cut.fromMetersLeft + 1;
        expect(segmentAt(c, s).label).toBe(cut.label);
      }
    }
  });

  it('★短い距離では、通らない区間のカットが出ない', () => {
    const short = ovalCourse(1000);
    const labels = cutsFor(short).map((x) => x.label);
    const segs = new Set(short.segments.map((x) => x.label));
    for (const l of labels) {
      if (['発走', '隊列形成', '追い比べ'].includes(l)) continue;
      expect(segs.has(l)).toBe(true);
    }
  });

  it('★残り距離は必ず減る順（逆戻りしない）', () => {
    for (const d of [1000, 1200, 1600, 2400, 3000]) {
      const cs = cutsFor(ovalCourse(d));
      for (let i = 1; i < cs.length; i += 1) {
        expect(cs[i]!.fromMetersLeft).toBeLessThan(cs[i - 1]!.fromMetersLeft);
      }
    }
  });
});
