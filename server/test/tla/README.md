# Room / match lifecycle model (TLA+)

`RoomMatch.tla` models the TS game server's room and match start-up (roomHandlers.ts): 3 seats, Team Deathmatch, honest
clients, every request plus the loading / prestart counters. `RoomMatch.cfg` lists the rules TLC checks:

| Rule | Meaning |
| --- | --- |
| HostInMatch | while a match starts or runs, its host is in it |
| SomeoneInMatch | a starting or running match has a player in it |
| BothTeamsInBattle | a running battle has players of both teams |
| LeaderSeated | a room with players has its leader in a seat |
| PlayingOnlyInBattle | players only fight while the room is in BATTLE (kills and the clock count only then) |
| NoStrayCounter | a loading / prestart counter only runs for a seat in the match |
| NoGoingBack (property) | a match only moves forward (loading, starting, battle) until it ends |

Check (Java 11+, tla2tools.jar 1.7.4 from the TLA+ releases):

    java -XX:+UseParallelGC -cp tla2tools.jar tlc2.TLC -config RoomMatch.cfg -workers 4 RoomMatch.tla

All rules hold (486 states; 4,596 with `S == {0, 1, 2, 3}`). Before quitMatch / followLeader / isOpeningSpawn and the forward-only LOADING_START / PRESTART, TLC broke
HostInMatch, PlayingOnlyInBattle and NoGoingBack; those paths are the tests in `../matchLeader.test.ts`. Keep the model in step with
roomHandlers.ts when the start-up flow changes. Left out: deaths / respawns, countdown and round modes, bots, spectators,
GM observers, team / slot changes, rejoin seats, dishonest clients. `RoomMatch.view.ts` is the chart view for the pstack
statechart command.

## One fighter's lives in a battle (timed)

`BattleLife.tla` models one victim's deaths and respawns against the battle guard (handleDeath / deathReqError / respawnSlot)
with a clock (1 tick = 0.5 s): the killer's DEATH_REQ goes victim -> P2P -> killer -> server, the victim's RESPAWN goes
victim -> server, each connection in order, at most `MaxLag` ticks late. `BattleLife.cfg` checks 20 s of battle with up to
2 s of lag (186,650 states; holds up to 4 s, 1.2 M states):

| Rule | Meaning |
| --- | --- |
| NoStrikeForHonestPlay | honest packets never draw a battle-guard strike |
| EveryKillCounts | no honest kill is skipped as "victim already dead" |
| ServerAgrees | with nothing in flight, the server and the victim's client agree whether it is alive |
| NoStaleLeft | no stale-RESPAWN count remains once everything is delivered |

Before `respawnsInMatch` / `staleRespawns`, EveryKillCounts broke at any lag: a spawn kill whose DEATH_REQ reached the server
before the victim's RESPAWN was dropped (test: battleAntiCheat.test.ts "a spawn kill whose DEATH_REQ beats the victim's RESPAWN").
Round modes keep skipping kills of fighters already dead this round. Left out: respawn coupons, multi-kill frags, suicides.
