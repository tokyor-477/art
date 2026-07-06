import paper from "paper";
import { getStroke } from "perfect-freehand";
import simplify from "simplify-js";

export interface BrushSettings {
  color: string;
  size: number;
}

interface Pt { x: number; y: number; pressure: number }

// 筆圧フリーハンドブラシ。perfect-freehand で輪郭ポリゴンを生成し、
// 塗りつぶしパスとして Paper.js に載せる。
export class Brush {
  private pts: Pt[] = [];
  private preview: paper.Path | null = null;
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

  /** 確定パスを返す(空ストロークなら null) */
  end(): paper.Path | null {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!this.pts.length) return null;
    // 点を軽く間引いてからストローク輪郭を確定(simplifyはpressureを保持したまま点を抽出する)
    const pts = this.pts.length > 4
      ? (simplify(this.pts, 0.4, true) as Pt[])
      : this.pts;
    const path = this.buildPath(pts);
    this.preview?.remove();
    this.preview = null;
    this.pts = [];
    return path;
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
      const p = this.buildPath(this.pts);
      this.preview?.remove();
      this.preview = p;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private buildPath(pts: Pt[]): paper.Path {
    const outline = getStroke(
      pts.map((p) => [p.x, p.y, p.pressure]),
      {
        // ズームしても線の太さが画面上でなくキャンバス上で一定になるよう project 座標で生成
        size: this.settings.size,
        thinning: 0.6,       // 筆圧→太さの効き
        smoothing: 0.5,
        streamline: 0.5,     // 手ぶれ補正
        simulatePressure: pts.every((p) => p.pressure === 0.5), // マウス等、筆圧なし入力のとき
      },
    );
    const path = new paper.Path({
      segments: outline.map(([x, y]) => new paper.Point(x, y)),
      closed: true,
      fillColor: this.settings.color,
      insert: true,
    });
    return path;
  }
}
