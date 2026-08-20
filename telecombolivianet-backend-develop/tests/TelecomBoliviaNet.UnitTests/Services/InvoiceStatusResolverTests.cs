using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Infrastructure.Jobs;

namespace TelecomBoliviaNet.UnitTests.Services;

/// <summary>
/// Problema 3 — El estado "Vencida" debe verse de inmediato cuando pasa la fecha de
/// vencimiento (InvoiceStatusResolver), y el marcado persistente debe correr a diario
/// con catch-up (BillingSchedule), sin depender de una ventana mensual.
/// </summary>
public class InvoiceStatusResolverTests
{
    private static readonly DateTime Now = new(2026, 7, 7, 12, 0, 0, DateTimeKind.Utc);

    private static Invoice Inv(InvoiceStatus status, DateTime dueDate) =>
        new() { Status = status, DueDate = dueDate, Amount = 99m };

    [Theory]
    [InlineData(InvoiceStatus.Pendiente)]
    [InlineData(InvoiceStatus.Emitida)]
    [InlineData(InvoiceStatus.Enviada)]
    // Una factura abonada a medias también vence: lo que venció es el plazo de pago, no la
    // ausencia de pagos. Antes se la excluía y por eso nunca entraba en mora ni en la
    // auto-suspensión (ambas filtran por Vencida). Lo abonado sigue vivo en AmountPaid.
    [InlineData(InvoiceStatus.ParcialmentePagada)]
    public void Effective_UnpaidPastDue_BecomesVencida(InvoiceStatus status)
    {
        var result = InvoiceStatusResolver.Effective(Inv(status, Now.AddDays(-1)), Now);
        result.Should().Be(InvoiceStatus.Vencida);
    }

    [Fact]
    public void Effective_ParcialmentePagadaNotYetDue_StaysParcialmentePagada()
    {
        var result = InvoiceStatusResolver.Effective(
            Inv(InvoiceStatus.ParcialmentePagada, Now.AddDays(3)), Now);
        result.Should().Be(InvoiceStatus.ParcialmentePagada,
            "dentro de plazo, el abono parcial es la información relevante para la UI");
    }

    [Fact]
    public void Effective_PendienteNotYetDue_StaysPendiente()
    {
        var result = InvoiceStatusResolver.Effective(Inv(InvoiceStatus.Pendiente, Now.AddDays(3)), Now);
        result.Should().Be(InvoiceStatus.Pendiente);
    }

    [Theory]
    [InlineData(InvoiceStatus.Pagada)]
    [InlineData(InvoiceStatus.Anulada)]
    public void Effective_TerminalStatuses_AreNeverChanged(InvoiceStatus status)
    {
        var result = InvoiceStatusResolver.Effective(Inv(status, Now.AddDays(-10)), Now);
        result.Should().Be(status);
    }

    // ── BillingSchedule ──────────────────────────────────────────────────────────

    [Fact]
    public void ShouldRunOverdue_FirstRunOfDay_ReturnsTrue()
    {
        BillingSchedule.ShouldRunOverdue(Now, lastRunDayKey: null).Should().BeTrue();
    }

    [Fact]
    public void ShouldRunOverdue_AlreadyRanToday_ReturnsFalse()
    {
        var today = BillingSchedule.DayKey(Now);
        BillingSchedule.ShouldRunOverdue(Now, today).Should().BeFalse();
    }

    [Fact]
    public void ShouldRunOverdue_MissedYesterday_CatchesUpToday()
    {
        var yesterday = BillingSchedule.DayKey(Now.AddDays(-1));
        BillingSchedule.ShouldRunOverdue(Now, yesterday).Should().BeTrue(
            "si se saltó un día, debe ejecutarse al próximo tick");
    }
}
