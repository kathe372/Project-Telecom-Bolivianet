using FluentAssertions;
using TelecomBoliviaNet.Domain.Entities.Clients;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// E-04 — El estado de una factura deja de asignarse a mano.
/// </summary>
/// <remarks>
/// Había seis sitios que hacían <c>invoice.Status = …</c> por su cuenta, y la
/// tabla de transiciones del dominio solo la consultaba el endpoint manual. Ahora
/// todo pasa por la entidad.
///
/// <para><b>Dos operaciones distintas, y la diferencia importa.</b>
/// <c>CambiarEstadoA</c> es el cambio manual y respeta la tabla, que prohíbe
/// llegar a <c>Pagada</c> a propósito: un administrador no puede declarar pagada
/// una factura sin un pago detrás. <c>RegistrarAbono</c> es cobrar, y ahí sí hay
/// pago —el importe es el argumento—, así que llega a Pagada legítimamente.</para>
/// </remarks>
public class InvoiceTransitionsTests
{
    private static Invoice Factura(InvoiceStatus estado, decimal importe = 100m, decimal abonado = 0m)
        => new()
        {
            Id = Guid.NewGuid(), ClientId = Guid.NewGuid(),
            Type = InvoiceType.Mensualidad, Status = estado,
            Year = 2026, Month = 8, Amount = importe, AmountPaid = abonado,
            IssuedAt = DateTime.UtcNow.AddDays(-10),
            DueDate  = DateTime.UtcNow.AddDays(-1),
        };

    // ── Cobrar ──────────────────────────────────────────────────────────────

    [Fact]
    public void AbonarElTotal_DejaLaFacturaPagada()
    {
        var f = Factura(InvoiceStatus.Emitida);

        f.RegistrarAbono(100m);

        f.Status.Should().Be(InvoiceStatus.Pagada);
        f.AmountPaid.Should().Be(100m);
        f.Outstanding.Should().Be(0m);
    }

    [Fact]
    public void AbonarUnaParte_DejaParcialmentePagada_YElSaldoCuadra()
    {
        var f = Factura(InvoiceStatus.Emitida);

        f.RegistrarAbono(30m);

        f.Status.Should().Be(InvoiceStatus.ParcialmentePagada);
        f.Outstanding.Should().Be(70m);
    }

    [Fact]
    public void UnaFacturaDeImporteCERO_QuedaPagada_YNoSeQuedaColgada()
    {
        // D-17. Antes se quedaba Emitida para siempre —Emitida está entre las
        // vencibles— y el job acababa marcándola Vencida con deuda cero. La regla
        // que lo evita es InvoiceDomainService.CalculateStatus, y ahora no hay
        // forma de saltársela: el estado no se elige, se calcula.
        var f = Factura(InvoiceStatus.Emitida, importe: 0m);

        f.RegistrarAbono(0m);

        f.Status.Should().Be(InvoiceStatus.Pagada);
    }

    [Fact]
    public void AbonarSuma_SobreLoQueYaHabia()
    {
        var f = Factura(InvoiceStatus.ParcialmentePagada, abonado: 40m);

        f.Abonar(60m);

        f.AmountPaid.Should().Be(100m);
        f.Status.Should().Be(InvoiceStatus.Pagada);
    }

    [Fact]
    public void NoSePuedeAbonarUnaFacturaANULADA()
    {
        var f = Factura(InvoiceStatus.Anulada);

        var acto = () => f.RegistrarAbono(100m);

        acto.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void UnAbonoNegativo_SeRechaza()
    {
        var f = Factura(InvoiceStatus.Emitida);

        var acto = () => f.RegistrarAbono(-10m);

        acto.Should().Throw<ArgumentOutOfRangeException>();
    }

    // ── Cambio manual de estado ─────────────────────────────────────────────

    [Fact]
    public void ElCambioMANUAL_NoPuedeDeclararPagadaUnaFacturaSinPago()
    {
        // La restricción es deliberada y estaba probada desde antes: dejaría
        // dinero sin asentar. Se comprueba aquí porque ahora la entidad es quien
        // la hace cumplir, no solo un endpoint.
        var f = Factura(InvoiceStatus.Emitida);

        var acto = () => f.CambiarEstadoA(InvoiceStatus.Pagada);

        acto.Should().Throw<InvalidOperationException>()
            .WithMessage("*no válida*");
        f.Status.Should().Be(InvoiceStatus.Emitida, "el estado no se toca si la transición falla");
    }

    [Fact]
    public void UnaFacturaPAGADA_EsUnEstadoFinal()
    {
        var f = Factura(InvoiceStatus.Pagada, abonado: 100m);

        var acto = () => f.CambiarEstadoA(InvoiceStatus.Vencida);

        acto.Should().Throw<InvalidOperationException>();
    }

    [Theory]
    [InlineData(InvoiceStatus.Emitida,   InvoiceStatus.Enviada)]
    [InlineData(InvoiceStatus.Emitida,   InvoiceStatus.Vencida)]
    [InlineData(InvoiceStatus.Enviada,   InvoiceStatus.Vencida)]
    [InlineData(InvoiceStatus.Pendiente, InvoiceStatus.Anulada)]
    [InlineData(InvoiceStatus.Vencida,   InvoiceStatus.Anulada)]
    public void LasTransicionesLEGITIMAS_Pasan(InvoiceStatus desde, InvoiceStatus hasta)
    {
        var f = Factura(desde);

        f.CambiarEstadoA(hasta);

        f.Status.Should().Be(hasta);
        f.UpdatedAt.Should().NotBeNull("cambiar de estado deja marca de cuándo");
    }

    [Fact]
    public void CambiarAlMismoEstado_NoHaceNada_YNoProtesta()
    {
        var f = Factura(InvoiceStatus.Enviada);

        f.CambiarEstadoA(InvoiceStatus.Enviada);

        f.Status.Should().Be(InvoiceStatus.Enviada);
    }
}
