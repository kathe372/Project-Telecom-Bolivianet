using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <inheritdoc />
/// <remarks>
/// 2026-08-04: escrita a mano, no con `dotnet ef migrations add` — mismo motivo
/// que 20260802230700_AddInstallationProspectIdentityCard.cs y
/// 20260804120000_AddTicketProspectIdentityCard.cs (el modelo de diseño está
/// adelantado al drift real de la base). Agrega el contacto alterno del
/// prospecto —un número distinto del WhatsApp desde el que escribe— para que el
/// técnico pueda ubicarlo el día de la instalación si el principal no responde.
///
/// El campo existe en las dos entidades con prospecto (ver AppDbContext:333 y
/// AppDbContext:645), así que la columna se agrega a las dos tablas.
///
/// NOTA (2026-08-20): este archivo fue reconstruido tras un borrado accidental
/// con `dotnet ef migrations remove --no-build`. El contenido se derivó del
/// mapeo vigente en AppDbContext (HasMaxLength(30), IsRequired(false)) y del
/// patrón de las dos migraciones hermanas. Si la columna YA está aplicada en
/// producción —lo estará, porque la migración original se desplegó— no hace
/// falta ninguna acción: el registro en __EFMigrationsHistory sigue intacto y
/// esta migración no se volverá a ejecutar.
/// </remarks>
[Migration("20260804123000_AddProspectBackupPhone")]
[DbContext(typeof(AppDbContext))]
public partial class AddProspectBackupPhone : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "ProspectBackupPhone",
            table: "Installations",
            type: "character varying(30)",
            maxLength: 30,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "ProspectBackupPhone",
            table: "SupportTickets",
            type: "character varying(30)",
            maxLength: 30,
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "ProspectBackupPhone", table: "Installations");
        migrationBuilder.DropColumn(name: "ProspectBackupPhone", table: "SupportTickets");
    }
}
