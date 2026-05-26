---
name: cookby-cloudflare-deploy
description: Deploy and verify this project's Cloudflare Workers backend from cloudflareWorkes. Use when the user asks to deploy, publish, dry-run, verify, or troubleshoot the CookbyAppointment Cloudflare Worker.
---

# CookbyAppointment Cloudflare Worker Deploy

This skill is only for the `CookbyAppointment` project at `/Users/trojan/github/CookbyAppointment`.

## What It Deploys

- Worker source: `cloudflareWorkes/worker.js`
- Wrangler config: `cloudflareWorkes/wrangler.toml`
- Worker name: `black-frost-08dc`
- Production custom domain: `wx.oulongxing.com`
- D1 binding: `env.DB` -> `cookby_appointment`
- R2 binding: `env.FILE_BUCKET` -> `cookby-appointment`
- Public R2 URL variable: `R2_PUBLIC_URL=https://images.wx.oulongxing.com`
- Secrets: `WX_APPID` and `WX_SECRET` are stored in Cloudflare and must not be written into the repo.

## Safety Rules

- Always run from the project root: `/Users/trojan/github/CookbyAppointment`.
- Always run a dry run before a real deploy.
- A real deploy updates the production Worker behind `https://wx.oulongxing.com`.
- If the user only asks to check, validate, or dry-run, do not deploy.
- If the user explicitly asks to deploy, run the preflight checks first, then deploy.
- Never print, request, or commit `WX_SECRET`.
- Do not commit local cache directories such as `.gitnexus/` or `node_modules/.cache/`.
- If Cloudflare quick editor may contain newer code than local `worker.js`, warn the user before deploying because Wrangler will overwrite the online version with local code.

## Deployment Runbook

Use these commands from the project root:

```bash
pwd
npm run build
npm run worker:whoami
npm run worker:dry-run
npm run worker:deploy
```

The npm scripts expand to:

```bash
npx --yes wrangler whoami
npx --yes wrangler deploy --dry-run --config cloudflareWorkes/wrangler.toml
npx --yes wrangler deploy --config cloudflareWorkes/wrangler.toml
```

If Wrangler is not authenticated, run:

```bash
npm run worker:login
```

Then retry:

```bash
npm run worker:whoami
npm run worker:dry-run
```

## Expected Dry Run Output

The dry run should show these bindings:

```text
env.DB (cookby_appointment)                                 D1 Database
env.FILE_BUCKET (cookby-appointment)                        R2 Bucket
env.R2_PUBLIC_URL ("https://images.wx.oulongxing.com")      Environment Variable
```

It is normal that `WX_APPID` and `WX_SECRET` do not appear in dry-run output because they are encrypted Cloudflare secrets.

## After Deploy

Confirm the deploy output includes:

```text
Uploaded black-frost-08dc
Deployed black-frost-08dc triggers
  wx.oulongxing.com (custom domain)
Current Version ID: <version-id>
```

Then verify the Worker responds:

```bash
curl -i https://wx.oulongxing.com/api/dish/list
```

A login/auth error, JSON payload, or application-level response means the Worker is reachable. A Cloudflare deployment error, script startup error, or missing route needs troubleshooting.

## Useful Troubleshooting Commands

```bash
npx --yes wrangler versions list --config cloudflareWorkes/wrangler.toml
npx --yes wrangler tail --config cloudflareWorkes/wrangler.toml
npx --yes wrangler deploy --dry-run --config cloudflareWorkes/wrangler.toml
```

Rollback is a production-changing operation. Only run rollback after explicit user approval:

```bash
npx --yes wrangler rollback --config cloudflareWorkes/wrangler.toml
```
