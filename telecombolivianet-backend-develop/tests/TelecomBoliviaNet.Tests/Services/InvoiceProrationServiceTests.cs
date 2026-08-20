using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Application.Services.Payments;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// BUG-03 (auditoría 2026-08-06) — Prorrata por cambio de plan a mitad de mes.
///
/// El filtro de anulación cubría solo Pendiente|Emitida|Enviada. Como la mensualidad pasa a
/// Vencida el día 6, en el escenario más común de un cambio "a mitad de mes" la mensualidad
/// NO se anulaba y el cliente terminaba con el mes completo MÁS las dos prorratas del mismo
/// periodo (Cobre 99 → Oro 199 un día 20: Bs. 287,96 en vez de Bs. 188,96).
/// </summary>
public class InvoiceProrationServiceTests
{
    private static readonly Guid ClientId = Guid.NewGuid();
    private static readonly DateTime Hoy  = new(2026, 8, 20, 0, 0, 0, DateTimeKind.Utc);

    private const decimal PrecioCobre = 99m;   // 31 días de agosto
    private const decimal PrecioOro   = 199m;

    private static Client MakeClient(decimal creditoInicial = 0m)
    {
        var client = TestEntityFactory.MakeClient(
            id: ClientId, fullName: "Ana Perez", planId: Guid.NewGuid());
        client.CreditBalance = creditoInicial;
        client.Plan = new Plan { Name = "Plan Cobre", MonthlyPrice = PrecioCobre };
        return client;
    }

    private static Invoice Mensualidad(InvoiceStatus status, decimal amountPaid = 0m) => new()
    {
        Id            = Guid.NewGuid(),
        ClientId      = ClientId,
        Type          = InvoiceType.Mensualidad,
        Status        = status,
        Year          = Hoy.Year,
        Month         = Hoy.Month,
        Amount        = PrecioCobre,
        AmountPaid    = amountPaid,
        InvoiceNumber = "F-2026-0042",
        DueDate       = new DateTime(Hoy.Year, Hoy.Month, 5, 0, 0, 0, DateTimeKind.Utc),
    };

    /// <summary>
    /// Servicio bajo prueba + el repositorio en memoria para inspeccionar las facturas
    /// resultantes. El libro mayor es el REAL sobre un repositorio mockeado: la devolución
    /// del importe abonado tiene que verse en <c>Client.CreditBalance</c>, y con un mock
    /// vacío eso no se comprobaría.
    /// </summary>
    private static (InvoiceProrationService Svc, IGenericRepository<Invoice> Repo)
        MakeService(params Invoice[] invoices)
    {
        var repo   = RepoMock.Of(invoices).Object;
        var ledger = new CreditLedgerService(
            RepoMock.Empty<CreditMovement>().Object,
            NullLogger<CreditLedgerService>.Instance);

        return (new InvoiceProrationService(repo, ledger), repo);
    }

    private static List<Invoice> Prorratas(IGenericRepository<Invoice> repo) =>
        repo.GetAll()
            .Where(i => i.Type == InvoiceType.ProrrataAnterior || i.Type == InvoiceType.ProrrataNueva)
            .ToList();

    private static Plan PlanOro() => new() { Name = "Plan Oro", MonthlyPrice = PrecioOro };

    // ── El bug: la mensualidad ya vencida debe anularse ──────────────────────

    [Theory]
    [InlineData(InvoiceStatus.Pendiente)]
    [InlineData(InvoiceStatus.Emitida)]
    [InlineData(InvoiceStatus.Enviada)]
    [InlineData(InvoiceStatus.Vencida)]              // ← el estado del bug
    [InlineData(InvoiceStatus.ParcialmentePagada)]   // ← el estado del bug
    public async Task ApplyMidMonth_MensualidadImpaga_SeAnulaCualquieraSeaSuEstado(InvoiceStatus status)
    {
        var mensualidad = Mensualidad(status, amountPaid: status == InvoiceStatus.ParcialmentePagada ? 40m : 0m);
        var (svc, _) = MakeService(mensualidad);

        await svc.ApplyMidMonthAsync(MakeClient(), PlanOro(), Hoy);

        mensualidad.Status.Should().Be(InvoiceStatus.Anulada,
            "toda mensualidad con saldo por cobrar se reemplaza por las dos prorratas del mes");
    }

    [Theory]
    [InlineData(InvoiceStatus.Pagada)]
    [InlineData(InvoiceStatus.Anulada)]
    public async Task ApplyMidMonth_MensualidadLiquidada_NoSeToca(InvoiceStatus status)
    {
        var mensualidad = Mensualidad(status, amountPaid: status == InvoiceStatus.Pagada ? PrecioCobre : 0m);
        var (svc, _) = MakeService(mensualidad);

        await svc.ApplyMidMonthAsync(MakeClient(), PlanOro(), Hoy);

        mensualidad.Status.Should().Be(status,
            "una factura ya cobrada o anulada no se reemplaza: el mes está liquidado");
    }

