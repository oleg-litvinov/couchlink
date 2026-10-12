"""API Gateway WebSocket Lambda: $connect, $disconnect, $default."""

import json
import logging
import os

from couchlink import core
from couchlink.ai import make_ai
from couchlink.bus import ApiGatewayBus
from couchlink.store import DynamoStore

logging.getLogger().setLevel(logging.INFO)

_store = DynamoStore()
_ai = make_ai()
_buses: dict[str, ApiGatewayBus] = {}


def _bus(endpoint: str) -> ApiGatewayBus:
    if endpoint not in _buses:
        _buses[endpoint] = ApiGatewayBus(endpoint)
    return _buses[endpoint]


def handler(event, _context):
    rc = event["requestContext"]
    route, conn_id = rc["routeKey"], rc["connectionId"]
    endpoint = os.environ.get("WS_ENDPOINT") or f"https://{rc['domainName']}/{rc['stage']}"
    ctx = core.Ctx(store=_store, bus=_bus(endpoint), ai=_ai)

    if route == "$connect":
        return {"statusCode": 200}
    if route == "$disconnect":
        core.detach(ctx, conn_id)
        return {"statusCode": 200}

    try:
        msg = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        ctx.bus.send(conn_id, {"type": "error", "code": "BAD_JSON", "message": "Body must be JSON"})
        return {"statusCode": 200}
    core.handle_ws(ctx, conn_id, msg)
    return {"statusCode": 200}
