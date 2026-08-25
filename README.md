# NWGB

Jordan's private desk. It is not a product, not a client portal, and not meant for anyone else.

You feed it a postcode. It hunts for local businesses that are still offline in the ways that matter:

- no website
- no Google Business Profile
- on Google, but still no website
- Instagram shops with no website and no booking link (Fresha, Booksy, Treatwell, and the rest)

It also hands you **one unused postcode at a time**. Once a code has been given, it is burnt. The machine will not offer it twice unless you restore it.

## How to open the website

This desk is not on the public internet. There is no `https://…` link to click until you start it. It runs on your computer, then you open [http://localhost:3000](http://localhost:3000).

### Fastest: double-click

1. Install **Node.js LTS** from [nodejs.org](https://nodejs.org) (green button, next-next-finish). Restart if it asks.
2. On GitHub, click **Code → Download ZIP**, then unzip the folder.
3. Double-click:
   - **Windows:** `start.bat`
   - **Mac:** `start.command` (first time: right-click → Open, because macOS blocks unknown scripts)
4. Your browser should open the desk. Leave the black/terminal window open while you use it. Close that window to shut the desk down.

If the browser does not open, go to [http://localhost:3000](http://localhost:3000) yourself.

Do not double-click `index.html`. That file is not the website.

### From a terminal

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

### Want a real link on the internet?

Use [Render](https://render.com). Connect this GitHub repo, it will pick up `render.yaml`. Set `APP_PIN` to a PIN only you know before you share anything — this GitHub repo is public, so a live URL without a PIN is open to anyone. After it deploys, Render shows the URL on the service page.

GitHub Codespaces also works: **Code → Codespaces → Create**, then open the forwarded port **3000**.

Optional `.env` (copy from `.env.example`):

| Variable | What it does |
| --- | --- |
| `OWNER_NAME` | Name on the desk. Defaults to Jordan. |
| `APP_PIN` | Locks the desk if you ever expose the port. |
| `GOOGLE_PLACES_API_KEY` | Turns on a live Google Places sweep for listings with no website. |

Without a Google key, hunts still run. OpenStreetMap supplies the street businesses, then the desk checks the public web for a Maps footprint. Instagram is pulled from public search results. Both of those nets can be thin; every card still has Maps / Google / Instagram links so you can finish the check in one click.

## How to work a town

1. Filter the ticket machine (England + Manchester, or area `M`, whatever you are sweeping).
2. Hit **Give me the next postcode**. That code is now used.
3. Hit **Hunt this one**.
4. Save the hot and warm leads. Download CSV when you want them out of the desk.
5. Take the next code. Repeat. Never twice.

If you mash the button by accident, **Undo last given**.

## Data

UK outcodes ship in `data/uk-outcodes.json`. Street data comes from OpenStreetMap via Overpass. UK full-postcode lookup uses postcodes.io. See `DATA-CREDITS.md`.
