using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <summary>
/// Desbloquea el admin: resetea FailedLoginAttempts, Status=Activo, contraseña Ädmin123!
/// </summary>
[Migration("20260510000003_UnblockAdminAccount")]
public partial class UnblockAdminAccount : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(@"
            UPDATE ""UserSystems""
            SET ""PasswordHash""           = '$2a$12$SKw6qCQwOINZMk.BN1AZNuuTskGw0nXNetQ0h9paT8ajYzvkTa.vy',
                ""RequiresPasswordChange"" = false,
                ""FailedLoginAttempts""    = 0,
                ""Status""                = 'Activo',
                ""UpdatedAt""             = NOW()
            WHERE ""Id"" = '00000000-0000-0000-0000-000000000001';
        ");
    }

    protected override void Down(MigrationBuilder migrationBuilder) { }
}
