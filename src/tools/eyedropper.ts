import paper from "paper";
import type { Tool } from "./types";
import { isGui } from "../engine/gui";

// スポイト: タップしたアイテムの塗り/線色をパネルに取り込む。
export class EyedropperTool implements Tool {
  constructor(private onPick: (fill: string | null, stroke: string | null) => void) {}

  begin(x: number, y: number) {
    const hit = paper.project.hitTest(new paper.Point(x, y), {
      fill: true, stroke: true, tolerance: 8 / paper.view.zoom,
      match: (h: paper.HitResult) => !isGui(h.item),
    });
    if (!hit?.item) return;
    const css = (c: paper.Color | null) => (c ? c.toCSS(true) : null);
    this.onPick(css(hit.item.fillColor), css(hit.item.strokeColor));
  }

  move() {}
  end() {}
  cancel() {}
}
