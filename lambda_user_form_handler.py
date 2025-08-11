import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

import boto3
from botocore.exceptions import ClientError
from urllib.parse import parse_qs


def _get_cors_headers() -> Dict[str, str]:
    allowed_origins = os.getenv("ALLOWED_ORIGINS", "*")
    return {
        "Access-Control-Allow-Origin": allowed_origins,
        "Access-Control-Allow-Methods": "OPTIONS,POST",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "86400",
    }


def _response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": _get_cors_headers(),
        "body": json.dumps(body),
    }


def _is_valid_email(email: str) -> bool:
    # Simple email validation pattern
    pattern = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    return re.match(pattern, email) is not None


def _parse_body(event: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    content_type = (event.get("headers", {}) or {}).get("content-type") or (event.get("headers", {}) or {}).get("Content-Type") or "application/json"
    raw_body = event.get("body") or ""

    if event.get("isBase64Encoded"):
        # Lambda proxy might base64-encode body for some integrations
        import base64
        raw_body = base64.b64decode(raw_body).decode("utf-8")

    if "application/x-www-form-urlencoded" in content_type:
        parsed = {k: v[0] if isinstance(v, list) and v else v for k, v in parse_qs(raw_body).items()}
        return parsed, "form"

    # Default: JSON
    try:
        parsed_json = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON in request body")

    if not isinstance(parsed_json, dict):
        raise ValueError("Request JSON must be an object")

    return parsed_json, "json"


def _validate_payload(payload: Dict[str, Any]) -> Tuple[bool, str]:
    required_fields = ["name", "email"]
    for field in required_fields:
        if not payload.get(field):
            return False, f"Missing required field: {field}"

    if not _is_valid_email(str(payload.get("email"))):
        return False, "Invalid email format"

    return True, ""


def _put_item(table_name: str, item: Dict[str, Any]) -> None:
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)
    table.put_item(
        Item=item,
        ConditionExpression="attribute_not_exists(userId)"
    )


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    # Handle CORS preflight
    if (event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method")) == "OPTIONS":
        return _response(204, {})

    table_name = os.getenv("TABLE_NAME")
    if not table_name:
        return _response(500, {"message": "Server misconfiguration: TABLE_NAME is not set"})

    try:
        payload, source_type = _parse_body(event)
        is_valid, error_msg = _validate_payload(payload)
        if not is_valid:
            return _response(400, {"message": error_msg})

        user_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()

        item: Dict[str, Any] = {
            "userId": user_id,
            "name": str(payload.get("name")),
            "email": str(payload.get("email")),
            "message": str(payload.get("message")) if payload.get("message") is not None else None,
            "phone": str(payload.get("phone")) if payload.get("phone") is not None else None,
            "sourceType": source_type,
            "createdAt": now_iso,
            "updatedAt": now_iso,
        }

        # Remove None values to keep the item tidy
        item = {k: v for k, v in item.items() if v is not None}

        _put_item(table_name, item)

        return _response(201, {"message": "Submitted", "userId": user_id})

    except ValueError as ve:
        return _response(400, {"message": str(ve)})
    except ClientError as ce:
        return _response(500, {"message": "DynamoDB error", "detail": str(ce)})
    except Exception as ex:
        return _response(500, {"message": "Internal server error", "detail": str(ex)})