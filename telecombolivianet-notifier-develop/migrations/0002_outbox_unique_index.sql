CREATE UNIQUE INDEX IF NOT EXISTS uq_outbox_client_tipo_ref
    ON "NotifOutbox" ("ClienteId", "Tipo", "ReferenciaId")
    WHERE "EstadoFinal" IS NULL;
