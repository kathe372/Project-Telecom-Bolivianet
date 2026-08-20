using FluentAssertions;
using TelecomBoliviaNet.Application.Clients.Queries;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// PASO 5 (2026-08): el chatbot necesita el snapshot de plan (PlanName/PlanPrice)
/// de cada factura para poder explicar diferencias de monto por cambio de plan
/// sin inventar la causa. Esta consulta es la fuente de ese dato.
/// </summary>
public class GetInvoicePlanSnapshotsHandlerTests
{
    private static Invoice MakeInvoice(Guid id, string? planName, decimal? planPrice)
        => new() { Id = id, ClientId = Guid.NewGuid(), PlanName = planName, PlanPrice = planPrice };

    [Fact]
    public async Task Returns_PlanName_And_PlanPrice_For_Requested_Invoices()
    {
        var inv1 = MakeInvoice(Guid.NewGuid(), "Plan Cobre", 99m);
        var inv2 = MakeInvoice(Guid.NewGuid(), "Plan Platinium 1", 199m);
        var repo = RepoMock.Of(inv1, inv2);
        var handler = new GetInvoicePlanSnapshotsHandler(repo.Object);

        var result = (await handler.Handle(
            new GetInvoicePlanSnapshotsQuery([inv1.Id, inv2.Id]), CancellationToken.None)).ToList();

        result.Should().HaveCount(2);
        result.Should().ContainSingle(r => r.InvoiceId == inv1.Id && r.PlanName == "Plan Cobre" && r.PlanPrice == 99m);
        result.Should().ContainSingle(r => r.InvoiceId == inv2.Id && r.PlanName == "Plan Platinium 1" && r.PlanPrice == 199m);
    }

    [Fact]
    public async Task Ignores_Invoices_Not_In_The_Requested_List()
    {
        var wanted   = MakeInvoice(Guid.NewGuid(), "Plan Cobre", 99m);
        var unwanted = MakeInvoice(Guid.NewGuid(), "Plan Oro", 300m);
        var repo = RepoMock.Of(wanted, unwanted);
        var handler = new GetInvoicePlanSnapshotsHandler(repo.Object);

        var result = (await handler.Handle(
            new GetInvoicePlanSnapshotsQuery([wanted.Id]), CancellationToken.None)).ToList();

        result.Should().ContainSingle();
        result[0].InvoiceId.Should().Be(wanted.Id);
    }

    [Fact]
    public async Task Empty_InvoiceIds_Returns_Empty_Without_Querying()
    {
        var repo = RepoMock.Empty<Invoice>();
        var handler = new GetInvoicePlanSnapshotsHandler(repo.Object);

        var result = await handler.Handle(new GetInvoicePlanSnapshotsQuery([]), CancellationToken.None);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task NullPlanName_And_NullPlanPrice_Are_Preserved_As_Null()
    {
        var invoice = MakeInvoice(Guid.NewGuid(), null, null);
        var repo = RepoMock.Of(invoice);
        var handler = new GetInvoicePlanSnapshotsHandler(repo.Object);

        var result = (await handler.Handle(
            new GetInvoicePlanSnapshotsQuery([invoice.Id]), CancellationToken.None)).ToList();

        result[0].PlanName.Should().BeNull();
        result[0].PlanPrice.Should().BeNull();
    }
}
