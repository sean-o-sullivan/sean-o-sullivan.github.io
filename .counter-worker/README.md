# Curated internet discovery counter

Cloudflare Worker backing the explicit `I found it` link on the portfolio homepage.

- Stores one aggregate count.
- Retains no raw IP addresses, user agents, referrers, cookies, or fingerprints.
- Uses a secret-keyed address digest only to suppress repeat counts for 24 hours.
- Deletes those digests after the deduplication window.

Deploy from this directory:

```sh
npx wrangler@latest secret put COUNTER_SALT
npx wrangler@latest deploy
```

Set the deployed `/found` URL as `data-endpoint` on `.discovery-counter` in `index.html`.

The read-only `/count` endpoint returns only the aggregate count. From the repository root:

```sh
python3 check_discoveries.py
```
