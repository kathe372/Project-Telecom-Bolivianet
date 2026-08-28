using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <summary>
/// Deja coherentes los horarios marcados 24x7: los siete días y de 0 a 24.
/// </summary>
/// <remarks>
/// 2026-08-27 — D-21 (ver BUGS_DESCUBIERTOS.md y ADR-004).
///
/// <para><c>ValidateDto</c> no comprobaba nada cuando <c>Is24x7</c> era true, y la
/// pantalla no pide días ni horas al marcar esa casilla: los campos llegaban en
/// cero y se guardaban tal cual. Un horario así hacía que la consulta de huecos
/// devolviera CERO citas disponibles todos los días —la máscara 0 no incluye
/// ningún día— mientras el cálculo de SLA seguía bien, porque trata el 24x7
/// aparte. Agenda vacía, sin ningún error.</para>
///
/// <para>El código ya interpreta esas filas correctamente
/// (<c>BusinessSchedule.IsWorkingDay</c> y <c>OpenHours</c>) y normaliza al
/// guardar, pero eso solo arregla una fila cuando alguien la edita. Esta
/// migración arregla el dato que YA está en la base.</para>
///
/// <para>Es idempotente y acotada: solo toca filas con <c>Is24x7 = true</c> cuyos
/// valores no sean ya los normalizados. En una base donde no haya ninguno, no
/// modifica nada.</para>
/// </remarks>
[Migration("20260827000001_NormalizeTwentyFourSevenSchedules")]
[DbContext(typeof(AppDbContext))]
public partial class NormalizeTwentyFourSevenSchedules : Migration
{
    protected override void Up(MigrationBuilder mb)
    {
        // 127 = los siete bits de día (lunes=1 … domingo=64).
        mb.Sql("""
            UPDATE "BusinessSchedules"
               SET "WorkingDaysMask" = 127,
                   "StartHour"       = 0,
                   "EndHour"         = 24,
                   "UpdatedAt"       = NOW() AT TIME ZONE 'UTC'
             WHERE "Is24x7" = TRUE
               AND ("WorkingDaysMask" <> 127 OR "StartHour" <> 0 OR "EndHour" <> 24);
            """);
    }

    /// <summary>
    /// No se revierte. Los valores anteriores eran justamente los que rompían el
    /// calendario, y no hay ninguno al que "volver" que tenga sentido: un 24x7
    /// con máscara 0 no es un estado que debiera existir.
    /// </summary>
    protected override void Down(MigrationBuilder mb) { }
}
