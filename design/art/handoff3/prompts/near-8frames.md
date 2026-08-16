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
| **3** | **最収縮** | ★**最小** | 四肢が腹の下に集まる。首を引き上げる。★接地は**後肢1本** |
| 4 | 蹴り出し | | |
| 5 | 収縮 | | |
| **6** | **宙に浮く** | 中 | ★**四肢すべてが地を離れる** |
| 7 | 伸展へ戻る | 大 | |

★**コマ3 と コマ6 が要点**です。駆歩は1完歩に「宙に浮く局面」が1回あり、
ここが無いと**走りに見えません**。

⚠️ ★**コマ3 の接地は「後肢1本」です。**
   最収縮は空中局面とほぼ重なるので、前肢を接地させると不自然になります。
   収縮期は**後肢主導**なので、残すなら後肢です。
   （第2便の契約では「前肢1本」と書いていました。★こちらの誤りです。契約も直します）

## セルと寸法の決め方

★**セルはきつく縛りません。** こちらは**生アートから焼き直す**ので、
余裕を持って描いていただき、**セルはこちらで測って決めます**。

```
セル        360 x 260（★余白を多めに取ってあります）
接地線      y = 252（セル上端から。全コマ共通）
重心 x      x = 180（セル中央。全コマ共通）
★馬の幅     300 ± 12px ＝ **外接矩形**（尾の先端 〜 鼻先。透明でない範囲の左端〜右端）
```

⚠️ ★**「馬の幅」は外接矩形です。胴の長さではありません。**
   尾とたてがみは後方に流れるので、胴で 300px にすると**尾がセルからはみ出します**。
   ★前回、そこで**尾が隣のセルに写り込み、走路に尾が1本浮いて見えました**。

★**尾を切らないでください。** 収まらなければ、はみ出したまま出していただければ、
こちらでセルを取り直します。**切られると復元できません。**

## プロンプト

```
A horizontal sprite sheet of ONE galloping racehorse with jockey, 8 frames of a
single complete gallop cycle, side view, facing right.

Each frame is 360 x 260 pixels; the sheet is 2880 x 260 pixels
(8 frames laid left to right, no gaps).
The horse's full bounding box - from the tip of the streaming tail to the tip of
the nose - is about 300 pixels wide. That is the OUTER bounding box, not the
body length; leave the tail and mane room and DO NOT crop them.

CRITICAL - all 8 frames share the same GROUND LINE at y = 252 and the same
body-center x = 180, measured from each cell's top-left corner.
In frames 0-5 and 7 the supporting hoof rests on that line; in frame 6 all four
hooves are 8 or more pixels above it.
A horse that drifts up, down or sideways between frames will visibly bounce.

The 8 frames, in order:
 0  full extension - fore and hind legs stretched furthest apart
 1  landing, legs beginning to gather
 2  collected - legs folding under the body
 3  MOST COLLECTED - all four legs gathered beneath the belly, hind legs swung
    forward under the barrel, forelegs folded tight at the knee, ONE HIND HOOF
    still on the ground (the collected phase is hind-leg driven, so do NOT put a
    forehoof down); neck RAISED, back rounded, nose-to-hip shortest
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
シート寸法            2880 x 260（1コマ 360 x 260・8コマ）
★馬の幅（外接矩形）   300 ± 12 px（尾の先端 〜 鼻先）
★接地線              全8コマで y = 252（許容 ±1px）
                     ★コマ6 は接地しないので、**接地線**で揃えます（接地点ではありません）
★重心 x              全8コマで x = 180（許容 ±2px）
                     ★ここがずれると、走らせたときに馬が横に揺れます
コマ3 の脚先の広がり   ★全コマ中で最小 ／ 接地は**後肢1本**
コマ6 の浮き          ★接地線から 8px 以上（四肢すべてが地を離れる）
背景                 完全に透明（半透明の縁を残さない）
勝負服               hue 200-260 / 彩度 0.35 以上・重心が全コマで一致
ゼッケン             無地（数字・ロゴなし。★数字はこちらで描きます）
★尾                 切らない（はみ出したままで結構です）
```

## 次にお願いするもの（今回は含みません）

1. 騎手の別コマ 2姿勢（`drive` / `celebrate`）— **near サイズのみ**
2. `far`（馬の幅 **120px**）を **4向き**（0° / 45° / 90° / −45°）
   ★真後ろ（180°）は要りません
3. 発走ゲート / 決勝線・ハロン棒・ラチ・芝目
