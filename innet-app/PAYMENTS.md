# YooKassa integration

The application integrates with YooKassa to handle upgrades to the **InNet Pro** subscription tier.
This document outlines the required configuration and high-level flow.

## Required environment variables

Set the following variables for the Next.js runtime (API routes and custom server):

- `YOOKASSA_SHOP_ID` – the shop ID provided by YooKassa.
- `YOOKASSA_SECRET_KEY` – the secret key associated with the shop.

Optionally set `NEXT_PUBLIC_SITE_URL` so that payment return URLs point at the correct public origin.
If it is omitted, the API falls back to `http://localhost:3000` in development.

## Payment flow overview

1. The client calls `POST /api/payments/create` with the desired plan (`pro-monthly` or `pro-annual`).
   The server creates a payment in YooKassa and returns the confirmation URL.
2. The user is redirected to the YooKassa checkout page to complete the payment.
3. YooKassa sends webhooks to `POST /api/payments/webhook` when the payment status changes.
4. After a successful payment the webhook updates the user account in Supabase:
   - `plan` is set to `pro`.
   - `planActivatedAt` is refreshed.
   - Additional metadata (`planProduct`, `planExpiresAt`) is stored in the JSON payload of the row.
5. The browser polls `GET /api/payments/status` until the webhook confirms success, then updates the
   local subscription cache so Pro features unlock immediately.

## Webhook configuration

Configure the YooKassa webhook endpoint to point at:

```
https://<your-domain>/api/payments/webhook
```

The webhook accepts either

- HTTP Basic authentication (`<shopId>:<secretKey>`) — доступно в некоторых версиях кабинета; или
- заголовок `Content-HMAC`, который ЮKassa добавляет автоматически.

Если Basic в интерфейсе не предлагается, просто сохраните вебхук — подпись `Content-HMAC` уже есть,
и приложение будет сверять её с вашим `YOOKASSA_SECRET_KEY`.

Ensure the webhook is allowed to send the `payment.succeeded` and `payment.canceled` events.

## Local testing tips

- During development the API stores temporary payment metadata in memory. If the Next.js server
  restarts, existing payment IDs are forgotten, so webhook callbacks cannot be matched.
- You can simulate a successful payment by crafting a request to `/api/payments/webhook` with a
  known `paymentId` and `metadata` payload that matches the values returned by `/api/payments/create`.
