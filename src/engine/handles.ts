import paper from "paper";
import { guiLayer, clearGui } from "./gui";
import { selectionBounds } from "./selection";

export type HandleHit =
  | { kind: "scale"; pivot: paper.Point }
  | { kind: "rotate"; pivot: paper.Point }
  | null;

const rotateHandlePos = (b: paper.Rectangle) =>
  b.topCenter.subtract(new paper.Point(0, 36 / paper.view.zoom));

/** 選択全体のバウンディングボックス+ハンドルをGUIレイヤーに描く */
export function drawSelectionHandles() {
  clearGui();
  const b = selectionBounds();
  if (!b) return;
  const prev = paper.project.activeLayer;
  guiLayer().activate();
  const z = paper.view.zoom;
  const size = 12 / z;

  const box = new paper.Path.Rectangle(b);
  box.strokeColor = new paper.Color("#2563eb");
  box.strokeWidth = 1 / z;
  box.dashArray = [4 / z, 4 / z];

  for (const c of [b.topLeft, b.topRight, b.bottomRight, b.bottomLeft]) {
    const r = new paper.Path.Rectangle(
      new paper.Rectangle(c.subtract(size / 2), new paper.Size(size, size)),
    );
    r.fillColor = new paper.Color("#fff");
    r.strokeColor = new paper.Color("#2563eb");
    r.strokeWidth = 1.5 / z;
  }
  const rot = new paper.Path.Circle({ center: rotateHandlePos(b), radius: size / 2 });
  rot.fillColor = new paper.Color("#2563eb");
  prev.activate();
}

/** ハンドルのヒット判定(scale: 対角が支点 / rotate: 中心が支点) */
export function hitHandle(pt: paper.Point): HandleHit {
  const b = selectionBounds();
  if (!b) return null;
  const tol = 14 / paper.view.zoom;
  const corners = [b.topLeft, b.topRight, b.bottomRight, b.bottomLeft];
  for (let i = 0; i < 4; i++) {
    if (pt.getDistance(corners[i]) < tol) return { kind: "scale", pivot: corners[(i + 2) % 4] };
  }
  if (pt.getDistance(rotateHandlePos(b)) < tol) return { kind: "rotate", pivot: b.center };
  return null;
}
