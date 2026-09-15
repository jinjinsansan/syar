# 照会 — 楕円の走路でレース判定が 40 倍遅くなっている（距離ロスの計算）

**案件**: STAR（ポイ活型オンライン競馬育成）
**発行**: 2026-09-15 ／ 開発側 → レビュー側・オーナー
**きっかけ**: `DEV_INSTRUCTIONS_VENUE_WIRING_20260915.md` §7-2 の V-4・V-6 を流す前に所要を見積もったところ、1 条件 約 21 時間の計算になった
**ブランチ・HEAD**: `p4/race-30sec-cuts` ／ `57adf77`（本書の作成で製品コードは変えていません）

> 凡例（R-13）: **✔** ＝ 開発側がこの便で実行・実測した ／ **計算** ＝ 実測値と定数から出した値 ／ **△** ＝ 未確認・推定
> ⚠️ 本書のための計測は、スクラッチに `git archive` でエンジンを取り出して行いました。作業ツリー・git の状態は変えていません（付録 B）。

---

## 0. 要旨

- `resolveRace` 1 回（12 頭・1600m・楕円）が **約 2.5ms** かかる。D-071 の前は **61µs** だった（✔）
- 遅くなったのは 2 回。**D-071（`97364c5`・2026-08-16）で 8 倍**、**`0a6e577`（2026-08-31・「器だけ」）でさらに 3 倍**。`0a6e577` は結果の指紋が前のコミットと完全に同じで、速さだけが悪くなった（✔）
- 原因は、`laneExtraM` が 10m ごとに呼ぶ `laneAt` の中で、**レースの間ずっと同じ値の `swingScale` を毎回作り直している**こと（✔ コード）
- `swingScale` を（距離・走路の形）で覚えるだけの試作で **537µs**（4.6〜6 倍速い）。**900 レースの結果の指紋が完全に一致**（✔）
- ⚠️ 本番のオッズ計算（1 レース 3,896,104 回）は、いまのエンジンだと**1 レース 約 2.7 時間**の計算になる。本番のワーカーがどの版で動いているかは未確認（△ §3-2）

---

## 1. 測定 ✔

### 1-1. コミットごとの `resolveRace` 1 回の所要

12 頭（`apps/web/src/lib/watch-pool.json` の先頭 12 頭）・芝・良。楕円は既定の走路（`DEFAULT_OVAL`）。2026-09-15 午前、他の計算を止め、AC 電源で 1 本ずつ実行。

| コミット | 日付 | 中身 | 楕円 1600m | 楕円 3000m | 直線 1200m | 結果の指紋 |
|---|---|---|---|---|---|---|
| `97364c5^` | 2026-08-16 | D-071 の前 | **61µs** | 53µs | 17µs | `2291295b…` |
| `97364c5` | 2026-08-16 | D-071（`w` をエンジンが引く・距離ロス） | 483µs | 1,285µs | 11µs | `4a4a2c8f…` |
| `7cff0ad` | 2026-08-21 | reveal 0.18 | 452µs | 1,310µs | 12µs | `0f54d535…` |
| `df1ecaa` | 2026-08-30 | `laneAt` が走路の形を受け取る | 504µs | 1,287µs | 15µs | `0f54d535…` |
| `74f7c5c` | 2026-08-30 | 競馬場の形を着順まで通す | 572µs | 1,319µs | 14µs | `54f05149…` |
| `97b6d05` | 2026-08-31 | 走る場所の作り直し（`LANE_MODEL`） | 841µs | 2,502µs | 14µs | `2e0f4480…` |
| **`0a6e577`** | 2026-08-31 | **コーナーごとの半径の器（値は変えない）** | **2,432µs** | **6,850µs** | 14µs | `2e0f4480…`（前と同じ） |
| `57adf77` | 2026-09-15 | HEAD | 2,497µs | 6,745µs | 16µs | `2e0f4480…` |
| 作業ツリー | — | 未コミットの VW 便を含む | 2,736µs | 7,182µs | 15µs | `2e0f4480…` |
| **試作** | — | 作業ツリー ＋ `swingScale` を覚える（§4） | **537µs** | **1,125µs** | 16µs | **`2e0f4480…`（一致）** |

