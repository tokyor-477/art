import paper from "paper";
import type { Tool } from "./types";
import { guiLayer, clearGui, isGui } from "../engine/gui";

type Mode = "move" | "scale" | "rotate" | null;

// 選択+変形ツール: タップで選択、ドラッグで移動、
// 角ハンドルで拡大縮小(対角を支点に等比)、上部ハンドルで回転。
// ponytail: 単一選択のみ。複数選択(ラバーバンド)は必要になったら。
export class SelectTool implements Tool {
  private item: paper.Item | null = null;
  private mode: Mode = null;
  private last: paper.Point | null = null;
  private pivot: paper.Point | null = null;
  private changed = false;

  constructor(private onCommit: () => void) {}

  begin(x: number, y: number) {
    const pt = new paper.Point(x, y);
    this.last = pt;
    this.changed = false;
    const tol = 12 / paper.view.zoom;

    // 1. ハンドル判定(選択中のみ)
    if (this.item) {
      const b = this.item.bounds;
      const corners = [b.topLeft, b.topRight, b.bottomRight, b.bottomLeft];
      for (let i = 0; i < 4; i++) {
        if (pt.getDistance(corners[i]) < tol) {
          this.mode = "scale";
          this.pivot = corners[(i + 2) % 4]; // 対角が支点
          return;
        }
      }
      if (pt.getDistance(this.rotateHandlePos(b)) < tol) {
        this.mode = "rotate";
        this.pivot = b.center;
        return;
      }
    }

    // 2. アイテム判定
    const hit = paper.project.hitTest(pt, {
      fill: true, stroke: true, tolerance: tol,
      match: (h: paper.HitResult) => !isGui(h.item),
    });
    if (hit?.item) {
      // レイヤー直下の子まで遡る(パスのままでOK、グループ対応はPhase 2)
      let item = hit.item;
      while (item.parent && !(item.parent instanceof paper.Layer)) item = item.parent;
      this.select(item);
      this.mode = "move";
    } else {
      this.select(null);
      this.mode = null;
    }
  }

  move(x: number, y: number) {
    if (!this.item || !this.mode || !this.last) return;
    const pt = new paper.Point(x, y);
    switch (this.mode) {
      case "move":
        this.item.translate(pt.subtract(this.last));
        break;
      case "scale": {
        const d0 = this.last.getDistance(this.pivot!);
        const d1 = pt.getDistance(this.pivot!);
        if (d0 > 1e-6) this.item.scale(d1 / d0, this.pivot!);
        break;
      }
      case "rotate": {
        const a0 = this.last.subtract(this.pivot!).angle;
        const a1 = pt.subtract(this.pivot!).angle;
        this.item.rotate(a1 - a0, this.pivot!);
        break;
      }
    }
    this.last = pt;
    this.changed = true;
    this.drawHandles();
  }

  end() {
    this.mode = null;
    if (this.changed) this.onCommit();
    this.changed = false;
  }

  cancel() { this.end(); }

  deactivate() { this.select(null); }

  /** 履歴restore後などアイテム参照が無効になったとき */
  reset() {
    this.item = null;
    this.mode = null;
    clearGui();
  }

  private select(item: paper.Item | null) {
    if (this.item) this.item.selected = false;
    this.item = item;
    if (item) item.selected = true;
    this.drawHandles();
  }

  private rotateHandlePos(b: paper.Rectangle): paper.Point {
    return b.topCenter.subtract(new paper.Point(0, 36 / paper.view.zoom));
  }

  private drawHandles() {
    clearGui();
    if (!this.item) return;
    const prev = paper.project.activeLayer;
    guiLayer().activate();
    const b = this.item.bounds;
    const z = paper.view.zoom;
    const size = 12 / z;
    for (const c of [b.topLeft, b.topRight, b.bottomRight, b.bottomLeft]) {
      const r = new paper.Path.Rectangle(
        new paper.Rectangle(c.subtract(size / 2), new paper.Size(size, size)),
      );
      r.fillColor = new paper.Color("#fff");
      r.strokeColor = new paper.Color("#2563eb");
      r.strokeWidth = 1.5 / z;
    }
    new paper.Path.Circle({
      center: this.rotateHandlePos(b), radius: size / 2,
      fillColor: "#2563eb",
    });
    prev.activate();
  }
}
