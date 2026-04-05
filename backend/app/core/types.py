"""
Database type compatibility layer.
Maps PostgreSQL-specific types to SQLite-compatible alternatives.
When deploying to PostgreSQL, these automatically use native types.
"""
from sqlalchemy import String, Text
from sqlalchemy.dialects import postgresql
from sqlalchemy.types import TypeDecorator, TypeEngine
import json
import uuid


class GUID(TypeDecorator):
    """
    Platform-independent UUID type.
    Uses PostgreSQL UUID on PG, CHAR(36) on SQLite.
    """
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            if isinstance(value, uuid.UUID):
                return str(value)
            return str(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            if not isinstance(value, uuid.UUID):
                return uuid.UUID(value)
        return value

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(postgresql.UUID(as_uuid=True))
        return dialect.type_descriptor(String(36))


class JSONType(TypeDecorator):
    """
    Platform-independent JSON type.
    Uses JSONB on PostgreSQL, TEXT with JSON serialization on SQLite.
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            if dialect.name != 'postgresql':
                return json.dumps(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            if dialect.name != 'postgresql' and isinstance(value, str):
                return json.loads(value)
        return value

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(postgresql.JSONB())
        return dialect.type_descriptor(Text())
