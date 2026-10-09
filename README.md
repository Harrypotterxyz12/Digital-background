# DigitalVault — Digital Products Store Starter

A mobile-friendly starter storefront with:
- USD product pricing
- Stripe Checkout for card payments (Visa/Mastercard availability depends on account settings)
- PayPal Orders API checkout
- Server-side payment checks before a download is served
- Private product files outside the public web folder

## Important limitations
This is a starter project, not a fully audited production commerce system. It does not include a database, order emails, tax/VAT handling, refunds, rate limiting, download limits, or persistent order logging. Add these and test thoroughly before taking real payments. The example uses a placeholder download file.

## Run locally
1. Install Node.js on a computer or a Node-capable hosting service.
2. Copy `.env.example` to `.env`.
3. Add Stripe test secret key and PayPal Sandbox client ID/secret.
4. Run `npm install`, then `npm start`.
5. Open `http://localhost:3000`.

## Configure Stripe
- Create an account and confirm eligibility for your business/country.
- Use test keys first.
- Set `STRIPE_SECRET_KEY` in `.env`.
- Use HTTPS in production and set `BASE_URL` to the exact public HTTPS URL.

## Configure PayPal
- Create a PayPal Developer app and use Sandbox credentials first.
- Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_MODE=sandbox`.
- After testing, follow PayPal's approval and account requirements before using live credentials.
- The server calls PayPal's API directly; credentials must never be put in browser JavaScript.

## Add your products
1. Edit the `PRODUCTS` object in `server.js`: name, description, price in cents, and file path.
2. Put each real file under `private/products/`.
3. Update each product's `file` path to its corresponding file.
4. Replace the sample brand, support email, terms, privacy and refund policies.
5. Keep private downloads outside `public/`.

## Deploy
Deploy the Node app to a host that runs Node.js (not static-only Cloudflare Pages by itself). Add environment variables through the host's secret/environment settings. Use HTTPS. Do not commit `.env` or live keys to GitHub. Test a successful payment, failed payment, cancelled checkout, wrong order ID and download link before launch.

## Security notes
- Stripe download access checks the Stripe Checkout Session status on the server.
- PayPal download access retrieves the PayPal order and checks completed capture status.
- These checks are a foundation, not a complete anti-sharing/download-abuse system. For production, add expiring one-time signed download links, a database-backed order record, webhook reconciliation, rate limiting, and logs.
