import type { GNode } from "./i3Gui.ts";

// [RECRIADO] English captions for lettering baked into the Portable client's Thai atlas.
// Keep the native sprite borders and state changes; cover only each caption's interior.
const CAPTIONS: Record<string, string> = {
  WeaponTab: "Weapons", CharacterTab: "Characters", ItemTab: "Items",
  ChallengeTab: "Mission Cards", "Designation tab": "Titles",
  ContactTab: "Community", NoteTab: "Messages",
  ClanListTab: "Clan List", UserListTab: "Members", ClanInfoTab: "Clan Info",
  ClanBattleTab: "Clan Battle", ClanSearchTab: "Find Clan", ClanManagementTab: "Management",
  Invitate: "Invite", Leave: "Back", Start: "Start", Ready: "Ready", CancelStart: "Cancel Start", CancelReady: "Cancel Ready",
  CashChargeButton: "Add Cash", HudConfirm: "Confirm", HudCancel: "Cancel", Used: "Equipped",
};

export function englishArtworkCaption(node: GNode): string | undefined {
  const named: Record<string, string> = { lbQuickStart: "Quick Start", lbSpecialWar: "Game Modes", clanBattleLobbyTeamListQuickButton: "Quick Join", Result_Confirm: "Confirm" };
  return named[node.name] ?? CAPTIONS[node.tpl ?? ""];
}

export function styleArtworkCaption(text: HTMLElement, node: GNode, state = 0, inputDisabled = false): void {
  const badge = node.tpl === "Used";
  const inset = badge ? 1 : 4;
  const tab = /tab$/i.test(node.tpl ?? "");
  const active = tab && state === 1;
  const disabled = !badge && !tab && (inputDisabled || state === 3);
  text.style.cssText = `position:absolute;left:${inset}px;top:${inset}px;width:${node.w - inset * 2}px;height:${node.h - inset * 2}px;`
    + `display:flex;align-items:center;justify-content:center;pointer-events:none;box-sizing:border-box;white-space:normal;text-align:center;`
    + `font:${badge ? 7 : node.name === "Result_Confirm" ? 13 : 10}px Arial,sans-serif;font-weight:bold;color:${disabled ? "#777" : "#fff"};text-shadow:0 1px 1px #000;`
    + `background:${badge ? "#665032" : disabled ? "#18191a" : active ? "linear-gradient(#315caa,#1b3774)" : "linear-gradient(#292b2d,#141516)"};`;
  if (badge) text.textContent = ["Equipped", "Unused", "Used"][Math.min(state, 2)];
  if (tab) text.parentElement?.setAttribute("aria-selected", String(active));
}