- 結果の指紋: 距離 5（1200〜3000m）× 走路 3（`DEFAULT_OVAL`・1 周 1900m 直線 310m・1 周 2400m 直線 540m）× 60 シード ＝ 900 レースの、各馬の `horseId`・`finalScore`・`laneExtraM`・`timeSec`・`marginLabel` を JSON にして sha256。数値は JSON で最短の往復表現になるので、**指紋の一致は全値のビット一致**を意味します
- 指紋が変わっているコミット（`97364c5`・`7cff0ad`・`74f7c5c`・`97b6d05`）は、結果を変える意図の便です。`df1ecaa` は `course` を渡していないので前と同じ、は各便の註記どおり
- 同じ日の朝の別の測り方（18 頭・1200m）では 4.2〜12.8ms でした。頭数に比例して増えます（8 頭 1.9ms ／ 12 頭 2.8ms ／ 16 頭 3.7ms ／ 18 頭 4.2ms）

### 1-2. CPU プロファイル（作業ツリー・12 頭）

`node --cpu-prof` で自己時間の上位: `lane.ts` の esbuild の名前付け補助 21% ／ `totalTurn` 14% ／ `ovalSegments` 8% ／ GC 6% ／ `swingScale` 5% ／ `laneAt` 5% ／ `withRunUp` 3%。**`resolveRace` 本体は 1.5%**。（`TextDecoder` 21% はローダーの起動分）

---

## 2. 原因（コードを読んで）✔

```
resolveRace                         race.ts:141   馬ごとに laneExtraM を 1 回
└ laneExtraM                        lane.ts:467   ovalSegments を 1 回、コーナーを 10m ごとに
   └ laneAt                         lane.ts:480   刻みごと
      ├ swingScale                  lane.ts:420   ← 1 回目（通り道の幅）
      └ swingScale                  lane.ts:444   ← 2 回目（揺らぎ）
         └ totalTurn × 2            lane.ts:198・200（距離と基準 1600m）
            └ ovalSegments          lane.ts:177   毎回、配列・オブジェクトを作り直す
               └ ovalCornerPlan     lane.ts:148   （0a6e577 から）
```

- **`swingScale(distance, spec)` は `distance` と走路の形だけで決まる**（`totalTurn` は `ovalSegments` と `ovalCornerPlan` しか使わず、どちらも `lapM`・`homeStretchM`・`cornerRadiiM` だけを読む。`widthM` は読まない）。**1 レースの間ずっと同じ値**です
- 回数（計算・`DEFAULT_OVAL`・1600m）: 走路の区間は［直線 200（2角を引き込み線に置換）・向正面 400・3角 300・4角 300・直線 400］で、コーナーは 600m ＝ 60 刻み。1 刻みで `ovalSegments` 4 回 → **1 頭 241 回・12 頭 2,892 回**。3000m はコーナーが増えるのでさらに多い
- `97b6d05` で `swingScale` の呼び出しが 1 刻み 2 回になり（`home` と `wob`）、`0a6e577` で `ovalSegments` の中に `ovalCornerPlan`（配列を作る）が入った、が段差に対応すると見ています（△ 段差ごとの内訳は測っていません。`0a6e577` の 3 倍のうちどれだけが `ovalCornerPlan` の割り当てかは未確認）

---

## 3. 影響（計算）

### 3-1. 検証の道具

| 計算 | 呼び出し | いま（2.5ms） | 試作（0.54ms） | D-071 の前（61µs） |
|---|---|---|---|---|
| V-4〜V-6（`verify:race` 既定・60,000 レース × 502 回） | 3,012 万回 | **約 21 時間** / 1 条件 | 約 4.5 時間 | 約 31 分 |
| オッズ（1 レース 3,896,104 回） | 390 万回 | **約 2.7 時間** / 1 レース | 約 35 分 | 約 4 分 |

