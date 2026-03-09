# DPI Engine — Deep Packet Inspection Web App

---

## What Is This?



- **Upload** `.pcap` captures (from Wireshark, tcpdump, etc.)
- **Analyze** packets with deep packet inspection
- **Identify** applications (YouTube, Netflix, TikTok, Facebook, etc.) from TLS SNI and HTTP Host headers
- **Block** traffic by IP, application, domain, or port using configurable rules
- **Visualize** traffic breakdowns, flow tables, top talkers, and timelines

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    MERN STACK                          │
│                                                        │
│  React Frontend     Express Backend     MongoDB        │
│  (Port 3000)   ──►  (Port 5000)    ──►  (Port 27017)  │
│                                                        │
│  Dashboard          /api/sessions       Sessions       │
│  Sessions    ──►    /api/packets    ──► Packets        │
│  Rules       ──►    /api/flows      ──► Flows          │
│  Detail View        /api/rules          Rules          │
│                     /api/stats                         │
└────────────────────────────────────────────────────────┘
```

---

## C++ → JavaScript DPI Engine Mapping

| C++ Component             | MERN Equivalent                          |
|---------------------------|------------------------------------------|
| `pcap_reader.cpp`         | `backend/utils/dpiEngine.js` → `parsePcapFile()` |
| `packet_parser.cpp`       | `dpiEngine.js` → `parseEthernet/IPv4/TCP/UDP()` |
| `sni_extractor.cpp`       | `dpiEngine.js` → `extractSNI()` |
| `types.cpp`               | `dpiEngine.js` → `sniToAppType()` |
| `rule_manager.h`          | `backend/models/Rule.js` + `checkRules()` |
| `connection_tracker.h`    | Flow tracking in `processPcapBuffer()` |
| `dpi_mt.cpp` (output)     | `backend/routes/sessions.js` → MongoDB storage |
| Terminal output           | React dashboard with Recharts visualizations |

---

## Quick Start

### Option 1: Docker Compose (Recommended)

> **Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

```bash
# 1. Clone / download the project
cd "DPI-Deep Packet Inspection"

# 2. Build all images and start all services
docker-compose up --build

# Stop everything
docker-compose down

# Stop and also delete the MongoDB data volume
docker-compose down -v
```

| Service   | URL                        |
|-----------|----------------------------|
| Frontend  | http://localhost:3000      |
| Backend   | http://localhost:5000/api  |
| MongoDB   | localhost:27017            |

**What `docker-compose up --build` does step by step:**

1. Pulls the `mongo:7` image and starts a MongoDB container with a named volume (`mongo-data`) so your data persists between restarts.
2. Builds the **backend** image from `backend/Dockerfile` — copies the Node.js app, runs `npm install --production`, exposes port 5000.
3. Builds the **frontend** image from `frontend/Dockerfile` — runs `npm run build` to produce an optimised React bundle, then serves it with **Nginx** on port 80 (mapped to 3000 on your machine).
4. The backend connects to MongoDB using the internal Docker network address `mongodb://mongodb:27017/dpi_engine` (not localhost).

**Uploaded PCAP files** are stored in `./backend/uploads/` on your host (bind-mounted into the container), so they survive restarts without rebuilding.

---

### Option 2: Manual Setup (No Docker)

**Prerequisites:** Node.js 18+, MongoDB running locally on port 27017.

**Backend:**
```bash
cd backend
# create .env (already exists — edit if needed)
# PORT=5000
# MONGODB_URI=mongodb://localhost:27017/dpi_engine
npm install
node server.js
```

**Frontend** (new terminal):
```bash
cd frontend
npm install
npm start
```

---

## Features

### Dashboard
- System-wide stats: sessions, packets analyzed, data inspected, dropped/forwarded counts
- Recent sessions chart (packet volume per session)
- Blocking efficacy pie chart

### Sessions
- Drag-and-drop PCAP file upload (up to 100MB)
- Real-time processing status with auto-polling
- Per-session stats: packets, bytes, TCP/UDP breakdown, flows, SNIs

### Session Detail (6 tabs)
1. **Packets** — Full paginated packet table with filtering by app type and blocked/forwarded status
2. **Flows** — 5-tuple flow table with classification and blocking status
3. **App Traffic** — Pie chart + table showing YouTube/Netflix/etc. breakdown
4. **SNI / Domains** — All detected TLS SNI and HTTP Host values
5. **Top Talkers** — Top 10 source IPs by bandwidth
6. **Timeline** — Packets/second over time

