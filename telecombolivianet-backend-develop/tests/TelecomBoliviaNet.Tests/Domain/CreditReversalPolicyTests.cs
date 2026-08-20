using FluentAssertions;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// BUG-02 (auditoría 2026-08-06) — Reversión del saldo a favor al anular un pago.
///
/// Un pago mueve el crédito en dos sentidos: consume saldo previo contra las facturas (asiento
/// negativo) y deja el sobrante como excedente (asiento positivo). Anular el pago debe deshacer
/// ambos. Antes la anulación no tocaba el saldo: el crédito consumido se perdía.
/// </summary>
public class CreditReversalPolicyTests
{
    // ── Devolver el crédito que el pago había consumido ──────────────────────

    [Fact]
    public void PagoQueConsumioCredito_DevuelveEseCredito()
    {
        // Cliente con Bs. 100 a favor paga 50 sobre una deuda de 120:
        // se consumen los 100 (asiento −100) y no queda excedente.
        var reversal = CreditReversalPolicy.Calculate([-100m], saldoActual: 0m);

        reversal.Amount.Should().Be(100m);
        reversal.IsComplete.Should().BeTrue();
    }

    [Fact]
    public void PagoQueDejoExcedente_RetiraEseExcedente()
    {
        // Pago de 200 sobre una deuda de 150: quedan 50 a favor (asiento +50).
        var reversal = CreditReversalPolicy.Calculate([50m], saldoActual: 50m);

        reversal.Amount.Should().Be(-50m);
        reversal.IsComplete.Should().BeTrue();
    }

    [Fact]
    public void PagoQueConsumioYAcumulo_RevierteElNeto()
    {
        // Consumió 30 de saldo previo y dejó 50 de excedente → neto +20.
        // Deshacerlo devuelve los 30 y retira los 50: efecto −20.
        var reversal = CreditReversalPolicy.Calculate([-30m, 50m], saldoActual: 20m);

        reversal.Amount.Should().Be(-20m);
        reversal.IsComplete.Should().BeTrue();
    }

    [Fact]
    public void PagoSinMovimientosDeCredito_NoTocaElSaldo()
    {
        var reversal = CreditReversalPolicy.Calculate([], saldoActual: 500m);

        reversal.Amount.Should().Be(0m);
        reversal.HasEffect.Should().BeFalse();
        reversal.IsComplete.Should().BeTrue();
    }

    // ── El saldo nunca queda negativo ────────────────────────────────────────

    [Fact]
    public void ExcedenteYaConsumido_RevierteHastaDondeAlcanzaYReportaElFaltante()
    {
        // El pago dejó 50 de excedente, pero el cliente ya los usó en otra factura: saldo 20.
        // Retirar los 50 completos dejaría el saldo en −30, lo que rompería el libro mayor.
        var reversal = CreditReversalPolicy.Calculate([50m], saldoActual: 20m);

        reversal.Amount.Should().Be(-20m, "solo se puede retirar lo que queda");
        reversal.Unapplied.Should().Be(-30m);
        reversal.IsComplete.Should().BeFalse("el faltante exige revisión manual");
    }

    [Fact]
    public void ExcedenteTotalmenteConsumido_NoRetiraNada()
    {
        var reversal = CreditReversalPolicy.Calculate([80m], saldoActual: 0m);

        reversal.Amount.Should().Be(0m);
        reversal.HasEffect.Should().BeFalse();
        reversal.IsComplete.Should().BeFalse();
    }

    [Fact]
    public void DevolucionDeCredito_NuncaSeRecortaPorFaltaDeSaldo()
    {
        // Devolver saldo siempre es posible: sube el balance, nunca lo deja negativo.
        var reversal = CreditReversalPolicy.Calculate([-250m], saldoActual: 0m);

        reversal.Amount.Should().Be(250m);
        reversal.IsComplete.Should().BeTrue();
    }

    // ── Invariante ───────────────────────────────────────────────────────────

    [Theory]
    [InlineData(new[] { -100.0 }, 0.0)]
    [InlineData(new[] { 50.0 }, 50.0)]
    [InlineData(new[] { -30.0, 50.0 }, 20.0)]
    [InlineData(new[] { 50.0 }, 20.0)]
    [InlineData(new[] { 80.0 }, 0.0)]
    public void ElSaldoResultanteNuncaEsNegativo(double[] movimientos, double saldo)
    {
        var reversal = CreditReversalPolicy.Calculate(
            movimientos.Select(m => (decimal)m), (decimal)saldo);

        ((decimal)saldo + reversal.Amount).Should().BeGreaterThanOrEqualTo(0m);
    }
}
