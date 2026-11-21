import { mapFromRoomMapId } from '../../../config.ts';
import { WIRE_READY, slotStateName } from '../../../net/roomClient.ts';
import { MAIN_BUTTONS, stageName } from '../../core/model.ts';
import { modeLabel } from '../../core/roomModes.ts';
import { crossIcons, paintRect } from '../../screens/icons.ts';
import { enforceRoomWeapons } from '../../../game/respawnSelect.ts';
import { KIT_SLOTS } from '../../equipment/loadouts.ts';
import { control, kitCards, kitTabs, node, paintKit } from '../../equipment/kitView.ts';
import type { PageCtx } from './common.ts';
import './readyRoom.css';

export class ReadyRoomPage {
  private root = node('section', 'pb-equipment pb-kit-view eq-ready-room');
  private content = node('div', 'ready-layout');
  private header = node('header', 'eq-header');
  private signature = '';
  private message = '';
  constructor(private ctx: PageCtx, private tools: { invite(): void; advanced(): void }) {
    this.root.hidden = true; this.root.setAttribute('aria-label', 'Ready room');
    this.root.append(this.header, this.content); ctx.layer.append(this.root);
  }
  paint(): void {
    const c = this.ctx.ctl, room = c.roomScreen?.room, info = room?.room, store = c.loadouts;
    this.root.hidden = c.page !== 'room' || !room;
    if (this.root.hidden || !room || !info) { this.signature = ''; return; }
    this.root.inert = !!(c.busy || c.selectingLoadout || c.msg || c.create || store?.busy);
    const signature = JSON.stringify([info, room.slots, room.mySlot, store?.data, store?.status, store?.busy, c.busy, c.selectingLoadout, c.roomScreen?.countdown.running, c.chatTab, c.chatRows().slice(-8)]);
    if (signature === this.signature) return; this.signature = signature;
    const hadFocus = document.activeElement instanceof HTMLInputElement && this.root.contains(document.activeElement);
    this.header.replaceChildren(node('div', 'eq-brand', 'BLACKOUT'), control('Loadouts', () => c.click('main', MAIN_BUTTONS.inventory)), control('Shop', () => c.click('main', MAIN_BUTTONS.shop)), control('Options', () => c.click('main', MAIN_BUTTONS.options)), control('Leave room', () => c.click('main', MAIN_BUTTONS.back)));
    const overview = node('aside', 'ready-overview'), map = node('div', 'ready-map'), sprite = node('div'); map.append(sprite);
    const byName = crossIcons()?.byName.map ?? {}, key = mapFromRoomMapId(info.mapId);
    const rect = Object.entries(byName).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
    if (rect) paintRect(sprite, rect, 300, 150);
    overview.append(map, node('b', 'ready-map-name', stageName(info.mapId)), node('div', 'ready-mode', modeLabel(info.rule, info.stage)));
    const roomTools = node('div', 'ready-tools');
    const settings = control('Room settings', () => c.click('mapinfo', 'i3UIButtonRoomSet')); settings.disabled = !room.isLeader || !!c.roomScreen?.countdown.running;
    const invite = control('Invite', this.tools.invite); invite.disabled = room.isBotRoom;
    const advanced = control('Rules', this.tools.advanced); advanced.disabled = !room.isLeader;
    roomTools.append(settings, invite, advanced); overview.append(roomTools);
    const teams = node('div', 'ready-teams');
    for (const team of [0, 1]) {
      const list = node('div', team ? 'ready-team blue' : 'ready-team');
      const heading = control(team ? 'Blue team' : 'Red team', () => c.click('team', team ? 'i3UIButton_BlueTeam' : 'i3UIButton')); heading.disabled = room.mySlot % 2 === team; list.append(heading);
      for (let index = team; index < (info.slotCount ?? 16); index += 2) {
        const player = room.slots[index], row = control('', () => c.listSelect(team ? 'blue' : 'red', Math.floor(index / 2)), 'ready-player');
        row.append(node('b', '', player?.nick || (player?.state === 1 ? 'Closed' : 'Open')));
        row.append(node('small', '', player?.nick ? index === room.leaderSlot ? 'Host' : player.state === WIRE_READY ? 'Ready' : slotStateName(player.state) === 'NORMAL' ? 'Not ready' : slotStateName(player.state) : ''));
        list.append(row);
      }
      teams.append(list);
    }
    overview.append(teams);
    const chat = node('form', 'ready-chat'), tabs = node('div', 'ready-chat-tabs');
    for (const [label, key] of [['All','all'],['Team','team'],['Whisper','whisper']] satisfies [string, typeof c.chatTab][]) { const b = control(label, () => { c.chatTab = key; c.draw(); }); b.setAttribute('aria-pressed', String(c.chatTab === key)); tabs.append(b); }
    const lines = node('div', 'ready-chat-lines'); c.chatRows().slice(-5).forEach(line => lines.append(node('div', '', line.text)));
    const input = node('input'); input.value = this.message; input.placeholder = 'Message'; input.setAttribute('aria-label', 'Room chat'); input.maxLength = 200; input.oninput = () => { this.message = input.value; };
    chat.onsubmit = e => { e.preventDefault(); if (c.submit('chat', input.value)) { this.message = ''; input.value = ''; } }; chat.append(tabs, lines, input); overview.append(chat);
    const equipment = node('section', 'ready-equipment'); equipment.append(node('div', 'ready-room-name', info.name));
    if (store?.status === 'ready') {
      const choose = async (index: number): Promise<void> => { try { await c.selectLoadout(index); } catch (e) { c.say(e instanceof Error ? e.message : String(e), true); } };
      const tabs = kitTabs(store.data, store.data.active, index => { void choose(index); });
      const ready = room.slots[room.mySlot]?.state === WIRE_READY;
      tabs.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = ready || !!c.roomScreen?.countdown.running; });
      const k = store.kit(), pairs = enforceRoomWeapons(KIT_SLOTS.map(s => ({ itemId: k[s] })), c.player?.items() ?? [], info.weaponsFlag, { itemId: 0 }, info.stage);
      equipment.append(tabs, kitCards({ primary: pairs[0].itemId, secondary: pairs[1].itemId, melee: pairs[2].itemId, grenade: pairs[3].itemId, special: pairs[4].itemId }));
      const actions = node('div', 'ready-actions'), state = node('span', '', `${store.data.presets[store.data.active].name} selected`);
      const counting = !!c.roomScreen?.countdown.running;
      const go = control(room.isLeader ? counting ? 'Cancel start' : 'Start match' : ready ? 'Cancel ready' : 'Ready', () => c.click('team', room.isLeader ? 'btnStart' : 'btnReady'), 'kit-confirm');
      go.disabled = c.busy || store.busy; actions.append(state, go); equipment.append(actions);
      if (info.weaponsFlag !== 0x1ff) equipment.append(node('div', 'ready-limit', 'Room weapon restrictions apply.'));
    } else equipment.append(node('div', 'ready-limit', store?.status === 'error' ? 'Loadouts could not be loaded.' : 'Loading loadouts…'), control('Open loadouts', () => c.click('main', MAIN_BUTTONS.inventory)));
    this.content.replaceChildren(overview, equipment); paintKit(equipment);
    if (hadFocus) input.focus();
  }
}
