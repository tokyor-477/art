import paper from "paper";

export interface DrawHandler {
  begin(x: number, y: number, pressure: number): void;
  move(x: number, y: number, pressure: number): void;
  end(): void;
  cancel(): void;
}

interface Touch { x: number; y: number; startX: number; startY: number; t: number }

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 32;

// 入力の振り分け:
//   ペン(またはマウス) → 描画ツールへ
//   指1本ドラッグ → パン / 指2本 → ピンチズーム+パン / 2本指タップ → Undo
// パームリジェクション: 描画はペン・マウスのみ。指は絶対に描画しない。
export function attachPointerInput(
  canvas: HTMLCanvasElement,
  draw: DrawHandler,
  onUndo: () => void,
) {
  let drawingId: number | null = null; // 描画中のペン/マウスのpointerId
  const touches = new Map<number, Touch>();
  let lastPinchDist = 0;
  let twoFingerTapPossible = false;

  const toProject = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return paper.view.viewToProject(new paper.Point(e.clientX - r.left, e.clientY - r.top));
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      touches.set(e.pointerId, {
        x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, t: performance.now(),
      });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        lastPinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        // 2本目が1本目のすぐ後に触れた → 2本指タップ候補
        twoFingerTapPossible = performance.now() - Math.min(a.t, b.t) < 300;
      } else {
        twoFingerTapPossible = false;
      }
      return;
    }
    // ペン/マウス
    if (drawingId !== null) return;
    drawingId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const p = toProject(e);
    draw.begin(p.x, p.y, e.pointerType === "pen" ? e.pressure : 0.5);
    e.preventDefault();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") {
      const t = touches.get(e.pointerId);
      if (!t) return;
      const dx = e.clientX - t.x;
      const dy = e.clientY - t.y;
      t.x = e.clientX; t.y = e.clientY;

      if (touches.size === 1) {
        // 1本指パン
        panBy(dx, dy);
      } else if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 };
        if (lastPinchDist > 0) {
          zoomAt(toProject(mid), dist / lastPinchDist);
        }
        lastPinchDist = dist;
        panBy(dx / 2, dy / 2); // 2本指ドラッグでのパン(各指の移動の平均相当)
        if (Math.hypot(e.clientX - t.startX, e.clientY - t.startY) > 12) {
          twoFingerTapPossible = false;
        }
      }
      return;
    }
    if (e.pointerId !== drawingId) return;
    // 高頻度サンプリング: coalesced events で中間点を全部拾う
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ce of events) {
      const p = toProject(ce);
      draw.move(p.x, p.y, e.pointerType === "pen" ? ce.pressure : 0.5);
    }
    e.preventDefault();
  });

  const endTouch = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      const t = touches.get(e.pointerId);
      touches.delete(e.pointerId);
      // 2本指タップ = 2本とも短時間・小移動で離れた → Undo
      if (
        twoFingerTapPossible && t && touches.size <= 1 &&
        performance.now() - t.t < 350 &&
        Math.hypot(e.clientX - t.startX, e.clientY - t.startY) < 12
      ) {
        if (touches.size === 0) onUndo();
      } else if (touches.size < 2) {
        twoFingerTapPossible = touches.size === 1 && twoFingerTapPossible;
      }
      if (touches.size < 2) lastPinchDist = 0;
      return;
    }
    if (e.pointerId !== drawingId) return;
    drawingId = null;
    if (e.type === "pointercancel") draw.cancel();
    else draw.end();
  };
  canvas.addEventListener("pointerup", endTouch);
  canvas.addEventListener("pointercancel", endTouch);

  function panBy(dxView: number, dyView: number) {
    const z = paper.view.zoom;
    paper.view.center = paper.view.center.subtract(new paper.Point(dxView / z, dyView / z));
  }

  function zoomAt(projectPoint: paper.Point, factor: number) {
    const view = paper.view;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
    const scale = newZoom / view.zoom;
    // projectPoint(ピンチ中心)が画面上で動かないように center を補正
    view.center = projectPoint.add(view.center.subtract(projectPoint).divide(scale));
    view.zoom = newZoom;
  }

  // デスクトップ検証用: ホイール/トラックパッドでズーム
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(toProject(e), Math.exp(-e.deltaY * 0.002));
  }, { passive: false });
}
