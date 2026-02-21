# GenZ

**AI-powered chat and voice assistant** — multi-agent, streaming, and extensible. Chat with built-in and custom agents, use voice, attach knowledge, and publish or discover agents in the marketplace.

---

## Features

| Area | Capabilities |
|------|----------------|
| **Chat** | Real-time streaming (SSE), markdown rendering, code blocks, citations, image generation in-conversation |
| **Agents** | Default agents (GenZ, Coder, Writer, Image, Research, Web) + custom agents with instructions and skills |
| **Skills** | Web search, knowledge base (RAG), image generation, memory; pluggable skill system |
| **Voice** | Live voice conversations over WebSocket with Gemini native audio |
| **Knowledge** | Upload PDFs/documents per agent; chunking, embedding, and retrieval for RAG |
| **Marketplace** | Publish agents, browse listings, download (copy) agents; optional auth for “already downloaded” |
| **Auth** | JWT-based auth; sign up, sign in, refresh; Supabase for profiles and persistence |

---

## Project structure

```
GenZ/
├── client/                 # React Native (Expo) app — iOS, Android, Web
│   ├── src/
│   │   ├── components/     # UI (chat, voice, sidebar, etc.)
│   │   ├── screens/       # Screens (Home, Chat, Agents, Marketplace, Settings)
│   │   ├── navigation/    # React Navigation (tabs, drawer, stacks)
│   │   ├── services/      # API client, auth
│   │   ├── contexts/      # Auth, Theme, App
│   │   └── constants/     # Agents, theme, config
│   └── app.json
├── server/                 # Go API (Gin)
│   ├── main.go
│   ├── config/            # Env-based config
│   ├── handlers/          # HTTP handlers (auth, chat, voice, agents, marketplace, knowledge)
│   ├── middleware/        # Auth, CORS, logger
│   ├── routes/            # Route setup
│   ├── database/          # Supabase client init
│   ├── services/          # Web search, research, PDF
│   ├── internal/          # Domain, agents, skills, prompts, clients (Gemini)
│   ├── models/            # Request/response and DB models
│   ├── migrations/        # SQL migrations (001–009)
│   └── utils/             # JWT, etc.
├── audio-orb/             # Standalone audio visualizer (Vite + TS)
├── docs/                  # Architecture, setup, marketplace planning
└── README.md
```

---

## Quick start

### Prerequisites

- **Go** 1.24+ (server)
- **Node.js** 18+ and **Bun** or **npm** (client)
- **Supabase** project (URL, anon key, service role secret)
- **Gemini API key** (Google AI Studio)

### 1. Clone and install

```bash
git clone <repo-url>
cd GenZ
cd server && go mod download && cd ..
cd client && bun install   # or npm install
```

### 2. Server

```bash
cd server
cp .env.example .env   # if present; otherwise create .env
# Set: SUPABASE_URL, SUPABASE_KEY, SUPABASE_SECRET, JWT_SECRET, GEMINI_API_KEY
go run main.go
```

Runs at `http://localhost:8080`. Health: `GET /health`.

### 3. Client

```bash
cd client
cp .env.example .env   # optional: set EXPO_PUBLIC_DEV_IP and EXPO_PUBLIC_API_PORT for device testing
bun start   # or npm start
```

Then open in Expo Go (mobile) or web. Set `EXPO_PUBLIC_DEV_IP` to your machine IP when testing on a physical device (e.g. `ipconfig getifaddr en0`).

### 4. Database

Apply migrations in order (`001_*.sql` … `009_*.sql`) to your Supabase (or Postgres) database.

---

## Configuration

### Server (`.env` in `server/`)

CORS allows only `http://localhost:PORT` and `http://127.0.0.1:PORT`; `PORT` comes from env (default `8080` if unset).

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SECRET` | Yes | Supabase service role secret |
| `JWT_SECRET` | Yes | Secret for signing/verifying JWTs |
| `GEMINI_API_KEY` | Yes* | Gemini API key for chat/voice (*optional if not using LLM) |
| `PORT` | No | Server port (default `8080`) |
| `APP_ENV` | No | `development` \| `production` |
| `SERP_API_KEY` | No | SerpAPI key for web search skill |
| `GEMINI_VOICE_MODEL` | No | Voice model ID (default: Gemini 2.5 Flash native audio) |
| `GEMINI_LIVE_API_VERSION` | No | `v1beta` or `v1alpha` |

### Client

- **`client/.env`** (optional): `EXPO_PUBLIC_DEV_IP` (machine IP for device testing), `EXPO_PUBLIC_API_PORT` (default `8080`). In dev, API base is `http://<DEV_IP>:<PORT>/api/v1`.

---

## API overview

| Group | Endpoints | Auth |
|-------|-----------|------|
| Health | `GET /health` | — |
| Auth | `POST /api/v1/auth/signup`, `signin`, `signout`, `refresh` | Public |
| Auth | `GET /api/v1/auth/me` | JWT |
| Chat | `POST /api/v1/chat?stream=true` | JWT |
| Chats | `GET/DELETE /api/v1/chats`, `GET /api/v1/chats/:id/messages` | JWT |
| Upload | `POST /api/v1/upload/pdf` | JWT |
| Agents | `CRUD /api/v1/agents`, `GET /api/v1/agents/:id` | JWT |
| Knowledge | `POST/GET/DELETE /api/v1/agents/:id/knowledge` | JWT |
| Profile | `GET/PUT/DELETE /api/v1/profile`, `GET /api/v1/profile/:id` | JWT |
| Prompts | `POST /api/v1/prompts/generate` | JWT |
| Voice | `GET /api/v1/voice/stream` (WebSocket) | Query token |
| Marketplace | `GET /api/v1/marketplace/listings`, `GET .../listings/:id` | Optional JWT |
| Marketplace | `POST/PUT/DELETE /api/v1/marketplace/listings`, `.../listings/mine`, `.../listings/:id/download` | JWT |

---

## Tech stack

- **Client:** React Native (Expo 54), React Navigation, TypeScript, Gluestack UI, Expo AV / audio
- **Server:** Go 1.24, Gin, JWT, WebSockets, Supabase (Postgres)
- **AI:** Google Gemini (chat + native voice), SerpAPI (web search), RAG via embeddings and vector search
- **Database:** Supabase (PostgreSQL); migrations in `server/migrations/`

---

## License

See [LICENSE](LICENSE) if present. Otherwise, all rights reserved.
