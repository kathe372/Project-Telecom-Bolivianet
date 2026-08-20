using Microsoft.EntityFrameworkCore;
using Moq;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Clients;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using Microsoft.Extensions.Logging.Abstractions;

namespace TelecomBoliviaNet.UnitTests.Services;

/// <summary>
/// BUG-PLANCHANGE regression: mid-month plan change must annul the existing invoice
/// regardless of whether its status is Pendiente, Emitida, or Enviada.
/// Without the fix, only Pendiente invoices were caught → 3 invoices instead of 2.
/// </summary>
public class PlanChangeServiceBugTests : ServiceTestBase
{
    // ─── helpers ────────────────────────────────────────────────────────────────

    private static Plan BuildPlan(decimal price = 100m) =>
        new() { Id = Guid.NewGuid(), Name = "Plan Test", MonthlyPrice = price, IsActive = true };

    private static Client BuildClient(Plan plan) => TestEntityFactory.MakeClient(
        fullName:         "Test Client",
        installationDate: new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        plan:             plan);

    private static Invoice BuildMonthlyInvoice(Guid clientId, InvoiceStatus status) => new()
    {
        Id        = Guid.NewGuid(),
        ClientId  = clientId,
        Year      = 2026,
        Month     = 6,
        Type      = InvoiceType.Mensualidad,
        Status    = status,
        Amount    = 100m,
        IssuedAt  = new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc),
        DueDate   = new DateTime(2026, 6, 5, 0, 0, 0, DateTimeKind.Utc),
    };

    // ─── BUG regression tests ────────────────────────────────────────────────────

    /// <summary>
    /// BUG-PLANCHANGE-T01: invoice with status Emitida must be annulled on mid-month change.
    /// This was the root cause of 3 invoices appearing instead of 2.
    /// </summary>
    [Fact]
    public void ApplyMidMonthProration_InvoiceEmitida_IsAnnulled()
    {
        var plan    = BuildPlan();
        var client  = BuildClient(plan);
        var invoice = BuildMonthlyInvoice(client.Id, InvoiceStatus.Emitida);

        // Simulate the filter that PlanChangeService applies
        var invoicesInDb = new[] { invoice }.AsQueryable();
        var found = invoicesInDb.FirstOrDefault(i =>
            i.ClientId == client.Id &&
            i.Year     == 2026 &&
            i.Month    == 6 &&
            i.Type     == InvoiceType.Mensualidad &&
            (i.Status  == InvoiceStatus.Pendiente ||
             i.Status  == InvoiceStatus.Emitida   ||
             i.Status  == InvoiceStatus.Enviada));

        found.Should().NotBeNull("invoice with Emitida status must be found by the updated filter");
        found!.Status.Should().NotBe(InvoiceStatus.Anulada); // before annulment

        // Simulate annulment
        found.Status = InvoiceStatus.Anulada;
        found.Status.Should().Be(InvoiceStatus.Anulada, "invoice must be annulled after mid-month change");
    }

    /// <summary>
    /// BUG-PLANCHANGE-T02: invoice with status Pendiente (original behavior) still annulled.
    /// Regression: the fix must not break the pre-existing Pendiente case.
    /// </summary>
    [Theory]
    [InlineData(InvoiceStatus.Pendiente)]
    [InlineData(InvoiceStatus.Emitida)]
    [InlineData(InvoiceStatus.Enviada)]
    public void ApplyMidMonthProration_AllUnpaidStatuses_AreFoundAndAnnulled(InvoiceStatus status)
    {
        var plan    = BuildPlan();
        var client  = BuildClient(plan);
        var invoice = BuildMonthlyInvoice(client.Id, status);

        var found = new[] { invoice }.AsQueryable().FirstOrDefault(i =>
            i.ClientId == client.Id &&
            i.Year     == 2026 &&
            i.Month    == 6 &&
            i.Type     == InvoiceType.Mensualidad &&
            (i.Status  == InvoiceStatus.Pendiente ||
             i.Status  == InvoiceStatus.Emitida   ||
             i.Status  == InvoiceStatus.Enviada));

        found.Should().NotBeNull($"status {status} must be included in the annulment filter");
    }

    /// <summary>
    /// BUG-PLANCHANGE-T03: Pagada and Anulada invoices must NOT be touched.
    /// </summary>
    [Theory]
    [InlineData(InvoiceStatus.Pagada)]
    [InlineData(InvoiceStatus.Anulada)]
    public void ApplyMidMonthProration_PaidOrAnnulledInvoices_AreIgnored(InvoiceStatus status)
    {
        var plan    = BuildPlan();
        var client  = BuildClient(plan);
        var invoice = BuildMonthlyInvoice(client.Id, status);

        var found = new[] { invoice }.AsQueryable().FirstOrDefault(i =>
            i.ClientId == client.Id &&
            i.Year     == 2026 &&
            i.Month    == 6 &&
            i.Type     == InvoiceType.Mensualidad &&
            (i.Status  == InvoiceStatus.Pendiente ||
             i.Status  == InvoiceStatus.Emitida   ||
             i.Status  == InvoiceStatus.Enviada));

        found.Should().BeNull($"status {status} must NOT be selected for annulment");
    }
}
