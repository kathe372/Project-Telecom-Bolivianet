using FluentAssertions;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.UnitTests.Services;

/// <summary>
/// Sonda de casos límite sobre la lógica de dominio pura.
///
/// No son tests de regresión de un bug conocido: son un intento deliberado de
/// romper los cálculos de dinero, estado y SLA con los valores que la suite
/// existente no toca — ceros, negativos, empates exactos, años bisiestos y
/// configuraciones degeneradas.
///
/// Lo que pase aquí es barato de arreglar; lo que no se pruebe, se descubre en
/// producción con dinero de por medio.
/// </summary>
public class DomainEdgeCaseProbeTests
{
    // ── Estado de factura ────────────────────────────────────────────────────

    [Fact]
    public void Una_factura_sin_importe_esta_saldada_no_pendiente()
    {
        // D-17 (corregido): antes la primera comprobación era `amountPaid <= 0`,
        // así que una factura de importe 0 quedaba Emitida para siempre — y
        // Emitida está en OverdueEligible, de modo que el job de vencimiento
        // acababa marcándola Vencida con deuda 0.
        InvoiceDomainService.CalculateStatus(0m, 0m)
            .Should().Be(InvoiceStatus.Pagada);

        // Y no se cuela en el marcado de vencidas.
        InvoiceDomainService.OverdueEligible
            .Should().NotContain(InvoiceStatus.Pagada);
    }

    [Fact]
    public void Un_horario_sin_jornada_util_da_error_legible_en_vez_de_colgarse()
    {
        // D-16 (corregido): con EndHour <= StartHour el bucle principal no
        // terminaba nunca y el hilo del job de SLA giraba para siempre.
        var degenerado = new BusinessSchedule
        {
            Name = "Turno mal configurado",
            StartHour = 18, EndHour = 8,   // fin antes que inicio
            WorkingDaysMask = 31, UtcOffsetHours = -4, Is24x7 = false,
        };

        var calcular = () => SlaCalculator.AddBusinessMinutes(
            new DateTime(2026, 8, 24, 12, 0, 0, DateTimeKind.Utc),
            minutes: 60, degenerado, Array.Empty<DateOnly>());

        calcular.Should().Throw<ArgumentException>()
            .WithMessage("*no tiene jornada útil*");
    }

    [Theory]
    [InlineData(100, 99.99, InvoiceStatus.ParcialmentePagada)]
    [InlineData(100, 100.00, InvoiceStatus.Pagada)]
    [InlineData(100, 100.01, InvoiceStatus.Pagada)]   // sobrepago
    [InlineData(100, 0.01, InvoiceStatus.ParcialmentePagada)]
    public void CalculateStatus_respeta_los_bordes_exactos(
        decimal importe, decimal abonado, InvoiceStatus esperado)
        => InvoiceDomainService.CalculateStatus(importe, abonado).Should().Be(esperado);

    // ── Anulación de pagos ───────────────────────────────────────────────────

    [Fact]
    public void Anular_el_unico_pago_deja_la_factura_a_cero()
    {
        var (abonado, estado, exacto) = PaymentReversalService.Recalculate(
            invoiceAmount: 100m, currentAmountPaid: 100m, voidedApplied: 100m,
            liveApplied: Array.Empty<decimal?>(),
            dueDate: new DateTime(2026, 1, 5, 0, 0, 0, DateTimeKind.Utc),
            now:     new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc));

