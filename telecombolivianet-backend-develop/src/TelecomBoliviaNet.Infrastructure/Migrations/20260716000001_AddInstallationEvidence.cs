using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <summary>
/// Fase 5 (nivel comercial): evidencia de cierre de instalación —
/// equipo instalado, metros de drop, checklist y fotos.
/// </summary>
[Migration("20260716000001_AddInstallationEvidence")]
[DbContext(typeof(AppDbContext))]
public partial class AddInstallationEvidence : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "EquipoOnuSerial",
            table: "Installations",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "MetrosDrop",
            table: "Installations",
            type: "integer",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "ChecklistJson",
            table: "Installations",
            type: "text",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "FotosUrlsJson",
            table: "Installations",
            type: "text",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "EquipoOnuSerial", table: "Installations");
        migrationBuilder.DropColumn(name: "MetrosDrop",      table: "Installations");
        migrationBuilder.DropColumn(name: "ChecklistJson",   table: "Installations");
        migrationBuilder.DropColumn(name: "FotosUrlsJson",   table: "Installations");
    }
}
