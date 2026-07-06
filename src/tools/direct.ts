import paper from "paper";
import type { Tool } from "./types";
import { isGui, clearGui } from "../engine/gui";

type Drag =
  | { seg: paper.Segment; kind: "point" | "handle-in" | "handle-out" }
  | null;

// ダイレクト選択: パスをタップで全アンカー表示、
// アンカーをドラッグで移動、ハンドルをドラッグで曲率編集。
export class DirectSelectTool implements Tool {
  private path: paper.Path | null = null;
  private drag: Drag = null;
  private changed = false;

  constructor(private onCommit: () => void) {}

  begin(x: number, y: number) {
    const pt = new paper.Point(x, y);
    const tol = 12 / paper.view.zoom;
    this.changed = false;

    // 編集中パスのアンカー/ハンドル判定
    if (this.path?.isInserted()) {
      for (const seg of this.path.segments) {
        if (pt.getDistance(seg.point) < tol) { this.drag = { seg, kind: "point" }; return; }
        if (pt.getDistance(seg.point.add(seg.handleIn)) < tol && !seg.handleIn.isZero()) {
          this.drag = { seg, kind: "handle-in" }; return;
        }
        if (pt.getDistance(seg.point.add(seg.handleOut)) < tol && !seg.handleOut.isZero()) {
          this.drag = { seg, kind: "handle-out" }; return;
        }
      }
    }

    // パス選択
    const hit = paper.project.hitTest(pt, {
      fill: true, stroke: true, tolerance: tol,
      match: (r: paper.HitResult) => !isGui(r.item) && r.item instanceof paper.Path,
    });
    this.select(hit?.item instanceof paper.Path ? hit.item : null);
  }

  move(x: number, y: number) {
    if (!this.drag) return;
    const pt = new paper.Point(x, y);
    const { seg, kind } = this.drag;
    if (kind === "point") {
      seg.point = pt;
    } else if (kind === "handle-in") {
      seg.handleIn = pt.subtract(seg.point);
    } else {
      seg.handleOut = pt.subtract(seg.point);
    }
    this.changed = true;
  }

  end() {
    this.drag = null;
    if (this.changed) this.onCommit();
    this.changed = false;
  }

  cancel() { this.end(); }

  deactivate() { this.select(null); }

  reset() { this.path = null; this.drag = null; }

  /** 選択中パス(スムーズ/簡略化の対象) */
  current(): paper.Path | null {
    return this.path?.isInserted() ? this.path : null;
  }

  private select(path: paper.Path | null) {
    if (this.path?.isInserted()) this.path.fullySelected = false;
    this.path = path;
    if (path) path.fullySelected = true; // 全アンカー+ハンドル表示
    clearGui();
  }
}
