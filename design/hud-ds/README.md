# STAR レース中継 HUD デザインシステム

ブラウザ競馬ゲーム「STAR」のレース中継画面（1280×720 Canvas）の見た目の正本。
実装は `jinjinsansan/syar` の `packages/render/src/*`。

## 本線

**派手版が本線。** 迷ったらこの 2 ファイル。

- `templates/race-hud/RaceHud.dc.html` — 見た目の正本（動く）
- `components/screen-live/index.html` — 実装値の正本（実測座標つき）

規約・走行アニメ・立ち絵の扱いは `MOTION_HANDOFF.md` にまとめてある。

## グループ

- **Tokens** — 色・文字階層・パネル規範
- **Screens** — フル画面モック
- **HUD** — 実況帯／順位／ミニマップ／区間タグ／勝馬テロップ／着順ボード／ナレーター4名
- **Motion** — 走行アニメ仕様・スプライトシート仕様・テンポ確認モック

## 変更のしかた

座標や色を変えるときは **まずカードを直し、そのあと Canvas 実装に反映する**（2 か所で持つと必ず離れる）。
