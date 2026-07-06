import paper from "paper";
import { getStroke } from "perfect-freehand";
import type { Tool } from "./types";
import { isGui } from "../engine/gui";
import { docLayers } from "../ui/panels";

interface Pt { x: number; y: number; pressure: number }

// ベクター消しゴム:
//   閉じたパス/塗りパス → 消しゴム領域をブーリアン減算(部分消し)
//   開いたパス・テキスト・グループ等 → 触れたら丸ごと削除
// ponytail: 開パスの部分消し(分割)は複雑なので非対応。要望が出たら。
export class Eraser implements Tool {
  private pts: Pt[] = [];
  private preview: paper.Path | null = null;

  constructor(
    private getSize: () => number,
    private onCommit: () => void,
  ) {}

  begin(x: number, y: number, pressure: number) {
    this.pts = [{ x, y, pressure }];
  }

  move(x: number, y: number, pressure: number) {
    if (!this.pts.length) return;
    this.pts.push({ x, y, pressure });
    this.preview?.remove();
    this.preview = this.outline();
    this.preview.fillColor = new paper.Color(1, 0.3, 0.3, 0.35); // 半透明の赤で消去範囲を見せる
  }

  end() {
    this.preview?.remove();
    this.preview = null;
    if (this.pts.length < 2) { this.pts = []; return; }
    const eraser = this.outline();
    eraser.remove(); // ドキュメントには入れない
    let changed = false;

    for (const layer of docLayers()) {
      if (!layer.visible || layer.locked) continue;
      for (const child of [...layer.children]) {
        if (isGui(child) || child.locked) continue;
        if (!child.bounds.intersects(eraser.bounds)) continue;

        if (child instanceof paper.Path && child.closed) {
          const r = child.subtract(eraser, { insert: false }) as paper.PathItem;
          child.replaceWith(r);
          if (r.isEmpty()) r.remove();
          changed = true;
        } else if (child instanceof paper.CompoundPath) {
          const r = child.subtract(eraser, { insert: false }) as paper.PathItem;
          child.replaceWith(r);
          if (r.isEmpty()) r.remove();
          changed = true;
        } else if (child instanceof paper.Path) {
          // 開いたパスは交差していたら丸ごと削除
          if (child.intersects(eraser)) { child.remove(); changed = true; }
        } else if (eraser.contains(child.bounds.center) || child.bounds.intersects(eraser.bounds)) {
          // テキスト・グループ・シンボル等は触れたら削除
          if (this.touches(child, eraser)) { child.remove(); changed = true; }
        }
      }
    }
    this.pts = [];
    if (changed) this.onCommit();
  }

  cancel() {
    this.preview?.remove();
    this.preview = null;
    this.pts = [];
  }

  /** 消しゴムストロークの輪郭ポリゴン(閉パス) */
  private outline(): paper.Path {
    const size = this.getSize() * 2; // ブラシより太めが使いやすい
    const outline = getStroke(
      this.pts.map((p) => [p.x, p.y, p.pressure]),
      { size, thinning: 0, smoothing: 0.5, streamline: 0.4 },
    );
    return new paper.Path({
      segments: outline.map(([x, y]) => new paper.Point(x, y)),
      closed: true,
      insert: true,
    });
  }

  /** バウンディングボックスだけでなく実形状で当たりを取る(粗い誤爆防止) */
  private touches(item: paper.Item, eraser: paper.Path): boolean {
    if (eraser.contains(item.bounds.center)) return true;
    const corners = [
      item.bounds.topLeft, item.bounds.topRight,
      item.bounds.bottomLeft, item.bounds.bottomRight,
    ];
    return corners.some((c) => eraser.contains(c));
  }
}
