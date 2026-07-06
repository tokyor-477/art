import paper from "paper";
import type { Tool, Style } from "./types";
import { isGui } from "../engine/gui";

// テキストツール(ポイント文字): 空白タップで新規作成、既存テキストをタップで内容編集。
// ponytail: 入力UIは prompt()。インライン編集は要望が出たら。
export class TextTool implements Tool {
  constructor(
    private getStyle: () => Style,
    private getFontSize: () => number,
    private onCommit: () => void,
  ) {}

  begin(x: number, y: number) {
    const pt = new paper.Point(x, y);
    const hit = paper.project.hitTest(pt, {
      fill: true, class: paper.PointText, tolerance: 12 / paper.view.zoom,
      match: (r: paper.HitResult) => !isGui(r.item),
    });

    if (hit?.item instanceof paper.PointText) {
      const t = prompt("テキストを編集", hit.item.content);
      if (t === null) return;
      if (t === "") hit.item.remove();
      else hit.item.content = t;
      this.onCommit();
      return;
    }

    const t = prompt("テキストを入力");
    if (!t) return;
    const s = this.getStyle();
    const text = new paper.PointText(pt);
    text.content = t;
    text.fontSize = this.getFontSize();
    text.fillColor = new paper.Color(s.fill ?? "#000");
    text.fontFamily = "-apple-system, system-ui, sans-serif";
    this.onCommit();
  }

  move() {}
  end() {}
  cancel() {}
}
