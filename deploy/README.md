# Host a private Point Blank playtest with Docker

This runs the production frontend, Node backend and PostgreSQL on one Linux Docker host. Caddy supplies HTTPS. The room leader's browser still hosts the match simulation; Docker hosts accounts, rooms, signaling and persistent progress. TURN relays gameplay when direct WebRTC fails.

Start with desktop Chrome, NStation, Death Match and two to four friends. Other maps/modes and the full catalog have not passed this playtest. Keep the host's game tab open. The native away timer returns inactive players to the room after 60 seconds. Server restarts interrupt matches; deploy between sessions. Use one backend replica: rooms and signaling are in process memory.

## 1. Prepare files and configuration

Install Docker Engine with Compose on the host. Copy this repository's code and your converted `portable/assets/` directory to the host. Preserve its relative symlinks (`cross`, `ui/cross`, `sfx/cross`, `config`). Do not copy or execute the original Windows programs. Assets are mounted read-only and are excluded from application images.

From the repository root:

```sh
cp deploy/env.example deploy/.env
chmod 600 deploy/.env
```

Edit `deploy/.env`: set `PB_DOMAIN` to your hostname, `PB_ORIGIN` to `https://` plus that hostname, `PB_ASSETS_DIR` to the absolute converted asset directory, and `PB_DB_PASSWORD` to a unique random password. Keep `PB_BIND_HOST=127.0.0.1`. The example values are not deployable credentials. Point the hostname's DNS to this host. Open TCP 80 and 443 for Caddy. PostgreSQL, backend port 8090 and the old raw game TCP ports stay private.

Provide TURN before inviting friends. Use either the existing `CF_TURN_KEY_ID`/`CF_TURN_API_TOKEN` integration, which issues short-lived relay credentials, or an authenticated TURN service with `TURN_URLS`, `TURN_USERNAME` and `TURN_CREDENTIAL`. These belong in the server environment, never in `VITE_*` build arguments. Include UDP and a TLS/TCP fallback if the service supports both.

For self-hosted coturn on Linux, copy `turnserver.conf.example` to `turnserver.conf`, replace all REPLACE fields, and match its username/password to the backend environment. Set its real public IP and open TCP/UDP 3478 and UDP 49160–49259. Start it by adding `-f deploy/compose.turn.yaml` to the Compose command. The supplied example has no TLS listener; configure its certificate and port 5349 before advertising a `turns:` URL. An HTTP reverse proxy cannot carry TURN UDP. TLS on TURN port 443 requires a separate public IP/host from Caddy's HTTPS listener. The UDP fault-injection test used a native loopback helper because Colima's UDP forwarding is not representative of Linux host networking. A separate Docker-only TCP relay is supplied for a local Mac preview.

References: [coturn Docker setup](https://github.com/coturn/coturn/blob/master/docker/coturn/README.md), [coturn configuration](https://github.com/coturn/coturn/blob/master/docker/coturn/turnserver.conf).

## 2. Build and start

```sh
docker build -f deploy/Dockerfile --target backend -t pb-friends-backend:local .
docker build -f deploy/Dockerfile --target frontend -t pb-friends-frontend:local .
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile public up -d --wait
```

The default build tries direct WebRTC and falls back to TURN. To prove relay connectivity, rebuild the frontend with `--build-arg VITE_RELAY_ONLY=1`, recreate the frontend container and repeat the test. Restore the default build after that test unless you want to require relaying.

Caddy stores certificate state in named volumes. PostgreSQL initializes its schema on the first empty volume and preserves accounts across container restarts. `docker compose down` preserves volumes; **do not add `-v`** to a normal stop or upgrade.

For loopback testing without HTTPS, set `PB_ORIGIN=http://localhost:18800` and omit `--profile public`. The normal local development instance on port 8000 is separate from this stack.

For a Docker-only Mac/Colima preview, set dedicated local `TURN_USERNAME`/`TURN_CREDENTIAL` values and start with both files:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.local-turn.yaml up -d --wait
```

This override uses an authenticated TCP TURN listener bound to loopback. Its advertised loopback relay addresses work only for browsers on this computer. Do not use it for friends on the internet; use the public TURN configuration above instead.

## 3. Verify before sharing

With server dependencies installed locally, run the read-only deployment check:

```sh
node deploy/check.mjs https://YOUR_HOSTNAME
```

It checks database readiness, the production bundle, actual map bytes, missing-file behavior, allowed WebSocket upgrades and refusal of untrusted origins. `/health` is process liveness; `/ready` includes PostgreSQL. A healthy HTTP server does not prove TURN connectivity.

Have two accounts connect from different networks (for example home Wi-Fi and a phone hotspot). Join Server 1, Channel 1 and the same NStation Death Match room. The guest selects Ready; the leader selects Start. Check both players moving, firing, kills, respawn, Options/Cancel, Exit, result screens and a rematch. Set a room password if you want to restrict joining. Repeat with the relay-only build. Check browser WebRTC statistics for a selected `relay` candidate; merely configuring TURN is not proof that it carried traffic.

Before calling the session ready, confirm that your actual public relay supports the fallback path you advertise. Local measurements do not establish internet ping, Wi-Fi stability or frame rate on your friends' computers. Host handoff and reconnect have automated coverage; an internet test with three friends remains useful before a longer session.

## 4. Operate and back up

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
docker compose --env-file deploy/.env -f deploy/compose.yaml logs --tail=100 backend
./deploy/backup.sh .env
```

`backup.sh` resolves `.env` relative to `deploy/`, writes a private PostgreSQL custom-format dump to `deploy/backups/` and removes a failed partial dump. Copy backups to another machine and retain several versions. Schedule this command with your host's normal scheduler. Certificate volumes are separate from database backups.

To test a backup without overwriting progress, restore into a new scratch database:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T postgres createdb -U pb pb_restore_check
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T postgres pg_restore -U pb -d pb_restore_check --no-owner < deploy/backups/YOUR_BACKUP.dump
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T postgres psql -U pb -d pb_restore_check -c 'SELECT count(*) FROM accounts;'
```

For disaster recovery, keep the old volume, create a fresh stack/database, restore the dump there, verify it, then switch service to it. Do not experiment with `pg_restore --clean` against the live database.

Build updated images before a scheduled restart, take a backup, and run `up -d`. Keep the previous image tag/digest for rollback. Do not horizontally scale or use rolling overlap for the backend; startup resets stale online flags under the single-process ownership assumption. Compose uses the stable project name `pb`; for an isolated test stack, override `COMPOSE_PROJECT_NAME` consistently for every command, including backups.

## Current scope

The private Death Match path is the readiness target. Missing dinosaur icons, mission artwork mismatches and incomplete clan/community features remain. The game host is player-controlled; this is not a trusted dedicated match server. No public domain, public relay credentials or hosting machine have been configured by this setup. The next external gate is the two-network relay-only test above.