- 1600m・12 頭の値で計算。長距離・多頭数ではさらに長くなります
- ✔ 実例と合っています: 2026-09-14 に `seed-races.mjs --env staging --races 1` が 1 時間 45 分で強制終了されました（1 本も終わらなかった）。`verify-payout.ts --races 2000`（V-10）は 10 時間半で強制終了。`seed-races.mjs` の註記「1 本 80〜96 秒」「236〜976 秒」は 2026-08-11（`13bfd53`）に書かれたもので、D-071 より前です
- ⚠️ 開発側は 2026-09-14〜15 に、これらをメモリ不足のせいと書いていました。**少なくとも一因は遅さ**です（2026-09-15 04:14 のセッションの終了は、メモリではなく Windows Update の自動再起動でした）

### 3-2. ⚠️ 本番（△ 未確認）

- 本番のワーカーは、1 レースのオッズを `resolveRace` 3,896,104 回で作ります（`apps/worker/src/build-race.ts:114`・`ODDS_MC_TRIALS`）
- ワーカーが `97364c5`（2026-08-16）より後のエンジンで動いているなら、1 レースに 30 分〜3 時間かかり、10 分サイクル（正典 §10.1）に間に合わない計算です
- 開発側は本番に接続していません。**どの版が動いているか・直近のレースの生成にかかった時間・抜けたサイクル**を、オーナーの許可をいただいてから読み取り専用で 1 回確かめます（Q-5）

---

## 4. 試作（リポジトリには入れていない）✔

作業ツリーのエンジンをスクラッチにコピーし、`lane.ts` の `swingScale` を次の形にしただけ（付録 B の `run.sh`）:

```ts
const swingCache = new Map<string, number>();
function swingScale(distance: number, spec: OvalSpec): number {
  const key = `${distance}|${spec.lapM}|${spec.homeStretchM}|${spec.cornerRadiiM === undefined ? '' : spec.cornerRadiiM.join(',')}`;
  const hit = swingCache.get(key);
  if (hit !== undefined) return hit;
  const v = swingScaleRaw(distance, spec);   // 元の関数そのまま
  swingCache.set(key, v);
  return v;
}
```

- 結果: 1600m 2,736 → **537µs**（5.1 倍）／ 3000m 7,182 → **1,125µs**（6.4 倍）／ **指紋 `2e0f4480…` 一致**
- 同じ入力で同じ関数を 1 回だけ計算するので、値は定義から同じです（浮動小数の計算の順番も変わらない）
- ⚠️ 試作でも D-071 の前の 9 倍です。残りは `laneAt` 本体（1 頭 60 刻み × ハッシュ 3 本・`sin`）と、`laneExtraM` が**馬ごとに** `ovalSegments` を作ることです

---

## 5. 照会

| # | 照会 | 回答が出るまでの既定 |
|---|---|---|
| **Q-1** | **エンジンの速さを直す便を出すか。** VW 便の中に入れるか、別の便にするか | **別の便**。VW 便の残りの計測（V-4〜V-6・V-18 の残り 47 組・VW-0 の大きさ）は、直った後に流す。直す前は流さない |
| **Q-2** | **直し方。** (a) 試作のように `swingScale` を覚える（モジュールに状態を持つ。`lane.ts` 冒頭の「純粋関数です」との関係・キーの数の上限）／ (b) `laneExtraM` の中で `swingScale` を 1 回だけ計算し、内部の関数に渡す。外に出ている `laneAt` の署名は変えない（描画・道具が呼んでいる）／ (c) (b) に加えて、`resolveRace` の中で区間を 1 レース 1 回だけ作り、馬ごとに作り直さない | 開発側の案は **(b)**。状態を持たず、外の署名も変えずに、試作と同じ効果が出る見込み（△ 未計測）。(c) は (b) の後に測ってから |
| **Q-3** | **「結果が 1 ビットも変わらない」を何で固定するか。** 案: 10 場 × 本番の 7 距離 × 頭数 2 通り × シード数十の、`resolveRace` の結果の指紋を CI に置く（**直す前のコミットで取った指紋**を期待値にする）。変異として、`swingScale` の覚え方を距離だけにすると落ちること | 案のとおり |
| **Q-4** | **速さの退行を CI で捕まえるか**（R-32 の系）。時間を測る検査は機械によって揺れるので、**1 回の `resolveRace` で `ovalSegments` を作る回数**を数えて上限を置く案 | 回数で固定する（上限は直した後の実測で決め、報告する） |
| **Q-5** | **本番のワーカーの確認**（オーナーの許可が要る）。読み取り専用で 1 回、①稼働中のビルド識別子（R-28）②直近 N 本のレースの生成時刻の間隔と所要 ③抜けたサイクルの有無 | **許可をいただくまで接続しない** |
| **Q-6** | `0a6e577` のように「値は変えない」便が速さを 3 倍悪くしたのに、どの検査にも出なかった。**R-15（入っているが使われない状態で一度コミット）の対照に、速さも入れるか** | レビュー側の判断に。開発側からは Q-4 の回数の検査で足りると考えています |

