using FluentAssertions;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Tests del domain service extraído en la CORRECCIÓN Problema #8.
/// Verifica que la lógica de crédito y estado sea correcta y consistente
/// en todos los contextos donde se usa (billing, pagos, M3).
/// </summary>
public class InvoiceDomainServiceTests
{
    // ── ApplyCredit ────────────────────────────────────────────────────────

    [Fact]
    public void AplicarCredito_CubreTotal_DebeRetornarMontoPendienteYCeroRestante()
    {
        var (aplicado, restante) = InvoiceDomainService.ApplyCredit(
            creditoDisponible: 100m, montoPendiente: 100m);

        aplicado.Should().Be(100m);
        restante.Should().Be(0m);
    }

    [Fact]
    public void AplicarCredito_CreditoExcedeMonto_DebeDejarExcedente()
    {
        var (aplicado, restante) = InvoiceDomainService.ApplyCredit(
            creditoDisponible: 150m, montoPendiente: 100m);

        aplicado.Should().Be(100m);
        restante.Should().Be(50m);
    }

    [Fact]
    public void AplicarCredito_CreditoInsuficiente_DebeAplicarParcialmente()
    {
        var (aplicado, restante) = InvoiceDomainService.ApplyCredit(
            creditoDisponible: 30m, montoPendiente: 100m);

        aplicado.Should().Be(30m);
        restante.Should().Be(0m);
    }

    [Fact]
    public void AplicarCredito_SinCredito_DebeRetornarCeroAplicadoYCreditoIntacto()
    {
        var (aplicado, restante) = InvoiceDomainService.ApplyCredit(
            creditoDisponible: 0m, montoPendiente: 100m);

        aplicado.Should().Be(0m);
        restante.Should().Be(0m);
    }

    [Fact]
    public void AplicarCredito_MontoNegativo_DebeRetornarCeroAplicado()
    {
        var (aplicado, restante) = InvoiceDomainService.ApplyCredit(
            creditoDisponible: 50m, montoPendiente: -10m);

        aplicado.Should().Be(0m);
        restante.Should().Be(50m);
    }

    // ── CalculateStatus ────────────────────────────────────────────────────────

    [Theory]
    [InlineData(100, 0,   InvoiceStatus.Emitida)]
    [InlineData(100, 50,  InvoiceStatus.ParcialmentePagada)]
    [InlineData(100, 100, InvoiceStatus.Pagada)]
    [InlineData(100, 120, InvoiceStatus.Pagada)]  // pago excesivo → Pagada
    public void CalcularEstado_DebeRetornarEstadoCorrecto(
        decimal amount, decimal amountPaid, InvoiceStatus expected)
    {
        var result = InvoiceDomainService.CalculateStatus(amount, amountPaid);
        result.Should().Be(expected);
    }

    // ── EstadoInicialConCredito ───────────────────────────────────────────────

    [Fact]
    public void EstadoInicialConCredito_SinCredito_DebeSerEmitida()
        => InvoiceDomainService.EstadoInicialConCredito(100m, 0m)
            .Should().Be(InvoiceStatus.Emitida);

    [Fact]
    public void EstadoInicialConCredito_CreditoParcial_DebeSerParcialmentePagada()
        => InvoiceDomainService.EstadoInicialConCredito(100m, 40m)
            .Should().Be(InvoiceStatus.ParcialmentePagada);

    [Fact]
    public void EstadoInicialConCredito_CreditoTotal_DebeSerPagada()
        => InvoiceDomainService.EstadoInicialConCredito(100m, 100m)
            .Should().Be(InvoiceStatus.Pagada);

    // ── TransicionEsValida ────────────────────────────────────────────────────

    [Theory]
    [InlineData(InvoiceStatus.Emitida,   InvoiceStatus.Enviada,   true)]
    [InlineData(InvoiceStatus.Emitida,   InvoiceStatus.Pendiente, true)]
    [InlineData(InvoiceStatus.Emitida,   InvoiceStatus.Anulada,   true)]
    [InlineData(InvoiceStatus.Emitida,   InvoiceStatus.Pagada,    false)]
    [InlineData(InvoiceStatus.Pagada,    InvoiceStatus.Anulada,   false)] // final
    [InlineData(InvoiceStatus.Anulada,   InvoiceStatus.Emitida,   false)] // final
    [InlineData(InvoiceStatus.Pendiente, InvoiceStatus.Vencida,   true)]
    [InlineData(InvoiceStatus.Vencida,   InvoiceStatus.Anulada,   true)]
    [InlineData(InvoiceStatus.ParcialmentePagada, InvoiceStatus.Pagada,  true)]
    [InlineData(InvoiceStatus.ParcialmentePagada, InvoiceStatus.Anulada, true)]
    // BUG-07 (auditoría 2026-08-06): al admitirse que una factura abonada a medias venza, el
    // ciclo tiene que cerrar en los dos sentidos. Antes Vencida solo permitía Anulada, así que
    // cobrar el remanente de una factura vencida era una transición "inválida".
    [InlineData(InvoiceStatus.ParcialmentePagada, InvoiceStatus.Vencida,            true)]
    [InlineData(InvoiceStatus.Vencida,            InvoiceStatus.Pagada,             true)]
    [InlineData(InvoiceStatus.Vencida,            InvoiceStatus.ParcialmentePagada, true)]
    [InlineData(InvoiceStatus.Vencida,            InvoiceStatus.Emitida,            false)]
    public void TransicionEsValida_DebeValidarCorrectamente(
        InvoiceStatus actual, InvoiceStatus nuevo, bool expected)
    {
        InvoiceDomainService.TransicionEsValida(actual, nuevo).Should().Be(expected);
    }

