import paper from "paper";
import { getStroke } from "perfect-freehand";

export type BrushPreset =
  | "standard" | "calligraphy" | "ink" | "fude" | "marker"
  | "pencil" | "airbrush" | "pattern" | "spray";

export interface BrushSettings {
  color: string;
  size: number;
  preset: BrushPreset;
}

interface Pt { x: number; y: number; pressure: number }

/** 決定的な疑似乱数(0〜1)。同じ添字なら常に同じ値 */
function rand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// プリセットごとの perfect-freehand パラメータ。
// streamline は低め=ペンに忠実(高いと補正でツルツルになるが遅れて感じる)
const PRESETS: Record<Exclude<BrushPreset, "pattern" | "spray">, {
  options: Parameters<typeof getStroke>[1];
  sizeMul: number;
  opacity: number;
}> = {
  standard: {
    options: { thinning: 0.65, smoothing: 0.45, streamline: 0.3 },
    sizeMul: 1, opacity: 1,
  },
  calligraphy: {
    // 強い筆圧変化+入り抜きテーパーで筆感を出す
    options: {
      thinning: 0.9, smoothing: 0.6, streamline: 0.4,
      start: { taper: 40 }, end: { taper: 40 },
    },
    sizeMul: 1.2, opacity: 1,
  },
  ink: {
    // 万年筆: 筆圧に敏感、抜きだけ長いテーパー
    options: {
      thinning: 0.75, smoothing: 0.4, streamline: 0.3,
      end: { taper: 60 },
    },
    sizeMul: 0.8, opacity: 1,
  },
  fude: {
    // 毛筆: 太く、入り抜きとも長いテーパー
    options: {
      thinning: 0.85, smoothing: 0.55, streamline: 0.35,
      start: { taper: 80 }, end: { taper: 80 },
    },
    sizeMul: 1.6, opacity: 0.95,
  },
  marker: {
    options: { thinning: 0, smoothing: 0.6, streamline: 0.4 },
    sizeMul: 1.6, opacity: 0.55,
  },
  pencil: {
    options: { thinning: 0.35, smoothing: 0.3, streamline: 0.25 },
    sizeMul: 0.5, opacity: 0.9,
  },
  airbrush: {
    // 太く淡い。重ね塗りで濃くなる
    options: { thinning: 0.2, smoothing: 0.7, streamline: 0.4 },
    sizeMul: 2.4, opacity: 0.25,
  },
};

// 筆圧フリーハンドブラシ。perfect-freehand で輪郭ポリゴンを生成し、
// 塗りつぶしパスとして Paper.js に載せる。pattern はスタンプ(点描)配置。
export class Brush {
  private pts: Pt[] = [];
  private preview: paper.Item | null = null;
  private dirty = false;
  private raf = 0;

  constructor(public settings: BrushSettings) {}

  /** project座標 + 筆圧を受け取る */
  begin(x: number, y: number, pressure: number) {
    this.pts = [{ x, y, pressure }];
    this.dirty = true;
    this.tick();
  }

  move(x: number, y: number, pressure: number) {
    if (!this.pts.length) return;
    this.pts.push({ x, y, pressure });
    this.dirty = true;
  }

  /** 確定アイテムを返す(空ストロークなら null)。
   *  プレビューと同じ点・同じパラメータで作るので、ペンを離しても線は変わらない。 */
  end(): paper.Item | null {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!this.pts.length) return null;
    const item = this.build(this.pts);
    this.preview?.remove();
    this.preview = null;
    this.pts = [];
    return item;
  }

  cancel() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.preview?.remove();
    this.preview = null;
    this.pts = [];
  }

  /** rAF で描画更新をバッチし、pointermove の頻度に引きずられない */
  private tick = () => {
    if (!this.pts.length) return;
    if (this.dirty) {
      this.dirty = false;
      const p = this.build(this.pts);
      this.preview?.remove();
      this.preview = p;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private build(pts: Pt[]): paper.Item {
    if (this.settings.preset === "pattern") return this.buildPattern(pts, false);
    if (this.settings.preset === "spray") return this.buildPattern(pts, true);
    const p = PRESETS[this.settings.preset];
    const outline = getStroke(
      pts.map((pt) => [pt.x, pt.y, pt.pressure]),
      {
        size: this.settings.size * p.sizeMul,
        simulatePressure: pts.every((pt) => pt.pressure === 0.5), // 筆圧なし入力(マウス等)
        ...p.options,
      },
    );
    const path = new paper.Path({
      segments: outline.map(([x, y]) => new paper.Point(x, y)),
      closed: true,
      fillColor: this.settings.color,
      insert: true,
    });
    path.opacity = p.opacity;
    return path;
  }

  /** パターン/スプレー: ストロークに沿って等間隔にスタンプ(線分内も補間)。
   *  乱数はスタンプ番号から決定的に作る=プレビューと確定が同一・チラつかない。 */
  private buildPattern(pts: Pt[], spray: boolean): paper.Item {
    const spacing = spray ? this.settings.size * 0.5 : this.settings.size * 1.4;
    const group = new paper.Group();
    let n = 0;
    const put = (pt: Pt) => {
      if (spray) {
        // 1ステップにつき小粒を3つ、決定的乱数で散らす
        for (let k = 0; k < 3; k++) {
          const a = rand(n * 3 + k) * Math.PI * 2;
          const d = rand(n * 7 + k + 1) * this.settings.size * 1.2;
          this.stamp(group, {
            x: pt.x + Math.cos(a) * d,
            y: pt.y + Math.sin(a) * d,
            pressure: pt.pressure,
          }, 0.18 + rand(n * 11 + k) * 0.2);
        }
      } else {
        this.stamp(group, pt, 0.4 + pt.pressure * 0.8);
      }
      n++;
    };
    put(pts[0]);
    let carry = spacing; // 次のスタンプまでの残距離
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) continue;
      let pos = carry;
      while (pos <= len) {
        const t = pos / len;
        put({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          pressure: a.pressure + (b.pressure - a.pressure) * t,
        });
        pos += spacing;
      }
      carry = pos - len;
    }
    return group;
  }

  private stamp(group: paper.Group, pt: Pt, sizeRatio: number) {
    const r = (this.settings.size / 2) * sizeRatio;
    const c = new paper.Path.Circle({ center: [pt.x, pt.y], radius: Math.max(r, 0.5) });
    c.fillColor = new paper.Color(this.settings.color);
    group.addChild(c);
  }
}
