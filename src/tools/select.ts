import paper from "paper";
import type { Tool } from "./types";
import { guiLayer, clearGui, isGui } from "../engine/gui";
import {
  getSelection, setSelection, clearSelection, selectionBounds,
} from "../engine/selection";
import { drawSelectionHandles, hitHandle } from "../engine/handles";
import { docLayers } from "../ui/panels";

type Mode = "move" | "scale" | "rotate" | "marquee" | null;

const SNAP = 7; // 画面px単位のスナップ距離

// 選択+変形ツール:
//   タップ=単一選択 / 空白ドラッグ=マーキーで複数選択
//   ドラッグ=移動(他オブジェクトの端・中心にスナップ、ガイド線表示)
//   角ハンドル=対角支点の等比拡縮 / 上ハンドル=回転
export class SelectTool implements Tool {
  private mode: Mode = null;
  private last: paper.Point | null = null;
  private origin: paper.Point | null = null;
  private pivot: paper.Point | null = null;
  private marqueeRect: paper.Path | null = null;
  private changed = false;

  constructor(private onCommit: () => void) {}

  begin(x: number, y: number) {
    const pt = new paper.Point(x, y);
    this.last = pt;
    this.origin = pt;
    this.changed = false;

    // 1. ハンドル
    const h = hitHandle(pt);
    if (h) {
      this.mode = h.kind;
      this.pivot = h.pivot;
      return;
    }

    // 2. アイテム
    const hit = paper.project.hitTest(pt, {
      fill: true, stroke: true, tolerance: 12 / paper.view.zoom,
      match: (r: paper.HitResult) => !isGui(r.item),
    });
    if (hit?.item) {
      let item = hit.item;
      while (item.parent && !(item.parent instanceof paper.Layer)) item = item.parent;
      // 選択済みアイテムをタップ → 選択全体を移動。未選択 → 単一選択に切替
      if (!getSelection().includes(item)) setSelection([item]);
      this.mode = "move";
      drawSelectionHandles();
    } else {
      clearSelection();
      clearGui();
      this.mode = "marquee";
    }
  }

  move(x: number, y: number) {
    if (!this.mode || !this.last || !this.origin) return;
    let pt = new paper.Point(x, y);
    const items = getSelection();

    switch (this.mode) {
      case "move": {
        let delta = pt.subtract(this.last);
        delta = this.applySnap(delta);
        for (const it of items) it.translate(delta);
        this.last = this.last.add(delta);
        this.changed = true;
        drawSelectionHandles();
        this.drawSnapGuides();
        return; // lastは自前更新済み
      }
      case "scale": {
        const d0 = this.last.getDistance(this.pivot!);
        const d1 = pt.getDistance(this.pivot!);
        if (d0 > 1e-6) for (const it of items) it.scale(d1 / d0, this.pivot!);
        this.changed = true;
        drawSelectionHandles();
        break;
      }
      case "rotate": {
        const a0 = this.last.subtract(this.pivot!).angle;
        const a1 = pt.subtract(this.pivot!).angle;
        for (const it of items) it.rotate(a1 - a0, this.pivot!);
        this.changed = true;
        drawSelectionHandles();
        break;
      }
      case "marquee": {
        this.marqueeRect?.remove();
        const prev = paper.project.activeLayer;
        guiLayer().activate();
        this.marqueeRect = new paper.Path.Rectangle(new paper.Rectangle(this.origin, pt));
        this.marqueeRect.strokeColor = new paper.Color("#2563eb");
        this.marqueeRect.strokeWidth = 1 / paper.view.zoom;
        this.marqueeRect.dashArray = [4 / paper.view.zoom, 4 / paper.view.zoom];
        prev.activate();
        break;
      }
    }
    this.last = pt;
  }

  end() {
    if (this.mode === "marquee" && this.origin && this.last) {
      const rect = new paper.Rectangle(this.origin, this.last);
      this.marqueeRect?.remove();
      this.marqueeRect = null;
      if (rect.width > 2 || rect.height > 2) {
        const hits: paper.Item[] = [];
        for (const layer of docLayers()) {
          if (!layer.visible) continue;
          for (const child of layer.children) {
            if (child.bounds.intersects(rect)) hits.push(child);
          }
        }
        setSelection(hits);
        drawSelectionHandles();
      }
    }
    this.mode = null;
    clearSnapGuides();
    if (this.changed) this.onCommit();
    this.changed = false;
  }

  cancel() { this.end(); }

  deactivate() { this.reset(); }

  /** 履歴restore後などアイテム参照が無効になったとき */
  reset() {
    clearSelection();
    this.mode = null;
    this.marqueeRect = null;
    clearGui();
  }

  // --- スナップ(スマートガイド) ---

  private snapLines: { x?: number; y?: number } = {};

  /** 移動deltaを他オブジェクトの端・中心に吸着させる */
  private applySnap(delta: paper.Point): paper.Point {
    this.snapLines = {};
    const b = selectionBounds();
    if (!b) return delta;
    const moved = new paper.Rectangle(b.point.add(delta), b.size);
    const tol = SNAP / paper.view.zoom;
    const selected = new Set(getSelection());

    let bestX: { diff: number; line: number } | null = null;
    let bestY: { diff: number; line: number } | null = null;
    for (const layer of docLayers()) {
      if (!layer.visible) continue;
      for (const other of layer.children) {
        if (selected.has(other)) continue;
        const ob = other.bounds;
        for (const ox of [ob.left, ob.center.x, ob.right]) {
          for (const mx of [moved.left, moved.center.x, moved.right]) {
            const diff = ox - mx;
            if (Math.abs(diff) < tol && (!bestX || Math.abs(diff) < Math.abs(bestX.diff))) {
              bestX = { diff, line: ox };
            }
          }
        }
        for (const oy of [ob.top, ob.center.y, ob.bottom]) {
          for (const my of [moved.top, moved.center.y, moved.bottom]) {
            const diff = oy - my;
            if (Math.abs(diff) < tol && (!bestY || Math.abs(diff) < Math.abs(bestY.diff))) {
              bestY = { diff, line: oy };
            }
          }
        }
      }
    }
    if (bestX) { delta = delta.add(new paper.Point(bestX.diff, 0)); this.snapLines.x = bestX.line; }
    if (bestY) { delta = delta.add(new paper.Point(0, bestY.diff)); this.snapLines.y = bestY.line; }
    return delta;
  }

  private drawSnapGuides() {
    // ハンドル描画(clearGui済み)の上にガイド線を追加
    const prev = paper.project.activeLayer;
    guiLayer().activate();
    const v = paper.view.bounds;
    const mk = (from: paper.Point, to: paper.Point) => {
      const l = new paper.Path.Line(from, to);
      l.strokeColor = new paper.Color("#f0f");
      l.strokeWidth = 1 / paper.view.zoom;
    };
    if (this.snapLines.x !== undefined) {
      mk(new paper.Point(this.snapLines.x, v.top), new paper.Point(this.snapLines.x, v.bottom));
    }
    if (this.snapLines.y !== undefined) {
      mk(new paper.Point(v.left, this.snapLines.y), new paper.Point(v.right, this.snapLines.y));
    }
    prev.activate();
  }
}

function clearSnapGuides() {
  drawSelectionHandles(); // ガイドを消してハンドルだけ描き直す
}