    // ── No se cobra dos veces el mismo mes ───────────────────────────────────

    [Fact]
    public async Task ApplyMidMonth_MensualidadVencida_NoSeCobraElMesDosVeces()
    {
        var (svc, repo) = MakeService(Mensualidad(InvoiceStatus.Vencida));

        await svc.ApplyMidMonthAsync(MakeClient(), PlanOro(), Hoy);

        var vigentes = repo.GetAll()
            .Where(i => i.Status != InvoiceStatus.Anulada)
            .Sum(i => i.Amount);

        // 19 días de Cobre + 12 días de Oro sobre 31 = 60,68 + 77,03 = 137,71
        // Antes del fix: 99 (mensualidad sin anular) + 137,71 = 236,71
        vigentes.Should().BeLessThan(PrecioCobre + PrecioOro);
        vigentes.Should().BeApproximately(
            Math.Round(PrecioCobre * 19 / 31, 2) + Math.Round(PrecioOro * 12 / 31, 2), 0.01m);
    }

    [Fact]
    public async Task ApplyMidMonth_GeneraExactamenteDosProrratas()
    {
        var (svc, repo) = MakeService(Mensualidad(InvoiceStatus.Vencida));

        await svc.ApplyMidMonthAsync(MakeClient(), PlanOro(), Hoy);

        var prorratas = Prorratas(repo);
        prorratas.Should().HaveCount(2);
        prorratas.Should().ContainSingle(p => p.Type == InvoiceType.ProrrataAnterior)
            .Which.PlanName.Should().Be("Plan Cobre");
        prorratas.Should().ContainSingle(p => p.Type == InvoiceType.ProrrataNueva)
            .Which.PlanName.Should().Be("Plan Oro");
    }

    // ── El dinero ya abonado vuelve al cliente ───────────────────────────────

    [Fact]
    public async Task ApplyMidMonth_MensualidadConAbono_DevuelveLoAbonadoComoSaldoAFavor()
    {
        var (svc, _) = MakeService(Mensualidad(InvoiceStatus.ParcialmentePagada, amountPaid: 40m));
        var client   = MakeClient(creditoInicial: 10m);

        await svc.ApplyMidMonthAsync(client, PlanOro(), Hoy);

        client.CreditBalance.Should().Be(50m,
            "los 40 abonados a la factura anulada se suman a los 10 que ya tenía a favor");
    }

    [Fact]
    public async Task ApplyMidMonth_MensualidadSinAbono_NoGeneraSaldoAFavor()
    {
        var (svc, _) = MakeService(Mensualidad(InvoiceStatus.Vencida));
        var client   = MakeClient();

        await svc.ApplyMidMonthAsync(client, PlanOro(), Hoy);

        client.CreditBalance.Should().Be(0m);
    }

    [Fact]
    public async Task ApplyMidMonth_MensualidadConAbono_DejaConstanciaEnLaNota()
    {
        var mensualidad = Mensualidad(InvoiceStatus.ParcialmentePagada, amountPaid: 40m);
        mensualidad.Notes = "Mes proporcional: 12 de 31 días";
        var (svc, _) = MakeService(mensualidad);

        await svc.ApplyMidMonthAsync(MakeClient(), PlanOro(), Hoy);

        mensualidad.Notes.Should().Contain("Mes proporcional: 12 de 31 días",
            "la nota original no se pisa");
        mensualidad.Notes.Should().Contain("40.00");
        mensualidad.Notes.Should().Contain("saldo a favor");
    }

    // ── Anti prorrata doble (comportamiento previo, no debe romperse) ────────

    [Fact]
    public async Task ApplyMidMonth_SegundoCambioEnElMismoMes_AnulaLasProrratasPrevias()
    {
        var prorrataPrevia = new Invoice
        {
            Id       = Guid.NewGuid(), ClientId = ClientId,
            Type     = InvoiceType.ProrrataNueva,
            Status   = InvoiceStatus.Vencida,
            Year     = Hoy.Year, Month = Hoy.Month, Amount = 77.03m,
            DueDate  = new DateTime(Hoy.Year, Hoy.Month, 5, 0, 0, 0, DateTimeKind.Utc),
        };
        var (svc, _) = MakeService(prorrataPrevia);

        await svc.ApplyMidMonthAsync(MakeClient(), PlanOro(), Hoy);

        prorrataPrevia.Status.Should().Be(InvoiceStatus.Anulada,
            "un segundo cambio en el mismo ciclo no debe apilar facturas proporcionales");
    }
}
