import paper from "paper";
import type { Tool, Style } from "./types";

export type ShapeKind = "rect" | "ellipse" | "line" | "polygon" | "star";

// ドラッグでシェイプを作るツール。rect/ellipse/line は対角ドラッグ、
// polygon/star は中心からドラッグ(Illustrator流)。
// ponytail: 多角形=6角・星=5芒で固定。辺数UIは要望が出たら追加。
export class ShapeTool implements Tool {
  private start: paper.Point | null = null;
  private item: paper.Item | null = null;

  constructor(
    private kind: ShapeKind,
    private getStyle: () => Style,
    private onCommit: () => void,
  ) {}

  begin(x: number, y: number) {
    this.start = new paper.Point(x, y);
  }

  move(x: number, y: number) {
    if (!this.start) return;
    this.item?.remove();
    this.item = this.build(this.start, new paper.Point(x, y));
  }

  end() {
    this.start = null;
    if (!this.item) return;
    // 誤タップ(極小シェイプ)は捨てる
    if (this.item.bounds.width < 2 && this.item.bounds.height < 2) {
      this.item.remove();
    } else {
      this.onCommit();
    }
    this.item = null;
  }

  cancel() {
    this.item?.remove();
    this.item = null;
    this.start = null;
  }

  private build(a: paper.Point, b: paper.Point): paper.Item {
    const s = this.getStyle();
    let item: paper.Path;
    switch (this.kind) {
      case "rect":
        item = new paper.Path.Rectangle(a, b);
        break;
      case "ellipse":
        item = new paper.Path.Ellipse(new paper.Rectangle(a, b));
        break;
      case "line":
        item = new paper.Path.Line(a, b);
        break;
      case "polygon":
        item = new paper.Path.RegularPolygon(a, 6, a.getDistance(b));
        item.rotate(b.subtract(a).angle + 90, a); // ドラッグ方向に頂点を向ける
        break;
      case "star": {
        const r = a.getDistance(b);
        item = new paper.Path.Star(a, 5, r * 0.45, r);
        item.rotate(b.subtract(a).angle + 90, a);
        break;
      }
    }
    if (this.kind === "line") {
      // 直線は塗り不可。線が無効なら塗り色を線として使う
      item.strokeColor = new paper.Color(s.stroke ?? s.fill ?? "#000");
      item.strokeWidth = s.strokeWidth;
    } else {
      item.fillColor = s.fill ? new paper.Color(s.fill) : null;
      item.strokeColor = s.stroke ? new paper.Color(s.stroke) : null;
      item.strokeWidth = s.stroke ? s.strokeWidth : 0;
    }
    item.strokeCap = s.cap;
    item.strokeJoin = s.join;
    return item;
  }
}
