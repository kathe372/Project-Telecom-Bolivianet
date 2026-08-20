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
/// PERF-01: MarkOverdueInvoicesAsync must load all clients in one batch query.
/// </summary>
public class BillingServicePerfTests
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

    // PERF-01-T01: GetAll on clientRepo called exactly once regardless of invoice count
    [Fact]
    public async Task MarkOverdueInvoices_MultipleClients_LoadsAllInOneQuery()
    {
        var plan = new Plan { Id = Guid.NewGuid(), Name = "Basic", MonthlyPrice = 100m };
        var overdueInvoices = Enumerable.Range(1, 10).Select(i => new Invoice
        {
            Id       = Guid.NewGuid(),
            ClientId = Guid.NewGuid(),
            Status   = InvoiceStatus.Pendiente,
            DueDate  = DateTime.UtcNow.AddDays(-5),
            Year     = 2026,
            Month    = i % 12 + 1,
            Amount   = 100m,
        }).ToList();

        var clients = overdueInvoices.Select(inv => TestEntityFactory.MakeClient(
            id:               inv.ClientId,
            plan:             plan,
            installationDate: DateTime.UtcNow.AddMonths(-3))).ToList();

        _invoiceRepoMock
            .Setup(r => r.GetAll())
            .Returns(overdueInvoices.AsQueryable().BuildMock());

        _invoiceRepoMock.Setup(r => r.UpdateRangeAsync(It.IsAny<IEnumerable<Invoice>>()))
            .Returns(Task.CompletedTask);

        _clientRepoMock
            .Setup(r => r.GetAll())
            .Returns(clients.AsQueryable().BuildMock());

        _notifMock.Setup(n => n.PublishAsync(
            It.IsAny<NotifType>(), It.IsAny<Guid>(), It.IsAny<string>(),
            It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()))
            .Returns(Task.CompletedTask);

        var service = BuildService();
        await service.MarkOverdueInvoicesAsync();

        // GetAll on clientRepo must be called exactly once (the batch), not 10 times
        _clientRepoMock.Verify(r => r.GetAll(), Times.Once,
            "PERF-01: all clients must be loaded in a single batch query, not N individual calls");
    }
}
