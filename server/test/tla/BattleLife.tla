---- MODULE BattleLife ----
\* One victim's lives in a running battle, against the battle guard of the TS game server (roomHandlers.ts handleDeath /
\* deathReqError / respawnSlot). Honest clients (src/net/battle.ts): the killer's client sends DEATH_REQ when it sees the
\* victim's kill mark; the victim's client respawns on its own RespawnTime and sends RESPAWN. The two travel on different
\* connections, each delivered in order, at most MaxLag ticks late. 1 tick = 0.5 s.
EXTENDS Naturals, FiniteSets

CONSTANTS MaxLag, Horizon
R == 10       \* Character.pef RespawnTime 5 s (no respawn coupon)
SLACK == 3    \* RESPAWN_SLACK_MS 1.5 s
NONE == 99

VARIABLES t, cAlive, seenAt, cDeadAt, sDead, sDeathAt, deaths, held, deathQ, respQ, strikes, lost, stale
vars == <<t, cAlive, seenAt, cDeadAt, sDead, sDeathAt, deaths, held, deathQ, respQ, strikes, lost, stale>>

\* in-flight messages: arrival ticks, in send order (one connection each)
Last(q) == IF q = {} THEN 0 ELSE CHOOSE a \in q : \A b \in q : b <= a
Arrivals(q) == {a \in t .. t + MaxLag : a >= Last(q)}

Init == t = 0 /\ cAlive = TRUE /\ seenAt = 0 /\ cDeadAt = NONE /\ sDead = FALSE /\ sDeathAt = 0 /\ deaths = 0 /\ held = NONE
        /\ deathQ = {} /\ respQ = {} /\ strikes = 0 /\ lost = 0 /\ stale = 0

\* the victim is killed on the clients; the killer's DEATH_REQ is on its way
\* (only once the killer's client has seen this life: the victim's P2P state, up to MaxLag after its respawn)
Killed == cAlive /\ t >= seenAt /\ \E a \in Arrivals(deathQ) :
  /\ cAlive' = FALSE /\ UNCHANGED seenAt /\ cDeadAt' = t /\ deathQ' = deathQ \cup {a}
  /\ UNCHANGED <<t, sDead, sDeathAt, deaths, held, respQ, strikes, lost, stale>>

\* the victim's client comes back after RespawnTime and sends RESPAWN
Respawns == ~cAlive /\ t = cDeadAt + R /\ \E a \in Arrivals(respQ), p \in 0 .. MaxLag :
  /\ cAlive' = TRUE /\ seenAt' = t + p /\ cDeadAt' = NONE /\ respQ' = respQ \cup {a}
  /\ UNCHANGED <<t, sDead, sDeathAt, deaths, held, deathQ, strikes, lost, stale>>

\* DEATH_REQ reaches the server: deathReqError, then the death.
\* fix: a victim the server still has dead respawned on its client (an honest killer reports one kill per life), its RESPAWN
\* still on the way: the death starts a new life, and that RESPAWN, when it comes, is stale (a held one is dropped now)
DeathArrives == t \in deathQ /\ deathQ' = deathQ \ {t} /\ UNCHANGED <<t, cAlive, seenAt, cDeadAt, respQ, lost>>
  /\ IF deaths >= 1 + (t \div R)                                                               \* lives in its time in battle
     THEN strikes' = strikes + 1 /\ UNCHANGED <<sDead, sDeathAt, deaths, held, stale>>
     ELSE /\ sDead' = TRUE /\ sDeathAt' = t /\ deaths' = deaths + 1 /\ UNCHANGED strikes
          /\ held' = NONE
          /\ stale' = IF sDead /\ held = NONE THEN stale + 1 ELSE stale

\* RESPAWN reaches the server: served, or held until RespawnTime - slack after the server's death time
RespawnArrives == t \in respQ /\ respQ' = respQ \ {t} /\ UNCHANGED <<t, cAlive, seenAt, cDeadAt, sDeathAt, deaths, deathQ, strikes, lost>>
  /\ IF stale > 0 THEN stale' = stale - 1 /\ UNCHANGED <<sDead, held>>
     ELSE UNCHANGED stale /\ IF sDead /\ sDeathAt + R - SLACK > t THEN held' = sDeathAt + R - SLACK /\ UNCHANGED sDead
     ELSE sDead' = FALSE /\ held' = NONE

HeldRespawn == held = t /\ sDead' = FALSE /\ held' = NONE
  /\ UNCHANGED <<t, cAlive, seenAt, cDeadAt, sDeathAt, deaths, deathQ, respQ, strikes, lost, stale>>

\* time moves on once everything due now has happened
Tick == t < Horizon /\ t \notin deathQ /\ t \notin respQ /\ held # t /\ ~(~cAlive /\ t = cDeadAt + R)
  /\ t' = t + 1 /\ UNCHANGED <<cAlive, seenAt, cDeadAt, sDead, sDeathAt, deaths, held, deathQ, respQ, strikes, lost, stale>>
End == t = Horizon /\ UNCHANGED vars

Next == Killed \/ Respawns \/ DeathArrives \/ RespawnArrives \/ HeldRespawn \/ Tick \/ End

\* ---- rules ----
NoStrikeForHonestPlay == strikes = 0
EveryKillCounts == lost = 0
\* with nothing in flight, the server agrees with the victim's client on whether it is alive
ServerAgrees == (deathQ = {} /\ respQ = {} /\ held = NONE) => (sDead = ~cAlive)
NoStaleLeft == (deathQ = {} /\ respQ = {}) => stale = 0
====
