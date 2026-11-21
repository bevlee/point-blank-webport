// PT-BR labels of the meta screens, by STBL/STR key of String_Brazil, resolved through src/lobby/ui/i18n.ts
// (public/assets/ui/cross/strings.json). The second value is the same text copied verbatim from the string table, used
// before loadStrings() resolves and in Node. Keys without a known control binding were chosen by hand [INFERIDO] from the
// original design-time caption (e.g. "장비하기" = equip). Colour tags are stripped; `line: true` keeps line breaks.
import { tOr } from "../ui/i18n.ts";

type Entry = readonly [key: string | null, fallback: string, multiline?: boolean];
const K = {
  shop: ["STBL_IDX_SHOP_CAPTION", "Shop"],
  inventory: ["STR_INVEN_INVENTORY", "Inventory"],
  buy: ["STR_SHOP_BUY", "Buy"],
  equip: ["STR_INVEN_DO_EQUIP", "Equip"],
  equipped: ["STR_INVEN_EQUIPPED", "Equipped"],
  // no STBL id recovered for this caption (cosmetic-slot clear was never dumped) [RECRIADO]
  unequip: [null, "Desequipar"],
  use: ["STR_INVEN_DO_USE", "Use"],
  leave: ["STR_POPUP_LEAVE", "Exit"],
  confirm: ["STR_POPUP_OK", "OK"],
  cancel: ["STR_POPUP_CANCEL", "Cancel"],
  gold: ["STR_SHOP_INFO_POINT", "Point"],
  cash: ["STR_SHOP_INFO_CASH", "Cash"],
  tag: [null, "TAG"], // design-time caption of StaticText_Money_Title2 (Latin; no BR key found)
  viewAll: ["STR_SHOP_MENU_ALLITEM", "All"],
  tabWeapon: ["STR_SHOP_MENU_NEWHOT_WEAPON", "Weapon"],
  tabChara: ["STR_SHOP_MENU_NEWHOT_CHARACTER", "Character"],
  tabItem: ["STR_SHOP_MENU_NEWHOT_ITEM", "Item"],
  primary: ["STR_INVEN_PRIMARY_WEAPON", "Main"],
  secondary: ["STR_INVEN_SECONDARY_WEAPON", "Secondary"],
  melee: ["STR_INVEN_MELEE_WEAPON", "Melee"],
  throwing: ["STR_INVEN_THROWING_WEAPON", "Explosive"],
  special: ["STR_INVEN_SPECIAL_WEAPON", "Special"],
  chara: ["STR_INVEN_CHRACTER", "Character"],
  head: ["STR_INVEN_HEAD", "Head"],
  mask: ["STR_SHOP_MENU_CHARACTER_MASK", "Mask"],
  beret: ["STR_INVEN_BERET", "Beret"],
  redChara: ["STR_INVEN_RED_CHARA", "Red Team character"],
  blueChara: ["STR_INVEN_BLUE_CHARA", "Blue Team character"],
  usedEquip: ["STR_INVEN_USED_EQUIP", "Equipment in use"],
  notUsed: ["STR_INVEN_NOTUSED", "Unused"],
  unlimited: ["STBL_IDX_ITEM_UNLIMITED", "Permanent"],
  days: ["STBL_IDX_ITEM_TERM_UNIT", "d"],
  units: ["STBL_IDX_ITEM_COUNT_UNIT", " Qty"],
  pcRoom: ["STR_INVEN_ONLY_PC_ROOM", "Partner internet cafes only"],
  startingAuth: ["STR_INVEN_STARTING_AUTH", "This item has not been used yet. \nAfter equipping it will be available until it runs out.\nDo you want to equip this?", true],
  buySuccess: ["STBL_IDX_EP_SHOP_BUY_SUCCESS", "Item added to inventory."],
  confirmBuy: ["STR_POPUP_CAPTION_CONFIRM_BUY", "Confirm Purchase?"],
  cannotEquip: ["STR_INVEN_CANNOT_EQUIP", "Cannot equip "],
  unknownItem: ["STR_SHOP_UNKNOWNITEM", "Unknown Item"],
  createRoom: ["STR_TBL_GUI_LOBBY_CREATE_ROOM_TEXT", "Create"],
  quickStart: ["STR_TBL_GUI_LOBBY_QUICK_START_TEXT", "Quick Start"],
  enterRoom: ["STR_TBL_GUI_LOBBY_ENTER_ROOM_TEXT", "Enter"],
  refresh: ["STR_TBL_GUI_LOBBY_REFRESH_TEXT", "Refresh"],
  userList: ["STR_TBL_GUI_LOBBY_USER_LIST", "Waiting List"],
  loadingRooms: ["STR_TBL_GUI_LOBBY_NOTICE_LOADING_ROOM_LIST", "Loading Room list."],
  // room list header: keys of PointBlankRe_Lobby_RoomList's Lua SetHeader
  colNumber: ["STR_TBL_GUI_SERVER_NUMBER", "No."],
  colRoomName: ["STR_TBL_GUI_LOBBY_ROOMNAME_TEXT2", "Room Name"],
  colMode: ["STR_TBL_GUI_READY_GAME_MODE", "Modes"],
  colStage: ["STR_TBL_PROFILE_STAGE_TEXT", "Stage"],
  colMember: ["STR_TBL_GUI_LOBBY_PEOPLE_COUNT_TEXT", "Player"],
  colState: ["STR_TBL_GUI_LOBBY_STATE_TEXT", "Status"],
  colPing: ["STR_TBL_GUI_LOBBY_PING_TEXT", "Ping"],
  stateWait: ["STBL_IDX_ROOM_STATE_WAIT", "Wait"],
  statePlay: ["STBL_IDX_ROOM_STATE_PLAY", "Play"],
  modeDeathmatch: ["STR_HEADER_MODE_TEAM_DEATH_MATCH", "Death Match"],
  notExistRoom: ["STBL_IDX_EP_LOBBY_NOT_EXIST_ROOM", "Room Does Not Exist"],
  waitState: ["STR_TBL_GUI_LOBBY_WAIT_STATE_TEXT", "Waiting"],
  noPoint: ["STBL_IDX_CLAN_NO_POINT", "No point"],
  noCash: ["STBL_IDX_COUPON_USE_FAIL_REASON_LIMIT_MONEY", "Insufficient cash to purchase."],
  cannotBuyItem: ["STR_SHOP_CANNOT_ITEM_BUYING", "Unable to purchase this item"],
  buyFail: ["STBL_IDX_EP_SHOP_BUY_FAIL_CAPTION_E", "Purchase Failed"],
} as const satisfies Record<string, Entry>;

/** Removes the client's {col:...}{/col} markup; single-line labels also fold line breaks. */
export function cleanLabel(s: string, multiline = false): string {
  const t = s.replace(/\{col:[^}]*\}|\{\/col\}/g, "");
  return multiline ? t.replace(/\\n/g, "\n") : t.replace(/\\n|\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** Hangul never reaches the screen (design-time captions / unresolved bindings). */
export const hasHangul = (s: string): boolean => /[ᄀ-ᇿ㄰-㆏가-힯]/.test(s);

type Labels = { readonly [k in keyof typeof K]: string };
export const S = {} as Labels;
for (const [name, e] of Object.entries(K) as [keyof typeof K, Entry][]) {
  Object.defineProperty(S, name, { enumerable: true, get: () => cleanLabel(e[0] ? tOr(e[0], e[1]) : e[1], e[2] === true) });
}