        abonado.Should().Be(0m);
        estado.Should().Be(InvoiceStatus.Vencida, "el vencimiento ya pasó");
        exacto.Should().BeTrue();
    }

    [Fact]
    public void El_sobrepago_de_los_pagos_vivos_se_recorta_al_importe_de_la_factura()
    {
        // Dos pagos vivos de 60 sobre una factura de 100: la suma (120) se recorta
        // a 100. Si no se recortara, AmountPaid superaría al importe y la ficha
        // mostraría una deuda negativa.
        var (abonado, estado, _) = PaymentReversalService.Recalculate(
            invoiceAmount: 100m, currentAmountPaid: 180m, voidedApplied: 60m,
            liveApplied: new decimal?[] { 60m, 60m },
            dueDate: new DateTime(2026, 1, 5, 0, 0, 0, DateTimeKind.Utc),
            now:     new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc));

        abonado.Should().Be(100m);
        estado.Should().Be(InvoiceStatus.Pagada);
    }

    [Fact]
    public void Enlaces_heredados_sin_reparto_conservan_el_importe_y_piden_revision()
    {
        var (abonado, _, exacto) = PaymentReversalService.Recalculate(
            invoiceAmount: 100m, currentAmountPaid: 80m, voidedApplied: null,
            liveApplied: new decimal?[] { null },
            dueDate: new DateTime(2026, 1, 5, 0, 0, 0, DateTimeKind.Utc),
            now:     new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc));

        abonado.Should().Be(80m, "no hay forma honesta de repartir; se conserva");
        exacto.Should().BeFalse("debe quedar marcado para revisión manual");
    }

    // ── Saldo a favor ────────────────────────────────────────────────────────

    [Fact]
    public void Revertir_un_pago_no_puede_dejar_el_saldo_en_negativo()
    {
        // El pago dejó 100 de excedente, pero el cliente ya solo tiene 30: los
        // otros 70 se consumieron contra otra factura. Se retira lo que hay y se
        // informa el faltante.
        var r = CreditReversalPolicy.Calculate(new[] { 100m }, saldoActual: 30m);

        r.Amount.Should().Be(-30m);
        r.Unapplied.Should().Be(-70m);
        r.IsComplete.Should().BeFalse();
    }

    [Fact]
    public void Un_pago_sin_movimientos_de_credito_no_mueve_el_saldo()
    {
        var r = CreditReversalPolicy.Calculate(Array.Empty<decimal>(), saldoActual: 500m);

        r.Amount.Should().Be(0m);
        r.HasEffect.Should().BeFalse();
        r.IsComplete.Should().BeTrue();
    }

    [Fact]
    public void Devolver_credito_consumido_siempre_es_posible()
    {
        // El pago consumió 80 de saldo (asiento negativo). Deshacerlo devuelve 80,
        // y devolver nunca puede fallar por falta de saldo.
        var r = CreditReversalPolicy.Calculate(new[] { -80m }, saldoActual: 0m);

        r.Amount.Should().Be(80m);
        r.IsComplete.Should().BeTrue();
    }

    // ── Política de cambio de plan ───────────────────────────────────────────

    [Fact]
    public void Cambiar_a_un_plan_del_MISMO_precio_no_es_upgrade()
    {
        // Frontera exacta: mismo precio NO permite aplicación inmediata, así que
        // va a fin de mes. Es lo que espera la política comercial.
        PlanChangePolicy.IsUpgrade(149m, 149m).Should().BeFalse();
        PlanChangePolicy.AllowsImmediate(149m, 149m).Should().BeFalse();
    }

    [Fact]
    public void La_fecha_efectiva_diferida_cae_el_dia_1_del_mes_siguiente_incluso_en_diciembre()
    {
        var dic = new DateTime(2026, 12, 20, 15, 0, 0, DateTimeKind.Utc);

        PlanChangePolicy.EffectiveDate(dic, immediate: false)
            .Should().Be(new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc));
    }

    // ── SLA sobre horario laboral ────────────────────────────────────────────

    private static BusinessSchedule Horario(
        int inicio = 8, int fin = 18, int mascara = 31, int offset = -4) => new()
    {
        StartHour = inicio, EndHour = fin, WorkingDaysMask = mascara,
        UtcOffsetHours = offset, Is24x7 = false,
    };

    [Fact]
    public void Un_SLA_que_empieza_un_viernes_por_la_tarde_salta_al_lunes()
    {
        // Viernes 2026-08-21, 17:00 Bolivia = 21:00 UTC. Quedan 60 min hábiles ese
        // día; pedir 120 obliga a cruzar el fin de semana.
        var viernes17 = new DateTime(2026, 8, 21, 21, 0, 0, DateTimeKind.Utc);

        var vence = SlaCalculator.AddBusinessMinutes(
            viernes17, minutes: 120, Horario(), Array.Empty<DateOnly>());

        var venceLocal = vence.AddHours(-4);
        venceLocal.DayOfWeek.Should().Be(DayOfWeek.Monday);
        venceLocal.Should().Be(new DateTime(2026, 8, 24, 9, 0, 0),
            "60 min el viernes + 60 el lunes desde las 08:00");
    }

    [Fact]
    public void Un_SLA_que_empieza_ANTES_de_abrir_cuenta_desde_la_apertura()
    {
        // Lunes 06:00 Bolivia: fuera de horario. El reloj arranca a las 08:00.
        var lunes6 = new DateTime(2026, 8, 24, 10, 0, 0, DateTimeKind.Utc);

        var vence = SlaCalculator.AddBusinessMinutes(
            lunes6, minutes: 60, Horario(), Array.Empty<DateOnly>());

        vence.AddHours(-4).Should().Be(new DateTime(2026, 8, 24, 9, 0, 0));
    }

    [Fact]
    public void Un_feriado_no_consume_minutos_de_SLA()
    {
        // Lunes 24 feriado: el SLA que empieza el lunes debe resolverse el martes.
        var lunes9 = new DateTime(2026, 8, 24, 13, 0, 0, DateTimeKind.Utc);
        var feriados = new[] { new DateOnly(2026, 8, 24) };

        var vence = SlaCalculator.AddBusinessMinutes(lunes9, 60, Horario(), feriados);

        vence.AddHours(-4).Date.Should().Be(new DateTime(2026, 8, 25));
    }

    [Fact]
    public void Un_SLA_de_cero_minutos_no_cuelga_ni_retrocede()
    {
        var lunes9 = new DateTime(2026, 8, 24, 13, 0, 0, DateTimeKind.Utc);

        var vence = SlaCalculator.AddBusinessMinutes(lunes9, 0, Horario(), Array.Empty<DateOnly>());

        vence.Should().Be(lunes9);
    }

    [Fact]
    public void Un_SLA_que_agota_exactamente_la_jornada_termina_al_cierre()
    {
        // Lunes 08:00 + 600 min = 18:00 del mismo día, justo al cierre. No debe
        // saltar al día siguiente.
        var lunes8 = new DateTime(2026, 8, 24, 12, 0, 0, DateTimeKind.Utc);

        var vence = SlaCalculator.AddBusinessMinutes(lunes8, 600, Horario(), Array.Empty<DateOnly>());

        vence.AddHours(-4).Should().Be(new DateTime(2026, 8, 24, 18, 0, 0));
    }
}