---

## 6. 範囲

- 本書のために製品コード・検査・正典は変えていません
- VW 便の未コミットの変更（`REPORT_VENUE_WIRING_20260915.md` の §6・§9 の追記、`apps/cli/test/v18-gate.test.ts` の対照の差し替えを含む）は、そのまま残しています
- 計測に使ったスクリプトは付録に全文を載せました（レビュー側が再実行できるように）

---

## 付録 A. 再実行

```bash
# スクラッチ（どこでもよい）に 2 つのファイルを置き、
bash run.sh
# 期待値: §1-1 の表の形。µs は機械で変わる。指紋（sha）は機械によらず同じ
```

## 付録 B. スクリプト

### `bench-engine.mts`

```ts
// ENGINE_DIR に取り出したエンジンで、resolveRace 1 回の所要と、結果の指紋（sha256）を出す。
// 読み取りのみ。リポジトリには何も書かない。
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const dir = process.env.ENGINE_DIR!;
const eng: any = await import(pathToFileURL(`${dir}/packages/race-engine/src/index.ts`).href);
const { resolveRace, DEFAULT_RACE_BALANCE } = eng;

const POOL = JSON.parse(readFileSync('V:/dev/Cusor/star/apps/web/src/lib/watch-pool.json', 'utf8'));
const S = ['nige', 'senko', 'sashi', 'oikomi'];
const field = (n: number, off = 0) => POOL.slice(off, off + n).map((h: any, i: number) => ({
  horseId: `H${i + 1}`, stats: h.stats, surfaceAptitude: h.surfaceAptitude, distanceCenter: h.distanceCenter,
  distanceRange: h.distanceRange, strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
  strategy: S[i % 4], condition: 3, fatigue: 0, weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
}));
const cond = (distance: number, courseShape: 'oval' | 'straight', course?: unknown) =>
  ({ raceId: 'b', distance, surface: 'turf', trackCondition: 'good', courseShape, baseWeightKg: 55, ...(course ? { course } : {}) });

const time = (c: any, entrants: any[], N: number): number => {
  for (let k = 0; k < 10; k += 1) resolveRace({ conditions: c, entrants, seed: 900_000 + k, balance: DEFAULT_RACE_BALANCE });
  const t = performance.now();
  for (let k = 0; k < N; k += 1) resolveRace({ conditions: c, entrants, seed: k, balance: DEFAULT_RACE_BALANCE });
  return ((performance.now() - t) / N) * 1000;
};

const e12 = field(12);
const oval1600 = time(cond(1600, 'oval'), e12, 200);
const oval3000 = time(cond(3000, 'oval'), e12, 100);
const straight = time(cond(1200, 'straight'), e12, 2000);

// 指紋: 着順・スコア・距離ロス・タイムを、距離 5 × 走路 3（既定・潮風相当・大河原相当）× 60 シード
const specs: (unknown | undefined)[] = [undefined, { lapM: 1900, homeStretchM: 310, widthM: 20 }, { lapM: 2400, homeStretchM: 540, widthM: 20 }];
const h = createHash('sha256');
for (const d of [1200, 1600, 2000, 2400, 3000]) {
  for (const sp of specs) {
    for (let s = 0; s < 60; s += 1) {
      const r = resolveRace({ conditions: cond(d, 'oval', sp), entrants: field(12, s % 20), seed: 12345 + s * 7919, balance: DEFAULT_RACE_BALANCE });
      h.update(JSON.stringify(r.order.map((o: any) => [o.horseId, o.finalScore, o.laneExtraM ?? null, o.timeSec, o.marginLabel])));
    }
  }
}
console.log(`${process.env.LABEL}\toval1600 ${oval1600.toFixed(0)}µs\toval3000 ${oval3000.toFixed(0)}µs\tstraight ${straight.toFixed(0)}µs\tsha ${h.digest('hex').slice(0, 16)}`);
```

