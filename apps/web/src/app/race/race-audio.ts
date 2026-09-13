/**
 * ★**レースの音**（★2026-09-13・オーナー支給の音源を移植）
 *
 * 【★経緯】
 *   ★実況（読み上げ）は ★**不採用**になりました（★2026-09-13・オーナー評「★全くダメですね」）。
 *   ★中身が毎回変わる（★馬名が生成物）ので、★端末任せの読み上げに頼るしかなく、
 *   ★声も読みも選べなかったためです。
 *   → ★オーナーから ★**音源ファイル**を頂きました。★中身が固定なので、これは成り立ちます。
 *
 * 【★音源の出どころ】
 *   ★オーナー支給（★リポジトリ直下と `dev/Cusor/sevendays` から移植・★2026-09-13）。
 *   ⚠️ ★**実在の競馬のファンファーレは使えません**（★権利・憲法 1）。★支給音源の権利の
 *      ★確認はオーナー側です。★ここでは ★**渡されたものを鳴らすだけ**です。
 *
 * 【★守っていること】
 *   ⚠️ ★`Date.now()` / `Math.random()` を使いません（★憲法 4）。★鳴らす時刻は
 *      ★**画面の表示秒**から決めます（★シード固定で同じ所で鳴る）。
 *   ⚠️ ★**既定は切**です（★R-27）。★ブラウザは人の操作なしに音を出させないので、
 *      ★ボタンの押下が解錠を兼ねます。
 *   ⚠️ ★例外を外へ出しません。★毎コマの描画の輪から呼ばれるので、
 *      ★音が落ちても ★**映像は続けます**。
 *   ⚠️ ★音源が無ければ ★**黙って鳴らしません**（★404 で画面を壊さない）。
 */

/** ★鳴らすもの。★`public/audio/` のファイル名と 1 対 1 */
export type RaceSoundId = 'fanfare' | 'gate-open' | 'whinny' | 'gallop' | 'crowd';

/**
 * ★**音源の置き場と、★それぞれの鳴らし方**。
 *
 * ⚠️ ★`loop` は ★**尺が足りないときだけ**です。★支給の走行音は 39.6 秒あり、
 *    ★本編（★33 秒）より長いので、★繰り返しません（★継ぎ目が耳に付きます）。
 */
export const RACE_SOUNDS: Readonly<Record<RaceSoundId, {
  readonly url: string; readonly gain: number; readonly loop: boolean;
}>> = {
  /** ★イントロ（★発走前）。★16.8 秒あり、★イントロ 4.4 秒では最後まで鳴りません */
  fanfare: { url: '/audio/fanfare.mp3', gain: 0.75, loop: false },
  /** ★ゲートが開く瞬間（★1.8 秒） */
  'gate-open': { url: '/audio/gate-open.mp3', gain: 0.95, loop: false },
  /** ★ゲートが開いた直後のいななき（★2.1 秒・★音源名のとおりの使い方） */
  whinny: { url: '/audio/whinny.mp3', gain: 0.8, loop: false },
  /** ★走行音（★39.6 秒）。★本編を通して敷きます */
  gallop: { url: '/audio/gallop.mp3', gain: 0.65, loop: false },
  /** ★ゴール後の群衆（★100.6 秒）。★着順ボードの間 */
  crowd: { url: '/audio/crowd.mp3', gain: 0.5, loop: false },
};

export interface RaceAudio {
  readonly available: boolean;
  /** ★人の操作から呼ぶ（★ブラウザの解錠）。★戻り値は解錠できたか */
  resume(): Promise<boolean>;
  /**
   * ★**1 回だけ鳴らす**。★同じ札で 2 度呼んでも 2 度は鳴りません。
   *   ★札は「どの場面の音か」。★やり直したら `reset()` で札を捨てます。
   */
  cue(id: RaceSoundId, tag: string): void;
  /** ★鳴っているものを、★時間をかけて絞る */
  fade(id: RaceSoundId, seconds: number): void;
  /**
   * ★**その場面は過ぎたので鳴らさない**、と札だけ立てる。
   *   ★例: イントロが終わってから音を入れた回のファンファーレ。
   */
  skip(tag: string): void;
  /** ★全部止めて、★札を捨てる（★「最初から」） */
  reset(): void;
  /** ★後片付け */
  dispose(): void;
}

