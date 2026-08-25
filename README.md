# NWGB

Jordan's private desk. It is not a product, not a client portal, and not meant for anyone else.

You feed it a postcode. It hunts for local businesses that are still offline in the ways that matter:

- no website
- no Google Business Profile
- on Google, but still no website
- Instagram shops with no website and no booking link (Fresha, Booksy, Treatwell, and the rest)

It also hands you **one unused postcode at a time**. Once a code has been given, it is burnt. The machine will not offer it twice unless you restore it.

## Run it

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Optional `.env` (copy from `.env.example`):

| Variable | What it does |
| --- | --- |
| `OWNER_NAME` | Name on the desk. Defaults to Jordan. |
| `APP_PIN` | Locks the desk if you ever expose the port. |
| `GOOGLE_PLACES_API_KEY` | Turns on a live Google Places sweep for listings with no website. |

Without a Google key, hunts still run. OpenStreetMap supplies the street businesses, then the desk checks the public web for a Maps footprint. Instagram is pulled from public search results. Both of those nets can be thin; every card still has Maps / Google / Instagram links so you can finish the check in one click.

## How to work a town

1. Pick **continent**, then **language**. That unlocks countries.
2. Pick a **country**. That unlocks cities.
3. Pick a **city**, then hit **Give me the next postcode**. That code is now used.
4. Hit **Hunt this one**.
5. Save the hot and warm leads. Download CSV when you want them out of the desk.
6. Take the next code. Repeat. Never twice.

If you mash the button by accident, **Undo last given**.

## Data

UK outcodes ship in `data/uk-outcodes.json`. Street data comes from OpenStreetMap via Overpass. UK full-postcode lookup uses postcodes.io. See `DATA-CREDITS.md`.
