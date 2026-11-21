---- MODULE RoomMatch ----
\* Room / match lifecycle of the TS game server (point-blank-webport/server/src/game/roomHandlers.ts),
\* Team Deathmatch, human players only, 3 seats: seats 0 and 2 = team FR, seat 1 = team CT. Clients are honest:
\* each sends its requests in the order the web client does (roomScreen.bootstrapBattle). Deaths / respawns, team
\* changes, countdown modes, bots, spectators and GM observers are left out.
EXTENDS Naturals, FiniteSets

S == {0, 1, 2}
Team(s) == s % 2

\* slot states, in the server's order
EMPTY == 0
NORMAL == 1
READY == 2
LOAD == 3
RENDEZVOUS == 4
PRESTART == 5
BATTLE_READY == 6
BATTLE == 7
\* room states (COUNTDOWN unused in Team Deathmatch)
R_READY == 0
R_LOADING == 2
R_RENDEZVOUS == 3
R_PRE_BATTLE == 4
R_BATTLE == 5

VARIABLES st, room, leader, udp, timer
vars == <<st, room, leader, udp, timer>>

Cnt(stv, t, lo, hi) == Cardinality({s \in S : Team(s) = t /\ stv[s] >= lo /\ stv[s] <= hi})
Present(stv) == {s \in S : stv[s] # EMPTY}

\* AllUtils.BattleEndPlayersCount: true when the match must end
MustEnd(stv, rm) ==
  LET fr == Cnt(stv, 0, BATTLE, BATTLE)
      ct == Cnt(stv, 1, BATTLE, BATTLE)
      frL == Cnt(stv, 0, LOAD, BATTLE_READY)
      ctL == Cnt(stv, 1, LOAD, BATTLE_READY)
  IN rm >= R_LOADING /\ ~( ((fr > 0 /\ ct > 0) \/ rm # R_BATTLE) /\ ((frL > 0 /\ ctL > 0) \/ rm > R_PRE_BATTLE) )

\* resetBattleInfo: every seat in the match back to the room, room READY, UDP host forgotten
ResetSt(stv) == [s \in S |-> IF stv[s] >= LOAD THEN NORMAL ELSE stv[s]]
ResetTm(stv, tmv) == [s \in S |-> IF stv[s] >= LOAD THEN FALSE ELSE tmv[s]]

\* RoomModel.setNewLeader(-1, floor, old): first other seat above the floor; a READY new leader goes NORMAL
NewLeader(stv, floor, old) ==
  LET c == {s \in S : s # old /\ stv[s] # EMPTY /\ stv[s] > floor}
  IN IF c = {} THEN old ELSE CHOOSE s \in c : \A o \in c : s <= o
UnreadyLeader(stv, ld) == IF stv[ld] = READY THEN [stv EXCEPT ![ld] = NORMAL] ELSE stv

\* fix (followLeader): a starting match catches up with its (new) leader's progress
FollowRm(stv, rm, ld) ==
  IF rm < R_LOADING \/ rm >= R_BATTLE THEN rm
  ELSE LET r1 == IF stv[ld] >= RENDEZVOUS /\ rm < R_RENDEZVOUS THEN R_RENDEZVOUS ELSE rm
       IN IF stv[ld] >= PRESTART /\ r1 < R_PRE_BATTLE THEN R_PRE_BATTLE ELSE r1
FollowUdp(stv, rm, ud, ld) == ud \/ (rm >= R_LOADING /\ rm < R_BATTLE /\ stv[ld] >= RENDEZVOUS)

\* write the post-handler values; `check` = the handler calls BattleEndPlayersCount
Settle(st1, tm1, rm1, ud1, ld1, check) ==
  IF check /\ MustEnd(st1, rm1)
  THEN st' = ResetSt(st1) /\ timer' = ResetTm(st1, tm1) /\ room' = R_READY /\ udp' = FALSE /\ leader' = ld1
  ELSE st' = st1 /\ timer' = tm1 /\ room' = rm1 /\ udp' = ud1 /\ leader' = ld1

Init == st = [s \in S |-> IF s = 0 THEN NORMAL ELSE EMPTY] /\ room = R_READY /\ leader = 0 /\ udp = FALSE
        /\ timer = [s \in S |-> FALSE]

\* handleJoinRoom: the room has a leader; the player takes a free seat
Join(s) == st[s] = EMPTY /\ st[leader] # EMPTY
           /\ st' = [st EXCEPT ![s] = NORMAL] /\ UNCHANGED <<room, leader, udp, timer>>

\* handleReadyBattle, guest branch
GuestReady(s) ==
  /\ s # leader /\ st[leader] # EMPTY
  /\ IF st[leader] >= LOAD /\ room >= R_LOADING
     THEN st[s] = NORMAL /\ st' = [st EXCEPT ![s] = LOAD]                       \* late joiner goes straight to loading
     ELSE \/ st[s] = NORMAL /\ st' = [st EXCEPT ![s] = READY]
          \/ st[s] = READY /\ st' = [st EXCEPT ![s] = NORMAL]
  /\ UNCHANGED <<room, leader, udp, timer>>

\* handleReadyBattle, leader branch (Team Deathmatch: no countdown) + startBattle
HostStart ==
  LET fr == Cnt(st, 0, READY, READY)
      ct == Cnt(st, 1, READY, READY)
      e0 == IF Team(leader) = 0 THEN ct ELSE fr
      enemies == IF fr + ct = 2 /\ e0 = 0 THEN 1 ELSE e0
      st1 == [st EXCEPT ![leader] = READY]
  IN /\ room = R_READY /\ st[leader] # EMPTY /\ enemies > 0
     /\ st' = [s \in S |-> IF st1[s] = READY THEN LOAD ELSE st1[s]]
     /\ room' = R_LOADING /\ UNCHANGED <<leader, udp, timer>>

\* handleLoadingStart (starts the 90 s loading counter)
LoadingStart(s) ==
  /\ room >= R_LOADING /\ st[s] = LOAD
  /\ st' = [st EXCEPT ![s] = RENDEZVOUS] /\ timer' = [timer EXCEPT ![s] = TRUE]
  /\ IF s = leader THEN udp' = TRUE /\ room' = IF room < R_RENDEZVOUS THEN R_RENDEZVOUS ELSE room ELSE UNCHANGED <<udp, room>>
  /\ UNCHANGED leader

\* handlePreStartBattle; a guest's client first waits for the room to reach RENDEZVOUS (the host's LOADING_START)
PreStart(s) ==
  /\ st[s] = RENDEZVOUS /\ (s = leader \/ room >= R_RENDEZVOUS)
  /\ IF ~(room >= R_LOADING /\ udp)
     THEN Settle([st EXCEPT ![s] = NORMAL], [timer EXCEPT ![s] = FALSE], room, udp, leader, TRUE)
     ELSE Settle([st EXCEPT ![s] = PRESTART], [timer EXCEPT ![s] = TRUE],
                 IF s = leader /\ room < R_PRE_BATTLE THEN R_PRE_BATTLE ELSE room, udp, leader, FALSE)

\* handleStartBattle (+ spawnReadyPlayers / executeSpawnReadyPlayers, countdownIG 0)
StartBattle(s) ==
  /\ st[s] = PRESTART
  /\ IF room < R_LOADING
     THEN st' = [st EXCEPT ![s] = NORMAL] /\ UNCHANGED <<room, leader, udp, timer>>
     ELSE LET st1 == [st EXCEPT ![s] = BATTLE_READY]
              fr == Cnt(st1, 0, LOAD, BATTLE)
              ctn == Cnt(st1, 1, LOAD, BATTLE)
              rFr == Cnt(st1, 0, BATTLE_READY, BATTLE)
              rCt == Cnt(st1, 1, BATTLE_READY, BATTLE)
              f3 == st1[leader] >= BATTLE_READY /\ rCt > ctn \div 2 /\ rFr > fr \div 2
              spawn == room = R_BATTLE \/ f3
          IN /\ st' = IF spawn THEN [x \in S |-> IF st1[x] = BATTLE_READY THEN BATTLE ELSE st1[x]] ELSE st1
             /\ room' = IF spawn /\ room < R_BATTLE THEN R_BATTLE ELSE room  \* fix: the first spawn opens the battle
             /\ timer' = [timer EXCEPT ![s] = FALSE] /\ UNCHANGED <<leader, udp>>

\* handleGiveUpBattle -> quitMatch
QuitMatch(s) ==
  /\ LET n1 == Cardinality({x \in S \ {s} : Team(x) = 0 /\ st[x] >= LOAD})
         n2 == Cardinality({x \in S \ {s} : Team(x) = 1 /\ st[x] >= LOAD})
         tFR == Cardinality({x \in S \ {s} : Team(x) = 0 /\ st[x] = BATTLE})
         tCT == Cardinality({x \in S \ {s} : Team(x) = 1 /\ st[x] = BATTLE})
         ok == (room # R_BATTLE \/ (tFR > 0 /\ tCT > 0)) /\ (room > R_PRE_BATTLE \/ (n1 > 0 /\ n2 > 0))
         ld == IF s = leader /\ ok THEN NewLeader(st, IF room = R_BATTLE THEN BATTLE_READY ELSE READY, leader) ELSE leader
         st1 == [UnreadyLeader(st, ld) EXCEPT ![s] = NORMAL]
         tm1 == [timer EXCEPT ![s] = FALSE]
     IN IF ~ok \/ ~(\E x \in S : st1[x] >= LOAD)
        THEN st' = ResetSt(st1) /\ timer' = ResetTm(st1, tm1) /\ room' = R_READY /\ udp' = FALSE /\ leader' = ld
        ELSE st' = st1 /\ timer' = tm1 /\ room' = FollowRm(st1, room, ld) /\ udp' = FollowUdp(st1, room, udp, ld) /\ leader' = ld

GiveUp(s) == room >= R_LOADING /\ st[s] >= LOAD /\ QuitMatch(s)

\* startCounter timeout (90 s loading / 30 s prestart): kicked back to the room; fix: the leader quits the match
Timeout(s) == timer[s] /\ st[s] # EMPTY
  /\ IF s = leader THEN QuitMatch(s) ELSE Settle([st EXCEPT ![s] = NORMAL], [timer EXCEPT ![s] = FALSE], room, udp, leader, TRUE)

\* removePlayer (leave the room, back to the lobby, or disconnect); ends with updateSlotsInfo's leader hand-over
Leave(s) ==
  /\ st[s] # EMPTY
  /\ LET inMatch == st[s] >= LOAD
         host == inMatch /\ s = leader
         floor == IF room = R_BATTLE THEN BATTLE_READY ELSE IF room >= R_LOADING THEN READY ELSE EMPTY
         ld1 == IF host /\ Present(st) \ {s} # {} THEN NewLeader(st, floor, leader) ELSE leader
         st1 == [UnreadyLeader(st, ld1) EXCEPT ![s] = EMPTY]
         tm1 == [timer EXCEPT ![s] = FALSE]
         ends1 == room >= R_LOADING /\ MustEnd(st1, room)
         st2 == IF ends1 THEN ResetSt(st1) ELSE st1
         rm2 == IF ends1 THEN R_READY ELSE room
         ends2 == rm2 \in {R_LOADING, R_RENDEZVOUS} /\ (host \/ st2[ld1] = BATTLE_READY)
         st3 == IF ends2 THEN ResetSt(st2) ELSE st2
         tm3 == IF ends1 \/ ends2 THEN ResetTm(st1, tm1) ELSE tm1
         rm3 == IF ends2 THEN R_READY ELSE rm2
         ld3 == IF st3[ld1] = EMPTY /\ Present(st3) # {} THEN NewLeader(st3, EMPTY, ld1) ELSE ld1
         st4 == UnreadyLeader(st3, ld3)
         ud3 == IF ends1 \/ ends2 THEN FALSE ELSE udp
     IN /\ st' = st4 /\ timer' = tm3 /\ room' = FollowRm(st4, rm3, ld3) /\ leader' = ld3
        /\ udp' = FollowUdp(st4, rm3, ud3, ld3)

\* the clock runs out or the kill limit is reached (TIMERSYNC 0 / DEATH): finishMatch
MatchEnds == room = R_BATTLE
  /\ st' = ResetSt(st) /\ timer' = ResetTm(st, timer) /\ room' = R_READY /\ udp' = FALSE /\ UNCHANGED leader

\* everyone left: the room is gone
Closed == Present(st) = {} /\ UNCHANGED vars

Next == \/ \E s \in S : Join(s) \/ GuestReady(s) \/ LoadingStart(s) \/ PreStart(s) \/ StartBattle(s)
                     \/ Timeout(s) \/ GiveUp(s) \/ Leave(s)
        \/ HostStart \/ MatchEnds \/ Closed

\* ---- rules ----
HostInMatch == room >= R_LOADING => st[leader] >= LOAD
SomeoneInMatch == room >= R_LOADING => \E s \in S : st[s] >= LOAD
BothTeamsInBattle == room = R_BATTLE => (\E s \in S : Team(s) = 0 /\ st[s] = BATTLE) /\ (\E s \in S : Team(s) = 1 /\ st[s] = BATTLE)
LeaderSeated == Present(st) # {} => st[leader] # EMPTY
PlayingOnlyInBattle == (\E s \in S : st[s] = BATTLE) => room = R_BATTLE
NoStrayCounter == \A s \in S : timer[s] => st[s] >= LOAD
\* a match only moves forward until it ends (back to the room)
NoGoingBack == [][room' >= room \/ room' = R_READY]_vars
====
