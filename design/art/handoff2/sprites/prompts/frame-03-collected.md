# 生成ジョブ — コマ3「最収縮」

★**既存の `horse-gallop-sheet.png` のコマ2 と コマ3 の間に入る1枚**です。

## 参照
- スタイルの基準: `design/art/assets/horse-gallop-sheet.png` の**コマ2**（最も畳まれているコマ）
- ★**この絵の画風・毛艶・筋肉の陰影・手綱の描き込み量を、そのまま維持してください**

## プロンプト（image-cockpit 用）

```
A single side-view pixel-art sprite of a galloping racehorse with jockey, at the
MOST COLLECTED phase of the gallop cycle: all four legs gathered beneath the belly,
hind legs swung forward under the barrel, forelegs folded tight at the knee,
only one forehoof touching the ground. The neck is RAISED and shortened compared
to the extended phase; the head is lifted about 10 pixels higher. The back is
rounded (flexed), so nose-to-hip is SHORTER than in any other frame.
The jockey stays deeply crouched in the irons, weight forward over the withers,
hips dropped slightly, hands low on the neck holding both reins.

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
脚先の広がり（下 28% の帯）  130 ± 15 px   ← 既存の最小 165px より狭いこと
胴〜鼻（尾を除く）           246 ± 6 px    ← 既存の最小 248px より短いこと
接地している脚               1本（下端 y = 136）
勝負服（hue 200-260 / 彩度 0.35+）の重心   ★(133, 20) に揃える
背景                        完全透明（アルファ 0 か 255 のみ・半透明の縁を残さない）
縁の緑                      0 画素
```

★**重心が (133, 20) に揃っていなければ差し戻してください。** シートに載せた瞬間に胴が跳ねます。
