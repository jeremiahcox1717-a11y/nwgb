# NWGB

Jordan's private desk. It is not a product, not a client portal, and not meant for anyone else.

You feed it a postcode. It hunts for local businesses that are still offline in the ways that matter:

- no website
- no Google Business Profile
- on Google, but still no website
- Instagram shops with no website and no booking link (Fresha, Booksy, Treatwell, and the rest)

It also hands you **one unused postcode at a time**. Once a code has been given, it is burnt. The machine will not offer it twice unless you restore it.

## Open the desk

The live site is:

**https://jeremiahcox1717-a11y.github.io/nwgb/**

It asks for a PIN. The PIN is not stored in this README. Jordan has it.

Your leads and used postcodes stay in **your browser** (they are not shared with anyone else who might guess the URL). Search engines are told not to index it.

After you merge this to `main`, GitHub Actions publishes the `gh-pages` branch. One-time GitHub click if the site 404s:

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **`gh-pages`**, folder: **/ (root)**
4. Save

Do **not** make this repository public without a PIN, and do not post the live URL.

### Optional: run it on your computer

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000) and use the same PIN.

## How to work a town

1. Filter the ticket machine (England + Manchester, or area `M`, whatever you are sweeping).
2. Hit **Give me the next postcode**. That code is now used.
3. Hit **Hunt this one**.
4. Save the hot and warm leads. Download CSV when you want them out of the desk.
5. Take the next code. Repeat. Never twice.

If you mash the button by accident, **Undo last given**.

## Data

UK outcodes ship in `data/uk-outcodes.json`. Street data comes from OpenStreetMap via Overpass. UK full-postcode lookup uses postcodes.io. See `DATA-CREDITS.md`.
