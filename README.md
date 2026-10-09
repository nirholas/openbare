<div align="center">  
  
# 🌐 OpenBare
 
### A decentralized, censorship-resistant web proxy network
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)

**Deploy your own node in 30 seconds** • **Use community nodes** • **Browse freely**

[Quick Start](#-quick-start) • [Deploy Your Node](#-deploy-your-own-node) • [Documentation](#-documentation) • [Contributing](#-contributing)

</div>

---

## ✨ Features

- 👀 **Instant Setup** - Deploy to Cloudflare Workers in 30 seconds
- 🌍 **Decentralized** - Community-run nodes across the globe
- ⚡ **Edge Performance** - Cloudflare Workers for <50ms latency worldwide
- 🔄 **Automatic Failover** - Client seamlessly switches between nodes
- 📊 **Built-in Monitoring** - Health checks, metrics, and status dashboard
- 🔒 **Production Ready** - Rate limiting, security headers, graceful shutdown
- 🤝 **UV Compatible** - Works with Ultraviolet and other TompHTTP clients

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            YOUR APPLICATION                             │
│                    (SperaxOS, Ultraviolet, etc.)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         OPENBARE CLIENT                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │
│  │ Server Pool │──│  Failover   │──│  Discovery  │                      │
│  │  Manager    │  │   Logic     │  │   Client    │                      │
│  └─────────────┘  └─────────────┘  └─────────────┘                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Node 1   │   │  Node 2   │   │  Node 3   │
            │  (US)     │   │  (EU)     │   │  (Asia)   │
            │  Vercel   │   │ Cloudflare│   │  Railway  │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │      OPENBARE REGISTRY        │
                    │   (Optional - Node Discovery) │
                    └───────────────────────────────┘
```

---

## 🚀 Quick Start

### Option 1: Point the Client at a Registry

The client can auto-discover nodes from a registry. `@openbare/client` is a workspace
package in this repo and is not published to npm, so import it from a clone (`npm install`
at the repo root links every workspace).

> No public registry is currently hosted: `registry.openbare.dev` does not resolve while
> hosting is being migrated. Run your own with `npm run start:registry` (see
> [`/registry`](./registry)) and point `registryUrl` at it, or skip discovery and list nodes
> explicitly as shown below.

```javascript
import { OpenBareClient } from '@openbare/client';

// With your own registry (autoDiscover is off by default)
const client = new OpenBareClient({
  registryUrl: 'http://localhost:3000',
  autoDiscover: true
});

// Or without a registry, using an explicit node list
const direct = new OpenBareClient({
  servers: ['https://openbare.xyz/bare/']
});

// Fetch any URL through the proxy network
const response = await direct.fetch('https://example.com');
```

### Option 2: Run Locally

```bash
# Clone the repo
git clone https://github.com/nirholas/openbare.git
cd openbare

# Start the server
cd server
npm install
npm start

# Server running at http://localhost:8080
# Bare endpoint at http://localhost:8080/bare/
```

### Option 3: Deploy Your Own (see below)

---

## 🌐 Deploy Your Own Node

### Recommended: Cloudflare Workers

| Platform | Deploy | Best For |
|----------|--------|----------|
| **Cloudflare Workers** ⭐ | [Deploy to Workers →](#cloudflare-workers) | Global edge, WebSocket support, free tier |
| **Render** | [render.com](https://render.com) | Persistent servers, easy setup |
| **Fly.io** | [fly.io](https://fly.io) | Global, WebSocket support |
| **Self-hosted** | [Docker →](#docker) | Full control |

> ⚠️ **Note:** Vercel and Railway don't work well for proxy servers (serverless limitations / banned dependencies).

### Cloudflare Workers (Recommended)

Deploy to 300+ edge locations worldwide with WebSocket support:

```bash
cd edge
npm install
npx wrangler login
npx wrangler deploy
```

You'll get a URL like: `https://openbare-edge.YOUR_SUBDOMAIN.workers.dev`

**Live Example:** `https://openbare.xyz`

### Docker

No prebuilt image is published yet, so build it from `server/Dockerfile`:

```bash
docker build -t openbare ./server
docker run -d \
  -p 8080:8080 \
  -e NODE_ID=my-node \
  -e REGION=us-east \
  -e NODE_URL=https://your-public-url.example \
  openbare
```

`NODE_URL` is required when `NODE_ENV=production` (the image default); the server refuses
to start without it.

### Manual Deployment

```bash
cd server
npm install
npm start
```

See [Self-Hosting Guide](docs/SELF-HOSTING.md) for detailed instructions.

---

## 📦 Components

| Package | Description | Location |
|---------|-------------|----------|
| **@openbare/server** | Node.js bare server with metrics | [`/server`](./server) |
| **@openbare/client** | Client library with failover | [`/client`](./client) |
| **@openbare/edge** | Cloudflare Workers server | [`/edge`](./edge) |
| **@openbare/registry** | Node discovery service | [`/registry`](./registry) |

---

## 🔧 Configuration

### Environment Variables

```bash
# Node Identification
NODE_ID=my-bare-node          # Unique node ID
REGION=us-east                # Geographic region
NODE_URL=https://example.com  # Public URL

# Rate Limiting
RATE_LIMIT_MAX=100            # Requests per minute
RATE_LIMIT_WINDOW_MS=60000    # Window size

# Registry (Optional)
REGISTRY_URL=http://localhost:3000  # your own registry; no public one is hosted

# Logging
LOG_LEVEL=info                # trace/debug/info/warn/error
```

See [`.env.example`](./server/.env.example) for all options.

---

## 📊 API Endpoints

Every OpenBare node exposes these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Server info and status |
| `/bare/` | * | Bare Server protocol |
| `/health` | GET | Health check (for load balancers) |
| `/status` | GET | Detailed metrics |
| `/info` | GET | Node information |

### Example Response: `GET /`

```json
{
  "status": "ok",
  "name": "OpenBare Server",
  "version": "1.0.0",
  "node_id": "us-east-abc123",
  "region": "us-east",
  "uptime_seconds": 86400,
  "requests_served": 150000,
  "healthy": true,
  "bare_endpoint": "/bare/"
}
```

---

## 📖 Documentation

- [**Architecture**](docs/ARCHITECTURE.md) - How OpenBare works
- [**Self-Hosting**](docs/SELF-HOSTING.md) - Deployment guide
- [**API Reference**](docs/API.md) - Full API documentation
- [**Client Usage**](client/README.md) - Client library guide

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone the repo
git clone https://github.com/nirholas/openbare.git
cd openbare

# Install all workspace dependencies
npm install

# Start server in dev mode
npm run dev:server

# Run tests
npm test
```

### Areas for Contribution

- 🌍 Run a public node
- 🐛 Report bugs
- 💡 Suggest features
- 📝 Improve documentation
- 🔧 Submit PRs

---

## 🔒 Security

OpenBare is designed with security in mind:

- **Rate limiting** prevents abuse
- **Helmet.js** sets security headers
- **No logging** of proxied content
- **Registry validation** prevents malicious nodes

Report security issues to: security@openbare.dev

---

## 📄 License

Proprietary - Copyright 2026 nirholas. All rights reserved. See the [LICENSE](LICENSE) file for the full terms.

---

## 🙏 Acknowledgments

- [TompHTTP](https://github.com/tomphttp) - Bare Server protocol
- [Ultraviolet](https://github.com/titaniumnetwork-dev/Ultraviolet) - Web proxy framework
- [Titanium Network](https://titaniumnetwork.org/) - Proxy community

---

<div align="center">

**[⬆ Back to Top](#-openbare)**

Made with ❤️ by the OpenBare community

</div>

## Documentation

Full documentation site: **https://nirholas.github.io/openbare/**

- [Getting started](docs/getting-started.md) covers install and first run.
- [Examples](docs/examples.md) has copy-paste snippets.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=nirholas/openbare&type=Date)](https://www.star-history.com/#nirholas/openbare&Date)
