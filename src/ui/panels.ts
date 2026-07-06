import paper from "paper";

// レイヤーパネル + ツールバーの配線。素のDOMで十分な規模なのでフレームワークなし。
export interface PanelCallbacks {
  onUndo(): void;
  onRedo(): void;
  onDocChange(): void; // レイヤー操作後(履歴snapshot用)
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let layerSeq = 1;

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function setupPanels(cb: PanelCallbacks) {
  $("undo").onclick = cb.onUndo;
  $("redo").onclick = cb.onRedo;

  $("clear").onclick = () => {
    if (!confirm("すべて消去しますか?")) return;
    paper.project.activeLayer.removeChildren();
    cb.onDocChange();
  };

  $("export-svg").onclick = () => {
    const svg = paper.project.exportSVG({ asString: true, bounds: "content" }) as string;
    download(new Blob([svg], { type: "image/svg+xml" }), "drawing.svg");
  };

  $("export-png").onclick = () => {
    (paper.view.element as HTMLCanvasElement).toBlob((b) => {
      if (b) download(b, "drawing.png");
    });
  };

  $("layer-add").onclick = () => {
    const layer = new paper.Layer();
    layer.name = `レイヤー ${++layerSeq}`;
    layer.activate();
    refreshLayers();
    cb.onDocChange();
  };

  $("layer-del").onclick = () => {
    if (paper.project.layers.length <= 1) return;
    paper.project.activeLayer.remove();
    paper.project.layers[paper.project.layers.length - 1].activate();
    refreshLayers();
    cb.onDocChange();
  };

  const size = $<HTMLInputElement>("size");
  size.oninput = () => { $("size-label").textContent = size.value; };

  refreshLayers();
}

export function currentColor(): string {
  return $<HTMLInputElement>("color").value;
}
export function currentSize(): number {
  return Number($<HTMLInputElement>("size").value);
}

/** レイヤーリストを描き直す(状態はpaper.projectが唯一の真実) */
export function refreshLayers() {
  const list = $("layer-list");
  list.innerHTML = "";
  for (const layer of paper.project.layers) {
    if (!layer.name) layer.name = `レイヤー ${layerSeq++}`;
    const row = document.createElement("div");
    row.className = "layer-row" + (layer === paper.project.activeLayer ? " active" : "");

    const vis = document.createElement("button");
    vis.textContent = layer.visible ? "👁" : "—";
    vis.onclick = (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      refreshLayers();
    };

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = layer.name;

    row.append(vis, name);
    row.onclick = () => { layer.activate(); refreshLayers(); };
    list.appendChild(row);
  }
}
