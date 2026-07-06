import paper from "paper";

// 選択状態の一元管理。ツール・アクション・スタイルパネルが共有する。
let items: paper.Item[] = [];
let listener: (() => void) | null = null;

export function getSelection(): paper.Item[] {
  // 削除済みアイテムを除外(ブール演算後など)
  items = items.filter((i) => i.isInserted());
  return items;
}

export function setSelection(list: paper.Item[]) {
  for (const it of items) { it.selected = false; if (it instanceof paper.Path) it.fullySelected = false; }
  items = list.filter((i) => i.isInserted());
  for (const it of items) it.selected = true;
  listener?.();
}

export const clearSelection = () => setSelection([]);

/** 選択変更後のハンドル再描画フック(mainが配線) */
export function onSelectionChange(fn: () => void) {
  listener = fn;
}

export function notifySelectionChange() {
  listener?.();
}

/** 選択全体の外接矩形 */
export function selectionBounds(): paper.Rectangle | null {
  const list = getSelection();
  if (!list.length) return null;
  return list.reduce((r: paper.Rectangle | null, i) => (r ? r.unite(i.bounds) : i.bounds), null);
}
