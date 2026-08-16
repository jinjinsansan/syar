# 生成ジョブ — `horse-gallop-near`（馬の幅 300px・駆歩8コマ）

★**一言**: `near` の駆歩8コマを、**馬の幅 300px** で作ってください。

## 参照

- 画風の基準: `design/art/assets/horse-gallop-sheet.png`
  ★**この絵の画風・毛艶・筋肉の陰影・手綱の描き込み量を、そのまま維持**してください
- コマの意味: 下の表（第2便で 6→8 コマに増やしています）

## ⚠️ なぜ縮小ではなく作り直すのか

既存の生アートは 1コマ 362px です。そこから 300px へ縮めると **0.83倍**になり、
★**画素の格子が合わず輪郭が濁ります**（実際に濁りました）。
→ ★**300px で描き起こしてください。** こちらでは整数倍でしか拡大しません。

## コマの並び（8コマ・左から）

| コマ | 局面 | 脚先の広がり | 備考 |
|---|---|---|---|
| 0 | 伸展（脚が最も開く） | 最大 | |
| 1 | 着地〜引き寄せ | | |
| 2 | 収縮 | | |
| **3** | **最収縮** | ★**最小** | 四肢が腹の下に集まる。首を引き上げる |
| 4 | 蹴り出し | | |
| 5 | 収縮 | | |
| **6** | **宙に浮く** | 中 | ★**四肢すべてが地を離れる** |
| 7 | 伸展へ戻る | 大 | |

★**コマ3 と コマ6 が要点**です。駆歩は1完歩に「宙に浮く局面」が1回あり、
ここが無いと**走りに見えません**。

## プロンプト

```
A horizontal sprite sheet of ONE galloping racehorse with jockey, 8 frames of a
single complete gallop cycle, side view, facing right.

Each frame is 304 x 234 pixels; the horse occupies about 300 pixels of width.
The sheet is 2432 x 234 pixels (8 frames laid left to right, no gaps).

CRITICAL — all 8 frames MUST share the same ground contact point:
the point where the leading hoof meets the ground sits at the SAME position
inside every cell (x = 152, y = 232 measured from that cell's top-left).
A horse that shifts up or down between frames will visibly bounce.

The 8 frames, in order:
 0  full extension - fore and hind legs stretched furthest apart
 1  landing, legs beginning to gather
 2  collected - legs folding under the body
 3  MOST COLLECTED - all four legs gathered beneath the belly, hind legs swung
    forward under the barrel, forelegs folded tight at the knee, only one
    forehoof touching the ground; neck RAISED, back rounded, nose-to-hip shortest
 4  push-off from the hind legs
 5  collected again, opening up
 6  SUSPENSION - all four hooves clear of the ground, body floating, neck
    stretched forward
 7  returning toward full extension

Style: pixel art, hard-edged pixels with NO anti-aliasing on the silhouette,
transparent background, rich muscle shading and coat sheen inside the body
(thousands of shades allowed - DO NOT posterize the interior), visible bridle
and double reins, black mane and tail streaming backward.

The jockey stays deeply crouched in the irons throughout, weight forward over
the withers, hands low on the neck holding both reins.
The jockey's silks (jacket, cap, sleeves) MUST be BLUE:
hue 200-260 degrees, saturation 0.35 or higher. Breeches white, boots black.
A plain saddle cloth sits under the saddle; leave it BLANK - no number, no logo.

Do NOT depict any real racehorse, owner, stable, racecourse, or any real silk
design. Invent the silks. No text, no logos, no watermarks, no background,
no ground shadow baked into the sprite.
```

## ★受け入れ条件（こちらで機械的に測ります）

```
シート寸法          2432 x 234（1コマ 304 x 234・8コマ）
馬の幅（最大コマ）   300 ± 12 px
★接地点            全8コマで一致（許容 ±1px）
                   ★ここがずれると、走らせたときに馬が跳ねます
コマ3 の脚先の広がり  ★全コマ中で最小
コマ6 の浮き        ★接地線から 8px 以上（四肢すべてが地を離れる）
背景               完全に透明（半透明の縁を残さない）
勝負服             hue 200-260 / 彩度 0.35 以上・重心が全コマで一致
ゼッケン           無地（数字・ロゴなし。★数字はこちらで描きます）
```

## 次にお願いするもの（今回は含みません）

1. 騎手の別コマ 2姿勢（`drive` / `celebrate`）— **near サイズのみ**
2. `far`（馬の幅 **120px**）を **4向き**（0° / 45° / 90° / −45°）
   ★真後ろ（180°）は要りません
3. 発走ゲート / 決勝線・ハロン棒・ラチ・芝目
