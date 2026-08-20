using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <inheritdoc />
/// <remarks>
/// 2026-08-04: escrita a mano, no con `dotnet ef migrations add` — mismo motivo
/// que 20260802230700_AddInstallationProspectIdentityCard.cs (el modelo de
/// diseño está adelantado al drift real de la base). Agrega a los tickets el
/// mismo campo de identidad de prospecto que ya existe en Installations, para
/// que un ticket creado para alguien sin ficha de cliente también quede con CI
/// verificable.
/// </remarks>
[Migration("20260804120000_AddTicketProspectIdentityCard")]
[DbContext(typeof(AppDbContext))]
public partial class AddTicketProspectIdentityCard : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "ProspectIdentityCard",
            table: "SupportTickets",
            type: "character varying(30)",
            maxLength: 30,
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "ProspectIdentityCard", table: "SupportTickets");
    }
}
