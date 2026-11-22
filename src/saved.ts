import { decode, labels, palette, rooms, shareParams, lightingPresets, defaultFloor, type Design, type Tool } from "./design.ts";
import { resolveWeb, tokenLabels, type Token } from "./web-preview.ts";

export function mountSaved(tool: Tool, current: () => Design, restore: (design: Design) => void) {
  document.body.insertAdjacentHTML("beforeend", `
    <dialog id="saved" class="sheet-dialog saved-drawer" aria-labelledby="saved-title">
      <div class="dialog-head"><h2 id="saved-title">Saved swatches</h2>
        <form method="dialog"><button class="outline">Close</button></form></div>
      <button type="button" id="save-current" class="solid">Save current design</button>
      <p id="saved-status" role="status"></p>
      <div id="saved-designs" class="saved-grid"></div>
    </dialog>`);
  const dialog = document.querySelector<HTMLDialogElement>("#saved")!;
  const grid = dialog.querySelector<HTMLElement>("#saved-designs")!;
  const status = dialog.querySelector<HTMLElement>("#saved-status")!;
  const save = dialog.querySelector<HTMLButtonElement>("#save-current")!;
  const key = "tintfolio-saved-" + tool;
  let entries: string[] = [];
  let temporary = false;

  function read() {
    if (temporary) return;
    try {
      const stored = localStorage.getItem(key);
      if (!stored) { entries = []; return; }
      const parsed: unknown = JSON.parse(stored);
      entries = Array.isArray(parsed)
        ? [...new Set(parsed.filter((value): value is string =>
            typeof value === "string" && decode(tool, new URLSearchParams(value)) !== null,
          ))].slice(0, 4)
        : [];
    } catch {
      temporary = true;
    }
  }

  function write() {
    if (temporary) return;
    try {
      localStorage.setItem(key, JSON.stringify(entries));
    } catch {
      temporary = true;
    }
  }

  function render(message = "") {
    const storageNote = temporary ? " Storage is unavailable. These swatches last until the page closes." : "";
    status.textContent = (message || (entries.length
      ? `${entries.length} of 4 designs saved.`
      : "Save up to four designs to compare side by side.")) + storageNote;
    save.setAttribute("aria-disabled", String(entries.length === 4));
    grid.innerHTML = entries.map((value, index) => {
      const design = decode(tool, new URLSearchParams(value))!;
      const swatches = tool === "paint"
        ? [...palette(design).map(([role, hex]) => [labels[role], hex]), ["Existing floor", design.floor ?? defaultFloor]]
        : Object.entries(resolveWeb(design)).map(([name, hex]) => [tokenLabels[name as Token], hex]);
      const subtitle = tool === "paint"
        ? `${rooms[design.room]} · ${lightingPresets[design.lighting]}`
        : design.theme === "dark" ? "Dark preview" : "Light preview";
      return `<article class="saved-design"><h3>Design ${index + 1}</h3><p>${subtitle}</p>
        <ul>${swatches.map(([label, hex]) => `<li><i class="chip" style="--swatch:${hex}" aria-hidden="true"></i> <span>${label} <code>${hex}</code></span></li>`).join("")}</ul>
        <button type="button" class="outline" data-restore="${index}" aria-label="Restore design ${index + 1}">Restore</button>
        <button type="button" class="text-btn" data-remove="${index}" aria-label="Remove design ${index + 1}">Remove</button></article>`;
    }).join("");
  }

  save.addEventListener("click", () => {
    read();
    const value = shareParams(tool, current()).toString();
    if (entries.includes(value)) { render("This design is already saved."); return; }
    if (entries.length === 4) { render("Remove a design to free a slot."); return; }
    entries.push(value);
    write();
    render();
  });
  grid.addEventListener("click", (event) => {
    const button = (event.target as Element).closest("button");
    if (!button) return;
    const value = entries[Number(button.dataset.restore ?? button.dataset.remove)];
    if (!value) return;
    if (button.dataset.restore !== undefined) {
      dialog.close();
      restore(decode(tool, new URLSearchParams(value))!);
    } else {
      read();
      entries = entries.filter((entry) => entry !== value);
      write();
      render("Design removed.");
      save.focus();
    }
  });
  return () => {
    read();
    render();
    dialog.showModal();
  };
}
