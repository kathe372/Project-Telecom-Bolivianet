using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.UnitTests.Helpers;

/// <summary>
/// Arma un <see cref="BillingService"/> para tests.
///
/// Existe porque tres archivos de prueba repetían la misma llamada al constructor: cuando
/// BillingService incorporó <see cref="IUnitOfWork"/> e <see cref="ICreditLedger"/>, los tres
/// dejaron de compilar y — al no haber una solución que agrupara los proyectos de test — el
/// proyecto entero quedó sin ejecutarse sin que nadie lo notara. Con la construcción en un
/// único sitio, un cambio de dependencias rompe un solo archivo y se arregla una sola vez.
///
/// Las dependencias no indicadas caen en mocks <c>Loose</c>: cada test declara solo lo que
/// realmente le importa.
/// </summary>
public sealed class BillingServiceBuilder
{
    private IGenericRepository<Client>?  _clientRepo;
    private IGenericRepository<Invoice>? _invoiceRepo;
    private IInvoiceNumberService?       _invNumSvc;
    private INotifPublisher?             _notif;
    private IUnitOfWork?                 _uow;
    private ICreditLedger?               _creditLedger;

    public BillingServiceBuilder WithClients(IGenericRepository<Client> repo)
    { _clientRepo = repo; return this; }

    public BillingServiceBuilder WithInvoices(IGenericRepository<Invoice> repo)
    { _invoiceRepo = repo; return this; }

    public BillingServiceBuilder WithInvoiceNumbers(IInvoiceNumberService svc)
    { _invNumSvc = svc; return this; }

    public BillingServiceBuilder WithNotifier(INotifPublisher notif)
    { _notif = notif; return this; }

    public BillingServiceBuilder WithUnitOfWork(IUnitOfWork uow)
    { _uow = uow; return this; }

    public BillingServiceBuilder WithCreditLedger(ICreditLedger ledger)
    { _creditLedger = ledger; return this; }

    public BillingService Build() => new(
        _clientRepo   ?? Mock.Of<IGenericRepository<Client>>(),
        _invoiceRepo  ?? Mock.Of<IGenericRepository<Invoice>>(),
        TestAudit.Real(),
        NullLogger<BillingService>.Instance,
        _invNumSvc    ?? Mock.Of<IInvoiceNumberService>(),
        _uow          ?? Mock.Of<IUnitOfWork>(),
        _creditLedger ?? Mock.Of<ICreditLedger>());

    /// <summary>
    /// F5: marcar vencidas se mudó a InvoiceStatusService. El builder lo arma con
    /// los mismos dobles para que los tests que ya existían no tengan que saberlo.
    /// </summary>
    public InvoiceStatusService BuildStatusService() => new(
        _invoiceRepo ?? Mock.Of<IGenericRepository<Invoice>>(),
        _clientRepo  ?? Mock.Of<IGenericRepository<Client>>(),
        _notif       ?? Mock.Of<INotifPublisher>(),
        TestAudit.Real(),
        NullLogger<InvoiceStatusService>.Instance);
}
