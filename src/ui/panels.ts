import paper from "paper";
import type { Style } from "../tools/types";
import { withGuiHidden } from "../engine/gui";

// ツールバー + レイヤーパネルの配線。素のDOMで十分な規模なのでフレームワークなし。
export interface PanelCallbacks {
  onUndo(): void;
  onRedo(): void;
  onDocChange(): void; // レイヤー操作後(履歴snapshot用)
  onToolChange(name: string): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

let layerSeq = 1;

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** ドキュメントのレイヤー(GUIレイヤーを除く) */
export function docLayers(): paper.Layer[] {
  return paper.project.layers.filter((l) => l.name !== "__gui");
}

export function setupPanels(cb: PanelCallbacks) {
  // ツール切替
  const toolButtons = [...$("tools").querySelectorAll<HTMLButtonElement>("button[data-tool]")];
  for (const btn of toolButtons) {
    btn.onclick = () => {
      toolButtons.forEach((b) => b.classList.toggle("on", b === btn));
      cb.onToolChange(btn.dataset.tool!);
    };
  }

  $("undo").onclick = cb.onUndo;
  $("redo").onclick = cb.onRedo;

  $("clear").onclick = () => {
    if (!confirm("すべて消去しますか?")) return;
    paper.project.activeLayer.removeChildren();
    cb.onDocChange();
  };

  $("export-svg").onclick = () => {
    const svg = withGuiHidden(() =>
      paper.project.exportSVG({ asString: true, bounds: "content" }) as string,
    );
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
    const layers = docLayers();
    if (layers.length <= 1) return;
    paper.project.activeLayer.remove();
    docLayers().at(-1)?.activate();
    refreshLayers();
    cb.onDocChange();
  };

  const size = input("size");
  size.oninput = () => { $("size-label").textContent = size.value; };

  // スウォッチ(localStorage 永続)
  renderSwatches();
  $("swatch-add").onclick = () => {
    const list = loadSwatches();
    const c = input("fill-color").value;
    if (!list.includes(c)) {
      list.push(c);
      localStorage.setItem("swatches", JSON.stringify(list));
      renderSwatches();
    }
  };

  refreshLayers(cb);
}

// --- スタイル ---

export function currentStyle(): Style {
  return {
    fill: input("fill-on").checked ? input("fill-color").value : null,
    fill2: input("fill-color2").value,
    fillType: $<HTMLSelectElement>("fill-type").value as Style["fillType"],
    stroke: input("stroke-on").checked ? input("stroke-color").value : null,
    strokeWidth: Number(input("stroke-width").value) || 1,
    cap: $<HTMLSelectElement>("cap").value,
    join: $<HTMLSelectElement>("join").value,
    opacity: Number(input("opacity").value) / 100,
    blend: $<HTMLSelectElement>("blend").value,
    dash: input("dash").checked,
  };
}

export function currentFontSize(): number {
  return Number(input("font-size").value) || 32;
}

/** スタイル入力の変更を選択中アイテムに反映する(mainが配線) */
export function onStyleChange(fn: () => void) {
  const ids = [
    "fill-on", "fill-color", "fill-type", "fill-color2",
    "stroke-on", "stroke-color", "stroke-width", "cap", "join",
    "opacity", "blend", "dash",
  ];
  for (const id of ids) {
    // changeイベント(確定時)のみ。inputだとスライダードラッグで履歴が溢れる
    $(id).addEventListener("change", fn);
  }
}

export function setPickedColors(fill: string | null, stroke: string | null) {
  input("fill-on").checked = !!fill;
  if (fill) input("fill-color").value = fill;
  input("stroke-on").checked = !!stroke;
  if (stroke) input("stroke-color").value = stroke;
}

export function currentBrushColor(): string {
  return input("fill-color").value;
}
export function currentBrushSize(): number {
  return Number(input("size").value);
}

// --- スウォッチ ---

const DEFAULT_SWATCHES = ["#111111", "#ffffff", "#e11d48", "#f97316", "#facc15", "#22c55e", "#0ea5e9", "#8b5cf6"];

function loadSwatches(): string[] {
  try {
    return JSON.parse(localStorage.getItem("swatches") || "null") ?? [...DEFAULT_SWATCHES];
  } catch {
    return [...DEFAULT_SWATCHES];
  }
}

function renderSwatches() {
  const box = $("swatches");
  box.innerHTML = "";
  for (const c of loadSwatches()) {
    const b = document.createElement("button");
    b.style.background = c;
    b.title = c;
    b.onclick = () => {
      input("fill-color").value = c;
      input("fill-on").checked = true;
    };
    box.appendChild(b);
  }
}

// --- レイヤーパネル ---

let panelCb: PanelCallbacks | null = null;

/** レイヤーリストを描き直す(状態はpaper.projectが唯一の真実) */
export function refreshLayers(cb?: PanelCallbacks) {
  if (cb) panelCb = cb;
  const list = $("layer-list");
  list.innerHTML = "";
  const layers = docLayers();
  layers.forEach((layer, i) => {
    if (!layer.name) layer.name = `レイヤー ${layerSeq++}`;
    const row = document.createElement("div");
    row.className = "layer-row" + (layer === paper.project.activeLayer ? " active" : "");

    const vis = document.createElement("button");
    vis.textContent = layer.visible ? "表示" : "—";
    vis.onclick = (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      refreshLayers();
      panelCb?.onDocChange();
    };

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = layer.name;

    // 並べ替え(上=前面へ / 下=背面へ)
    const up = document.createElement("button");
    up.textContent = "▲";
    up.disabled = i === layers.length - 1;
    up.onclick = (e) => {
      e.stopPropagation();
      layer.insertAbove(layers[i + 1]);
      refreshLayers();
      panelCb?.onDocChange();
    };
    const down = document.createElement("button");
    down.textContent = "▼";
    down.disabled = i === 0;
    down.onclick = (e) => {
      e.stopPropagation();
      layer.insertBelow(layers[i - 1]);
      refreshLayers();
      panelCb?.onDocChange();
    };

    row.append(vis, name, up, down);
    row.onclick = () => { layer.activate(); refreshLayers(); };
    list.appendChild(row);
  });
}
