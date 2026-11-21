const ROOM: Record<number, string> = { 0: "In the room", 2: "Loading", 3: "Loading", 4: "Starting", 5: "In battle" };
export const title = "Point Blank room: Team Deathmatch, 3 seats";
export const state = (v: any) => {
  const st = [0, 1, 2].map((i) => v.st[i] ?? v.st[String(i)]);
  if (st.every((x: number) => x === 0)) return "Room closed";
  return ROOM[v.room];
};
export const group = (v: any) => (v.room === 5 ? "battle" : v.room === 0 ? "room" : "start");
export const colors = { room: "blue", start: "orange", battle: "purple" };
export const step = (a: string, from: any, to: any) => {
  const lbl: Record<string, string> = {
    Join: "a player joins", GuestReady: "a guest readies, unreadies or joins late", HostStart: "the host presses start",
    LoadingStart: "a player finishes loading", PreStart: "a player is ready to fight", StartBattle: "a player spawns in",
    Timeout: "a player takes too long", GiveUp: "a player quits the match", Leave: "a player leaves the room",
    MatchEnds: "time or kill limit is reached", Closed: null as any,
  };
  return lbl[a] ?? a;
};
