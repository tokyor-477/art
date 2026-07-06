import paper from "paper";
import type { Tool, Style } from "./types";

// ベジェペンツール: タップでアンカー追加、ドラッグでハンドルを引き出す。
// 始点をタップで閉じて確定。ツール切替でも確定。
// 描画途中はアンカーをドラッグして位置修正できる。
export class PenTool implements Tool {
  private path: paper.Path | null = null;
  private dragSeg: paper.Segment | null = null;
  private dragMode: "handles" | "anchor" = "handles";

  constructor(
    private getStyle: () => Style,
    private onCommit: () => void,
  ) {}

  begin(x: number, y: number) {
    const pt = new paper.Point(x, y);
    const tol = 12 / paper.view.zoom;

    if (this.path) {
      // 始点タップ → パスを閉じて確定
      if (this.path.segments.length > 1 && pt.getDistance(this.path.firstSegment.point) < tol) {
        this.path.closed = true;
        this.finish();
        return;
      }
      // 既存アンカーをタップ → 位置修正モード
      for (const seg of this.path.segments) {
        if (pt.getDistance(seg.point) < tol) {
          this.dragSeg = seg;
          this.dragMode = "anchor";
          return;
        }
      }
      this.dragSeg = this.path.add(pt) as paper.Segment;
      this.dragMode = "handles";
    } else {
      const s = this.getStyle();
      this.path = new paper.Path({
        strokeColor: s.stroke ?? s.fill ?? "#000",
        strokeWidth: s.strokeWidth,
        strokeCap: s.cap,
        strokeJoin: s.join,
        // 塗りは確定時に付ける(作画中に塗られると見づらい)
      });
      this.path.selected = true; // アンカー・ハンドルを表示
      this.dragSeg = this.path.add(pt) as paper.Segment;
      this.dragMode = "handles";
    }
  }

  move(x: number, y: number) {
    if (!this.dragSeg) return;
    const pt = new paper.Point(x, y);
    if (this.dragMode === "anchor") {
      this.dragSeg.point = pt;
    } else {
      // ドラッグでハンドルを引き出す(対称ハンドル=スムーズポイント)
      const v = pt.subtract(this.dragSeg.point);
      this.dragSeg.handleOut = v;
      this.dragSeg.handleIn = v.multiply(-1);
    }
  }

  end() { this.dragSeg = null; }

  cancel() { this.dragSeg = null; }

  deactivate() { this.finish(); }

  /** パス確定 */
  finish() {
    if (!this.path) return;
    this.path.selected = false;
    if (this.path.segments.length < 2) {
      this.path.remove();
    } else {
      const s = this.getStyle();
      if (this.path.closed && s.fill) this.path.fillColor = new paper.Color(s.fill);
      this.onCommit();
    }
    this.path = null;
    this.dragSeg = null;
  }
}
