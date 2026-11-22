import { rgb } from "culori";
import { labels, palette, type Design } from "./design.ts";

const maxSide = 1200;
const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const linear = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const srgb = (value: number) => 255 * (value <= 0.0031308
  ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);

export function mountPhoto(current: () => Design) {
  document.body.insertAdjacentHTML("beforeend", `
    <dialog id="photo" class="sheet-dialog photo-dialog" aria-labelledby="photo-title">
      <div class="dialog-head"><h2 id="photo-title">Tint a photo</h2>
        <form method="dialog"><button class="outline">Close</button></form></div>
      <label>Choose a photo <input id="photo-file" type="file" accept="image/*"></label>
      <p id="photo-status" role="status">The photo stays in this tab.</p>
      <div id="photo-tools" hidden>
        <label>Paint colour <select id="photo-colour"></select></label>
        <p id="photo-help">Drag the region or use its arrow keys to move it. Drag the corner or use its arrow keys to resize.</p>
        <div class="photo-stage">
          <canvas id="photo-canvas" aria-label="Photo with virtual paint tint" role="img"></canvas>
          <div id="photo-region" tabindex="0" role="group" aria-label="Move tint region" aria-describedby="photo-help">
            <button type="button" id="photo-resize" aria-label="Resize tint region">↘</button>
          </div>
        </div>
        <button type="button" id="photo-clear" class="outline">Remove photo</button>
      </div>
    </dialog>`);

  const dialog = document.querySelector<HTMLDialogElement>("#photo")!;
  const file = dialog.querySelector<HTMLInputElement>("#photo-file")!;
  const canvas = dialog.querySelector<HTMLCanvasElement>("#photo-canvas")!;
  const region = dialog.querySelector<HTMLElement>("#photo-region")!;
  const resize = dialog.querySelector<HTMLButtonElement>("#photo-resize")!;
  const colour = dialog.querySelector<HTMLSelectElement>("#photo-colour")!;
  const status = dialog.querySelector<HTMLElement>("#photo-status")!;
  const tools = dialog.querySelector<HTMLElement>("#photo-tools")!;
  const stage = canvas.parentElement!;
  let original: ImageData | undefined;
  let revision = 0;
  let frame = 0;
  let rect = { x: 22, y: 22, w: 56, h: 56 };
  let drag: { id: number; x: number; y: number; start: typeof rect; resize: boolean } | undefined;

  function draw() {
    frame = 0;
    if (!original) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.putImageData(original, 0, 0);
    const x = Math.floor(rect.x * canvas.width / 100);
    const y = Math.floor(rect.y * canvas.height / 100);
    const w = Math.max(1, Math.floor((rect.x + rect.w) * canvas.width / 100) - x);
    const h = Math.max(1, Math.floor((rect.y + rect.h) * canvas.height / 100) - y);
    const patch = ctx.getImageData(x, y, w, h);
    const { r, g, b } = rgb(colour.value)!;
    const paint = [r, g, b].map((channel) => linear[Math.round(channel * 255)]);
    const base = luminance(paint[0], paint[1], paint[2]);
    for (let i = 0; i < patch.data.length; i += 4) {
      const light = luminance(linear[patch.data[i]], linear[patch.data[i + 1]], linear[patch.data[i + 2]]);
      for (let channel = 0; channel < 3; channel++) {
        const tint = light < base
          ? paint[channel] * (light / base)
          : paint[channel] + (1 - paint[channel]) * (light - base) / (1 - base || 1);
        patch.data[i + channel] = 0.2 * patch.data[i + channel] + 0.8 * srgb(tint);
      }
    }
    ctx.putImageData(patch, x, y);
  }

  function update() {
    region.style.inset = `${rect.y}% ${100 - rect.x - rect.w}% ${100 - rect.y - rect.h}% ${rect.x}%`;
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function adjust(start: typeof rect, dx: number, dy: number, resizing: boolean) {
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    rect = resizing
      ? { ...start, w: clamp(start.w + dx, 8, 100 - start.x), h: clamp(start.h + dy, 8, 100 - start.y) }
      : { ...start, x: clamp(start.x + dx, 0, 100 - start.w), y: clamp(start.y + dy, 0, 100 - start.h) };
    update();
  }

  function clear() {
    revision++;
    original = undefined;
    canvas.width = canvas.height = 1;
    tools.hidden = true;
    file.value = "";
    status.textContent = "The photo stays in this tab.";
  }

  file.addEventListener("change", async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    clear();
    const request = revision;
    status.textContent = "Opening photo…";
    try {
      const bitmap = await createImageBitmap(chosen);
      try {
        if (request !== revision) return;
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        original = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } finally {
        bitmap.close();
      }
      stage.style.setProperty("--aspect", String(canvas.width / canvas.height));
      rect = { x: 22, y: 22, w: 56, h: 56 };
      tools.hidden = false;
      status.textContent = "Photo ready.";
      update();
    } catch {
      if (request === revision) status.textContent = "This photo could not be read. Choose another image.";
    }
  });
  colour.addEventListener("change", update);
  dialog.querySelector("#photo-clear")!.addEventListener("click", () => { clear(); file.focus(); });
  region.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    region.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: rect, resize: event.target === resize };
  });
  region.addEventListener("pointermove", (event) => {
    if (drag?.id !== event.pointerId) return;
    adjust(drag.start, 100 * (event.clientX - drag.x) / stage.clientWidth,
      100 * (event.clientY - drag.y) / stage.clientHeight, drag.resize);
  });
  region.addEventListener("lostpointercapture", () => { drag = undefined; });
  region.addEventListener("keydown", (event) => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    adjust(rect, delta[0] * step, delta[1] * step, event.target === resize);
  });
  return () => {
    const previous = colour.value;
    colour.innerHTML = palette(current()).map(([role, value]) =>
      `<option value="${value}">${labels[role]} · ${value}</option>`,
    ).join("");
    if (Array.from(colour.options).some((option) => option.value === previous))
      colour.value = previous;
    if (original) update();
    dialog.showModal();
  };
}
