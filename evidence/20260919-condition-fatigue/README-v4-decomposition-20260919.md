# ★V-4 の分解 4 本 — ★**生の出力と、その素性**（2026-09-19）

★1 枚の報告: `REPORT_CONDITION_FATIGUE_DECOMPOSITION_20260919.md`
★この場所に置いた理由: ★**セッション領域にしか無いと、セッションが終わると消えるため**（★レビュー側の依頼）。

> ⚠️ 🔴 ★**`out/` は `.gitignore:11` で無視されています。★この 5 ファイルはコミットされません。**
> ★**「証拠が repo に残る」にはなっていません。** ★置き場は別に決める必要があります（★レビュー側へ報告済み）。

---

## ★出力（★加工していません。★道具の出力そのままです）

| ファイル | 本 | 旗 | シード | レース |
|---|---|---|---|---|
| `v4-1-baselineD-8seed-20260919.txt` | ★① 基準値 D | ★**なし** | 8 | 120,000 |
| `v4-23-cond-and-fatigue-only-1seed-20260919.txt` | ★②③ | `--b6-wired` ＋ ★加工プール | 1（42） | 15,000 ×2 |
| `v4-4-b6wired-1seed-20260919.txt` | ★④（1 シード） | `--b6-wired` | 1（42） | 15,000 |
| `v4-4-b6wired-8seed-20260919.txt` | ★④（8 シード） | `--b6-wired` | 8 | 120,000 |

⚠️ ★**①②③ は `grep` で絞った出力**です（★`seed=` と `V-4` の行だけ）。★④ の 1 シードも同様。
★**絞っていない全文は残っていません。** ★次からは絞らずに保存します。

---

## ★流したコマンド（★そのまま）

### ★① 基準値 D（8 シード）
```
npx tsx apps/cli/src/verify-race.ts --pool out/al11/pool-D-active-3000.json \
  --races 120000 --seeds 42,7,2026,31337,1,99,12345,65537
```

### ★④（8 シード）— ★**旗が 1 つだけ違います**
```
npx tsx apps/cli/src/verify-race.ts --pool out/al11/pool-D-active-3000.json \
  --races 120000 --seeds 42,7,2026,31337,1,99,12345,65537 --b6-wired
```

### ★④（1 シード）
```
npx tsx apps/cli/src/verify-race.ts --pool out/al11/pool-D-active-3000.json \
  --races 15000 --seeds 42 --b6-wired
```

### ★②③（★プールのほうを加工しています）
```
for p in cond-only fatigue-only; do
  echo "=== $p ==="
  npx tsx apps/cli/src/verify-race.ts --pool out/al11/pool-D-$p.json \
    --races 15000 --seeds 42 --b6-wired
done
```

★加工の中身（★`pool-D-active-3000.json` から作る）:
- ★`pool-D-cond-only.json` … ★`__training` を `{condition: 実物, fatigue: 0}` にする
- ★`pool-D-fatigue-only.json` … ★`__training` を `{fatigue: 実物}` だけにする（★`condition` の**キーを消す** → ★`race-field.ts:580` の `rng.int(2,4)` に落ちる）

---

## ★母集団（sha256 の先頭 12 桁）

| ファイル | sha256 | 頭数 |
|---|---|---|
| `pool-D-active-3000.json` | `df10399b5c44` | 3,000 |
| `pool-D-cond-only.json` | `d6382064a37c` | 3,000 |
| `pool-D-fatigue-only.json` | `0beab3fea213` | 3,000 |

---

## 🔴 ★読むときの注意（★私が一度 間違えた所）

★**`30.88%` は ① の seed=42 だけの値**です。★**① の 8 シードは 31.01%**。
★私は最初、★**1 シードの値と 8 シードの平均を引き算**して「+2.91pp」と書きました。★正しくは ★**+2.78pp**。

> ★**CN-14** ★2 つの数を引くときは、★**同じ標本の大きさか**を先に見る。
> ★どちらも「V-4」という同じ名前で出てくるので、★**名前だけでは気づけない。**

## 🔴 ★この測定に付いていない不確かさ

★①②③④ の**すべて**が、★`POOL-DRAIN`／`SEED-LOCKSTEP` の ★**1 つの位相**（★現役 7,333 頭が全頭 `birth_week = −160`）で採られています。
★★**シードを増やしても、この不確かさは減りません。**