export function createRaceAudio(): RaceAudio {
  const Ctor: typeof AudioContext | undefined = typeof window === 'undefined' ? undefined
    : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (Ctor === undefined) {
    return {
      available: false,
      resume: async () => false,
      cue() { /* ★この端末では鳴らせない */ },
      fade() { /* 同上 */ },
      skip() { /* 同上 */ },
      reset() { /* 同上 */ },
      dispose() { /* 同上 */ },
    };
  }

  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  const buffers = new Map<RaceSoundId, AudioBuffer>();
  const loading = new Set<RaceSoundId>();
  /** ★鳴らし終えた札。★同じ場面で二度鳴らさないため */
  const fired = new Set<string>();
  /** ★いま鳴っているもの（★絞るために掴んでおく） */
  const playing = new Map<RaceSoundId, { src: AudioBufferSourceNode; gain: GainNode }>();

  /**
   * ★**音源を取りに行く**。★無ければ黙って諦め、★二度と取りに行きません。
   * ⚠️ ★`decodeAudioData` は端末によって Promise を返さない実装があります。★どちらも受けます。
   */
  const load = (id: RaceSoundId): void => {
    if (buffers.has(id) || loading.has(id)) return;
    loading.add(id);
    void (async (): Promise<void> => {
      try {
        const res = await fetch(RACE_SOUNDS[id].url);
        if (!res.ok) return;
        const bytes = await res.arrayBuffer();
        const buf = await new Promise<AudioBuffer>((resolve, reject) => {
          const out = ctx.decodeAudioData(bytes, resolve, reject) as unknown;
          if (out instanceof Promise) out.then(resolve, reject);
        });
        buffers.set(id, buf);
      } catch { /* ★無い・読めない。★黙って鳴らさない */ }
    })();
  };

  /** ★先に全部取りに行く（★場面で待たせない） */
  const preload = (): void => {
    for (const id of Object.keys(RACE_SOUNDS) as RaceSoundId[]) load(id);
  };
  /**
   * ⚠️ ★**作った時点で取りに行きます**（★2026-09-13・オーナー評
   *    ★「★ファンファーレ音源は道具ボタンを押すとなったりならなかったりする」）。
   *
   *    ★以前は ★**「音」を押した時**に取りに行っていました。★ところがファンファーレの
   *    ★出番はイントロの ★**4.4 秒**しかありません。★読み込みが間に合わなければ、
   *    ★その回は ★**一度も鳴りません**（★下の `cue` は、読めていないときに札を立てないので、
   *    ★場面が過ぎれば終わりです）。★押す前から取りに行けば、間に合います。
   * ⚠️ ★`AudioContext` は止まったままでも `decodeAudioData` は動きます。★音は出ません。
   */
  preload();

  const start = (id: RaceSoundId): void => {
    const buf = buffers.get(id);
    if (buf === undefined) { load(id); return; }
    try {
      const spec = RACE_SOUNDS[id];
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = spec.loop;
      const g = ctx.createGain();
      g.gain.value = spec.gain;
      src.connect(g); g.connect(master);
      src.start();
      playing.set(id, { src, gain: g });
      src.addEventListener('ended', () => {
        if (playing.get(id)?.src === src) playing.delete(id);
      });
    } catch { /* ★鳴らせなければ黙る */ }
  };

  return {
    available: true,

    async resume(): Promise<boolean> {
      try {
        if (ctx.state !== 'running') await ctx.resume();
        preload();
        return ctx.state === 'running';
      } catch { return false; }
    },

    cue(id: RaceSoundId, tag: string): void {
      if (ctx.state !== 'running') return;
      if (fired.has(tag)) return;
      /**
       * ⚠️ ★**まだ読めていなければ札を立てません。** ★立ててしまうと、★読み込みが
       *    ★間に合わなかった回に ★**その場面の音が永久に鳴りません**。
       */
      if (!buffers.has(id)) { load(id); return; }
      fired.add(tag);
      start(id);
    },

    skip(tag: string): void { fired.add(tag); },

    fade(id: RaceSoundId, seconds: number): void {
      const cur = playing.get(id);
      if (cur === undefined) return;
      try {
        const t = ctx.currentTime;
        const s = Math.max(0.05, seconds);
        cur.gain.gain.cancelScheduledValues(t);
        cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
        cur.gain.gain.linearRampToValueAtTime(0.0001, t + s);
        cur.src.stop(t + s + 0.05);
        playing.delete(id);
      } catch { /* 無視 */ }
    },

    reset(): void {
      for (const [, cur] of playing) {
        try { cur.src.stop(); } catch { /* 無視 */ }
      }
      playing.clear();
      fired.clear();
    },

    dispose(): void {
      try { void ctx.close(); } catch { /* 無視 */ }
    },
  };
}
