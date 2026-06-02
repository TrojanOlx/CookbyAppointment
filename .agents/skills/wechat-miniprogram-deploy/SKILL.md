---
name: wechat-miniprogram-deploy
description: Upload this CookbyAppointment WeChat Mini Program with miniprogram-ci. Use when uploading, previewing, or preparing the mini program release package. Requires the private upload key at /Users/trojan/.config/wechat-miniprogram/wxabc39c01a21a60a8.private.key. Does not submit audit or publish the formal release unless explicitly extended.
---

# CookbyAppointment WeChat Mini Program Upload

This skill is only for `/Users/trojan/github/CookbyAppointment`.

## What It Does

- Uploads the mini program source from the project root.
- AppID: `wxabc39c01a21a60a8`.
- Upload key: `/Users/trojan/.config/wechat-miniprogram/wxabc39c01a21a60a8.private.key`.
- Tool: `miniprogram-ci`.

This uploads code to the WeChat Mini Program platform. It does not submit audit or publish the final formal release.

## Commands

Run from the project root:

```bash
npm run miniprogram:upload
```

Optional environment variables:

```bash
VERSION=1.0.1 DESC="release notes" ROBOT=1 npm run miniprogram:upload
```

## Safety Rules

- Never commit the private key.
- Keep the private key outside the repo with permission `600`.
- Run `git status --short` before upload and prefer uploading committed code.
- If upload fails with IP whitelist or permission errors, update WeChat Mini Program platform settings before retrying.
