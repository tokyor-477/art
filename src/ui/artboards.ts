import paper from "paper";
import { withGuiHidden } from "../engine/gui";

// アートボード: 最背面レイヤー(__artboards)に置いたロック済み白矩形。
// Paper.js にアートボード概念がないための軽量実装。
// ロック済みなのでヒットテスト・マーキー選択には掛からない。
const LAYER = "__artboards";
let active = 0;
let commit: () => void = () => {};

const $ = (id: string) => document.getElementById(id)!;

function layer(): paper.Layer {
  let l = paper.project.layers.find((x) => x.name === LAYER);
  if (!l) {
    const prev = paper.project.activeLayer;
    l = new paper.Layer();
    l.name = LAYER;
    paper.project.insertLayer(0, l); // 最背面
    prev.activate();
  }
  return l;
}

const boards = () => layer().children;

export function setupArtboards(onCommit: () => void) {
  commit = onCommit;

  $("artboard-add").onclick = () => {
    const size = new paper.Size(800, 600);
    const rect = new paper.Path.Rectangle(
      new paper.Rectangle(paper.view.center.subtract(new paper.Point(400, 300)), size),
    );
    rect.fillColor = new paper.Color("#ffffff");
    rect.locked = true;
    layer().addChild(rect);
    active = boards().length - 1;
    refreshArtboards();
    commit();
  };

  $("artboard-del").onclick = () => {
    const b = boards()[active];
    if (!b) return;
    b.remove();
    active = Math.max(0, active - 1);
    refreshArtboards();
    commit();
  };

  $("artboard-export").onclick = () => {
    const b = boards()[active];
    if (!b) return;
    const svg = withGuiHidden(() =>
      paper.project.exportSVG({ asString: true, bounds: b.bounds }) as string,
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    a.download = `artboard-${active + 1}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  refreshArtboards();
}

/** 読込・undo後にリストを再構築 */
export function refreshArtboards() {
  const list = $("artboard-list");
  list.innerHTML = "";
  boards().forEach((b, i) => {
    const btn = document.createElement("button");
    btn.textContent = `アートボード ${i + 1}`;
    btn.className = i === active ? "on" : "";
    btn.onclick = () => {
      active = i;
      paper.view.center = b.bounds.center; // ジャンプ
      refreshArtboards();
    };
    list.appendChild(btn);
  });
}
