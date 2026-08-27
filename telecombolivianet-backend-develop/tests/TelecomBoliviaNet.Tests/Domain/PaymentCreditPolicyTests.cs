using FluentAssertions;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// El reparto entre efectivo y saldo a favor era aritmética privada dentro de
/// <c>PaymentCreditService</c>, comprobable solo a través de una operación con
/// once dependencias. Decide cuánto dinero se mueve, así que ahora es dominio
/// puro con su tabla de casos (F5).
/// </summary>
public class PaymentCreditPolicyTests
{
    // ── Cuánto crédito se consume ───────────────────────────────────────────

    [Fact]
    public void SiElEfectivoAlcanza_NoSeToscaElCredito()
    {
        // D-15: el caso que generaba dos asientos fantasma que se anulaban entre sí.
        var (excedente, usado) = PaymentCreditPolicy.Split(
            amount: 50m, creditBalance: 100m, totalDebt: 50m);

        usado.Should().Be(0m, "el efectivo cubrió la deuda entera");
        excedente.Should().Be(100m, "el saldo que ya tenía sigue intacto");
    }

    [Fact]
    public void SiElEfectivoNoAlcanza_SeConsumeSoloLoQueFalta()
    {
        var (excedente, usado) = PaymentCreditPolicy.Split(
            amount: 30m, creditBalance: 100m, totalDebt: 50m);

        usado.Should().Be(20m, "faltaban 20 para cubrir la deuda");
        excedente.Should().Be(80m);
    }

    [Fact]
    public void SiElCreditoNoBastaParaCubrirLoQueFalta_SeConsumeEntero()
    {
        var (excedente, usado) = PaymentCreditPolicy.Split(
            amount: 30m, creditBalance: 10m, totalDebt: 100m);

        usado.Should().Be(10m, "no se puede consumir más saldo del que hay");
        excedente.Should().Be(0m);
    }

    [Fact]
    public void UnPagoDeMas_DejaExcedente()
    {
        var (excedente, usado) = PaymentCreditPolicy.Split(
            amount: 200m, creditBalance: 0m, totalDebt: 149m);

        usado.Should().Be(0m);
        excedente.Should().Be(51m);
    }

    [Fact]
    public void PagoExacto_SinCredito_NoDejaNada()
    {
        var (excedente, usado) = PaymentCreditPolicy.Split(
            amount: 149m, creditBalance: 0m, totalDebt: 149m);

        usado.Should().Be(0m);
        excedente.Should().Be(0m);
    }

    // ── Cuánto de ese excedente lo aporta ESTE cobro ────────────────────────

    [Fact]
    public void ElExcedenteQueYaTenia_NoSeVuelveAAsentar()
    {
        // Sin esto, el libro mayor contaría dos veces el mismo dinero: el cliente
        // ya tenía 100 a favor y el pago no aporta nada nuevo.
        var nuevo = PaymentCreditPolicy.NuevoExcedente(
            excedenteFinal: 100m, creditoPrevio: 100m, creditoUsado: 0m);

        nuevo.Should().Be(0m);
    }

    [Fact]
    public void SoloSeAsientaLaParteNuevaDelExcedente()
    {
        // Tenía 20 a favor, paga 200 sobre una deuda de 149 → queda con 71,
        // de los cuales 51 los aporta este cobro.
        var (excedente, usado) = PaymentCreditPolicy.Split(
            amount: 200m, creditBalance: 20m, totalDebt: 149m);
        excedente.Should().Be(71m);

        PaymentCreditPolicy.NuevoExcedente(excedente, creditoPrevio: 20m, creditoUsado: usado)
            .Should().Be(51m);
    }

    [Fact]
    public void SiSeConsumioCredito_ElAporteNuevoNoEsPositivo()
    {
        var (excedente, usado) = PaymentCreditPolicy.Split(
            amount: 30m, creditBalance: 100m, totalDebt: 50m);

        // Consumió 20 del saldo y no aportó excedente nuevo: 80 - (100 - 20) = 0.
        PaymentCreditPolicy.NuevoExcedente(excedente, creditoPrevio: 100m, creditoUsado: usado)
            .Should().Be(0m);
    }

    // ── El invariante que ata las dos ───────────────────────────────────────

    [Theory]
    [InlineData(50, 100, 50)]
    [InlineData(30, 100, 50)]
    [InlineData(200, 20, 149)]
    [InlineData(0, 0, 149)]
    [InlineData(149, 0, 149)]
    public void ElSaldoFinalSiempreCuadra(decimal amount, decimal credito, decimal deuda)
    {
        var (excedente, usado) = PaymentCreditPolicy.Split(amount, credito, deuda);
        var nuevo = PaymentCreditPolicy.NuevoExcedente(excedente, credito, usado);

        (credito - usado + nuevo).Should().Be(excedente,
            "el saldo previo menos lo consumido más lo aportado tiene que dar el saldo final; " +
            "si no, el libro mayor no explicaría el número que ve el cliente");
    }
}
