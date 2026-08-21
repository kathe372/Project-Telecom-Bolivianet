using Microsoft.EntityFrameworkCore;
using Moq;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using Microsoft.Extensions.Logging.Abstractions;

namespace TelecomBoliviaNet.UnitTests.Services;

/// <summary>
/// Regression tests for BUG-02 (SaveChanges in loop) and BUG-04 (plan snapshot).
/// </summary>
public class BillingServiceBugTests : ServiceTestBase
{
    private readonly Mock<IGenericRepository<Client>>  _clientRepoMock  = new(MockBehavior.Loose);
    private readonly Mock<IGenericRepository<Invoice>> _invoiceRepoMock = new(MockBehavior.Loose);
    private readonly Mock<IInvoiceNumberService>       _invNumMock      = new(MockBehavior.Loose);
    private readonly Mock<INotifPublisher>             _notifMock       = new(MockBehavior.Loose);

    private BillingService BuildService() => new BillingServiceBuilder()
        .WithClients(_clientRepoMock.Object)
        .WithInvoices(_invoiceRepoMock.Object)
        .WithInvoiceNumbers(_invNumMock.Object)
        .WithNotifier(_notifMock.Object)
        .Build();

    // ── BUG-02 ───────────────────────────────────────────────────────────────

    // BUG-02-T02: UpdateRangeAsync called once, not once per client with credit
    [Fact]
    public async Task GenerateMonthlyInvoices_MultipleClientsWithCredit_SingleBatchUpdate()
    {
        var plan = new Plan { Id = Guid.NewGuid(), Name = "Plan 50MB", MonthlyPrice = 150m };
        var clients = Enumerable.Range(1, 5).Select(_ => TestEntityFactory.MakeClient(
            installationDate: new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            creditBalance:    20m,
            plan:             plan)).ToList();

        _clientRepoMock
            .Setup(r => r.GetAll())
            .Returns(clients.AsQueryable().BuildMock());

        _invoiceRepoMock
            .Setup(r => r.GetAll())
            .Returns(Enumerable.Empty<Invoice>().AsQueryable().BuildMock());

        _invNumMock
            .Setup(s => s.NextInvoiceNumberAsync(It.IsAny<bool>()))
            .ReturnsAsync("F-2026-0001");

        _clientRepoMock.Setup(r => r.UpdateRange(It.IsAny<IEnumerable<Client>>()));
        _invoiceRepoMock.Setup(r => r.AddRangeAsync(It.IsAny<IEnumerable<Invoice>>()))
            .Returns(Task.CompletedTask);
        _invoiceRepoMock.Setup(r => r.SaveChangesAsync())
            .Returns(Task.CompletedTask);

        var service = BuildService();
        await service.GenerateMonthlyInvoicesAsync(2026, 6);

        // UpdateRangeAsync must be called exactly once (batch), not N times
        _clientRepoMock.Verify(
            r => r.UpdateRange(It.IsAny<IEnumerable<Client>>()),
            Times.Once,
            "créditos deben actualizarse en un único batch, no N veces");

        // UpdateAsync (individual) must NOT be called at all
        _clientRepoMock.Verify(
            r => r.Update(It.IsAny<Client>()),
            Times.Never,
            "UpdateAsync individual no debe llamarse — usar UpdateRangeAsync");
    }

    // ── BUG-04 ───────────────────────────────────────────────────────────────

    // BUG-04-T01: invoice snapshot captures plan name and price
    [Fact]
    public async Task GenerateMonthlyInvoices_Always_CapturesPlanSnapshot()
    {
        var plan = new Plan { Id = Guid.NewGuid(), Name = "Premium 50MB", MonthlyPrice = 150m };
        var client = TestEntityFactory.MakeClient(
            fullName:         "Test Client",
            installationDate: new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            plan:             plan);

        _clientRepoMock
            .Setup(r => r.GetAll())
            .Returns(new[] { client }.AsQueryable().BuildMock());

        _invoiceRepoMock
            .Setup(r => r.GetAll())
            .Returns(Enumerable.Empty<Invoice>().AsQueryable().BuildMock());

        _invNumMock
            .Setup(s => s.NextInvoiceNumberAsync(It.IsAny<bool>()))
            .ReturnsAsync("F-2026-0001");

        var capturedInvoices = new List<Invoice>();
        _invoiceRepoMock
            .Setup(r => r.AddRangeAsync(It.IsAny<IEnumerable<Invoice>>()))
            .Callback<IEnumerable<Invoice>>(inv => capturedInvoices.AddRange(inv))
            .Returns(Task.CompletedTask);
        _invoiceRepoMock.Setup(r => r.SaveChangesAsync()).Returns(Task.CompletedTask);

        var service = BuildService();
        await service.GenerateMonthlyInvoicesAsync(2026, 6);

        var created = capturedInvoices.Single(i => i.ClientId == client.Id);
        created.PlanName.Should().Be("Premium 50MB", "snapshot debe capturar nombre del plan");
        created.PlanPrice.Should().Be(150m, "snapshot debe capturar precio del plan");
    }
}
