"""Key-value storage over a (pk, sk) single-table layout.

Items are plain dicts stored as a JSON string, so DynamoDB never sees floats
(no Decimal juggling) and the in-memory store behaves identically.

Layout:
  pk=<code>          sk=STATE            playback state, picks
  pk=<code>          sk=CONN#<connId>    {name}
  pk=<code>          sk=PREF#<name>      {text}
  pk=<code>          sk=VOTE#<mediaId>#<name>  {up}
  pk=CONN#<connId>   sk=META             {code, name}
  pk=ALEXA#<userId>  sk=LINK             {code, name}
"""

from __future__ import annotations

import json
import os
import threading
import time
from typing import Protocol

TTL_SECONDS = 24 * 3600


class Store(Protocol):
    def get(self, pk: str, sk: str) -> dict | None: ...
    def put(self, pk: str, sk: str, data: dict) -> None: ...
    def delete(self, pk: str, sk: str) -> None: ...
    def query(self, pk: str, prefix: str) -> list[tuple[str, dict]]: ...


class MemoryStore:
    def __init__(self) -> None:
        self._items: dict[tuple[str, str], str] = {}
        self._lock = threading.Lock()

    def get(self, pk, sk):
        with self._lock:
            raw = self._items.get((pk, sk))
        return json.loads(raw) if raw is not None else None

    def put(self, pk, sk, data):
        with self._lock:
            self._items[(pk, sk)] = json.dumps(data)

    def delete(self, pk, sk):
        with self._lock:
            self._items.pop((pk, sk), None)

    def query(self, pk, prefix):
        with self._lock:
            rows = [(k[1], v) for k, v in self._items.items() if k[0] == pk and k[1].startswith(prefix)]
        return [(sk, json.loads(v)) for sk, v in sorted(rows)]


class DynamoStore:
    def __init__(self, table_name: str | None = None) -> None:
        import boto3

        self._table = boto3.resource("dynamodb").Table(table_name or os.environ["TABLE_NAME"])

    def get(self, pk, sk):
        item = self._table.get_item(Key={"pk": pk, "sk": sk}).get("Item")
        return json.loads(item["d"]) if item else None

    def put(self, pk, sk, data):
        self._table.put_item(
            Item={"pk": pk, "sk": sk, "d": json.dumps(data), "ttl": int(time.time()) + TTL_SECONDS}
        )

    def delete(self, pk, sk):
        self._table.delete_item(Key={"pk": pk, "sk": sk})

    def query(self, pk, prefix):
        from boto3.dynamodb.conditions import Key

        out: list[tuple[str, dict]] = []
        kwargs = {"KeyConditionExpression": Key("pk").eq(pk) & Key("sk").begins_with(prefix)}
        while True:
            resp = self._table.query(**kwargs)
            out += [(i["sk"], json.loads(i["d"])) for i in resp["Items"]]
            if "LastEvaluatedKey" not in resp:
                return out
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
