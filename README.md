# Zvastra Admin

Standalone admin console for social posting, extracted from [evega](https://github.com/AmoghPoluru/evega)'s
`/staff/post-to-social` page. Only app admins can sign in.

What it does, per vendor:

- Connect / disconnect Instagram (Instagram Login OAuth) and post product photos.
- Generate Instagram banners with OpenAI and post the generated image.
- Link a WhatsApp device via QR (Baileys), resolve a group/channel invite to a JID, and post to it.

## Why it is a separate app

Baileys keeps a live WhatsApp socket and writes linked-device credentials to disk. That needs
**one long-lived process with a persistent volume** — it cannot run on serverless or scale to
multiple replicas without two instances fighting over the same device session. evega stays on
Vercel; this console runs as a single container.

This console is the **sole owner** of WhatsApp linking. Do not re-enable vendor-facing WhatsApp
linking in evega.

## Data

It talks to the **same MongoDB as evega** through a trimmed Payload config (users, roles, media,
tags, vendors, products, vendor/logo templates, happy banners, social posts, vendor social
connections, WhatsApp channel sessions). There is no Payload admin UI here and no migrations of
its own — evega owns the schema.

`PAYLOAD_SECRET` must match evega's, otherwise stored encrypted values (Instagram tokens) cannot
be decrypted.

Auth cookies use the `zvastra-admin` prefix, so signing in here does not touch storefront or
vendor sessions.

Media stored with a relative URL is served by the storefront, so relative URLs are resolved
against `NEXT_PUBLIC_STOREFRONT_URL` (Instagram and WhatsApp cannot fetch this console's host or
localhost).

## Admin-only access

Admin status (`role: "admin"`, legacy `super-admin`, or `appRole.slug === "app-admin"`) is checked
at four layers: login, middleware, every tRPC procedure (`adminProcedure`), and the console
layout. Optionally set `ADMIN_EMAIL_ALLOWLIST` to restrict sign-in further. There is no signup.

## Local development

```bash
cp .env.example .env    # fill in DATABASE_URL, PAYLOAD_SECRET, Meta/blob values
npm install
npm run dev             # http://localhost:3100
```

```bash
npm run lint
npm run typecheck
npm run build
npm run generate:types  # after collection changes
```

## Deployment

Single instance, persistent disk, non-serverless (Railway / Render / Fly.io / VPS):

```bash
docker build -t zvastra-admin .
docker run -p 3000:3000 --env-file .env -v zvastra-sessions:/data/sessions zvastra-admin
```

- `WHATSAPP_CHANNELS_SESSION_DIR` must point at the mounted volume (`/data/sessions` in the image).
- Keep replicas at **1**. A second replica breaks the WhatsApp device link.
- Register `<origin>/api/auth/instagram/callback` as an Instagram OAuth redirect URI on the Meta app.
- `GET /api/health` returns 200 when Payload can reach MongoDB, 503 otherwise.
