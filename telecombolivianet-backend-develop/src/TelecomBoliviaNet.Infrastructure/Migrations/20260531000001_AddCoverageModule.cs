using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations
{
    /// <summary>
    /// Módulo de cobertura real:
    /// - Extensión PostGIS
    /// - CoverageZones (polígonos con índice GIST)
    /// - DistributionBoxes (cajas NAP con índice GIST y contadores de puertos)
    /// - Columnas GPS y FK en Installations
    /// - Seed de Coverage:MaxCableDropMeters
    /// </summary>
    /// <remarks>
    /// 2026-08-20 — Reescrita como SQL idempotente. Motivo (ver ADR-004):
    ///
    /// Le faltaba <c>[DbContext(typeof(AppDbContext))]</c> y tampoco estaba en
    /// MigrationsDbContextLink.cs, así que EF nunca la vio. Sus tablas
    /// (CoverageZones, DistributionBoxes) y las columnas de Installations
    /// llegaron a producción por SQL directo — de ahí que la base real y las
    /// migraciones llevaran meses divergiendo.
    ///
    /// Al recuperar la visibilidad, EF intentará aplicarla en el próximo
    /// despliegue porque no consta en __EFMigrationsHistory. Cada operación es
    /// idempotente para que en producción sea un no-op y en una base nueva
    /// construya el esquema correcto.
    ///
    /// Las claves foráneas no admiten IF NOT EXISTS en PostgreSQL, así que se
    /// hace DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT: el resultado final es el
    /// mismo tanto si la restricción existía como si no.
    /// </remarks>
    [Migration("20260531000001_AddCoverageModule")]
    [DbContext(typeof(AppDbContext))]
    public partial class AddCoverageModule : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Extensión PostGIS
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS postgis;");

            // 2. CoverageZones
            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS "CoverageZones" (
                    "Id"                     uuid NOT NULL,
                    "Nombre"                 character varying(200) NOT NULL,
                    "Tecnologia"             character varying(20)  NOT NULL,
                    "VelocidadMaxMbps"       integer NOT NULL,
                    "Estado"                 character varying(20)  NOT NULL DEFAULT 'Planificada',
                    "FechaExpansionEstimada" timestamp with time zone NULL,
                    "Geom"                   geometry(Polygon,4326) NOT NULL,
                    "CreadoAt"               timestamp with time zone NOT NULL,
                    "CreadoPorId"            uuid NOT NULL,
                    CONSTRAINT "PK_CoverageZones" PRIMARY KEY ("Id")
                );
                """);

            migrationBuilder.Sql("""
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_CoverageZones_Nombre" ON "CoverageZones" ("Nombre");
                CREATE INDEX IF NOT EXISTS "IX_CoverageZones_Estado" ON "CoverageZones" ("Estado");
                -- GIST obligatorio para el rendimiento de ST_Contains
                CREATE INDEX IF NOT EXISTS "IX_CoverageZones_Geom_GIST" ON "CoverageZones" USING GIST ("Geom");
                """);

            // 3. DistributionBoxes
            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS "DistributionBoxes" (
                    "Id"                      uuid NOT NULL,
                    "Codigo"                  character varying(50)  NOT NULL,
                    "DireccionReferencia"     character varying(300) NOT NULL,
                    "ZoneId"                  uuid NOT NULL,
                    "Location"                geometry(Point,4326) NOT NULL,
                    "PuertosTotal"            integer NOT NULL,
                    "PuertosOcupados"         integer NOT NULL DEFAULT 0,
                    "PuertosReservados"       integer NOT NULL DEFAULT 0,
                    "DistanciaMaxCableMetros" integer NULL,
                    "Estado"                  character varying(20) NOT NULL DEFAULT 'Activo',
                    "CreadoAt"                timestamp with time zone NOT NULL,
                    CONSTRAINT "PK_DistributionBoxes" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_DistributionBoxes_CoverageZones_ZoneId"
                        FOREIGN KEY ("ZoneId") REFERENCES "CoverageZones" ("Id") ON DELETE RESTRICT
                );
                """);

            migrationBuilder.Sql("""
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_DistributionBoxes_Codigo" ON "DistributionBoxes" ("Codigo");
                CREATE INDEX IF NOT EXISTS "IX_DistributionBoxes_ZoneId" ON "DistributionBoxes" ("ZoneId");
                CREATE INDEX IF NOT EXISTS "IX_DistributionBoxes_Estado" ON "DistributionBoxes" ("Estado");
                -- GIST obligatorio para el rendimiento de ST_DWithin
                CREATE INDEX IF NOT EXISTS "IX_DistributionBoxes_Location_GIST" ON "DistributionBoxes" USING GIST ("Location");
                """);

            // 4. Columnas nuevas en Installations
            migrationBuilder.Sql("""
                ALTER TABLE "Installations" ADD COLUMN IF NOT EXISTS "GpsLatitude"       numeric(10,7) NULL;
                ALTER TABLE "Installations" ADD COLUMN IF NOT EXISTS "GpsLongitude"      numeric(10,7) NULL;
                ALTER TABLE "Installations" ADD COLUMN IF NOT EXISTS "LocationSource"    character varying(30) NULL;
                ALTER TABLE "Installations" ADD COLUMN IF NOT EXISTS "CoverageZoneId"    uuid NULL;
                ALTER TABLE "Installations" ADD COLUMN IF NOT EXISTS "DistributionBoxId" uuid NULL;
                """);

            // Las FK no admiten IF NOT EXISTS: se sueltan y se vuelven a crear.
            migrationBuilder.Sql("""
                ALTER TABLE "Installations"
                    DROP CONSTRAINT IF EXISTS "FK_Installations_CoverageZones_CoverageZoneId";
                ALTER TABLE "Installations"
                    ADD CONSTRAINT "FK_Installations_CoverageZones_CoverageZoneId"
                    FOREIGN KEY ("CoverageZoneId") REFERENCES "CoverageZones" ("Id") ON DELETE RESTRICT;

                ALTER TABLE "Installations"
                    DROP CONSTRAINT IF EXISTS "FK_Installations_DistributionBoxes_DistributionBoxId";
                ALTER TABLE "Installations"
                    ADD CONSTRAINT "FK_Installations_DistributionBoxes_DistributionBoxId"
                    FOREIGN KEY ("DistributionBoxId") REFERENCES "DistributionBoxes" ("Id") ON DELETE RESTRICT;
                """);

            // 5. Seed: distancia máxima de cable drop configurable.
            // ON CONFLICT DO NOTHING: si el operador ya ajustó el valor en producción,
            // este seed no debe pisárselo.
            migrationBuilder.Sql("""
                INSERT INTO "SystemConfigs" ("Id", "Key", "Value", "Description", "IsSecret", "UpdatedAt")
                VALUES (
                    '00000000-0000-0000-0099-000000000001',
                    'Coverage:MaxCableDropMeters',
                    '50',
                    'Distancia máxima de cable drop para instalación estándar (metros). Rango recomendado: 30-100.',
                    FALSE,
                    NOW() AT TIME ZONE 'UTC'
                )
                ON CONFLICT ("Id") DO NOTHING;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "Installations" DROP CONSTRAINT IF EXISTS "FK_Installations_DistributionBoxes_DistributionBoxId";
                ALTER TABLE "Installations" DROP CONSTRAINT IF EXISTS "FK_Installations_CoverageZones_CoverageZoneId";

                ALTER TABLE "Installations" DROP COLUMN IF EXISTS "GpsLatitude";
                ALTER TABLE "Installations" DROP COLUMN IF EXISTS "GpsLongitude";
                ALTER TABLE "Installations" DROP COLUMN IF EXISTS "LocationSource";
                ALTER TABLE "Installations" DROP COLUMN IF EXISTS "CoverageZoneId";
                ALTER TABLE "Installations" DROP COLUMN IF EXISTS "DistributionBoxId";

                DROP TABLE IF EXISTS "DistributionBoxes";
                DROP TABLE IF EXISTS "CoverageZones";

                DELETE FROM "SystemConfigs" WHERE "Id" = '00000000-0000-0000-0099-000000000001';
                """);
        }
    }
}
