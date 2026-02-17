# Deployment Guide

## Desktop Application

### Building for Development

```bash
pnpm run build:desktop
```

### Building for Production

```bash
# Windows
pnpm run package:win

# macOS
pnpm run package:mac

# Linux
pnpm run package:linux
```

### Code Signing

#### macOS

1. Obtain Apple Developer certificate
2. Set environment variables:
   ```bash
   export APPLE_ID="your-apple-id"
   export APPLE_PASSWORD="app-specific-password"
   export APPLE_TEAM_ID="your-team-id"
   export CSC_LINK="path/to/certificate.p12"
   export CSC_KEY_PASSWORD="certificate-password"
   ```
3. Build with signing:
   ```bash
   pnpm run package:mac -- --sign
   ```

#### Windows

1. Obtain code signing certificate
2. Set environment variables:
   ```bash
   export WIN_CSC_LINK="path/to/certificate.pfx"
   export WIN_CSC_KEY_PASSWORD="certificate-password"
   ```
3. Build with signing:
   ```bash
   pnpm run package:win -- --sign
   ```

### Auto-Update Configuration

Update `update-manifest.json` for each release:

```json
{
  "version": "1.0.0",
  "releaseDate": "2024-01-01T00:00:00Z",
  "platforms": {
    "win32-x64": {
      "url": "https://releases.titan-ai.dev/v1.0.0/titan-ai-win32-x64.exe",
      "sha256": "..."
    },
    "darwin-x64": {
      "url": "https://releases.titan-ai.dev/v1.0.0/titan-ai-darwin-x64.dmg",
      "sha256": "..."
    }
  }
}
```

## Web Application

### Building

```bash
pnpm --filter @titan/web build
```

### Environment Variables

```bash
NEXT_PUBLIC_API_URL=https://api.titan-ai.dev
NEXT_PUBLIC_ANALYTICS_ID=...
```

### Deploying to Vercel

1. Connect GitHub repository
2. Configure environment variables
3. Deploy:
   ```bash
   vercel --prod
   ```

### Deploying to Custom Server

```bash
# Build
pnpm --filter @titan/web build

# Start production server
pnpm --filter @titan/web start
```

### Docker Deployment

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN corepack enable pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @titan/web build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

## CLI Tool

### Global Installation

```bash
npm install -g @titan/cli
```

### Local Installation

```bash
npm install @titan/cli
npx titan init
```

## Self-Hosted Server

### Requirements

- Node.js 20+
- 8GB RAM minimum
- GPU recommended for local models

### Configuration

Create `titan-server.config.json`:

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "ai": {
    "providers": {
      "anthropic": { "apiKey": "..." },
      "ollama": { "host": "http://localhost:11434" }
    }
  },
  "security": {
    "allowedOrigins": ["https://yourapp.com"],
    "rateLimit": {
      "windowMs": 60000,
      "max": 100
    }
  }
}
```

### Running

```bash
titan serve --config titan-server.config.json
```

### Docker Compose

```yaml
version: '3.8'
services:
  titan:
    image: titanai/server:latest
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - ./config:/app/config
      - ./data:/app/data
    
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

volumes:
  ollama_data:
```

## Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

### Metrics Endpoint

```bash
curl http://localhost:3000/metrics
```

### Logging

Configure logging level:

```bash
TITAN_LOG_LEVEL=debug titan serve
```

## Scaling

### Horizontal Scaling

1. Deploy multiple instances
2. Use load balancer (nginx, HAProxy)
3. Share vector database (use PostgreSQL with pgvector)

### Caching

Enable Redis caching:

```json
{
  "cache": {
    "type": "redis",
    "url": "redis://localhost:6379"
  }
}
```

## Security Considerations

1. **API Keys**: Never commit API keys; use environment variables
2. **HTTPS**: Always use HTTPS in production
3. **Authentication**: Implement user authentication for multi-tenant
4. **Rate Limiting**: Configure appropriate rate limits
5. **Input Validation**: All user input is sanitized by default
