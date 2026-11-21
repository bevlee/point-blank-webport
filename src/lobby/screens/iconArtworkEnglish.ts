// [RECRIADO] Translated lettering in known Portable cash-item atlas cells.
// Coordinates identify artwork, not item IDs: several item variants share a cell.
type Captions = { top?: string; bottom?: string; bottomHeight?: number };
const LABELS: Record<string, Captions> = {
  "item_cash_a0:0:0": { top: "Change Name" },
  "item_cash_a0:3:0": { bottom: "Reset Escapes", bottomHeight: 33 },
  "item_cash_a0:4:0": { top: "Clan Name" },
  "item_cash_a0:0:1": { top: "Clan Emblem" },
  "item_cash_a0:3:1": { top: "Clan Members" },
  "item_cash_a0:1:2": { top: "Transfer" },
  "item_cash_a0:0:3": { top: "Change Name", bottom: "7 days" },
  "item_cash_a0:1:3": { top: "Respawn Time", bottom: "7 days" },
  "item_cash_a0:2:3": { bottom: "7 days" },
  "item_cash_a0:3:3": { bottom: "7 days" },
  "item_cash_b0:4:0": { top: "Clan Color" },
  "item_cash_b0:0:1": { top: "Name Color" },
  "item_cash_b0:1:1": { top: "Respawn Time" },
  "item_cash_b0:2:1": { top: "Extra Ammo" },
  "item_cash_b0:3:1": { top: "Disguise Name" },
  "item_cash_b0:4:1": { top: "Chat Color" },
  "item_cash_b0:0:2": { top: "Crosshair Color" },
  "item_cash_b0:1:2": { top: "Fake Rank" },
  "item_cash_b0:2:2": { top: "Custom Crosshair" },
  "item_cash_b0:4:2": { top: "Transfer" },
  "item_cash_b1:1:4": { top: "Respawn Time" },
  "item_cash_b1:2:4": { top: "Respawn Time" },
  "item_cash_b1:3:4": { top: "Respawn Time" },
  "item_cash_b1:1:5": { top: "Dummy Item 01" },
  "item_cash_b1:2:5": { top: "Dummy Item 02" },
  "item_cash_a1:3:4": { top: "Dummy Item 01" },
  "item_cash_a1:4:4": { top: "Dummy Item 02" },
  "item_cash_a2:0:0": { top: "Rice Cake" },
  "item_cash_a2:1:0": { bottom: "Battle Capsule\n1 day", bottomHeight: 47 },
  "item_cash_a2:2:0": { bottom: "Battle Capsule\n7 days", bottomHeight: 47 },
  "item_cash_a2:3:0": { bottom: "Mask Box\n1 day", bottomHeight: 47 },
  "item_cash_a2:4:0": { bottom: "Mask Box\n7 days", bottomHeight: 47 },
  "item_cash_a2:0:1": { bottom: "1 million Points", bottomHeight: 18 },
  "item_cash_a2:3:1": { bottom: "Gatotkaca Box", bottomHeight: 25 },
  "item_cash_a2:4:1": { bottom: "Gift Box", bottomHeight: 25 },
  "item_cash_a2:4:2": { bottom: "Tournament Ticket", bottomHeight: 25 },
  "item_cash_a2:0:3": { bottom: "Tournament Ticket", bottomHeight: 25 },
  "item_cash_a2:2:3": { bottom: "Tournament Ticket", bottomHeight: 25 },
  "item_cash_a3:0:0": { bottom: "Gold Case", bottomHeight: 25 },
};

export function localizeIconArtwork(el: HTMLElement, rect: { atlas: string; x: number; y: number; w: number; h: number }): void {
  el.querySelectorAll(":scope > .icon-english").forEach(n => n.remove());
  const col = (rect.x - 1) / 91, row = (rect.y - 1) / 66;
  const labels = LABELS[`${rect.atlas}:${col}:${row}`];
  if (!labels) return;
  for (const edge of ["top", "bottom"] as const) {
    const value = labels[edge];
    if (!value) continue;
    const caption = document.createElement("span");
    caption.className = "icon-english";
    caption.textContent = value;
    const height = edge === "top" ? 18 : labels.bottomHeight ?? 12;
    caption.style.cssText = `position:absolute;left:3%;right:3%;${edge}:3%;height:${height / rect.h * 100}%;`
      + "display:flex;align-items:center;justify-content:center;white-space:pre-line;text-align:center;pointer-events:none;"
      + "background:#102b32;color:#ffe5a6;text-shadow:0 1px #000;font:bold 9px Arial,sans-serif;";
    el.appendChild(caption);
  }
}
