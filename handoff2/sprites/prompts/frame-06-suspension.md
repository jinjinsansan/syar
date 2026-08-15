# 生成ジョブ — コマ6「宙に浮く」

★**既存の `horse-gallop-sheet.png` のコマ4 と コマ5 の間に入る1枚**です。

## 参照
- スタイルの基準: `design/art/assets/horse-gallop-sheet.png` の**コマ0**（最も伸びているコマ）
- ★**画風・毛艶・筋肉の陰影・手綱の描き込み量を、そのまま維持してください**

## プロンプト（image-cockpit 用）

```
A single side-view pixel-art sprite of a galloping racehorse with jockey, at the
SUSPENSION phase of the gallop: ALL FOUR HOOVES ARE OFF THE GROUND. The horse is
airborne mid-stride, body lifted clear of the ground line, hind legs still
trailing back from the push-off, forelegs beginning to reach forward but not yet
extended. The neck stretches forward and slightly down. The whole animal sits
noticeably HIGHER in the frame than in any grounded frame.
The jockey stays deeply crouched, hips high out of the saddle, weight over the
withers, hands low, reins taut.

Style: 220x140 pixel art, side view, facing right, transparent background,
hard-edged pixels with NO anti-aliasing on the silhouette, rich muscle shading
and coat sheen (thousands of shades allowed inside the body — DO NOT posterize),
visible bridle and double reins, black mane and tail streaming backward.

The jockey's silks (jacket, cap, sleeves) MUST be BLUE:
hue 200-260 degrees, saturation 0.35 or higher. Breeches white, boots black.
A plain saddle cloth sits under the saddle; leave it BLANK (no number, no logo).

Do NOT depict any real racehorse, owner, stable, racecourse, or any real
silk design. Invent the silks. No text, no logos, no watermarks.
```

## ★受け入れ条件（数値）

```
脚先の広がり（下 28% の帯）  200 ± 20 px
胴〜鼻（尾を除く）           268 ± 6 px
★接地している脚              0本 — 最下端が y ≤ 112（接地線 136 から 24px 以上浮く）
勝負服（hue 200-260 / 彩度 0.35+）の重心   ★(133, 20) に揃える
背景                        完全透明
縁の緑                      0 画素
```

★**「浮いている」ことは下端の y だけで判定できます。** 136 − 24 = 112 より上にあれば合格です。
