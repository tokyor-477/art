import paper from "paper";
import { getSelection, setSelection, selectionBounds } from "../engine/selection";
import { drawSelectionHandles } from "../engine/handles";

// 選択アイテムに対するアクション(パスファインダー・整列・グループ等)。
// 全ボタンは index.html の #actions 行にあり、ここで一括配線する。

let commit: () => void = () => {};
let clipboard: string[] = []; // アプリ内クリップボード(exportJSONの配列)

const $ = (id: string) => document.getElementById(id) as HTMLButtonElement;

export function setupActions(onCommit: () => void) {
  commit = onCommit;

  $("act-group").onclick = group;
  $("act-ungroup").onclick = ungroup;
  $("act-unite").onclick = () => boolOp("unite");
  $("act-subtract").onclick = () => boolOp("subtract");
  $("act-intersect").onclick = () => boolOp("intersect");
  $("act-exclude").onclick = () => boolOp("exclude");
  $("act-mask").onclick = clipMask;
  $("act-dup").onclick = duplicate;
  $("act-copy").onclick = copy;
  $("act-paste").onclick = paste;
  $("act-delete").onclick = removeSelected;
  $("act-flip-h").onclick = () => flip(-1, 1);
  $("act-flip-v").onclick = () => flip(1, -1);
  $("act-shear-h").onclick = () => shear(0.25, 0);
  $("act-shear-v").onclick = () => shear(0, 0.25);
  $("act-smooth").onclick = smooth;
  $("act-simplify").onclick = simplify;

  const aligns: Record<string, (b: paper.Rectangle, ib: paper.Rectangle) => paper.Point> = {
    "align-l": (b, ib) => new paper.Point(b.left - ib.left, 0),
    "align-cx": (b, ib) => new paper.Point(b.center.x - ib.center.x, 0),
    "align-r": (b, ib) => new paper.Point(b.right - ib.right, 0),
    "align-t": (b, ib) => new paper.Point(0, b.top - ib.top),
    "align-cy": (b, ib) => new paper.Point(0, b.center.y - ib.center.y),
    "align-b": (b, ib) => new paper.Point(0, b.bottom - ib.bottom),
  };
  for (const [id, fn] of Object.entries(aligns)) {
    $(`act-${id}`).onclick = () => align(fn);
  }
  $("act-dist-h").onclick = () => distribute("x");
  $("act-dist-v").onclick = () => distribute("y");
}

function done() {
  drawSelectionHandles();
  commit();
}

// --- グループ ---

function group() {
  const items = getSelection();
  if (items.length < 2) return;
  items.sort((a, b) => a.index - b.index);
  const g = new paper.Group(items);
  setSelection([g]);
  done();
}

function ungroup() {
  const next: paper.Item[] = [];
  for (const it of getSelection()) {
    if (it instanceof paper.Group && !(it instanceof paper.Layer)) {
      const children = [...it.children];
      it.parent!.insertChildren(it.index, children);
      it.remove();
      next.push(...children);
    } else {
      next.push(it);
    }
  }
  setSelection(next);
  done();
}

// --- パスファインダー(背面→前面の順に適用、スタイルは最背面を継承) ---

function boolOp(op: "unite" | "subtract" | "intersect" | "exclude") {
  const paths = getSelection().filter((i): i is paper.PathItem => i instanceof paper.PathItem);
  if (paths.length < 2) return;
  paths.sort((a, b) => a.index - b.index);
  let acc = paths[0];
  for (let i = 1; i < paths.length; i++) {
    const result = acc[op](paths[i]) as paper.PathItem;
    acc.remove();
    paths[i].remove();
    acc = result;
  }
  setSelection([acc]);
  done();
}

// --- クリッピングマスク(最前面のパスがマスクになる) ---

function clipMask() {
  const items = getSelection();
  if (items.length < 2) return;
  items.sort((a, b) => a.index - b.index);
  const mask = items[items.length - 1]; // 最前面
  const rest = items.slice(0, -1);
  const g = new paper.Group([mask, ...rest]); // 先頭の子がクリップ形状
  g.clipped = true;
  setSelection([g]);
  done();
}

// --- 複製・コピペ・削除 ---

function duplicate() {
  const offset = new paper.Point(20, 20).divide(paper.view.zoom);
  const clones = getSelection().map((it) => {
    const c = it.clone();
    c.translate(offset);
    return c;
  });
  if (!clones.length) return;
  setSelection(clones);
  done();
}

function copy() {
  clipboard = getSelection().map((it) => it.exportJSON());
}

function paste() {
  if (!clipboard.length) return;
  const offset = new paper.Point(20, 20).divide(paper.view.zoom);
  const items = clipboard.map((json) => {
    const it = paper.project.activeLayer.importJSON(json) as paper.Item;
    it.translate(offset);
    return it;
  });
  setSelection(items);
  done();
}

function removeSelected() {
  const items = getSelection();
  if (!items.length) return;
  for (const it of items) it.remove();
  setSelection([]);
  done();
}

// --- 変形 ---

function flip(sx: number, sy: number) {
  const b = selectionBounds();
  if (!b) return;
  for (const it of getSelection()) it.scale(sx, sy, b.center);
  done();
}

function shear(hor: number, ver: number) {
  const b = selectionBounds();
  if (!b) return;
  for (const it of getSelection()) it.shear(hor, ver, b.center);
  done();
}

// --- 整列・分布 ---

function align(offsetOf: (b: paper.Rectangle, ib: paper.Rectangle) => paper.Point) {
  const items = getSelection();
  const b = selectionBounds();
  if (items.length < 2 || !b) return;
  for (const it of items) it.translate(offsetOf(b, it.bounds));
  done();
}

function distribute(axis: "x" | "y") {
  const items = [...getSelection()];
  if (items.length < 3) return;
  items.sort((a, b) => a.bounds.center[axis] - b.bounds.center[axis]);
  const first = items[0].bounds.center[axis];
  const last = items[items.length - 1].bounds.center[axis];
  const step = (last - first) / (items.length - 1);
  items.forEach((it, i) => {
    const target = first + step * i;
    const d = target - it.bounds.center[axis];
    it.translate(axis === "x" ? new paper.Point(d, 0) : new paper.Point(0, d));
  });
  done();
}

// --- パス編集 ---

function pathsInSelection(): paper.Path[] {
  return getSelection().filter((i): i is paper.Path => i instanceof paper.Path);
}

function smooth() {
  const paths = pathsInSelection();
  if (!paths.length) return;
  for (const p of paths) p.smooth({ type: "catmull-rom", factor: 0.5 });
  done();
}

function simplify() {
  const paths = pathsInSelection();
  if (!paths.length) return;
  for (const p of paths) p.simplify(2.5 / paper.view.zoom);
  done();
}
