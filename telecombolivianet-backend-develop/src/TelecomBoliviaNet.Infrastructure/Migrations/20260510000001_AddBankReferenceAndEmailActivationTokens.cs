using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

[Migration("20260510000001_AddBankReferenceAndEmailActivationTokens")]
public partial class AddBankReferenceAndEmailActivationTokens : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Columna BankReference faltante en Payments
        migrationBuilder.AddColumn<string>(
            name: "BankReference",
            table: "Payments",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);

        // Tabla EmailActivationTokens (tokens de activación de cuenta por email)
        migrationBuilder.CreateTable(
            name: "EmailActivationTokens",
            columns: table => new
            {
                Id        = table.Column<Guid>(type: "uuid", nullable: false),
                UserId    = table.Column<Guid>(type: "uuid", nullable: false),
                Token     = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                Used      = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_EmailActivationTokens", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_EmailActivationTokens_Token",
            table: "EmailActivationTokens",
            column: "Token",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_EmailActivationTokens_UserId",
            table: "EmailActivationTokens",
            column: "UserId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "EmailActivationTokens");

        migrationBuilder.DropColumn(
            name: "BankReference",
            table: "Payments");
    }
}
