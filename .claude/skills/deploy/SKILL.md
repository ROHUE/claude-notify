---
name: deploy
description: Deploy claude-notify PWA updates to technovators VPS (https://claude.technovators.co.za)
user-invocable: true
scope: project
---

# Claude-Notify Deploy Skill

**Scope:** This skill is specific to the `claude-notify` project only.

**Target:** Deploys to https://claude.technovators.co.za on the technovators VPS.

## Usage

```
/deploy
```

## Configuration

| Setting | Value |
|---------|-------|
| SSH Host | `technovators` |
| Remote Path | `~/claude-notify` |
| Service | `claude-notify` (systemd user) |
| Port | `4200` |
| Public URL | `https://claude.technovators.co.za` |
| Local Path | `/mnt/c/Users/ZamokuhleMthimkhulu/eztended/CascadeProjects/claude-notify` |

## Deployment Steps

Execute these steps in order:

### Step 1: Check & commit local changes
```bash
git -C /mnt/c/Users/ZamokuhleMthimkhulu/eztended/CascadeProjects/claude-notify status --porcelain
```
- If changes exist → commit with meaningful message and push
- If no changes → proceed to step 2

### Step 2: Pull on VPS
```bash
ssh technovators "cd ~/claude-notify && git pull origin main"
```

### Step 3: Install dependencies (only if package.json changed)
```bash
ssh technovators "cd ~/claude-notify/server && npm install --omit=dev"
```

### Step 4: Restart service
```bash
ssh technovators "systemctl --user restart claude-notify"
```

### Step 5: Verify deployment
```bash
ssh technovators "sleep 2 && curl -s http://localhost:4200/api/health"
curl -s https://claude.technovators.co.za/api/health
```

### Step 6: Report status
Tell the user:
- Whether deployment succeeded or failed
- The health check response
- Any errors encountered
