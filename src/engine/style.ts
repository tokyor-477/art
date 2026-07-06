import paper from "paper";
import type { Style } from "../tools/types";

/** 塗り色を生成(単色 or 線形/円形グラデーション。グラデはアイテムのboundsに合わせる) */
export function makeFillColor(s: Style, bounds: paper.Rectangle): paper.Color | null {
  if (!s.fill) return null;
  if (s.fillType === "solid") return new paper.Color(s.fill);
  return new paper.Color({
    gradient: {
      stops: [s.fill, s.fill2],
      radial: s.fillType === "radial",
    },
    origin: s.fillType === "radial" ? bounds.center : bounds.leftCenter,
    destination: bounds.rightCenter,
  });
}

/** 現在スタイルをアイテムに適用(テキストは塗りのみ意味を持つ) */
export function applyStyle(item: paper.Item, s: Style) {
  if (!(item instanceof paper.PointText)) {
    item.strokeColor = s.stroke ? new paper.Color(s.stroke) : null;
    item.strokeWidth = s.stroke ? s.strokeWidth : 0;
    item.strokeCap = s.cap;
    item.strokeJoin = s.join;
    item.dashArray = s.dash && s.stroke ? [s.strokeWidth * 3, s.strokeWidth * 2] : [];
  }
  item.fillColor = makeFillColor(s, item.bounds);
  item.opacity = s.opacity;
  item.blendMode = s.blend;
}
