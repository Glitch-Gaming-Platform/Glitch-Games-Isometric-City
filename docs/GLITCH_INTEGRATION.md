# Glitch Integration

Glitch is implemented as an optional layer. Normal local builds behave as they did before. A build becomes Glitch-backed only when `NEXT_PUBLIC_GLITCH_ENABLED=1`.

## Title Registry

The shared registry lives in `src/lib/glitch/config.ts`.

| game | route | title id | runtime token env | deploy token env |
| --- | --- | --- | --- | --- |
| IsoCity | `/` and `/coop/[roomCode]` | `ed2b4375-3918-4916-8736-aae299226363` | `NEXT_PUBLIC_GLITCH_ISOCITY_TITLE_TOKEN` | `GLITCH_ISOCITY_DEPLOY_TOKEN` |
| IsoCoaster | `/coaster` and `/coaster/coop/[roomCode]` | `e51bcfd1-ffda-4038-b124-b4cb090fb8a7` | `NEXT_PUBLIC_GLITCH_COASTER_TITLE_TOKEN` | `GLITCH_COASTER_DEPLOY_TOKEN` |

Runtime title tokens are client credentials for install/cloud-save/progression/multiplayer routes. Deploy tokens are not client credentials and are only read by scripts.

## Runtime Boot Flow

`src/lib/glitch/GlitchProvider.tsx` performs the runtime boot sequence:

1. Detect the game from the route or `NEXT_PUBLIC_GLITCH_GAME_KEY`.
2. Create a `GlitchClient` with the title id and runtime title token.
3. Create or reuse an install with `POST /titles/{title_id}/installs`.
4. Persist Glitch's returned `install_id`.
5. Validate access with `POST /titles/{title_id}/installs/{install_id}/validate`.
6. Block play when `valid` is false or the token is missing while the flag is enabled.
7. Refresh the install every 60 seconds by reusing the same `user_install_id` and `session_id`.

The provider never reads deploy tokens, admin JWTs, or server tokens.

## Cloud Saves

Cloud save support is in `src/lib/glitch/cloudSave.ts` and `src/hooks/useGlitchGameServices.ts`.

The hook runs inside each game component and is inert unless Glitch is validated. It stores slot `0` autosaves by:

1. Serializing the current game state to JSON bytes.
2. Base64 encoding those raw bytes.
3. Computing SHA-256 over the decoded raw bytes, not the base64 string.
4. Sending `slot_index`, `payload`, `checksum`, `save_type`, `client_timestamp`, and `base_version`.
5. Storing the returned cloud `version` in localStorage for optimistic concurrency.

If Glitch returns a 409 conflict, the code logs the conflict object and does not overwrite silently. A future UI can surface `keep_server` versus `use_client` using `resolveSaveConflict`.

When the player is inside a multiplayer room, autosaves intentionally store a per-user rejoin handle instead of the full shared world. That handle contains the game key, room code, saved timestamp, player count, and `source_of_truth: glitch_lobby_event_log`. This prevents each player from creating a competing personal cloud copy of the same city. Solo play still stores the full local state in the user's cloud slot.

Guest installs may receive `GUEST_NOT_ALLOWED` for cloud saves. That is handled as a skip rather than a crash.

## Multiplayer and MMO

`src/lib/multiplayer/providerFactory.ts` selects the provider:

- Glitch disabled: existing Supabase realtime provider.
- Glitch enabled: `src/lib/multiplayer/glitchProvider.ts`.

The Glitch provider uses documented multiplayer routes:

- Creates public lobbies with `game_mode` set to `isocity-coop` or `coaster-coop` unless a future caller explicitly marks the room private.
- Uses the existing 5-character room code as `map_name` and `metadata.room_code`.
- Stores a deterministic room seed in lobby metadata: game key, room code, city/park name, grid size, capacity, and `source_of_truth`.
- Lets creators set the number of builder slots, clamped to 1-64 for the current browser-client topology.
- Lists public joinable rooms through `GET /titles/{title_id}/multiplayer/lobbies`.
- Joins rooms by searching lobbies with that game mode and map name.
- Sends small edit commands through lobby messages with `message_type: "system"`.
- Replays ordered lobby messages from sequence 0 for late joiners, starting from the deterministic room seed.
- Splits oversized placement batches and drops anything that still exceeds the documented 4 KB control-plane limit.
- Sends text chat as `message_type: "chat"` lobby messages and displays the last 100 messages.
- Creates or joins Glitch voice rooms attached to the lobby, stores voice participant tokens only in memory, heartbeats voice state, and uses the documented packet/poll fallback for browser microphone chunks when supported.
- Attempts MMO presence by listing an existing active realm and city zone, then calling `world/enter` and `world/presence`.

Important limitation: the attached Glitch docs explicitly say lobby messages are a control plane and not realtime gameplay replication. There is no documented shared room-state database endpoint in the exported context. For that reason, large full-state snapshots are not pushed through Glitch lobby messages. The current implementation uses an event-sourced room model: deterministic seed plus ordered, compact edit actions. This gives horizontally scalable active rooms because no browser is the only persisted source of truth, but it is still not a replacement for a dedicated authoritative simulation server for very large or long-lived MMO worlds.

The existing Supabase provider remains the fallback when Glitch is disabled. Supabase still provides database-backed shared room state in that mode. Voice chat is marked unsupported in Supabase fallback because the requested voice implementation is tied to Glitch voice rooms and participant tokens.

## Achievements and Leaderboards

The client wrapper implements the documented shared submit endpoint:

`POST /titles/{title_id}/installs/{install_id}/submit`

The current dashboard export says no leaderboard or achievement definitions are loaded for either title. The game therefore does not invent api keys. Configure these env lists after creating definitions in Glitch:

- `NEXT_PUBLIC_GLITCH_ISOCITY_LEADERBOARD_KEYS`
- `NEXT_PUBLIC_GLITCH_ISOCITY_STAT_KEYS`
- `NEXT_PUBLIC_GLITCH_COASTER_LEADERBOARD_KEYS`
- `NEXT_PUBLIC_GLITCH_COASTER_STAT_KEYS`

Future code can then map in-game metrics to those exact keys.

## Deployment

This is a Next.js app, so the correct Glitch deployment type is `node` and the entry point is `server.js`. Static `iframe` or `wasm` deployment would not include the Next server.

Scripts:

```bash
npm run build:glitch:isocity
npm run build:glitch:coaster
npm run deploy:glitch:isocity:dry-run
npm run deploy:glitch:coaster:dry-run
npm run deploy:glitch:isocity
npm run deploy:glitch:coaster
```

Deploy scripts build a standalone Next artifact, copy `.next/static` and `public`, write `glitch.deploy.json`, run a Glitch CLI dry-run, then upload only when the deploy script includes `--deploy`.

Node deployments also require a root `Dockerfile` in the uploaded ZIP. The artifact builder writes a minimal Dockerfile that runs the standalone Next server on `PORT=3000`, sets `HOSTNAME=0.0.0.0`, removes host-platform `node_modules`, and runs `npm ci --omit=dev` inside the Linux container. `package-lock.json` is copied into the artifact for that install step. Generated artifacts live under `.glitch-build/` and are gitignored.

Use local shell or CI secrets:

```bash
export GLITCH_ISOCITY_TITLE_TOKEN="..."
export GLITCH_ISOCITY_DEPLOY_TOKEN="..."
export GLITCH_COASTER_TITLE_TOKEN="..."
export GLITCH_COASTER_DEPLOY_TOKEN="..."
```

Never store deploy tokens in source, `public/`, `.env.example`, or `NEXT_PUBLIC_*` variables.
