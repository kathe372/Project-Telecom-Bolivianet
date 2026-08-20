using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <summary>
/// BUG-14: las instalaciones de PROSPECTOS (sin cliente registrado) fallaban con
/// violación de FK porque ClienteId null se convertía en Guid.Empty. La columna
/// pasa a ser nullable: NULL = instalación de prospecto.
/// </summary>
[Migration("20260712000001_InstallationClientIdNullable")]
[DbContext(typeof(TelecomBoliviaNet.Infrastructure.Data.AppDbContext))]
public partial class InstallationClientIdNullable : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE "Installations" ALTER COLUMN "ClientId" DROP NOT NULL;
            """);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DELETE FROM "Installations" WHERE "ClientId" IS NULL;
            ALTER TABLE "Installations" ALTER COLUMN "ClientId" SET NOT NULL;
            """);
    }
}
