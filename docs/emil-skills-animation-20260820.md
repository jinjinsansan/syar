# 外部スキル集の記録 — Emil Kowalski `skills`（Web 画面のモーション用・**未導入**）

**記録**: 2026-08-20（開発側）
**クローン先**: `V:\dev\Cusor\emil-skills`（★**`star` リポジトリの外**。製品の一部ではないため中には置いていない）
**取得時のコミット**: `e879241`（`--depth 1`）
**出典**: https://github.com/emilkowalski/skills
**状態**: **クローンしただけ。導入も適用もしていない**

---

## 1. 何か

Emil Kowalski（`Sonner` / `Vaul` の作者・`animations.dev`）による、**AI エージェント向けのスキル集**（11本）。

> "For designers and engineers to help them build better user interfaces"

| スキル | 内容 |
|---|---|
| `animate` | 適切なカーブ・duration・動かすプロパティを選ぶ |
| `review-animations` | 既存実装をルールに沿って厳しく監査する |
| `improve-animations` | コードベースを走査して改善点を出す |
| `find-animation-opportunities` | モーションを入れる価値のある箇所を見つける |
| `animation-vocabulary` | 動きを言葉で正確に指定するための語彙 |
| `apple-design` | Apple の UI・モーション原則を Web に |
| `emil-design-eng` / `prototype` / `pick-ui-library` / `ask-sonner` / `animate-expo` | 総論・試作・ライブラリ選定・トースト・React Native |

**対象技術**: CSS アニメーション／Framer Motion／React／React Native（Expo）。

---

## 2. この案件でどこに当たるか

**この案件のアニメーションは2層に分かれており、性質がまったく違います。**

### ❌ ① レース中継 — **当たりません**

`packages/render/*.ts` から **Canvas に `drawImage`** する世界です。8コマのスプライトを**距離に応じて回します**（`design/hud-ds/MOTION_HANDOFF.md`）。素材は Codex の画像生成。**CSS も Framer Motion も出てきません。**

### ✅ ② Web 画面12枚（アーケードテーマ）— **当たります**

Next.js の DOM です。現状のモーションは `globals.css` の **`.rise`（0.45s）と `.welcome`（0.6s）だけ**で、ボタンの押下感・カードの登場・タブ切替・数値のカウントアップは手つかずです。

→ **使うなら `review-animations` / `find-animation-opportunities` を、Web 画面だけに当てる。**

---

## 3. 🔴 使うときの必須の注意 — **race 側に当ててはいけません**

**この案件には「参考映像が一般的な作法より優先される」という決定があります。**

`CLAUDE_CODE_HANDOFF_RACE_20260819.md` §2 より:

> カット替えのフラッシュ: 今は参考映像どおり**白 95%・0.3s**。デザインは白 18%・3 フレーム。
> **オーナーが参考映像側を指定しているので変えていない**

**一般的なモーション設計の基準では、白95%・0.3秒のフラッシュは「強すぎる」と判定されます。** `review-animations` を race 側に当てれば、**まさにこれを「直すべき」と言ってきます。**

**アーケード筐体の派手さは意図的に選ばれたもの**（D-057・R-1 のオーナー判定「凄くゲーム感がある」）なので、そこへ Apple 的な上品さの基準を持ち込むと、**合格済みのものを壊す方向に働きます。**

> **★外部の「良い作法」は、この案件が自分で決めた基準を上書きしません。**
> 正本は `MOTION_HANDOFF.md` と参考映像であり、外部スキルはその下です。

---

## 4. 導入するときの手順（まだやらないこと）

1. **適用範囲を先に決める** — `apps/web/src/app/{setup,stable,training,entry,records,prizes,races}` の DOM のみ。**`apps/web/src/app/race`（Canvas）と `packages/render` は対象外**
2. `.claude/skills/` に置くか、都度参照するかを決める（クローンしただけの現状は後者）
3. **出力は提案として受け取り、`MOTION_HANDOFF.md` と突き合わせてから採る**

---

## 5. 判断の記録

| | |
|---|---|
| 誰が | オーナー（2026-08-20「後ほど web の画面モーションで使えるかもしれないので」） |
| いま | **クローンのみ。導入・適用なし** |
| 次に検討する時期 | Web 画面のモーションを扱う便（P4 のレース演出が一段落した後） |
