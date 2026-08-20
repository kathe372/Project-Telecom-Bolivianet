using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <summary>
/// Auditoría 2026-08-01 — Fase 2b.
///
/// Config y plantilla para dos tipos nuevos que antes se falsificaban
/// reutilizando plantillas ajenas:
///
/// - CAMBIO_PLAN_RECHAZADO: el rechazo enviaba CAMBIO_PLAN con el plan nuevo,
///   así que el cliente leía "tu plan cambió a Plan Oro" tras un rechazo.
/// - PAGO_ANULADO: la anulación enviaba CONFIRMACION_PAGO con el texto
///   "Pago anulado…" incrustado en la variable {{periodo}}.
///
/// Ambos se siembran ACTIVOS: en los dos flujos ya se notificaba al cliente
/// (con el mensaje equivocado); esto conserva la notificación y corrige el texto.
/// </summary>
[Migration("20260801000003_AddRechazoYAnulacionNotifs")]
[DbContext(typeof(AppDbContext))]
public partial class AddRechazoYAnulacionNotifs : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(@"
            INSERT INTO ""NotifConfigs"" (
                ""Id"", ""Tipo"", ""Activo"", ""DelaySegundos"",
                ""HoraInicio"", ""HoraFin"", ""Inmediato"", ""DiasAntes"", ""ActualizadoAt""
            ) VALUES
            (
                '00000000-0000-0000-0008-000000000013',
                'CAMBIO_PLAN_RECHAZADO',
                TRUE, 0, '08:00:00', '20:00:00', FALSE, NULL, NOW()
            ),
            (
                '00000000-0000-0000-0008-000000000014',
                'PAGO_ANULADO',
                TRUE, 0, '08:00:00', '20:00:00', FALSE, NULL, NOW()
            )
            ON CONFLICT DO NOTHING;
        ");

        // 2026-08-04: la INSERT original no mandaba "Categoria" ni "HsmStatus" —
        // ambas NOT NULL desde migraciones anteriores. Fallaba con
        // "null value in column ... violates not-null constraint" en cualquier
        // entorno donde esta migración corriera desde cero.
        // Categorías alineadas con la plantilla equivalente ya existente:
        // CAMBIO_PLAN_RECHAZADO → misma categoría que CAMBIO_PLAN ("Cobro");
        // PAGO_ANULADO → misma categoría que CONFIRMACION_PAGO ("General").
        // HsmStatus 'Pendiente' = mismo default que usa la entidad NotifTemplate
        // en código (plantillas nuevas, todavía no aprobadas como HSM de Meta).
        migrationBuilder.Sql(@"
            INSERT INTO ""NotifPlantillas"" (
                ""Id"", ""Tipo"", ""Categoria"", ""HsmStatus"", ""Activa"", ""Texto"", ""CreadoAt"", ""CreadoPorId""
            ) VALUES
            (
                '00000000-0000-0000-0009-000000000013',
                'CAMBIO_PLAN_RECHAZADO',
                'Cobro',
                'Pendiente',
                TRUE,
                E'Estimado/a {{nombre}},\n\nSu solicitud de cambio al plan *{{plan}}* no pudo ser aprobada.\n\nMotivo: {{motivo}}\n\nSu plan actual se mantiene sin cambios. Si tiene dudas, escríbanos por este medio.\n\n*TelecomBoliviaNet*',
                NOW(),
                (SELECT ""Id"" FROM ""UserSystems"" WHERE ""Role"" = 'Admin' LIMIT 1)
            ),
            (
                '00000000-0000-0000-0009-000000000014',
                'PAGO_ANULADO',
                'General',
                'Pendiente',
                TRUE,
                E'Estimado/a {{nombre}},\n\nLe informamos que el pago de *Bs. {{monto}}* registrado a su nombre fue anulado.\n\nLas facturas que cubría vuelven a estar pendientes de pago. Si cree que se trata de un error, comuníquese con nosotros por este medio.\n\n*TelecomBoliviaNet*',
                NOW(),
                (SELECT ""Id"" FROM ""UserSystems"" WHERE ""Role"" = 'Admin' LIMIT 1)
            )
            ON CONFLICT DO NOTHING;
        ");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(@"DELETE FROM ""NotifPlantillas"" WHERE ""Id"" IN ('00000000-0000-0000-0009-000000000013','00000000-0000-0000-0009-000000000014');");
        migrationBuilder.Sql(@"DELETE FROM ""NotifConfigs""   WHERE ""Id"" IN ('00000000-0000-0000-0008-000000000013','00000000-0000-0000-0008-000000000014');");
    }
}
