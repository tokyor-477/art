import paper from "paper";

// 選択ハンドル等のGUI表示専用レイヤー。ドキュメント(保存/書き出し/履歴)には含めない。
let layer: paper.Layer | null = null;

export function guiLayer(): paper.Layer {
  if (!layer || !layer.project) {
    const prev = paper.project.activeLayer;
    layer = new paper.Layer();
    layer.name = "__gui";
    prev?.activate(); // new Layer() は自動でactiveになるので戻す
  }
  return layer;
}

export function clearGui() {
  layer?.removeChildren();
}

export function resetGui() {
  layer = null; // project.clear() 後に呼ぶ(参照が死んでいるため)
}

/** GUIレイヤーを一時的に外して fn を実行(exportJSON / exportSVG 用) */
export function withGuiHidden<T>(fn: () => T): T {
  const l = layer && layer.project ? layer : null;
  l?.remove();
  try {
    return fn();
  } finally {
    if (l) paper.project.addLayer(l);
  }
}

export const isGui = (item: paper.Item) => item.layer?.name === "__gui";
