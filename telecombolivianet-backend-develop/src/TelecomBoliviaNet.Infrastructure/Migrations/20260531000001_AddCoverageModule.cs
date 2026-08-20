using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations
{
    /// <summary>
    /// Agrega el módulo de cobertura real:
    /// - Extensión PostGIS
    /// - Tabla CoverageZones (polígonos de cobertura con GIST index)
    /// - Tabla DistributionBoxes (cajas NAP con GIST index y contadores de puertos)
    /// - Columnas GPS y FK en Installations
    /// - Seed de Coverage:MaxCableDropMeters en SystemConfigs
    /// </summary>
    [Migration("20260531000001_AddCoverageModule")]
    public partial class AddCoverageModule : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Extensión PostGIS (idempotente)
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS postgis;");

            // 2. CoverageZones
            migrationBuilder.CreateTable(
                name: "CoverageZones",
                columns: table => new
                {
                    Id                     = table.Column<Guid>(type: "uuid", nullable: false),
                    Nombre                 = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Tecnologia             = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    VelocidadMaxMbps       = table.Column<int>(type: "integer", nullable: false),
                    Estado                 = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "Planificada"),
                    FechaExpansionEstimada = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Geom                   = table.Column<Geometry>(type: "geometry(Polygon,4326)", nullable: false),
                    CreadoAt               = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreadoPorId            = table.Column<Guid>(type: "uuid", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoverageZones", x => x.Id);
                });

            migrationBuilder.CreateIndex("IX_CoverageZones_Nombre", "CoverageZones", "Nombre", unique: true);
            migrationBuilder.CreateIndex("IX_CoverageZones_Estado", "CoverageZones", "Estado");
            // GIST index obligatorio para rendimiento de ST_Contains
            migrationBuilder.Sql(
                "CREATE INDEX IX_CoverageZones_Geom_GIST ON \"CoverageZones\" USING GIST (\"Geom\");");

            // 3. DistributionBoxes
            migrationBuilder.CreateTable(
                name: "DistributionBoxes",
                columns: table => new
                {
                    Id                      = table.Column<Guid>(type: "uuid", nullable: false),
                    Codigo                  = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DireccionReferencia     = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    ZoneId                  = table.Column<Guid>(type: "uuid", nullable: false),
                    Location                = table.Column<Point>(type: "geometry(Point,4326)", nullable: false),
                    PuertosTotal            = table.Column<int>(type: "integer", nullable: false),
                    PuertosOcupados         = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    PuertosReservados       = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    DistanciaMaxCableMetros = table.Column<int>(type: "integer", nullable: true),
                    Estado                  = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "Activo"),
                    CreadoAt                = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DistributionBoxes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DistributionBoxes_CoverageZones_ZoneId",
                        column: x => x.ZoneId,
                        principalTable: "CoverageZones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex("IX_DistributionBoxes_Codigo", "DistributionBoxes", "Codigo", unique: true);
            migrationBuilder.CreateIndex("IX_DistributionBoxes_ZoneId", "DistributionBoxes", "ZoneId");
            migrationBuilder.CreateIndex("IX_DistributionBoxes_Estado", "DistributionBoxes", "Estado");
            // GIST index obligatorio para rendimiento de ST_DWithin
            migrationBuilder.Sql(
                "CREATE INDEX IX_DistributionBoxes_Location_GIST ON \"DistributionBoxes\" USING GIST (\"Location\");");

            // 4. Nuevas columnas en Installations
            migrationBuilder.AddColumn<decimal>(
                name: "GpsLatitude", table: "Installations",
                type: "decimal(10,7)", nullable: true);
            migrationBuilder.AddColumn<decimal>(
                name: "GpsLongitude", table: "Installations",
                type: "decimal(10,7)", nullable: true);
            migrationBuilder.AddColumn<string>(
                name: "LocationSource", table: "Installations",
                type: "character varying(30)", maxLength: 30, nullable: true);
            migrationBuilder.AddColumn<Guid>(
                name: "CoverageZoneId", table: "Installations",
                type: "uuid", nullable: true);
            migrationBuilder.AddColumn<Guid>(
                name: "DistributionBoxId", table: "Installations",
                type: "uuid", nullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Installations_CoverageZones_CoverageZoneId",
                table: "Installations", column: "CoverageZoneId",
                principalTable: "CoverageZones", principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
            migrationBuilder.AddForeignKey(
                name: "FK_Installations_DistributionBoxes_DistributionBoxId",
                table: "Installations", column: "DistributionBoxId",
                principalTable: "DistributionBoxes", principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // 5. Seed: distancia máxima de cable drop configurable
            migrationBuilder.InsertData(
                table: "SystemConfigs",
                columns: new[] { "Id", "Key", "Value", "Description", "IsSecret", "UpdatedAt" },
                values: new object[]
                {
                    Guid.Parse("00000000-0000-0000-0099-000000000001"),
                    "Coverage:MaxCableDropMeters",
                    "50",
                    "Distancia máxima de cable drop para instalación estándar (metros). Rango recomendado: 30-100.",
                    false,
                    DateTime.UtcNow,
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Installations_DistributionBoxes_DistributionBoxId",
                table: "Installations");
            migrationBuilder.DropForeignKey(
                name: "FK_Installations_CoverageZones_CoverageZoneId",
                table: "Installations");
            migrationBuilder.DropColumn(name: "GpsLatitude",       table: "Installations");
            migrationBuilder.DropColumn(name: "GpsLongitude",      table: "Installations");
            migrationBuilder.DropColumn(name: "LocationSource",    table: "Installations");
            migrationBuilder.DropColumn(name: "CoverageZoneId",    table: "Installations");
            migrationBuilder.DropColumn(name: "DistributionBoxId", table: "Installations");
            migrationBuilder.DropTable(name: "DistributionBoxes");
            migrationBuilder.DropTable(name: "CoverageZones");
            migrationBuilder.DeleteData(
                table: "SystemConfigs",
                keyColumn: "Id",
                keyValue: Guid.Parse("00000000-0000-0000-0099-000000000001"));
        }
    }
}
