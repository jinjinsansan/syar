# ★`tools/measure-gallop.mjs` の ② を直すパッチ

**結論：② は伸縮を測っていません。尾の長さを測っています。**

## 1. 何が起きているか

`bodyLen = x1 - x0 + 1`（外接矩形の幅）は、**尾の先から鼻先まで**です。
駆歩の尾は**常に後方へ流れた状態**なので、四肢が伸びても縮んでも左端が動きません。

`design/art/assets/horse-gallop-sheet.png` を部位別に測り直した結果:

| 測り方 | コマ0 | 1 | 2 | 3 | 4 | 5 | 変化 |
|---|---|---|---|---|---|---|---|
| 外形 bbox（＝現行の ②） | 355 | 350 | 341 | 347 | 335 | 351 | **5.6%** ❌ |
| 胴〜鼻（暗い尾を除く） | 270 | 267 | 260 | 270 | 248 | 273 | 9.2% |
| ★**脚先の広がり**（下 28%） | 355 | 329 | **171** | 260 | **165** | 344 | ★**53.5%** ✅ |
| 体高 | 222 | 261 | 262 | 263 | 252 | 255 | 15.6% ✅ |

★**この絵は伸縮しています。** コマ0 で脚が 355px に開き、コマ4 で 165px に畳まれます。
外形が動かないのは尾のせいです。

⚠️ **この判定を根拠に絵を作り直すと、§6-1 の失敗（筋肉の陰影と手綱を失った件）を繰り返します。**

## 2. パッチ

`measure()` に脚の広がりを足します。

```js
  /**
   * ★**脚先の広がり**（下 28% の帯にある画素の左右の広がり）。
   *   ⚠️ 外接矩形の幅を使ってはいけません。**尾が左端を固定してしまいます。**
   *      駆歩の尾は常に後方へ流れているので、四肢が畳まれても bbox は縮みません。
   *   ★伸展と収縮は**脚の広がり**に出ます。そこを測ります。
   */
  const legTop = y0 + Math.round((y1 - y0) * 0.72);
  let lx0 = W, lx1 = -1;
  for (let y = legTop; y <= y1; y += 1) for (let x = 0; x < W; x += 1) {
    if (!on(x, y)) continue;
    if (x < lx0) lx0 = x;
    if (x > lx1) lx1 = x;
  }

  /**
   * ★**胴〜鼻**（明るい画素だけ）。尾・たてがみ・馬具の黒（最大値 70 未満）を落とします。
   *   背中のしなりはここに出ます。
   */
  const bandTop = y0 + Math.round((y1 - y0) * 0.20);
  const bandBot = y0 + Math.round((y1 - y0) * 0.55);
  let bx0 = W, bx1 = -1;
  for (let y = bandTop; y <= bandBot; y += 1) for (let x = 0; x < W; x += 1) {
    const o = (y * W + x) * C;
    if (data[o + 3] <= 128) continue;
    if (Math.max(data[o], data[o + 1], data[o + 2]) < 70) continue;   // ★尾を落とす
    if (x < bx0) bx0 = x;
    if (x > bx1) bx1 = x;
  }

  return {
    // …既存のまま…
    legSpan: lx1 - lx0 + 1,      // ★追加
    torsoLen: bx1 - bx0 + 1,     // ★追加
  };
```

判定の ② を差し替えます。

```js
// ② ★体の伸び縮み — **脚の広がり**で測る（尾を含む外形では測れない）
const legs = ms.map((m) => m.legSpan);
const legVar = (Math.max(...legs) - Math.min(...legs)) / Math.max(...legs);
const LEG_MIN = 0.30;
if (legVar < LEG_MIN) {
  fails.push(\`② ★**四肢が伸び縮みしない**（脚の広がりの変化 \${(legVar * 100).toFixed(1)}%、必要 \${LEG_MIN * 100}%以上）\`);
} else {
  console.log(\`  ② 四肢の伸び縮み: \${(legVar * 100).toFixed(1)}%\`);
}

// ②-b ★背中のしなり — 胴〜鼻の長さ（尾を除く）
const torsos = ms.map((m) => m.torsoLen);
const torsoVar = (Math.max(...torsos) - Math.min(...torsos)) / Math.max(...torsos);
const TORSO_MIN = 0.07;
if (torsoVar < TORSO_MIN) {
  fails.push(\`②-b ★**背中がしならない**（胴〜鼻の変化 \${(torsoVar * 100).toFixed(1)}%、必要 \${TORSO_MIN * 100}%以上）\`);
} else {
  console.log(\`  ②-b 背中のしなり: \${(torsoVar * 100).toFixed(1)}%\`);
}
```

## 3. 基準値をどこに引くか

| 検査 | 基準 | 根拠 |
|---|---|---|
| ② 脚の広がり | **30% 以上** | 現行の良いシートが 53.5%。★**基準は「いま良いとされているもの」より下に引きます。** 上に引くと、良い絵まで落ちます |
| ②-b 胴〜鼻 | **7% 以上** | 現行 9.2%。同上 |
| ⑥ 胴体・首・騎手 | 12% のまま | 現行 14.1%。★ここは触りません |

★**外形 bbox の 15% は撤回してください。** その基準を満たす絵は「尾が伸び縮みする馬」です。

## 4. パッチ後の見込み

`horse-gallop-sheet.png`（現行の良いシート）は、**①〜⑦ すべて PASS します。**
