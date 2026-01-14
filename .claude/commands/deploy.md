---
description: "Deploy the project to production or staging environment"
---

# /deploy - Deployment Workflow

## Status: NOT CONFIGURED

This deployment skill needs to be configured for your project.

## Setup Instructions

When you run `/deploy`, I will help you configure:

1. **Deployment Target**: Where does this project deploy?
   - Vercel, Netlify, AWS, GCP, Azure, VPS, Docker, etc.

2. **Deployment Command**: What command deploys the project?
   - `vercel --prod`, `npm run deploy`, `docker push`, custom script, etc.

3. **Pre-deploy Checks**: What should pass before deploying?
   - Tests, linting, build, type checking, etc.

4. **Environment**: Production, staging, or both?

## To Configure

Run `/deploy` and I will:
1. Ask about your deployment setup
2. Update this file with your workflow
3. Save the configuration for future deploys

---

## Deployment Workflow

```yaml
# UNCONFIGURED - Run /deploy to set up
target: null
command: null
pre_checks: []
environment: null
```
