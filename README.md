# React Files Hub

A unified file management system with distributed architecture. Browse, stream, and manage files across multiple storage nodes from a single React-based interface.

## Features

- 🎬 **Media Streaming** - Stream videos and audio with subtitle support
- 📁 **Distributed Storage** - Connect multiple storage nodes via mesh networking
- 🔐 **Authentication** - Admin setup with JWT-based security
- 🎨 **React Frontend** - Modern SPA built with React + Vite + TypeScript
- 🐍 **FastAPI Backend** - High-performance Python backend with async support
- 🐳 **Docker-Ready** - Multi-stage Dockerfile for easy deployment
- 🔄 **Auto-Sync** - File system watcher for automatic change detection

## Quick Start

### Prerequisites

- Docker & Docker Compose
- 1GB+ storage for data volume
- Accessible network interface (for multi-node setup)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/imwasay/react_files_hub.git
   cd react_files_hub
   ```

2. **Run the setup script:**
   ```bash
   chmod +x scripts/deploy_node.sh
   ./scripts/deploy_node.sh
   ```

   This will prompt you for:
   - **Node ID** - Unique identifier for this node (e.g., `node_directory`, `node_storage_1`)
   - **Node IP** - Network address(es) accessible by other nodes (e.g., `192.168.1.10:8000`)
   - **Mesh Join Token** - Leave blank for new mesh, or paste from Admin UI to join existing
   - **JWT Secret** - Generate with `openssl rand -hex 32` for new mesh
   - **Admin credentials** - Username, email, and password
   - **Storage roots** - Comma-separated paths to index (e.g., `/mnt/movies,/mnt/documents`)
   - **Database path** - Where to store the registry (default: `./data/registry.db`)
   - **Port** - HTTP port (default: `8000`)

3. **Start the service:**
   ```bash
   docker compose up -d
   ```

4. **Access the UI:**
   - Navigate to `http://localhost:8000`
   - Login with your admin credentials
   - Start browsing your indexed files!

## Environment Configuration

### Example `.env` file

```env
# Node Identity
NODE_ID=optiplex_test
SELF_NODE_ID=optiplex_test

# Network Configuration
NODE_IP=192.168.1.10:8000,mydir.duckdns.org:8000
MESH_JOIN_TOKEN=

# Security
JWT_SECRET=your-random-secret-here

# Admin Account
ADMIN_USERNAME=admin2
ADMIN_EMAIL=admin2@y.com
ADMIN_PASSWORD=password

# Storage Configuration
DB_PATH=/data/registry.db
STORAGE_ROOTS=/mnt/movies,/mnt/documents

# Optional: Node Mode (directory or storage)
NODE_MODE=directory
```

### Key Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ID` | Unique identifier for this node | ✓ |
| `NODE_IP` | Network address(es) for peer communication | ✓ |
| `JWT_SECRET` | Secret key for signing JWTs (for new mesh only) | ✓* |
| `MESH_JOIN_TOKEN` | Token to join existing mesh | ✗ |
| `ADMIN_USERNAME` | Initial admin username | ✓ |
| `ADMIN_EMAIL` | Initial admin email | ✓ |
| `ADMIN_PASSWORD` | Initial admin password | ✓ |
| `STORAGE_ROOTS` | Comma-separated paths to index | ✓ |
| `DB_PATH` | Database file location | ✓ |

*Required for new mesh only; provided automatically when joining via `MESH_JOIN_TOKEN`

## Docker Deployment

### Building the Image

The Dockerfile uses multi-stage builds:

```bash
# Build with default fallback nodes
docker build -t react-files-hub .

# Build with custom fallback nodes
docker build \
  --build-arg VITE_FALLBACK_NODE_URLS="https://node1.example.com,https://node2.example.com" \
  -t react-files-hub .
```

### Docker Compose

**Basic setup** (single directory node):
```bash
docker compose up -d
```

**Production considerations:**

1. **Volume mounts** - Uncomment and configure storage root paths in `docker-compose.yml`:
   ```yaml
   volumes:
     - ./data:/data
     - /etc/letsencrypt:/certs:ro
     - /mnt/movies:/mnt/movies:ro
     - /mnt/documents:/mnt/documents:ro
   ```

2. **Network mode** - Currently using `host` mode. For bridge network:
   ```yaml
   ports:
     - "8000:8000"
   ```

3. **Restart policy** - Already set to `unless-stopped`

### Container Health

The container includes a health check:
```bash
curl -f http://localhost:8000/api/v1/health
```

Monitor health:
```bash
docker compose ps
```

## Architecture

### Directory Node
- Maintains the central registry
- Serves the web UI
- Federates file lists from storage nodes
- Manages user authentication and access

### Storage Node
- Indexes local file system paths
- Watches for file changes (add/modify/delete)
- Pushes change events to directory node
- Serves media streams via HTTP

### Communication
- Nodes communicate via HTTP with JWT authentication
- File watcher uses configurable debounce (default: 2000ms)
- Automatic failover to local storage node on directory node unavailability

## File Structure

```
.
├── backend/              # FastAPI application
│   ├── config.py        # Configuration management
│   ├── main.py          # Application entry point
│   ├── routers/         # API endpoints
│   ├── agent/           # File watcher & sync logic
│   └── requirements.txt  # Python dependencies
├── frontend/            # React + Vite application
│   ├── src/
│   │   ├── api/         # HTTP client & API calls
│   │   ├── components/  # React components
│   │   └── pages/       # Page components
│   └── package.json     # Node dependencies
├── scripts/
│   └── deploy_node.sh   # Interactive setup wizard
├── docker-compose.yml   # Service orchestration
├── Dockerfile           # Multi-stage build
└── .env.example         # Environment template
```

## API Endpoints

### Health Check
```bash
GET /api/v1/health
```

### Configuration
```bash
GET /api/v1/config
```

### File Operations
```bash
GET /api/v1/files           # List files
GET /api/v1/files/:id       # Get file details
GET /api/v1/files/:id/stream # Stream file content
```

### Admin Panel
```bash
GET  /api/v1/admin/nodes        # List nodes
POST /api/v1/admin/nodes        # Register new node
GET  /api/v1/admin/roots        # List storage roots
POST /api/v1/admin/roots        # Create storage root
```

## Development

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

Vite development server runs on `http://localhost:5173`

### Backend Development

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or: venv\Scripts\activate on Windows
pip install -r requirements.txt
python main.py
```

FastAPI server runs on `http://localhost:8000`

## Troubleshooting

### Node not connecting to mesh
- Verify `NODE_IP` is accessible from other nodes
- Check firewall allows port 8000 (or configured port)
- Validate `MESH_JOIN_TOKEN` or `JWT_SECRET` on new mesh

### Files not appearing
- Check `STORAGE_ROOTS` paths are accessible in container
- Verify volume mounts in `docker-compose.yml`
- Check container logs: `docker compose logs -f backend`

### Media playback issues
- Verify ffmpeg is installed: `docker compose exec backend ffmpeg -version`
- Check file MIME type detection
- Try downloading file to verify integrity

### Database errors
- Ensure `./data` directory is writable
- Check `DB_PATH` permissions
- Try removing `./data` and restarting (will rescan storage)

## Logs

View real-time logs:
```bash
docker compose logs -f backend
```

Access container shell:
```bash
docker compose exec backend bash
```

## License

Open source - see repository for details.

## Contributing

Pull requests welcome! Please ensure:
- Frontend builds without errors
- Backend tests pass
- Docker image builds successfully

---

For questions or issues, open a GitHub issue or check the admin panel documentation.
