/**
 * ★**(b′)（注視点を走線に沿った長さで置く）の既定と、戻せること**（正典 D-089・D-085）
 *
 * 【★この検査が生まれた理由】
 *   ★正典 **D-085**（この案件自身の失敗から）:
 *     > ★**既定を変えるときは「戻せる口」を同時に置き、戻せること自体を検査で固定する** —
 *     > `PREVIOUS_RACE_SCRIPT = 'v5'` が無いと `?cinematography=v5` が**黙って既定へ落ちる**（R-27）
 *
 *   ⚠️ ★裁定 `REVIEW_P4_SEAM_BPRIME_VERDICT_20260829.md` §3:
 *     > ★(b′) は**カメラの向け先を全カットで変えます**。
 *     > ★オーナーが実画面で「前のほうが良かった」と感じたとき、
 *     > ★**その場で比べられなければ、判断そのものができません。**
 *
 * 【★「口を置いた」だけでは足りません】
 *   ★裁定 §3 の求めるもの 2:「★**戻せること自体を検査で固定する**（『口を置いた』だけでは前回と同じ穴）」。
 *   → ★この検査は **URL の解釈**だけでなく、★**実際にカメラが変わること**まで見ます。
 */
import { describe, it, expect } from 'vitest';
import {
  LANE_ALIGNED_FOCUS_DEFAULT, laneAlignedFocusFromSearch,
} from '../src/broadcast-v2.js';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

/**
 * ★走路の折れ目（s=600）の手前。★**コーナーの中**なので、走線に沿った置き方と
 *   中心線の置き方で**カメラの向け先が変わる**場所です。
 *   ⚠️ ★直線で比べると差が 0 なので、★**この検査は何も守らなくなります**（R-3 / R-21）。
 */
const HORSES = Array.from({ length: 12 }, (_, i) => ({
  gate: i + 1, s: 660 - i * 3, w: 2.2 + i * 0.6, staminaRatio: 1,
}));

const sceneWith = (laneAlignedFocus: boolean | undefined) =>
  resolveBroadcastV2Scene(course, HORSES, VIEWPORT, false, {
    forceShotId: 'side-drive',
    ...(laneAlignedFocus === undefined ? {} : { laneAlignedFocus }),
  });

describe('★(b′) の既定と戻し口', () => {
  it('★既定は `true`（2026-08-29・D-089 で採用）', () => {
    expect(LANE_ALIGNED_FOCUS_DEFAULT).toBe(true);
  });

  describe('★URL の解釈', () => {
    it('★`?laneFocus=off` で切れる', () => {
      expect(laneAlignedFocusFromSearch('?laneFocus=off')).toBe(false);
      expect(laneAlignedFocusFromSearch('?seed=42&laneFocus=off')).toBe(false);
    });

    it('★`?laneFocus=on` で明示できる', () => {
      expect(laneAlignedFocusFromSearch('?laneFocus=on')).toBe(true);
    });

    /**
     * ⚠️ ★**R-27: 縮退は狭い側・安全な側へ。**
     *   ★綴りを間違えたときは**既定のまま**にします。
     *   ★「切ったつもりで切れていない」より、★**「切れなかった」ほうが画で気づけます。**
     */
    it('★省略・綴り違い・空はすべて既定へ落ちる（R-27）', () => {
      for (const s of ['', '?', '?seed=42', '?laneFocus=', '?laneFocus=OFF', '?laneFocus=false', '?lanefocus=off']) {
        expect(laneAlignedFocusFromSearch(s), `search=${JSON.stringify(s)}`)
          .toBe(LANE_ALIGNED_FOCUS_DEFAULT);
      }
    });
  });

  describe('★「口を置いた」だけにしない — 実際に画が変わること', () => {
    /**
     * ★**これが D-085 の後半（戻せること自体を固定する）です。**
     *   ⚠️ ★URL の解釈だけを検査すると、★**呼び出し側が渡し忘れていても緑になります**
     *      （R-31 が言う「渡さなければ画面と違う側に落ちる」形）。
     */
    it('★切ると、カメラの向け先が実際に変わる（コーナーで）', () => {
      const on = sceneWith(true);
      const off = sceneWith(false);
      const d = Math.hypot(on.camera.target.x - off.camera.target.x,
        on.camera.target.y - off.camera.target.y);
      expect(d, '★ON と OFF でカメラの向け先が同じ＝戻し口が効いていない').toBeGreaterThan(0.01);
    });

    it('★渡さなければ既定（`true`）と同じ画になる', () => {
      const omitted = sceneWith(undefined);
      const explicit = sceneWith(LANE_ALIGNED_FOCUS_DEFAULT);
      expect(omitted.camera.target.x).toBeCloseTo(explicit.camera.target.x, 9);
      expect(omitted.camera.target.y).toBeCloseTo(explicit.camera.target.y, 9);
    });

    /**
     * ★**`focusS` は動かさない**（D-089 の条文）。
     *   ★あれは「何 m 地点を見ているか」という意味の値で、可視判定などが乗っています。
     *   ★動かすのは `cameraAt()` に渡す値だけです。
     */
    it('★`focusS` と `focusW` は ON/OFF で変わらない（動かすのはカメラだけ）', () => {
      const on = sceneWith(true);
      const off = sceneWith(false);
      expect(on.focusS).toBe(off.focusS);
      expect(on.focusW).toBe(off.focusW);
      expect(on.shot.id).toBe(off.shot.id);
    });

    /**
     * ★**直線では差が出ないこと**（幾何どおり）。
     *   ★ここで差が出るなら、★走線の長さの計算が直線でも効いていることになり、実装が誤りです。
     */
    it('★直線では ON/OFF で差が出ない（幾何どおり）', () => {
      const straight = Array.from({ length: 12 }, (_, i) => ({
        gate: i + 1, s: 1400 - i * 3, w: 2.2 + i * 0.6, staminaRatio: 1,
      }));
      const at = (laneAlignedFocus: boolean) =>
        resolveBroadcastV2Scene(course, straight, VIEWPORT, false,
          { forceShotId: 'straight-contest', laneAlignedFocus });
      expect(at(true).camera.target.x).toBeCloseTo(at(false).camera.target.x, 6);
      expect(at(true).camera.target.y).toBeCloseTo(at(false).camera.target.y, 6);
    });
  });
});
