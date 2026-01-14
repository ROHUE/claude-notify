---
name: deploy
description: Deploy claude-notify PWA to technovators VPS. Use when user says "/deploy", "deploy", "push to production", or wants to update the live site at https://claude.technovators.co.za
user-invocable: true
---

# Deploy claude-notify to Production

Target: https://claude.technovators.co.za

## Configuration

| Setting | Value |
|---------|-------|
| SSH Host | `technovators` |
| Remote Path | `~/claude-notify` |
| Service | `claude-notify` (systemd user) |
| Port | `4200` |

## Deployment Steps

Execute in order:

### 1. Check local changes
```bash
git -C /mnt/c/Users/ZamokuhleMthimkhulu/eztended/CascadeProjects/claude-notify status --porcelain
```
If changes exist, commit with meaningful message and push.

### 2. Pull on VPS
```bash
ssh technovators "cd ~/claude-notify && git pull origin main"
```

### 3. Install dependencies (if package.json changed)
```bash
ssh technovators "cd ~/claude-notify/server && npm install --omit=dev"
```

### 4. Restart service
```bash
ssh technovators "systemctl --user restart claude-notify"
```

### 5. Verify
```bash
ssh technovators "sleep 2 && curl -s http://localhost:4200/api/health"
curl -s https://claude.technovators.co.za/api/health
```

### 6. Report
Tell user: success/failure, health check response, any errors.