### Rules
- Create IP, application, domain, and port blocking rules
- Enable/disable rules with a toggle switch
- View hit counts (how many packets each rule blocked)
- Load sample rules (YouTube, TikTok, Facebook blocks)

---

## How DPI Works (JavaScript Port)

### TLS SNI Extraction

The engine reads raw PCAP bytes and extracts domain names from TLS Client Hello packets — even over HTTPS:

```javascript
// From dpiEngine.js — port of sni_extractor.cpp
function extractSNI(payload) {
  if (payload[0] !== 0x16) return null;  // Not TLS handshake
  if (payload[5] !== 0x01) return null;  // Not Client Hello
  // Navigate to SNI extension (type 0x0000)
  // Return the hostname string
}
```

### Application Classification

```javascript
function sniToAppType(sni) {
  if (sni.includes('youtube') || sni.includes('googlevideo')) return 'YOUTUBE';
  if (sni.includes('netflix') || sni.includes('nflxso'))      return 'NETFLIX';
  if (sni.includes('tiktok'))                                  return 'TIKTOK';
  // ... etc
}
```

### Flow Tracking

All packets sharing the same 5-tuple (srcIP, dstIP, srcPort, dstPort, protocol) are grouped into a **flow**. Once a flow is identified and blocked, all subsequent packets from that flow are also blocked — mirroring the C++ `connection_tracker.h` logic.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions/upload` | Upload PCAP file |
| `GET` | `/api/sessions/:id` | Get session details |
| `DELETE` | `/api/sessions/:id` | Delete session + data |
| `GET` | `/api/packets?sessionId=` | List packets (paginated) |
| `GET` | `/api/packets/breakdown/apps?sessionId=` | App type breakdown |
| `GET` | `/api/flows?sessionId=` | List flows |
| `GET` | `/api/flows/top-talkers?sessionId=` | Top source IPs |
| `GET` | `/api/rules` | List rules |
| `POST` | `/api/rules` | Create rule |
| `PUT` | `/api/rules/:id` | Update rule |
| `PATCH` | `/api/rules/:id/toggle` | Toggle rule active |
| `DELETE` | `/api/rules/:id` | Delete rule |
| `POST` | `/api/rules/seed` | Create sample rules |
| `GET` | `/api/stats/overview` | Global stats |
| `GET` | `/api/stats/timeline?sessionId=` | Traffic timeline |
| `GET` | `/api/stats/protocols?sessionId=` | Protocol breakdown |

---

## Project Structure

```
dpi-mern/
├── backend/
│   ├── models/
│   │   ├── Session.js      # PCAP analysis session
│   │   ├── Packet.js       # Individual packet record
│   │   ├── Flow.js         # 5-tuple network flow
│   │   └── Rule.js         # Blocking rule
│   ├── routes/
│   │   ├── sessions.js     # Upload + analyze PCAP
│   │   ├── packets.js      # Packet queries
│   │   ├── flows.js        # Flow queries
│   │   ├── rules.js        # Rule CRUD
│   │   └── stats.js        # Analytics
│   ├── utils/
│   │   └── dpiEngine.js    # ★ Core DPI logic (JS port of C++)
│   ├── uploads/            # Uploaded PCAP files
│   ├── server.js           # Express entry point
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Sessions.jsx
│   │   │   ├── SessionDetail.jsx  # Main analysis view
│   │   │   └── Rules.jsx
│   │   ├── components/
│   │   │   └── Layout.jsx
│   │   ├── utils/
│   │   │   └── api.js      # Axios API client
│   │   ├── App.js
│   │   ├── App.css         # Industrial terminal aesthetic
│   │   └── index.css       # CSS variables + globals
│   └── package.json
│
└── docker-compose.yml
```

---

## Generating Test PCAP Files

Use Wireshark or tcpdump to capture traffic, or generate a synthetic one using the original Python script from the C++ repo:

```bash
python3 generate_test_pcap.py
# Produces test_dpi.pcap
```

Then upload `test_dpi.pcap` through the web interface.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router 6, Recharts |
| Backend | Node.js 20, Express 4 |
| Database | MongoDB 7, Mongoose |
| File Upload | Multer |
| Styling | Custom CSS (Space Mono + Inter fonts) |
| Containerization | Docker + Docker Compose |
