"""Message delivery to connected TVs."""

from __future__ import annotations

import json
from typing import Callable, Protocol


class Bus(Protocol):
    def send(self, conn_id: str, msg: dict) -> bool:
        """Deliver msg; return False if the connection is gone."""
        ...


class ApiGatewayBus:
    """Pushes to API Gateway WebSocket connections via the Management API."""

    def __init__(self, endpoint_url: str) -> None:
        import boto3

        self._client = boto3.client("apigatewaymanagementapi", endpoint_url=endpoint_url)

    def send(self, conn_id, msg):
        try:
            self._client.post_to_connection(ConnectionId=conn_id, Data=json.dumps(msg).encode())
            return True
        except self._client.exceptions.GoneException:
            return False


class CallbackBus:
    """Used by the local dev server and tests."""

    def __init__(self, deliver: Callable[[str, dict], bool]) -> None:
        self._deliver = deliver

    def send(self, conn_id, msg):
        return self._deliver(conn_id, msg)
