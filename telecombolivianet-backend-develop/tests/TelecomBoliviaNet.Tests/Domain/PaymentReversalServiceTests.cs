using FluentAssertions;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// REGRESIÓN (auditoría 2026-08-01, Fase 2): antes anular un pago forzaba la
/// factura a Pendiente/Vencida sin mirar si otros pagos también la cubrían.
/// Si dos pagos habían saldado una factura y se anulaba uno, el aporte del OTRO
/// pago se perdía y la factura volvía a cobrarse completa. Estos tests fijan el
/// recálculo correcto a partir de los pagos que siguen vigentes.
/// </summary>
public class PaymentReversalServiceTests
{
    private static readonly DateTime Now         = new(2026, 8, 1, 12, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime FutureDue   = Now.AddDays(10);
    private static readonly DateTime PastDue     = Now.AddDays(-10);

    [Fact]
    public void UnSoloPagoQueSeAnula_DejaLaFacturaTotalmenteImpaga()
    {
        var (amountPaid, status, isExact) = PaymentReversalService.Recalculate(
            invoiceAmount: 149m, currentAmountPaid: 149m,
            voidedApplied: 149m, liveApplied: [],
            dueDate: FutureDue, now: Now);

        amountPaid.Should().Be(0m);
        status.Should().Be(InvoiceStatus.Emitida);
        isExact.Should().BeTrue();
    }

    [Fact]
    public void DosPagosCubrenLaFactura_AlAnularUno_ElOtroSigueAbonado()
    {
        // ESTE es exactamente el bug: factura de 149 cubierta por dos pagos de 75
        // cada uno. Al anular el primero, antes la factura quedaba con AmountPaid
        // intacto (149) pero Status forzado a Pendiente — un estado contradictorio
        // que además hacía cobrarla de nuevo por completo en la próxima gestión.
        var (amountPaid, status, isExact) = PaymentReversalService.Recalculate(
            invoiceAmount: 149m, currentAmountPaid: 149m,
            voidedApplied: 75m, liveApplied: [75m],
            dueDate: FutureDue, now: Now);

        amountPaid.Should().Be(75m);
        status.Should().Be(InvoiceStatus.ParcialmentePagada);
        isExact.Should().BeTrue();
    }

    [Fact]
    public void TresPagosCubrenLaFactura_AlAnularUno_QuedanLosOtrosDos()
    {
        var (amountPaid, status, isExact) = PaymentReversalService.Recalculate(
            invoiceAmount: 150m, currentAmountPaid: 150m,
            voidedApplied: 50m, liveApplied: [50m, 50m],
            dueDate: FutureDue, now: Now);

        amountPaid.Should().Be(100m);
        status.Should().Be(InvoiceStatus.ParcialmentePagada);
        isExact.Should().BeTrue();
    }

    [Fact]
    public void FacturaVencidaQueQuedaImpagaTrasAnular_PasaAVencidaSinEsperarElJob()
    {
        var (_, status, _) = PaymentReversalService.Recalculate(
            invoiceAmount: 149m, currentAmountPaid: 149m,
            voidedApplied: 149m, liveApplied: [],
            dueDate: PastDue, now: Now);

        status.Should().Be(InvoiceStatus.Vencida);
    }

    [Fact]
    public void FacturaAunNoVencidaQueQuedaImpaga_NoSeMarcaVencidaAntesDeTiempo()
    {
        var (_, status, _) = PaymentReversalService.Recalculate(
            invoiceAmount: 149m, currentAmountPaid: 149m,
            voidedApplied: 149m, liveApplied: [],
            dueDate: FutureDue, now: Now);

        status.Should().Be(InvoiceStatus.Emitida);
    }

    [Fact]
    public void SinPagosVigentesRestantes_LaSumaVaciaEsExactaAunSinConocerElAnulado()
    {
        // El pago anulado era el único que cubría la factura: sin pagos vigentes
        // restantes, el nuevo abonado es 0 sin ambigüedad, se conozca o no lo que
        // aportaba el anulado.
        var (amountPaid, status, isExact) = PaymentReversalService.Recalculate(
            invoiceAmount: 149m, currentAmountPaid: 149m,
            voidedApplied: null, liveApplied: [],
            dueDate: FutureDue, now: Now);

        amountPaid.Should().Be(0m);
        status.Should().Be(InvoiceStatus.Emitida);
        isExact.Should().BeTrue();
    }

    [Fact]
    public void EnlaceHeredadoSinRepartoConocido_RestaLoConocidoYSeMarcaParaRevision()
    {
        // Factura de 149 saldada por el pago anulado (100) más un enlace vigente
        // anterior a la migración que añadió AmountApplied (reparto desconocido).
        // Restar el importe CONOCIDO del anulado es aritméticamente correcto; lo
        // que no puede verificarse es si el remanente coincide con lo que de
        // verdad aportó el enlace legado, así que se marca para revisión.
        var (amountPaid, status, isExact) = PaymentReversalService.Recalculate(
            invoiceAmount: 149m, currentAmountPaid: 149m,
            voidedApplied: 100m, liveApplied: [null],
            dueDate: FutureDue, now: Now);

        amountPaid.Should().Be(49m);
        status.Should().Be(InvoiceStatus.ParcialmentePagada);
        isExact.Should().BeFalse();
    }

    [Fact]
    public void SoloElAnuladoTeniaImporteConocido_YEraElUnicoConAlgo_DejaCero()
    {
        // Aquí el enlace vigente desconocido en realidad no aportaba nada
        // (currentAmountPaid solo reflejaba lo del anulado): restar deja 0.
        var (amountPaid, _, isExact) = PaymentReversalService.Recalculate(
            invoiceAmount: 149m, currentAmountPaid: 149m,
            voidedApplied: 149m, liveApplied: [null],
            dueDate: FutureDue, now: Now);

        amountPaid.Should().Be(0m);
        isExact.Should().BeFalse();
    }

    [Fact]
    public void SeConoceLoAnuladoPeroNoTodoLoVigente_RestaLoConocidoYMarcaInexacto()
    {
        var (amountPaid, _, isExact) = PaymentReversalService.Recalculate(
            invoiceAmount: 200m, currentAmountPaid: 200m,
            voidedApplied: 50m, liveApplied: [100m, null],
            dueDate: FutureDue, now: Now);

        // Se puede restar con confianza el importe conocido del anulado, aunque no
        // se pueda verificar contra el enlace heredado.
        amountPaid.Should().Be(150m);
        isExact.Should().BeFalse();
    }

    [Fact]
    public void NuncaDevuelveUnSaldoNegativo()
    {
        var (amountPaid, _, _) = PaymentReversalService.Recalculate(
            invoiceAmount: 100m, currentAmountPaid: 50m,
            voidedApplied: 80m, liveApplied: [],
            dueDate: FutureDue, now: Now);

        amountPaid.Should().Be(0m);
    }

    [Fact]
    public void NuncaDevuelveMasDelTotalDeLaFactura()
    {
        var (amountPaid, _, _) = PaymentReversalService.Recalculate(
            invoiceAmount: 100m, currentAmountPaid: 100m,
            voidedApplied: null, liveApplied: [80m, 80m],
            dueDate: FutureDue, now: Now);

        amountPaid.Should().Be(100m);
    }
}
