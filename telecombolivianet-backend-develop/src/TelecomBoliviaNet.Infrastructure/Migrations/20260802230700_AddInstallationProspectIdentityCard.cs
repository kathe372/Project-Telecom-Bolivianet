using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <inheritdoc />
/// <remarks>
/// PASO 10 (2026-08): escrita a mano, no con `dotnet ef migrations add` — el
/// modelo de diseño ya está adelantado a la base real (varias tablas de
/// sesiones anteriores se crearon por SQL directo, no por migración EF: ver
/// CoverageQueries, CreditMovements, GeocodeCaches, NapPorts, PortReservations).
/// Generarla automáticamente arrastraba ese drift entero como si fuera nuevo
/// (recrear tablas que ya existen en producción) — se descartó ese archivo y
/// se escribió esta migración mínima, mismo patrón que
/// 20260715000001_AddProspectFieldsToInstallations.cs.
/// </remarks>
[Migration("20260802230700_AddInstallationProspectIdentityCard")]
[DbContext(typeof(AppDbContext))]
public partial class AddInstallationProspectIdentityCard : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "ProspectIdentityCard",
            table: "Installations",
            type: "character varying(30)",
            maxLength: 30,
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "ProspectIdentityCard", table: "Installations");
    }
}
