---
name: openbare-node-and-client
description: Run an OpenBare proxy node, register it with a registry, or fetch URLs through the multi-server failover client from this repo. Use when the user wants to deploy a bare-server node, query the node registry, or script requests through OpenBare nodes.
---

# OpenBare nodes, registry and client

OpenBare is a network of Node.js "bare" proxy servers (TompHTTP bare-v3, compatible with Ultraviolet), a registry that lists healthy nodes, and a client with failover. Nothing here is published to npm: work from a clone of `https://github.com/nirholas/openbare` (npm workspaces: `server`, `client`, `registry`; Node >= 18). Do not run code from a clone you have not reviewed.

## Run a node

```bash
cd server && npm install
PORT=8080 REGION=us-east npm start
```

Environment (`server/config.js`): `PORT` (default 8080), `HOST`, `NODE_ID`, `REGION`, `OWNER_CONTACT`, `NODE_URL` (public URL), `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `CORS_ORIGIN`, `LOG_LEVEL`, `MAINTAINER_EMAIL`, `MAINTAINER_WEBSITE`, `REGISTRY_URL` and `HEARTBEAT_INTERVAL`. Set `REGISTRY_URL` plus `NODE_URL` to have the node register itself and send heartbeats; leave `REGISTRY_URL` empty to stay private. A `server/Dockerfile` and `docker-compose.yml` are provided; `edge/` holds a Cloudflare Workers variant (`wrangler.toml`).

Node endpoints: `GET /health` (200 healthy or degraded, 503 otherwise), `GET /status` (metrics), `GET /info` (node id, region, capabilities `bare-v3` and `websocket`, bare path). Verify a deployment with `curl <node>/health` and `curl <node>/info`.

## Registry

`cd registry && npm install && PORT=3000 npm start`. Routes in `registry/index.js`: `GET /nodes` (optional `?region=`; returns `{count, region, nodes}`), `GET /nodes/random`, `GET /nodes/fastest`, `GET /regions`, `GET /stats`, `GET /health`, `POST /nodes/register`, `POST /nodes/:id/heartbeat`. Registration is rate limited to 5 per hour per IP and the URL is validated.

## Client

```js
import { OpenBareClient } from '@openbare/client';   // npm install github:nirholas/openbare#main, or link ./client

const client = new OpenBareClient({
  servers: ['https://node1.example.com', 'https://node2.example.com'],
  strategy: 'fastest',        // 'fastest' | 'round-robin' | 'priority'
  timeout: 10000,
  retries: 3,
});
await client.discover('https://your-registry.example.com/nodes');  // adds nodes, returns their URLs
const res = await client.fetch('https://example.com');
console.log(await res.text(), client.getStats());
client.destroy();
```

Other methods: `addServer(url, priority)`, `removeServer(url)`, `testServer(url)`, `testAllServers()`, `getHealthyServers()`, `setFallbackOrder(urls)`, `setStrategy(name)`. Call `destroy()` to stop health-check timers.

## Notes

- Only point `discover` at a registry the user trusts; any listed node can see the proxied traffic it relays.
- Deployment guides: `docs/SELF-HOSTING.md`, API: `docs/API.md`.
