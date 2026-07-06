import paper from "paper";
import { getStroke } from "perfect-freehand";
import simplify from "simplify-js";

export type BrushPreset = "standard" | "calligraphy" | "marker" | "pencil" | "pattern";

export interface BrushSettings {
  color: string;
  size: number;
  preset: BrushPreset;
}

interface Pt { x: number; y: number; pressure: number }

// プリセットごとの perfect-freehand パラメータ
const PRESETS: Record<Exclude<BrushPreset, "pattern">, {
  options: Parameters<typeof getStroke>[1];
  sizeMul: number;
  opacity: number;
}> = {
  standard: {
    options: { thinning: 0.6, smoothing: 0.5, streamline: 0.5 },
    sizeMul: 1, opacity: 1,
  },
  calligraphy: {
    // 強い筆圧変化+入り抜きテーパーで筆感を出す
    options: {
      thinning: 0.9, smoothing: 0.7, streamline: 0.6,
      start: { taper: 40 }, end: { taper: 40 },
    },
    sizeMul: 1.2, opacity: 1,
  },
  marker: {
    options: { thinning: 0, smoothing: 0.6, streamline: 0.5 },
    sizeMul: 1.6, opacity: 0.55,
  },
  pencil: {
    options: { thinning: 0.35, smoothing: 0.35, streamline: 0.3 },
    sizeMul: 0.5, opacity: 0.9,
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

  /** 確定アイテムを返す(空ストロークなら null) */
  end(): paper.Item | null {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!this.pts.length) return null;
    // 点を軽く間引いてから確定(simplifyはpressureを保持したまま点を抽出する)
    const pts = this.pts.length > 4
      ? (simplify(this.pts, 0.4, true) as Pt[])
      : this.pts;
    const item = this.build(pts);
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
    if (this.settings.preset === "pattern") return this.buildPattern(pts);
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

  /** パターンブラシ: ストロークに沿って等間隔にスタンプ(線分内も補間) */
  private buildPattern(pts: Pt[]): paper.Item {
    const spacing = this.settings.size * 1.4;
    const group = new paper.Group();
    this.stamp(group, pts[0]);
    let carry = spacing; // 次のスタンプまでの残距離
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) continue;
      let pos = carry;
      while (pos <= len) {
        const t = pos / len;
        this.stamp(group, {
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

  private stamp(group: paper.Group, pt: Pt) {
    const r = (this.settings.size / 2) * (0.4 + pt.pressure * 0.8);
    const c = new paper.Path.Circle({ center: [pt.x, pt.y], radius: Math.max(r, 0.5) });
    c.fillColor = new paper.Color(this.settings.color);
    group.addChild(c);
  }
}
