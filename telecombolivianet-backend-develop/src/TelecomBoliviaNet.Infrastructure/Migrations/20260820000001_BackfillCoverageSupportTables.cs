using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <summary>
/// Recupera como migración las cuatro tablas de soporte de cobertura que solo
/// existían en producción, creadas por SQL directo: CoverageQueries,
/// GeocodeCaches, NapPorts y PortReservations.
/// </summary>
/// <remarks>
/// 2026-08-20 — Fase 0 del plan de mejora técnica (ver ADR-004).
///
/// El test <c>SchemaParityTests</c> demostró que ninguna migración creaba estas
/// cuatro tablas: el modelo de EF las mapea, producción las tiene, y el
/// repositorio no sabía nada de ellas. Una base reconstruida desde cero salía
/// sin ellas y la aplicación reventaba al primer uso del módulo de cobertura.
///
/// Todo el DDL es idempotente (IF NOT EXISTS): en producción esta migración es
/// un no-op —las tablas ya están— y en un entorno nuevo las construye igual que
/// el modelo las espera. El contenido se derivó del mapeo vigente en
/// AppDbContext (líneas 690-743) y de las entidades de Domain/Entities/Coverage.
/// </remarks>
[Migration("20260820000001_BackfillCoverageSupportTables")]
[DbContext(typeof(AppDbContext))]
public partial class BackfillCoverageSupportTables : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // ── CoverageQueries ───────────────────────────────────────────────────
        // Log de demanda: dónde nos consultan cobertura y qué se respondió.
        // MatchedBoxId es referencia suelta a propósito (sin FK): el log debe
        // sobrevivir al borrado de la caja.
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "CoverageQueries" (
                "Id"           uuid NOT NULL,
                "QueriedAt"    timestamp with time zone NOT NULL,
                "InputType"    character varying(20) NOT NULL,
                "Location"     geometry(Point,4326) NOT NULL,
                "Result"       character varying(40) NOT NULL,
                "MatchedBoxId" uuid NULL,
                "ZoneName"     character varying(200) NULL,
                "Channel"      character varying(20) NOT NULL,
                "ContactPhone" character varying(30)  NULL,
                "ContactName"  character varying(200) NULL,
                CONSTRAINT "PK_CoverageQueries" PRIMARY KEY ("Id")
            );

            CREATE INDEX IF NOT EXISTS "IX_CoverageQueries_QueriedAt" ON "CoverageQueries" ("QueriedAt");
            CREATE INDEX IF NOT EXISTS "IX_CoverageQueries_Result"    ON "CoverageQueries" ("Result");
            """);

        // ── GeocodeCaches ─────────────────────────────────────────────────────
        // Caché dirección→coordenadas. NormalizedQuery es la clave de caché.
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "GeocodeCaches" (
                "Id"              uuid NOT NULL,
                "NormalizedQuery" character varying(400) NOT NULL,
                "Location"        geometry(Point,4326) NOT NULL,
                "Confidence"      double precision NOT NULL,
                "DisplayName"     character varying(500) NULL,
                "CreatedAt"       timestamp with time zone NOT NULL,
                CONSTRAINT "PK_GeocodeCaches" PRIMARY KEY ("Id")
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_GeocodeCaches_NormalizedQuery"
                ON "GeocodeCaches" ("NormalizedQuery");
            """);

        // ── NapPorts ──────────────────────────────────────────────────────────
        // Read-model de puertos por caja. FK con cascada: borrar la caja limpia
        // sus puertos.
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "NapPorts" (
                "Id"                uuid NOT NULL,
                "DistributionBoxId" uuid NOT NULL,
                "Numero"            integer NOT NULL,
                "Status"            character varying(20) NOT NULL,
                "AccountId"         uuid NULL,
                "OnuSerial"         character varying(100) NULL,
                "InstallationId"    uuid NULL,
                "UpdatedAt"         timestamp with time zone NOT NULL,
                CONSTRAINT "PK_NapPorts" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_NapPorts_DistributionBoxes_DistributionBoxId"
                    FOREIGN KEY ("DistributionBoxId") REFERENCES "DistributionBoxes" ("Id") ON DELETE CASCADE
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_NapPorts_DistributionBoxId_Numero"
                ON "NapPorts" ("DistributionBoxId", "Numero");
            CREATE INDEX IF NOT EXISTS "IX_NapPorts_Status" ON "NapPorts" ("Status");
            """);

        // ── PortReservations ──────────────────────────────────────────────────
        // Reservas con TTL. Sin FK a propósito: el registro de capacidad
        // sobrevive a borrados y no arrastra cascadas.
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "PortReservations" (
                "Id"                uuid NOT NULL,
                "DistributionBoxId" uuid NOT NULL,
                "InstallationId"    uuid NOT NULL,
                "ReservedAt"        timestamp with time zone NOT NULL,
                "ExpiresAt"         timestamp with time zone NOT NULL,
                "Status"            character varying(20) NOT NULL,
                CONSTRAINT "PK_PortReservations" PRIMARY KEY ("Id")
            );

            CREATE INDEX IF NOT EXISTS "IX_PortReservations_Status_ExpiresAt"
                ON "PortReservations" ("Status", "ExpiresAt");
            CREATE INDEX IF NOT EXISTS "IX_PortReservations_InstallationId"
                ON "PortReservations" ("InstallationId");
            """);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE IF EXISTS "PortReservations";
            DROP TABLE IF EXISTS "NapPorts";
            DROP TABLE IF EXISTS "GeocodeCaches";
            DROP TABLE IF EXISTS "CoverageQueries";
            """);
    }
}