### `run.sh`

```bash
#!/usr/bin/env bash
# コミットごとにエンジンを取り出して速さを測る。作業ツリー・git の状態は変えない（git archive で読むだけ）。
set -u
REPO=/v/dev/Cusor/star
SP="$(cd "$(dirname "$0")" && pwd)"
TSX="$REPO/node_modules/.bin/tsx"
TSCONFIG='{"compilerOptions":{"baseUrl":".","paths":{"@star/sim-engine":["packages/sim-engine/src/index.ts"]},"module":"ESNext","moduleResolution":"Bundler","target":"ES2022"}}'

prep() { # $1=ディレクトリ
  mkdir -p "$1"; printf '%s' "$TSCONFIG" > "$1/tsconfig.json"
}
bench() { # $1=ラベル $2=ディレクトリ
  (cd "$2" && LABEL="$1" ENGINE_DIR="$2" "$TSX" --tsconfig "$2/tsconfig.json" "$SP/bench-engine.mts" 2>&1 | tail -1)
}

for c in 97364c5^ 97364c5 7cff0ad df1ecaa 74f7c5c 97b6d05 0a6e577 57adf77; do
  d="$SP/at/$(echo "$c" | tr '^' '_')"
  rm -rf "$d"; prep "$d"
  git -C "$REPO" archive "$c" packages/race-engine/src packages/sim-engine/src | tar -x -C "$d"
  bench "$c $(git -C "$REPO" log -1 --format='%ad' --date=short "$c")" "$d"
done

# 試作: 作業ツリーのエンジンの swingScale だけを (距離・走路の形) で覚える形にしたもの
w="$SP/at/worktree"; p="$SP/at/proto-memo"
for x in "$w" "$p"; do
  rm -rf "$x"; prep "$x"
  mkdir -p "$x/packages/race-engine" "$x/packages/sim-engine"
  cp -r "$REPO/packages/race-engine/src" "$x/packages/race-engine/"
  cp -r "$REPO/packages/sim-engine/src" "$x/packages/sim-engine/"
done
node -e '
const fs=require("fs");const f=process.argv[1];let s=fs.readFileSync(f,"utf8");
const head="function swingScale(distance: number, spec: OvalSpec): number {";
if(s.split(head).length!==2){console.error("置換先が 1 か所でない");process.exit(3)}
s=s.replace(head,
"const swingCache = new Map<string, number>();\n"+
"function swingScale(distance: number, spec: OvalSpec): number {\n"+
"  const key = `${distance}|${spec.lapM}|${spec.homeStretchM}|${spec.cornerRadiiM === undefined ? \"\" : spec.cornerRadiiM.join(\",\")}`;\n"+
"  const hit = swingCache.get(key);\n"+
"  if (hit !== undefined) return hit;\n"+
"  const v = swingScaleRaw(distance, spec);\n"+
"  swingCache.set(key, v);\n"+
"  return v;\n"+
"}\n"+
"function swingScaleRaw(distance: number, spec: OvalSpec): number {");
fs.writeFileSync(f,s);' "$p/packages/race-engine/src/lane.ts" || exit 3
bench "作業ツリー（未コミットの VW を含む）" "$w"
bench "試作: swingScale を覚える" "$p"
```

---

本書の作成にあたって、**7DAYS のファイルは開いていません**。
