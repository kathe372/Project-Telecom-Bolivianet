using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <summary>
/// Auditoría 2026-08-01 — hallazgo A.
///
/// Bloqueo TEMPORAL por intentos fallidos (estándar de la industria: Auth0,
/// Cognito, Azure AD). Antes 5 intentos fallidos ponían Status=Bloqueado de
/// forma PERMANENTE: si el bloqueado era el único Admin, nadie podía
/// desbloquearlo desde la UI y la única salida era RESET_ADMIN + redespliegue.
///
/// Además, desbloquea a quienes quedaron atrapados por el mecanismo anterior:
/// las cuentas en Bloqueado con intentos fallidos acumulados (bloqueo automático)
/// vuelven a Activo. Los bloqueos administrativos manuales (sin intentos
/// fallidos) se conservan.
/// </summary>
[Migration("20260801000004_AddUserLockedUntil")]
[DbContext(typeof(AppDbContext))]
public partial class AddUserLockedUntil : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "LockedUntil",
            table: "UserSystems",
            type: "timestamp with time zone",
            nullable: true);

        // Amnistía única: los bloqueos AUTOMÁTICOS del mecanismo viejo (Bloqueado
        // + intentos fallidos en el tope) pasan al modelo nuevo ya expirados.
        migrationBuilder.Sql(@"
            UPDATE ""UserSystems""
            SET ""Status"" = 'Activo',
                ""FailedLoginAttempts"" = 0,
                ""UpdatedAt"" = NOW()
            WHERE ""Status"" = 'Bloqueado'
              AND ""FailedLoginAttempts"" >= 3;
        ");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "LockedUntil", table: "UserSystems");
    }
}
