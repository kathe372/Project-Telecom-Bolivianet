using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <summary>
/// Fase 2 (nivel comercial): el estado Reprogramada dejó de usarse — las
/// instalaciones reprogramadas vuelven a Pendiente para que sigan ocupando
/// capacidad de agenda y reciban el recordatorio T-1 (BUG B3).
/// </summary>
[Migration("20260715000002_NormalizeReprogramadaStatus")]
[DbContext(typeof(AppDbContext))]
public partial class NormalizeReprogramadaStatus : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            UPDATE "Installations"
            SET "Status" = 'Pendiente', "ReminderSentAt" = NULL
            WHERE "Status" = 'Reprogramada';
            """);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Sin reversa: no hay forma de saber qué filas eran Reprogramada.
    }
}
