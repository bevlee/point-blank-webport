import type { LoadoutStore } from './LoadoutStore.ts';
import { control, kitCards, kitTabs, node, paintKit } from './kitView.ts';
import type { EquipmentKit } from './loadouts.ts';

export function confirmMatchLoadout(options: { store: LoadoutStore; map: string; team: string; resolveKit(index: number): EquipmentKit; apply(index: number): Promise<void> }): Promise<boolean> {
  return new Promise(resolve => {
    const overlay = node('div', 'pb-kit-view pb-match-loadout'), dialog = node('section', 'kit-dialog');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', 'Choose your loadout');
    const header = node('div', 'kit-dialog-header'); header.append(node('b', '', 'BLACKOUT'), node('span', '', `${options.map} · ${options.team}`));
    const title = node('div', 'kit-dialog-title', 'Choose your loadout'), content = node('div'), error = node('div', 'kit-error'), footer = node('div', 'kit-dialog-footer');
    let selected = options.store.data.active, busy = false;
    const abort = new AbortController();
    const finish = (ok: boolean): void => { if (busy) return; abort.abort(); overlay.remove(); resolve(ok); };
    const cancel = control('Back', () => finish(false));
    const confirm = control('Confirm loadout', () => {
      if (busy) return; busy = true; confirm.disabled = true; cancel.disabled = true;
      void options.apply(selected).then(() => { busy = false; finish(true); }, e => { busy = false; confirm.disabled = false; cancel.disabled = false; error.textContent = e instanceof Error ? e.message : String(e); });
    }, 'kit-confirm');
    const paint = (): void => { content.replaceChildren(kitTabs(options.store.data, selected, index => { if (!busy) { selected = index; paint(); } }), kitCards(options.resolveKit(selected))); paintKit(content); };
    footer.append(cancel, confirm); dialog.append(header, title, content, error, footer); overlay.append(dialog); document.body.append(overlay); paint(); confirm.focus();
    overlay.addEventListener('keydown', e => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      if (e.code === 'Tab') { const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')); const first = buttons[0], last = buttons[buttons.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    }, { signal: abort.signal });
  });
}