    [Fact]
    public void GetTransicionesPermitidas_EstadoFinal_DebeRetornarVacio()
    {
        var pagada  = InvoiceDomainService.GetTransicionesPermitidas(InvoiceStatus.Pagada);
        var anulada = InvoiceDomainService.GetTransicionesPermitidas(InvoiceStatus.Anulada);

        pagada.Should().BeEmpty();
        anulada.Should().BeEmpty();
    }

    // ── UnpaidStatuses / IsUnpaid / OutstandingAmount ─────────────────────────
    // REGRESIÓN (auditoría 2026-08-01): la definición de "deuda" estaba repartida
    // por 5 clases y ninguna coincidía. Como una factura recién generada nace en
    // Emitida y no pasa a Vencida hasta vencer, del día 1 al 5 de cada mes el bot
    // respondía "no tienes deuda pendiente" y se negaba a enviar el QR de pago.

    [Theory]
    [InlineData(InvoiceStatus.Pendiente,          true)]
    [InlineData(InvoiceStatus.Emitida,            true)]  // ← el estado del bug
    [InlineData(InvoiceStatus.Enviada,            true)]
    [InlineData(InvoiceStatus.Vencida,            true)]
    [InlineData(InvoiceStatus.ParcialmentePagada, true)]  // ← saldo remanente
    [InlineData(InvoiceStatus.Pagada,             false)]
    [InlineData(InvoiceStatus.Anulada,            false)]
    public void IsUnpaid_DebeCubrirTodoEstadoConSaldoPorCobrar(
        InvoiceStatus status, bool expected)
        => InvoiceDomainService.IsUnpaid(status).Should().Be(expected);

    [Fact]
    public void UnpaidStatuses_DebeIncluirTodoEstadoQuePuedeVencer()
    {
        // Si un estado puede vencer, por definición tiene saldo por cobrar.
        InvoiceDomainService.UnpaidStatuses
            .Should().Contain(InvoiceDomainService.OverdueEligible,
                "todo estado vencible debe contar como deuda");
    }

    [Fact]
    public void OverdueEligible_DebeIncluirParcialmentePagada()
    {
        // BUG-07: una factura abonada a medias nunca pasaba a Vencida, así que quedaba fuera
        // del aviso de mora y de AutoSuspendClientJob (ambos filtran por Status == Vencida):
        // bastaba con pagar Bs. 1 de cada factura para no ser suspendido nunca.
        InvoiceDomainService.OverdueEligible
            .Should().Contain(InvoiceStatus.ParcialmentePagada);
    }

    [Fact]
    public void OverdueEligible_TodoEstadoVencibleDebeTenerTransicionAVencida()
    {
        // Invariante: si el job de marcado puede llevar un estado a Vencida, la tabla de
        // transiciones tiene que permitirlo — o el endpoint manual y el job se contradicen.
        foreach (var status in InvoiceDomainService.OverdueEligible)
        {
            InvoiceDomainService.TransicionEsValida(status, InvoiceStatus.Vencida)
                .Should().BeTrue($"{status} figura en OverdueEligible");
        }
    }

    [Fact]
    public void UnpaidStatuses_NoDebeIncluirEstadosLiquidados()
        => InvoiceDomainService.UnpaidStatuses
            .Should().NotContain([InvoiceStatus.Pagada, InvoiceStatus.Anulada]);

    [Fact]
    public void CalculateStatus_DevuelveSiempreUnEstadoCoherenteConIsUnpaid()
    {
        // Una factura sin abonos debe considerarse deuda; una saldada, no.
        InvoiceDomainService.IsUnpaid(InvoiceDomainService.CalculateStatus(100m, 0m))
            .Should().BeTrue();
        InvoiceDomainService.IsUnpaid(InvoiceDomainService.CalculateStatus(100m, 50m))
            .Should().BeTrue();
        InvoiceDomainService.IsUnpaid(InvoiceDomainService.CalculateStatus(100m, 100m))
            .Should().BeFalse();
    }

    [Theory]
    [InlineData(InvoiceStatus.Emitida,            150, 0,   150)]
    [InlineData(InvoiceStatus.Vencida,            150, 0,   150)]
    [InlineData(InvoiceStatus.ParcialmentePagada, 150, 50,  100)] // solo el remanente
    [InlineData(InvoiceStatus.Pagada,             150, 150, 0)]
    [InlineData(InvoiceStatus.Anulada,            150, 0,   0)]
    public void OutstandingAmount_DebeDescontarLoYaAbonado(
        InvoiceStatus status, decimal amount, decimal amountPaid, decimal expected)
    {
        var invoice = new Invoice { Status = status, Amount = amount, AmountPaid = amountPaid };
        InvoiceDomainService.OutstandingAmount(invoice).Should().Be(expected);
        invoice.Outstanding.Should().Be(expected, "la propiedad delega en el domain service");
    }

    [Fact]
    public void FacturaRecienGenerada_DebeContarComoDeuda()
    {
        // Escenario exacto del bug: BillingService crea la factura del mes en
        // Emitida con vencimiento el día 5. Antes del vencimiento debía seguir
        // contando como deuda para el bot y para el perfil del cliente.
        var recienGenerada = new Invoice
        {
            Status  = InvoiceDomainService.CalculateStatus(149m, 0m),
            Amount  = 149m,
            DueDate = DateTime.UtcNow.AddDays(4),
        };

        recienGenerada.Status.Should().Be(InvoiceStatus.Emitida);
        recienGenerada.IsUnpaid.Should().BeTrue();
        recienGenerada.Outstanding.Should().Be(149m);
    }
}
