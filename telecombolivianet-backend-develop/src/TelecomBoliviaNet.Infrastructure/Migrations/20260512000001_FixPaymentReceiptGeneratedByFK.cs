using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations
{
    [Migration("20260512000001_FixPaymentReceiptGeneratedByFK")]
    public partial class FixPaymentReceiptGeneratedByFK : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // La migración 20260414000002 creó GeneratedByUserId pero sin FK ni índice.
            // EF Core generaba una sombra GeneratedById que nunca existió en la BD,
            // causando el error: column "GeneratedById" of relation "PaymentReceipts" does not exist.
            // Se registra GeneratedByUserId como FK real hacia UserSystems.
            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_GeneratedByUserId",
                table: "PaymentReceipts",
                column: "GeneratedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_PaymentReceipts_UserSystems_GeneratedByUserId",
                table: "PaymentReceipts",
                column: "GeneratedByUserId",
                principalTable: "UserSystems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PaymentReceipts_UserSystems_GeneratedByUserId",
                table: "PaymentReceipts");

            migrationBuilder.DropIndex(
                name: "IX_PaymentReceipts_GeneratedByUserId",
                table: "PaymentReceipts");
        }
    }
}
