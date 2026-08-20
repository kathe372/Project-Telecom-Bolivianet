using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <summary>
/// Resetea la contraseña del admin a Ädmin123! y desactiva RequiresPasswordChange.
/// </summary>
[Migration("20260510000002_ResetAdminPassword")]
public partial class ResetAdminPassword : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(@"
            UPDATE ""UserSystems""
            SET ""PasswordHash""           = '$2a$12$SKw6qCQwOINZMk.BN1AZNuuTskGw0nXNetQ0h9paT8ajYzvkTa.vy',
                ""RequiresPasswordChange"" = false,
                ""UpdatedAt""              = NOW()
            WHERE ""Id"" = '00000000-0000-0000-0000-000000000001';
        ");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(@"
            UPDATE ""UserSystems""
            SET ""RequiresPasswordChange"" = true
            WHERE ""Id"" = '00000000-0000-0000-0000-000000000001';
        ");
    }
}
