---
name: deploy
description: Deploy updates to claude-notify PWA on technovators server
user-invocable: true
---

# Deploy Skill

Deploy updates to the claude-notify PWA server at https://claude.technovators.co.za

## Usage

```
/deploy
```

## Server Details

- **Host**: technovators (SSH config)
- **App path**: ~/claude-notify
- **Service**: claude-notify (systemd user service)
- **Port**: 4200
- **URL**: https://claude.technovators.co.za

## Deployment Steps

When this skill is invoked, perform these steps:

### 1. Check for local changes
```bash
git -C /mnt/c/Users/ZamokuhleMthimkhulu/eztended/CascadeProjects/claude-notify status --porcelain
```
If changes exist, commit and push them first.

### 2. Pull changes on server
```bash
ssh technovators "cd ~/claude-notify && git pull"
```

### 3. Install dependencies (if package.json changed)
```bash
ssh technovators "cd ~/claude-notify/server && npm install --omit=dev"
```

### 4. Restart the service
```bash
ssh technovators "systemctl --user restart claude-notify"
```

### 5. Verify deployment
```bash
sleep 2 && curl -s https://claude.technovators.co.za/api/health
```

Report success/failure to the user.
