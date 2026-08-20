from dataclasses import dataclass


@dataclass(frozen=True)
class OutboxRecord:
    outbox_id:           str
    cliente_id:          str
    tipo:                str
    phone:               str
    intentos:            int
    phone_log:           str
    mensaje:             str
    is_template:         bool            = False
    meta_template_name:  str | None      = None
    meta_language_code:  str | None      = None
    meta_params:         tuple[str, ...] | None = None


@dataclass(frozen=True)
class RawOutboxRow:
    id:            str
    tipo:          str
    cliente_id:    str
    phone_number:  str
    intentos:      int
    contexto_json: str | None

    @classmethod
    def from_db_row(cls, row: dict) -> "RawOutboxRow":
        """Construye desde un dict de asyncpg."""
        return cls(
            id=row["id"],
            tipo=row["tipo"],
            cliente_id=row["cliente_id"],
            phone_number=row["phone_number"],
            intentos=row["intentos"],
            contexto_json=row.get("contexto_json"),
        )
