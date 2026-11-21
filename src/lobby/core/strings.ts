// PT-BR texts the lobby controller (controller.ts) says or hands to the Cross shell: STBL/STR key of String_Brazil resolved
// by src/lobby/ui/i18n.ts, fallback copied verbatim from the table; key null = literal PT-BR chosen here [INFERIDO] (no BR key
// found). Same scheme as src/lobby/screens/strings.ts.
import { tOr } from "../ui/i18n.ts";
import { cleanLabel } from "../screens/strings.ts";

type Entry = readonly [key: string | null, fallback: string, multiline?: boolean];
const K = {
  // servers / channels
  full: ["STR_TBL_GUI_SERVER_STATE_FULL", "FULL"],
  server: [null, "Server"],
  channel: [null, "Channel"],
  // lobby
  colMode: ["STR_TBL_GUI_READY_GAME_MODE", "Modes"],
  loadingRooms: ["STR_TBL_GUI_LOBBY_NOTICE_LOADING_ROOM_LIST", "Loading Room list."],
  notExistRoom: ["STBL_IDX_EP_LOBBY_NOT_EXIST_ROOM", "Room Does Not Exist"],
  // 2017 exe 0x8f54e0 (room phase, game event 1001 from SERVER_MESSAGE_KICK_PLAYER_ACK)
  roomKicked: ["STBL_IDX_EP_ROOM_KICKED", "Kicked out by the room host."],
  wait: ["STR_TBL_GUI_LOBBY_WAIT_STATE_TEXT", "Waiting"],
  // login / loading captions (the exe's own wait messages)
  loginNoServer: ["STBL_IDX_EP_LOGIN_WAIT_DISCONNECT", "Disconnecting prior session.\nPlease try again later.", true],
  loadConnect: ["STBL_IDX_EP_LOGIN_WAIT_CONNECT_W", "Conneting to the server.\nPlease wait..", true],
  loadServer: ["STBL_IDX_EP_SERVER_WAIT_REFRESH_W", "Loading server information.\nPlease wait..", true],
  loadMyInfo: ["STBL_IDX_EP_SERVER_WAIT_GET_MYINFO", "Waiting for user information.\nPlease wait..", true],
  welcome: [null, "Welcome to"],
  // room modes (roomModes.ts ROOM_MODES[].text): Deathmatch variants of Rules.xml (Mode 19/20/21: StageOptions 96/128/224)
  deathmatch: ["STR_HEADER_MODE_TEAM_DEATH_MATCH", "Death Match"],
  modeSniper: ["STR_TBL_GUI_LOBBY_SNIPERMODE_TITLE", "Snipers"],
  modeShotgun: ["STR_TBL_GUI_LOBBY_SHOTGUNMODE_TITLE", "Shotguns"],
  // renamed on purpose: the original BR title ("Partida Clube", STR_TBL_GUI_LOBBY_KNUCKLEMODE_TITLE) is not shown
  modeKnife: [null, "Knife Mode"],
  // AI room: server Rules.xml Mode 16 "DEATHMATCH_AIC" = Rule 0, StageOptions 2 (AI), Conditions 4
  modeBots: ["STR_TBL_GUI_LOBBY_TRANING_TEXT", "Challenge"],
  modeHeadHunter: ["STR_TBL_GUI_LOBBY_HEADHUNTERMODE_TITLE", "Head Hunter"],
  modeChaos: ["STR_TBL_GUI_LOBBY_CHAOS_TITLE", "Chaos"],
  modeBomb: ["STR_HEADER_MODE_EXPLOSION", "Bomb"],
  // Bomb Mission with a special weapon: no Cross string for the variant (STBL_IDX_GAMEMODE_BOMB_SR / _SG / _KCL) [RECRIADO]
  modeBombSniper: [null, "Sniper Demolition"],
  modeBombShotgun: [null, "Shotgun Demolition"],
  modeBombKnife: [null, "Knife Demolition"],
  // Destroy (Sabotagem, STR_HEADER_MODE_DESTROY); its variants [RECRIADO] like the Bomb ones
  modeDestroy: ["STR_HEADER_MODE_DESTROY", "Destroy"],
  modeDefence: ["STR_HEADER_MODE_DEFENCE", "Defense"],
  modeDestroySniper: [null, "Sniper Sabotage"],
  modeDestroyShotgun: [null, "Shotgun Sabotage"],
  modeDestroyKnife: [null, "Knife Sabotage"],
  // Annihilation = Rules.xml Mode 4 (Rule 0, StageOptions 1, Conditions 16); the Cross create window names it "Guerra de extermínio"
  modeAnnihilation: ["STR_TBL_GUI_LOBBY_ROUND_BATTLE_TEXT", "Elimination"],
  // Ace = Rules.xml Mode 55 (Rule 128, Conditions 32). No Cross string for the mode name: "Ace Attacker" (tutorial text) [INFERIDO]
  modeAce: ["STR_HEADER_DO_TCH_DN_ACE_ATTACKER", "Ace Attacker"],
  minutes: [null, "minutes"],
  noTrainingTeam: ["STBL_IDX_EP_ROOM_NO_TRAINIG_TEAM_S", "Operators must play on the same team in this mode."],
  // ready room
  noChangeSlot: ["STBL_IDX_EP_ROOM_NO_CHANGE_SLOT_S", "Ready status must be released to change teams."],
  startNeedsReady: [null, "At least 1 READY player is required on the opposing team."],
  noPlayerInfo: [null, "Could not retrieve player information."],
  // chat feedback [RECRIADO]: the exe's texts for these were not traced
  chatBlocked: [null, "Player blocked:"],
  chatUnblocked: [null, "Player unblocked:"],
  chatBlockList: [null, "Blocked:"],
  chatBlockNone: [null, "No blocked players."],
  chatBlockUsage: [null, "Use /bloquear <nickname> or /desbloquear <nickname>."],
  chatNoWhisper: [null, "Select a player in the list (PM) or use /w <nickname> <text>."],
  chatNoTeam: [null, "Team chat is only available in a room."],
  chatOffline: [null, "Disconnected from chat server."],
} as const satisfies Record<string, Entry>;

type Labels = { readonly [k in keyof typeof K]: string };
export const T = {} as Labels;
for (const [name, e] of Object.entries(K) as [keyof typeof K, Entry][]) {
  Object.defineProperty(T, name, { enumerable: true, get: () => cleanLabel(e[0] ? tOr(e[0], e[1]) : e[1], e[2] === true) });
}
