#!/usr/bin/env python3
"""Print the aggregate number of curated-internet discoveries."""

import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


COUNTER_URL = (
    "https://poral-discovery-counter.seangerardosullivan.workers.dev/count"
)


def main() -> int:
    request = Request(
        COUNTER_URL,
        headers={
            "Accept": "application/json",
            "User-Agent": "poral-counter-check/1.0",
        },
    )

    try:
        with urlopen(request, timeout=10) as response:
            payload = json.load(response)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"Could not read discovery count: {error}", file=sys.stderr)
        return 1

    count = payload.get("count")
    if not isinstance(count, int) or count < 0:
        print("Counter returned an invalid response.", file=sys.stderr)
        return 1

    print(f"Curated internet discoveries: {count:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
