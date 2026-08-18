# STAR レース中継 HUD デザインシステム

`node design/hud-ds/build.mjs` で Claude Design 用のプレビュー（HTML）を生成し、DesignSync で同期する。
描画の本体は `packages/render/src/oblique-ui.ts`（Canvas）。ここは見た目の合意用のモックで、変更は Canvas 実装へ反映する。
