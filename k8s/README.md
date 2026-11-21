# PB on Bev Deploy

Production URL: https://pb.bevsoft.com. Namespace: `pb`. Context: `context-cszouotwbgq` (Sydney OKE, ARM64).

This follows the [Bev Deploy skill](/Users/bevan/.claude/skills/bev-deploy/SKILL.md): Skaffold builds/pushes Docker Hub images, Kustomize declares the namespace and workloads, Traefik routes HTTPS and cert-manager renews the single-host certificate. The application frontend and backend use the same `docker.io/bevdev1/pb` image in two containers. The infrastructure relay uses `docker.io/bevdev1/pb-turn`, derived from pinned coturn 4.6.3 with its privileged file capability removed. Both run non-root, with read-only roots and all capabilities dropped.

## Data and ownership

- Shared PostgreSQL: `postgres-client.db.svc.cluster.local:5432`; database `pb`, owner `pb_user`; namespace-local Secret `pb-db`, key `url`. The database was initialized from `db/init/001_init.sql` under its dedicated owner. The seed contains no user accounts; two private smoke-test accounts were subsequently created. Create your own game account on the site.
- Converted assets: `pb-assets` RWO PVC, 50 GiB (OCI minimum volume allocation), mounted read-only in the frontend. Original executables and assets are excluded from application images.
- Match simulation runs in the leader's browser. One application replica with `Recreate` is required: rooms and signaling are in process memory. Deploy between games; restarts interrupt sessions.
- The existing database backup CronJob dumps the PostgreSQL cluster, including newly created databases. A separate first-deploy PB dump is retained outside Git. Never delete the database or PVC as a routine rollout step.

## Release

```sh
kubectl config current-context
kubectl kustomize k8s >/dev/null
skaffold diagnose
skaffold build --file-output=/tmp/pb-build.json
skaffold deploy --build-artifacts=/tmp/pb-build.json
kubectl -n pb rollout status deployment/pb --timeout=5m
kubectl -n pb rollout status deployment/pb-turn --timeout=5m
node deploy/check.mjs https://pb.bevsoft.com
```

Skaffold uses Git tag descriptions and resolves images to immutable digests. The first deployment is from the current modified working tree, recorded in `/Users/bevan/projects/pb/review/kubernetes-build-artifacts-final.json`. Do not run the generic release script against the upstream author's origin: it is not Bevan's fork. Set up an owned repository before publishing release tags.

Rollback the application between matches with `kubectl -n pb rollout undo deployment/pb`, or deploy a saved known-good build-artifacts file. Application schema updates must remain compatible with the rollback image.

## Relay and network

TURN has a dedicated OCI network load balancer with public IP recorded in `turn-address.yaml`. Backend Secret `pb-turn` supplies authenticated UDP/TCP TURN URLs and credentials. Those values must stay out of Git and frontend builds. TURN credentials are delivered to authenticated game participants as required by WebRTC; treat them as playtest credentials and rotate if abused. The server denies private/link-local/multicast peer targets and limits allocations/bandwidth.

`turn-service.yaml` exposes TCP/UDP 3478 and UDP 49160–49175. The 16 relay ports bound simultaneous allocations; this targets a small friends playtest, not a public large server. TCP transport is supported on 3478; TLS TURN on 443 is not configured, so restrictive corporate networks may still fail.

The OCI UDP service requires security management `None`. A dedicated `pb-turn` NSG allows only the published TURN ports plus relay egress. The shared worker security list has rules for this Service's exact node ports (preserved client source) and a health-check rule from the LB subnet. All pre-existing rules were preserved using an ETag-conditional update. OCI setup snapshots and the configuration scripts are under `/Users/bevan/projects/pb/review/kubernetes-*` and `configure-turn-network.py` / `update-turn-source-rules.py`. Do not rerun those initial creation scripts blindly.

Keep this Service instead of deleting/recreating it: doing so changes its public IP and allocated node ports. If recreation is unavoidable, update `turn-address.yaml`, the `pb-turn` Secret URLs, dedicated NSG/backend node-port rules and restart both relay and application. A new IP requires new allocations and interrupts games.

## Verify and operate

```sh
kubectl -n pb get pods,svc,pvc,certificate
kubectl -n pb logs deployment/pb -c backend --tail=100
kubectl -n pb logs deployment/pb-turn --tail=100
node deploy/check.mjs https://pb.bevsoft.com
```

The automated HTTP checker verifies real map bytes, production bundles, database readiness, WebSocket upgrades and origin rejection. It does not prove gameplay or TURN. Test two accounts from different networks, with both default routing and a relay-only frontend build, before calling internet gameplay verified. Keep the leader's tab open and use NStation Death Match for the initial session.

Local development (8000) and the isolated Docker preview (18800) remain separate from this new production database.

## Public relay smoke test

`PB_TEST_RELAY_ONLY=1` enables relay-only policy in the protocol integration tests. Set `PB_LIVE_TEST_PASSWORD` to a private random fixture password before running `node src/p2p/test/p2pbattle.live.ts --gw wss://pb.bevsoft.com --api https://pb.bevsoft.com --suffix UNIQUE`. This creates two test accounts, runs a real room/battle and changes their test progress. Use a unique suffix and retain the password privately; do not use the source test default password on production. The isolated `p2p2peers.test.ts` test can check the public TURN service with local signaling without creating production accounts.

Public hostname and registration are reachable without a site invitation gate. Set room passwords for friends matches. The first live checks passed; detailed deployment evidence is `/Users/bevan/projects/pb/review/kubernetes-deployment-results.md`.
