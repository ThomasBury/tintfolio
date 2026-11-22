const shapes: Record<string, string> = {
  room: '<path d="M3 13h18v6H3zM5 13V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5M5 19v2m14-2v2"/>',
  web: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-15-2h1m2 0h1"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8 11 7-4m-7 6 7 4"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  undo: '<path d="M4 10h10a5 5 0 0 1 0 10h-3M4 10l5-5m-5 5 5 5"/>',
  sliders:
    '<path d="M3 7h6m5 0h7M3 17h11m5 0h2"/><circle cx="11.5" cy="7" r="2.5"/><circle cx="16.5" cy="17" r="2.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  pen: '<path d="m5 15 10-10 4 4L9 19l-5 1zM13 7l4 4"/>',
  layers: '<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
};
export const icon = (name: string) =>
  `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${shapes[name]}</svg>`;
