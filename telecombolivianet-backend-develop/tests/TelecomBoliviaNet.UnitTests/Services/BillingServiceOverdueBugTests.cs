using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using Microsoft.Extensions.Logging.Abstractions;

namespace TelecomBoliviaNet.UnitTests.Services;

/// <summary>
/// Regression tests for:
///   BUG-1 — facturas en estado Emitida/Enviada (no solo Pendiente) deben marcarse
///           como Vencida cuando pasa su fecha de vencimiento.
///   BUG-3 — la notificación de morosidad debe reportar el saldo pendiente
///           (Amount - AmountPaid), no el monto bruto.
/// </summary>
public class BillingServiceOverdueBugTests
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

    private static Client MakeClient(Guid id) => TestEntityFactory.MakeClient(
        id:               id,
        plan:             new Plan { Id = Guid.NewGuid(), Name = "Basic", MonthlyPrice = 100m },
        installationDate: DateTime.UtcNow.AddMonths(-6));

    private static Invoice MakeInvoice(InvoiceStatus status, DateTime dueDate,
        decimal amount = 100m, decimal amountPaid = 0m) => new()
    {
        Id         = Guid.NewGuid(),
        ClientId   = Guid.NewGuid(),
        Status     = status,
        DueDate    = dueDate,
        Year       = 2026,
        Month      = 3,
        Amount     = amount,
        AmountPaid = amountPaid,
    };

    // ── BUG-1 ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task MarkOverdue_MarksEmitidaEnviadaAndPendiente_ButNotPagadaNorFuture()
    {
        var past   = DateTime.UtcNow.AddDays(-5);
        var future = DateTime.UtcNow.AddDays(5);

        var emitida    = MakeInvoice(InvoiceStatus.Emitida,   past);   // debe vencer
        var enviada    = MakeInvoice(InvoiceStatus.Enviada,   past);   // debe vencer
        var pendiente  = MakeInvoice(InvoiceStatus.Pendiente, past);   // debe vencer
        var pagada     = MakeInvoice(InvoiceStatus.Pagada,    past);   // NO (ya pagada)
        var futuraPend = MakeInvoice(InvoiceStatus.Pendiente, future); // NO (no vencida aún)

        var allInvoices = new[] { emitida, enviada, pendiente, pagada, futuraPend };
        var clients     = allInvoices.Select(i => MakeClient(i.ClientId)).ToList();

        _invoiceRepoMock.Setup(r => r.GetAll())
            .Returns(allInvoices.AsQueryable().BuildMock());
        _clientRepoMock.Setup(r => r.GetAll())
            .Returns(clients.AsQueryable().BuildMock());

        var updated = new List<Invoice>();
        _invoiceRepoMock.Setup(r => r.UpdateRangeAsync(It.IsAny<IEnumerable<Invoice>>()))
            .Callback<IEnumerable<Invoice>>(inv => updated.AddRange(inv))
            .Returns(Task.CompletedTask);
        _notifMock.Setup(n => n.PublishAsync(
                It.IsAny<NotifType>(), It.IsAny<Guid>(), It.IsAny<string>(),
                It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()))
            .Returns(Task.CompletedTask);

        var count = await BuildService().MarkOverdueInvoicesAsync();

        count.Should().Be(3, "solo Emitida, Enviada y Pendiente vencidas son elegibles");
        updated.Should().HaveCount(3);
        updated.Should().OnlyContain(i => i.Status == InvoiceStatus.Vencida);
        updated.Select(i => i.Id).Should().BeEquivalentTo(
            new[] { emitida.Id, enviada.Id, pendiente.Id });
        updated.Should().NotContain(i => i.Id == pagada.Id || i.Id == futuraPend.Id);
    }

    // ── BUG-3 ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task MarkOverdue_NotifiesNetOutstanding_NotGrossAmount()
    {
        var client  = MakeClient(Guid.NewGuid());
        var invoice = MakeInvoice(InvoiceStatus.Emitida, DateTime.UtcNow.AddDays(-3),
                                  amount: 100m, amountPaid: 30m);  // crédito aplicado
        invoice.ClientId = client.Id;

        _invoiceRepoMock.Setup(r => r.GetAll())
            .Returns(new[] { invoice }.AsQueryable().BuildMock());
        _clientRepoMock.Setup(r => r.GetAll())
            .Returns(new[] { client }.AsQueryable().BuildMock());

        Dictionary<string, string>? capturedVars = null;
        _invoiceRepoMock.Setup(r => r.UpdateRangeAsync(It.IsAny<IEnumerable<Invoice>>()))
            .Returns(Task.CompletedTask);
        _notifMock.Setup(n => n.PublishAsync(
                It.IsAny<NotifType>(), It.IsAny<Guid>(), It.IsAny<string>(),
                It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()))
            .Callback<NotifType, Guid, string, Dictionary<string, string>, Guid?>(
                (_, _, _, vars, _) => capturedVars = vars)
            .Returns(Task.CompletedTask);

        await BuildService().MarkOverdueInvoicesAsync();

        capturedVars.Should().NotBeNull();
        capturedVars!["monto"].Should().Be("70.00",
            "el saldo adeudado es Amount(100) - AmountPaid(30) = 70, no el bruto 100");
    }
}
