using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <inheritdoc />
[Migration("20260602000001_AddInstallationTechniciansV2")]
public partial class AddInstallationTechniciansV2 : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // ── InstallationTechnicians ───────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "InstallationTechnicians",
            columns: table => new
            {
                Id             = table.Column<Guid>(nullable: false),
                InstallationId = table.Column<Guid>(nullable: false),
                TechnicianId   = table.Column<Guid>(nullable: false),
                IsLead         = table.Column<bool>(nullable: false, defaultValue: false),
                AssignedAt     = table.Column<DateTime>(nullable: false),
                AssignedBy     = table.Column<Guid>(nullable: false),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_InstallationTechnicians", x => x.Id);
                table.ForeignKey(
                    name: "FK_InstallationTechnicians_Installations_InstallationId",
                    column: x => x.InstallationId,
                    principalTable: "Installations",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_InstallationTechnicians_UserSystems_TechnicianId",
                    column: x => x.TechnicianId,
                    principalTable: "UserSystems",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_InstallationTechnicians_InstallationId_TechnicianId",
            table: "InstallationTechnicians",
            columns: new[] { "InstallationId", "TechnicianId" },
            unique: true);

        // ── VisitTechnicians ──────────────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "VisitTechnicians",
            columns: table => new
            {
                Id           = table.Column<Guid>(nullable: false),
                VisitId      = table.Column<Guid>(nullable: false),
                TechnicianId = table.Column<Guid>(nullable: false),
                IsLead       = table.Column<bool>(nullable: false, defaultValue: false),
                AssignedAt   = table.Column<DateTime>(nullable: false),
                AssignedBy   = table.Column<Guid>(nullable: false),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_VisitTechnicians", x => x.Id);
                table.ForeignKey(
                    name: "FK_VisitTechnicians_TicketVisits_VisitId",
                    column: x => x.VisitId,
                    principalTable: "TicketVisits",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_VisitTechnicians_UserSystems_TechnicianId",
                    column: x => x.TechnicianId,
                    principalTable: "UserSystems",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_VisitTechnicians_VisitId_TechnicianId",
            table: "VisitTechnicians",
            columns: new[] { "VisitId", "TechnicianId" },
            unique: true);

        // ── Nuevos campos en Installations ───────────────────────────────────
        migrationBuilder.AddColumn<DateTime>(
            name: "ReminderSentAt",
            table: "Installations",
            nullable: true);

        migrationBuilder.AddColumn<DateTime>(
            name: "CanceladoAt",
            table: "Installations",
            nullable: true);

        // ── Nuevos campos en TicketVisits ─────────────────────────────────────
        migrationBuilder.AddColumn<int>(
            name: "DuracionMin",
            table: "TicketVisits",
            nullable: false,
            defaultValue: 60);

        // ── Nuevos campos en Plans ────────────────────────────────────────────
        migrationBuilder.AddColumn<int>(
            name: "TecnicosRequeridos",
            table: "Plans",
            nullable: false,
            defaultValue: 1);

        migrationBuilder.AddColumn<int>(
            name: "DuracionInstalacionMin",
            table: "Plans",
            nullable: false,
            defaultValue: 120);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "InstallationTechnicians");
        migrationBuilder.DropTable(name: "VisitTechnicians");

        migrationBuilder.DropColumn(name: "ReminderSentAt",      table: "Installations");
        migrationBuilder.DropColumn(name: "CanceladoAt",          table: "Installations");
        migrationBuilder.DropColumn(name: "DuracionMin",          table: "TicketVisits");
        migrationBuilder.DropColumn(name: "TecnicosRequeridos",   table: "Plans");
        migrationBuilder.DropColumn(name: "DuracionInstalacionMin", table: "Plans");
    }
}
