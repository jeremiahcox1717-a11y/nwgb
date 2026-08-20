# NWGB

Private finder for **Google Business listings that have no website**.

It is not a public directory. The pages send `noindex` headers, every screen except login is password-gated, and you should keep this GitHub repo private.

Type a **city** (`Austin TX`, `Manchester`) or a **postal code** (`90210`, `M5V 2T6`). The app geocodes that place with Google, searches Google Places in that area, and keeps listings with no website (Facebook / Instagram / Yelp-only pages can count as no website).

Google does not return every business in a city. A **quick scan** is one mixed query. **Search this** uses the category you picked. **Sweep common trades** runs plumbers, dentists, salons, and the other built-in trades one after another so you get more coverage.

## Run it only for yourself

1. Copy `.env.example` to `.env.local`.
2. Set `ACCESS_PASSWORD` to a long password only you know.
3. Create a Google Cloud API key and enable:
   - [Places API (New)](https://developers.google.com/maps/documentation/places/web-service/op-overview)
   - [Geocoding API](https://developers.google.com/maps/documentation/geocoding)
4. Put that key in `GOOGLE_MAPS_API_KEY`. Restrict the key to those two APIs.
5. Install and start:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter your password, then search.

## Deploy without making it public

Keep the GitHub repository **private**. Host it on Vercel (or similar) with the same env vars:

- `ACCESS_PASSWORD`
- `GOOGLE_MAPS_API_KEY`
- `SESSION_SECRET` (optional; defaults to a value derived from the password)

Nobody else can use the search without the password. Do not post the live URL in public places.

Places Text Search with website data is a paid Google SKU. Sweeping every trade in a busy city will use more quota than a single category search.

## Scripts

```bash
npm test
npm run build
```
