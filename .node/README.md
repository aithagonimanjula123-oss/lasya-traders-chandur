# Lasya Traders Chandur

Single-service Node.js + PostgreSQL app for inventory and wholesale orders.

## Render deployment

This service runs from the `.node` directory (Docker context). It requires a Render PostgreSQL connection string in the service environment variable `DATABASE_URL`.

1. Open the Render PostgreSQL database dashboard and copy its **Internal Database URL**.
2. Open the `lasya-traders-chandur` web service → **Environment**.
3. Add `DATABASE_URL` with that Internal Database URL and save.
4. Redeploy. The health endpoint is `/api/health`.

The database creates its tables on startup. Sample products are inserted only once, tracked by `app_meta`; deleting inventory will not cause products to reappear on later restarts. If `DATABASE_URL` is missing, the UI does not pretend to save data locally.

Never commit database passwords or connection strings to GitHub.
