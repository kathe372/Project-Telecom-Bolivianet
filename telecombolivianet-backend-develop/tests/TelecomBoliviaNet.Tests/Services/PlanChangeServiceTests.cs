using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Clients;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Application.Services.Payments;
using TelecomBoliviaNet.Application.Services.Tickets;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Tests.Helpers;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

public class PlanChangeServiceTests
{
    private static readonly Guid ActorId   = Guid.NewGuid();
    private static readonly Guid ClientId  = Guid.NewGuid();
    private static readonly Guid OldPlanId = Guid.NewGuid();
    private static readonly Guid NewPlanId = Guid.NewGuid();

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Plan MakePlan(Guid id, string name, decimal price, bool active = true) =>
        new() { Id = id, Name = name, MonthlyPrice = price, IsActive = active };

    private static Client MakeClient(Guid planId, Plan plan)
    {
        var client = TestEntityFactory.MakeClient(
            id:               ClientId,
            tbnCode:          "TBN-100",
            fullName:         "Cliente Prueba",
            planId:           planId,
            installationDate: DateTime.UtcNow.AddMonths(-3));
        client.Plan = plan;
        return client;
    }

    private static AuditService MakeAudit() =>
        new(RepoMock.Empty<AuditLog>().Object, NullLogger<AuditService>.Instance);

    private static TicketNumberService MakeTicketNumSvc()
    {
        var seq = new Mock<ISequenceGenerator>();
        seq.Setup(s => s.NextTicketNumberAsync()).ReturnsAsync("TK-2026-0001");
        return new TicketNumberService(seq.Object);
    }

    /// <summary>
    /// Libro mayor REAL sobre un repositorio en memoria: la devolución del importe abonado al
    /// anular una factura por cambio de plan debe verse reflejada en <c>Client.CreditBalance</c>,
    /// y eso solo se comprueba si el ledger no es un mock vacío.
    /// </summary>
    private static ICreditLedger MakeCreditLedger() =>
        new CreditLedgerService(
            RepoMock.Empty<CreditMovement>().Object,
            NullLogger<CreditLedgerService>.Instance);

    private static IUnitOfWork MakeUow()
    {
        var uow = new Mock<IUnitOfWork>();
        uow.Setup(u => u.BeginTransactionAsync(default)).Returns(Task.CompletedTask);
        uow.Setup(u => u.CommitAsync(default)).Returns(Task.CompletedTask);
        uow.Setup(u => u.RollbackAsync(default)).Returns(Task.CompletedTask);
        return uow.Object;
    }

    private static INotifPublisher MakeNotif()
    {
        var notif = new Mock<INotifPublisher>();
        notif.Setup(n => n.PublishAsync(
            It.IsAny<NotifType>(), It.IsAny<Guid>(),
            It.IsAny<string>(), It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()))
            .Returns(Task.CompletedTask);
        return notif.Object;
    }

    // F5: la clase se partió en pedir / resolver / consultar. La fábrica sigue
    // devolviendo lo mismo en las cuatro primeras posiciones y añade los dos
    // servicios nuevos al final, para que cada test toque solo lo que le importa.
    private (PlanChangeService svc,
             Mock<IPlanChangeRequestRepository> changeRepo,
             Mock<IGenericRepository<Invoice>> invoiceRepo,
             Mock<INotifPublisher> notif,
             PlanChangeRequestService requestSvc,
             PlanChangeQueryService querySvc)
        MakeService(
            IEnumerable<PlanChangeRequest>? changes  = null,
            IEnumerable<Invoice>?           invoices = null,
            Client? client   = null,
            Plan?   newPlan  = null)
    {
        var oldPlan     = MakePlan(OldPlanId, "Plan Cobre", 100m);
        var resolvedNew = newPlan  ?? MakePlan(NewPlanId, "Plan Plata", 150m);
        var resolvedCli = client   ?? MakeClient(OldPlanId, oldPlan);

        var changeRepo  = SpecificRepoMock.PlanChanges(changes?.ToArray() ?? []);
        var clientRepo  = SpecificRepoMock.Clients(resolvedCli);
        var planRepo    = RepoMock.Of(oldPlan, resolvedNew);
        var invoiceRepo = RepoMock.Of(invoices?.ToArray() ?? []);
        var ticketRepo  = SpecificRepoMock.Tickets();
        var notifMock   = new Mock<INotifPublisher>();
        notifMock.Setup(n => n.PublishAsync(
            It.IsAny<NotifType>(), It.IsAny<Guid>(),
            It.IsAny<string>(), It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()))
            .Returns(Task.CompletedTask);

        var planNotifier = new PlanChangeNotifier(
            notifMock.Object,
            new Mock<IChatbotDirectNotifier>().Object,
            NullLogger<PlanChangeNotifier>.Instance);

        var svc = new PlanChangeService(
            changeRepo.Object, clientRepo.Object, ticketRepo.Object,
            MakeAudit(), MakeUow(), planNotifier,
            new InvoiceProrationService(invoiceRepo.Object, MakeCreditLedger()));

        var requestSvc = new PlanChangeRequestService(
            changeRepo.Object, clientRepo.Object, planRepo.Object, ticketRepo.Object,
            MakeAudit(), MakeUow(),
            new Mock<IInternalAlertService>().Object,
            MakeTicketNumSvc());

        var querySvc = new PlanChangeQueryService(changeRepo.Object);

        return (svc, changeRepo, invoiceRepo, notifMock, requestSvc, querySvc);
    }

    // ════════════════════════════════════════════════════════════════════════
    // RequestChangeAsync
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task SolicitarCambio_CreaRegistroPendiente()
    {
        var (svc, changeRepo, _, _, requestSvc, querySvc) = MakeService();

        var result = await requestSvc.RequestChangeAsync(
            ClientId, NewPlanId, null, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        changeRepo.Verify(r => r.AddAsync(
            It.Is<PlanChangeRequest>(c =>
                c.ClientId  == ClientId &&
                c.NewPlanId == NewPlanId &&
                c.Status    == PlanChangeStatus.Pendiente)),
            Times.Once);
    }

    [Fact]
    public async Task SolicitarCambio_FechaEfectivaEs1roDeMesSiguiente()
    {
        var (svc, changeRepo, _, _, requestSvc, querySvc) = MakeService();

        await requestSvc.RequestChangeAsync(ClientId, NewPlanId, null, ActorId, "Admin", "127.0.0.1");

        var hoy      = DateTime.UtcNow;
        var expected = new DateTime(hoy.Year, hoy.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);

        changeRepo.Verify(r => r.AddAsync(
            It.Is<PlanChangeRequest>(c => c.EffectiveDate == expected)),
            Times.Once);
    }

    [Fact]
    public async Task SolicitarCambio_ConPendienteExistente_RetornaError()
    {
        var pending = new PlanChangeRequest
        {
            ClientId = ClientId, Status = PlanChangeStatus.Pendiente,
            OldPlanId = OldPlanId, NewPlanId = NewPlanId,
        };
        var (svc, _, _, _, requestSvc, querySvc) = MakeService(changes: [pending]);

        var result = await requestSvc.RequestChangeAsync(
            ClientId, NewPlanId, null, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("pendiente");
    }

    [Fact]
    public async Task SolicitarCambio_MismoPlan_RetornaError()
    {
        var (svc, _, _, _, requestSvc, querySvc) = MakeService();

        var result = await requestSvc.RequestChangeAsync(
            ClientId, OldPlanId, null, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("ya tiene ese plan");
    }

    [Fact]
    public async Task SolicitarCambio_PlanInactivo_RetornaError()
    {
        var planInactivo = MakePlan(NewPlanId, "Plan Inactivo", 200m, active: false);
        var (svc, _, _, _, requestSvc, querySvc) = MakeService(newPlan: planInactivo);

        var result = await requestSvc.RequestChangeAsync(
            ClientId, NewPlanId, null, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("inactivo");
    }

    [Fact]
    public async Task SolicitarCambio_LlamaSaveChangesAntesDeCommit()
    {
        // FIX-A: verifica que AddAsync + SaveChangesAsync se llaman (no solo AddAsync + CommitAsync vacío)
        var (svc, changeRepo, _, _, requestSvc, querySvc) = MakeService();

        await requestSvc.RequestChangeAsync(ClientId, NewPlanId, null, ActorId, "Admin", "127.0.0.1");

        changeRepo.Verify(r => r.SaveChangesAsync(), Times.Once);
    }

    // ════════════════════════════════════════════════════════════════════════
    // GetPendingAsync
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task GetPendientes_RetornaListaTipada()
    {
        var oldPlan = MakePlan(OldPlanId, "Plan Cobre", 100m);
        var newPlan = MakePlan(NewPlanId, "Plan Plata", 150m);
        var cli     = MakeClient(OldPlanId, oldPlan);

        var pending = new PlanChangeRequest
        {
            Id = Guid.NewGuid(), ClientId = ClientId, Client = cli,
            OldPlanId = OldPlanId, OldPlan = oldPlan,
            NewPlanId = NewPlanId, NewPlan = newPlan,
            Status = PlanChangeStatus.Pendiente,
            EffectiveDate = DateTime.UtcNow.AddMonths(1),
            RequestedAt = DateTime.UtcNow,
        };

        var (svc, _, _, _, requestSvc, querySvc) = MakeService(changes: [pending]);
        var items = await querySvc.GetPendingAsync();

        items.Should().BeOfType<List<PlanChangeItemDto>>();
        items.Should().HaveCount(1);
        items[0].PlanAnterior.Should().Be("Plan Cobre");
        items[0].PlanNuevo.Should().Be("Plan Plata");
    }

    [Fact]
    public async Task GetPendientes_FiltradoPorClientId()
    {
        var otroId = Guid.NewGuid();
        var p1 = new PlanChangeRequest
        {
            ClientId = ClientId, Status = PlanChangeStatus.Pendiente,
            OldPlanId = OldPlanId, NewPlanId = NewPlanId,
            EffectiveDate = DateTime.UtcNow.AddMonths(1), RequestedAt = DateTime.UtcNow,
        };
        var p2 = new PlanChangeRequest
        {
            ClientId = otroId, Status = PlanChangeStatus.Pendiente,
            OldPlanId = OldPlanId, NewPlanId = NewPlanId,
            EffectiveDate = DateTime.UtcNow.AddMonths(1), RequestedAt = DateTime.UtcNow,
        };
        var (svc, _, _, _, requestSvc, querySvc) = MakeService(changes: [p1, p2]);

        var items = await querySvc.GetPendingAsync(clientId: ClientId);
        items.Should().HaveCount(1);
    }

    [Fact]
    public async Task GetPendientes_ExcluyeAprobadosYRechazados()
    {
        var aprobado  = new PlanChangeRequest { ClientId = ClientId, Status = PlanChangeStatus.Aprobado,  OldPlanId = OldPlanId, NewPlanId = NewPlanId, EffectiveDate = DateTime.UtcNow, RequestedAt = DateTime.UtcNow };
        var rechazado = new PlanChangeRequest { ClientId = ClientId, Status = PlanChangeStatus.Rechazado, OldPlanId = OldPlanId, NewPlanId = NewPlanId, EffectiveDate = DateTime.UtcNow, RequestedAt = DateTime.UtcNow };
        var (svc, _, _, _, requestSvc, querySvc) = MakeService(changes: [aprobado, rechazado]);

        var items = await querySvc.GetPendingAsync();
        items.Should().BeEmpty();
    }

    // ════════════════════════════════════════════════════════════════════════
    // GetHistorialAsync (FIX-F)
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task GetHistorial_RetornaTodosLosEstados()
    {
        var oldPlan = MakePlan(OldPlanId, "Plan Cobre", 100m);
        var newPlan = MakePlan(NewPlanId, "Plan Plata", 150m);

        var aprobado  = new PlanChangeRequest { ClientId = ClientId, Status = PlanChangeStatus.Aprobado,  OldPlan = oldPlan, NewPlan = newPlan, OldPlanId = OldPlanId, NewPlanId = NewPlanId, EffectiveDate = DateTime.UtcNow, RequestedAt = DateTime.UtcNow.AddDays(-10) };
        var rechazado = new PlanChangeRequest { ClientId = ClientId, Status = PlanChangeStatus.Rechazado, OldPlan = oldPlan, NewPlan = newPlan, OldPlanId = OldPlanId, NewPlanId = NewPlanId, EffectiveDate = DateTime.UtcNow, RequestedAt = DateTime.UtcNow.AddDays(-5), RejectionReason = "No disponible" };
        var pendiente = new PlanChangeRequest { ClientId = ClientId, Status = PlanChangeStatus.Pendiente, OldPlan = oldPlan, NewPlan = newPlan, OldPlanId = OldPlanId, NewPlanId = NewPlanId, EffectiveDate = DateTime.UtcNow.AddMonths(1), RequestedAt = DateTime.UtcNow };

        var (svc, _, _, _, requestSvc, querySvc) = MakeService(changes: [aprobado, rechazado, pendiente]);

        var historial = await querySvc.GetHistorialAsync(ClientId);

        historial.Should().HaveCount(3);
        historial.Should().Contain(h => h.Status == "Aprobado");
        historial.Should().Contain(h => h.Status == "Rechazado" && h.MotivoRechazo == "No disponible");
        historial.Should().Contain(h => h.Status == "Pendiente");
    }

    [Fact]
    public async Task GetHistorial_SoloDevuelveDelClienteIndicado()
    {
        var otroId = Guid.NewGuid();
        var mio   = new PlanChangeRequest { ClientId = ClientId, Status = PlanChangeStatus.Aprobado, OldPlanId = OldPlanId, NewPlanId = NewPlanId, EffectiveDate = DateTime.UtcNow, RequestedAt = DateTime.UtcNow };
        var otro  = new PlanChangeRequest { ClientId = otroId,   Status = PlanChangeStatus.Aprobado, OldPlanId = OldPlanId, NewPlanId = NewPlanId, EffectiveDate = DateTime.UtcNow, RequestedAt = DateTime.UtcNow };
        var (svc, _, _, _, requestSvc, querySvc) = MakeService(changes: [mio, otro]);

        var historial = await querySvc.GetHistorialAsync(ClientId);
        historial.Should().HaveCount(1);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ApproveChangeAsync — Fin de mes
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task AprobarCambio_FinDeMes_NoCreaFacturas()
    {
        var cambioId = Guid.NewGuid();
        var oldPlan  = MakePlan(OldPlanId, "Plan Cobre", 100m);
        var newPlan  = MakePlan(NewPlanId, "Plan Plata", 150m);
        var cli      = MakeClient(OldPlanId, oldPlan);

        var pending = new PlanChangeRequest
        {
            Id = cambioId, ClientId = ClientId, Client = cli,
            NewPlanId = NewPlanId, NewPlan = newPlan,
            Status = PlanChangeStatus.Pendiente,
            EffectiveDate = DateTime.UtcNow.AddMonths(1),
        };

        var (svc, changeRepo, invoiceRepo, _, requestSvc, querySvc) = MakeService(changes: [pending]);

        var result = await svc.ApproveChangeAsync(
            cambioId, midMonth: false, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        invoiceRepo.Verify(r => r.AddAsync(It.IsAny<Invoice>()), Times.Never);
        // FIX-A: debe llamar MarkModifiedAsync, NO UpdateAsync directamente
        changeRepo.Verify(r => r.Update(
            It.Is<PlanChangeRequest>(c => c.Status == PlanChangeStatus.Aprobado)),
            Times.Once);
    }

    // ════════════════════════════════════════════════════════════════════════
    // Problema 1 — Aprobación resiliente (concurrencia + notificaciones)
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task AprobarCambio_ConflictoConcurrencia_RetornaFailure_NoLanza()
    {
        var cambioId = Guid.NewGuid();
        var oldPlan  = MakePlan(OldPlanId, "Plan Cobre", 100m);
        var newPlan  = MakePlan(NewPlanId, "Plan Plata", 150m);
        var cli      = MakeClient(OldPlanId, oldPlan);

        var pending = new PlanChangeRequest
        {
            Id = cambioId, ClientId = ClientId, Client = cli,
            NewPlanId = NewPlanId, NewPlan = newPlan,
            Status = PlanChangeStatus.Pendiente,
            EffectiveDate = DateTime.UtcNow.AddMonths(1),
        };

        var (svc, changeRepo, _, _, requestSvc, querySvc) = MakeService(changes: [pending]);
        changeRepo.Setup(r => r.SaveChangesAsync())
            .ThrowsAsync(new DbUpdateConcurrencyException());

        var result = await svc.ApproveChangeAsync(
            cambioId, midMonth: false, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse("un conflicto de concurrencia no debe salir como 500");
        result.ErrorMessage.Should().Contain("modificado");
    }

    [Fact]
    public async Task AprobarCambio_NotificacionFalla_IgualRetornaSuccess()
    {
        var cambioId = Guid.NewGuid();
        var oldPlan  = MakePlan(OldPlanId, "Plan Cobre", 100m);
        var newPlan  = MakePlan(NewPlanId, "Plan Plata", 150m);
        var cli      = MakeClient(OldPlanId, oldPlan);

        var pending = new PlanChangeRequest
        {
            Id = cambioId, ClientId = ClientId, Client = cli,
            NewPlanId = NewPlanId, NewPlan = newPlan,
            Status = PlanChangeStatus.Pendiente,
            EffectiveDate = DateTime.UtcNow.AddMonths(1),
        };

        var (svc, _, _, notif, requestSvc, querySvc) = MakeService(changes: [pending]);
        notif.Setup(n => n.PublishAsync(
                It.IsAny<NotifType>(), It.IsAny<Guid>(), It.IsAny<string>(),
                It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()))
            .ThrowsAsync(new Exception("WhatsApp caído"));

        var result = await svc.ApproveChangeAsync(
            cambioId, midMonth: false, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue(
            "una notificación fallida no debe revertir un cambio ya confirmado");
    }

    [Fact]
    public async Task AprobarCambio_FinDeMes_LlamaSaveChangesUnaVez()
    {
        // FIX-A: un único SaveChangesAsync antes del CommitAsync (no múltiples intermedios)
        var cambioId = Guid.NewGuid();
        var oldPlan  = MakePlan(OldPlanId, "Plan Cobre", 100m);
        var newPlan  = MakePlan(NewPlanId, "Plan Plata", 150m);
        var cli      = MakeClient(OldPlanId, oldPlan);
        var pending  = new PlanChangeRequest { Id = cambioId, ClientId = ClientId, Client = cli, NewPlanId = NewPlanId, NewPlan = newPlan, Status = PlanChangeStatus.Pendiente, EffectiveDate = DateTime.UtcNow.AddMonths(1) };

        var (svc, changeRepo, _, _, requestSvc, querySvc) = MakeService(changes: [pending]);

        await svc.ApproveChangeAsync(cambioId, midMonth: false, ActorId, "Admin", "127.0.0.1");

        changeRepo.Verify(r => r.SaveChangesAsync(), Times.Once);
    }

    // ── BUG-12 (auditoría 2026-08-06) · el cambio diferido NO se aplica al aprobar ──────
    // La política es upgrade inmediato / downgrade a fin de mes, y el ticket promete "efectivo
    // el 1ro del mes siguiente". Pero al aprobar se ejecutaba ChangePlan igual, así que el
    // cliente perdía la velocidad ese mismo día habiendo pagado el mes completo del plan
    // superior. Ahora queda en Aprobado y lo aplica ApplyScheduledPlanChangesJob.

    private static PlanChangeRequest PendienteDeAprobar(Guid cambioId, Client cli, Plan newPlan) => new()
    {
        Id            = cambioId,
        ClientId      = ClientId,
        Client        = cli,
        NewPlanId     = NewPlanId,
        NewPlan       = newPlan,
        Status        = PlanChangeStatus.Pendiente,
        EffectiveDate = DateTime.UtcNow.AddMonths(1),
    };

    [Fact]
    public async Task AprobarCambio_FinDeMes_NoCambiaElPlanTodavia()
    {
        var cambioId = Guid.NewGuid();
        var cli      = MakeClient(OldPlanId, MakePlan(OldPlanId, "Plan Cobre", 100m));
        var pending  = PendienteDeAprobar(cambioId, cli, MakePlan(NewPlanId, "Plan Plata", 150m));

        var (svc, _, _, _, requestSvc, querySvc) = MakeService(changes: [pending], client: cli);

        var result = await svc.ApproveChangeAsync(cambioId, midMonth: false, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        cli.PlanId.Should().Be(OldPlanId,
            "el cliente conserva el plan que ya pagó hasta la fecha efectiva");
        pending.Status.Should().Be(PlanChangeStatus.Aprobado,
            "aprobado ≠ aplicado: queda a la espera del job");
    }

    [Fact]
    public async Task AprobarCambio_FinDeMes_NoAnunciaUnCambioQueAunNoOcurrio()
    {
        var cambioId = Guid.NewGuid();
        var cli      = MakeClient(OldPlanId, MakePlan(OldPlanId, "Plan Cobre", 100m));
        var pending  = PendienteDeAprobar(cambioId, cli, MakePlan(NewPlanId, "Plan Plata", 150m));

        var (svc, _, _, notifMock, requestSvc, querySvc) = MakeService(changes: [pending], client: cli);

        await svc.ApproveChangeAsync(cambioId, midMonth: false, ActorId, "Admin", "127.0.0.1");

        notifMock.Verify(n => n.PublishAsync(
            NotifType.CAMBIO_PLAN, It.IsAny<Guid>(),
            It.IsAny<string>(), It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()),
            Times.Never,
            "avisar \"tu plan cambió\" un mes antes de que cambie es una promesa falsa; " +
            "el aviso lo manda el job al aplicarlo");
    }

    [Fact]
    public async Task AprobarCambio_MidMonth_SiCambiaElPlanYAvisa()
    {
        var cambioId = Guid.NewGuid();
        var cli      = MakeClient(OldPlanId, MakePlan(OldPlanId, "Plan Cobre", 100m));
        var pending  = PendienteDeAprobar(cambioId, cli, MakePlan(NewPlanId, "Plan Plata", 150m));

        var (svc, _, _, notifMock, requestSvc, querySvc) = MakeService(changes: [pending], client: cli);

        await svc.ApproveChangeAsync(cambioId, midMonth: true, ActorId, "Admin", "127.0.0.1");

        cli.PlanId.Should().Be(NewPlanId);
        pending.Status.Should().Be(PlanChangeStatus.Aplicado);
        notifMock.Verify(n => n.PublishAsync(
            NotifType.CAMBIO_PLAN, It.IsAny<Guid>(),
            It.IsAny<string>(), It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()),
            Times.Once);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ApproveChangeAsync — Mitad de mes (FIX-A crítico)
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task AprobarCambio_MidMonth_SinFacturaPendiente_CreaDosProporcionales()
    {
        // Escenario: no hay factura mensual activa → crea proporcional viejo plan + nuevo plan
        var cambioId = Guid.NewGuid();
        var oldPlan  = MakePlan(OldPlanId, "Plan Cobre", 100m);
        var newPlan  = MakePlan(NewPlanId, "Plan Plata", 150m);
        var cli      = MakeClient(OldPlanId, oldPlan);
        var pending  = new PlanChangeRequest { Id = cambioId, ClientId = ClientId, Client = cli, NewPlanId = NewPlanId, NewPlan = newPlan, Status = PlanChangeStatus.Pendiente, EffectiveDate = DateTime.UtcNow.AddMonths(1) };

        var (svc, changeRepo, invoiceRepo, _, requestSvc, querySvc) = MakeService(changes: [pending]);

        var result = await svc.ApproveChangeAsync(cambioId, midMonth: true, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        changeRepo.Verify(r => r.Update(
            It.Is<PlanChangeRequest>(c => c.Status == PlanChangeStatus.Aplicado && c.MidMonthChange)),
            Times.Once,
            "un cambio inmediato queda APLICADO, no solo aprobado");

        // Si daysPlanOld > 0 se crean 2 facturas (viejo plan + nuevo plan)
        // Si daysPlanOld == 0 (día 1 del mes) solo se crea 1 (nuevo plan)
        var hoy = DateTime.UtcNow;
        var expectedInvoices = hoy.Day > 1 ? 2 : 1;
        invoiceRepo.Verify(r => r.AddAsync(It.IsAny<Invoice>()), Times.Exactly(expectedInvoices));
    }

    [Fact]
    public async Task AprobarCambio_MidMonth_ConFacturaPendiente_AnulaYCreaProporcionales()
    {
        // FIX-A: el escenario que causaba el bug — hay factura mensual que anular
        var cambioId = Guid.NewGuid();
        var oldPlan  = MakePlan(OldPlanId, "Plan Cobre", 100m);
        var newPlan  = MakePlan(NewPlanId, "Plan Plata", 150m);
        var cli      = MakeClient(OldPlanId, oldPlan);

        var hoy = DateTime.UtcNow;
        var facturaActual = new Invoice
        {
            Id       = Guid.NewGuid(),
            ClientId = ClientId,
            Type     = InvoiceType.Mensualidad,
            Status   = InvoiceStatus.Pendiente,
            Year     = hoy.Year,
            Month    = hoy.Month,
            Amount   = 100m,
            IssuedAt = hoy.AddDays(-5),
            DueDate  = hoy.AddDays(5),
        };

        var pending = new PlanChangeRequest
        {
            Id = cambioId, ClientId = ClientId, Client = cli,
            NewPlanId = NewPlanId, NewPlan = newPlan,
            Status = PlanChangeStatus.Pendiente,
            EffectiveDate = hoy.AddMonths(1),
        };

        var (svc, changeRepo, invoiceRepo, _, requestSvc, querySvc) = MakeService(changes: [pending], invoices: [facturaActual]);

        var result = await svc.ApproveChangeAsync(cambioId, midMonth: true, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue();

        // La factura actual queda Anulada, marcada dentro de la transacción.
        //
        // F3 (2026-08-21): antes esto eran dos aserciones —"usa MarkModifiedAsync"
        // y "NO usa UpdateAsync"— que con el contrato nuevo se contradicen: ambos
        // métodos son hoy Update(), que por definición no persiste. La garantía
        // que importaba era que la anulación NO se confirmara por su cuenta,
        // fuera de la transacción del cambio de plan.
        invoiceRepo.Verify(r => r.Update(
            It.Is<Invoice>(i => i.Id == facturaActual.Id && i.Status == InvoiceStatus.Anulada)),
            Times.Once);
    }

    [Fact]
    public async Task AprobarCambio_MidMonth_LlamaSaveChangesUnaVez()
    {
        // FIX-A: aun con factura que anular, solo un SaveChangesAsync al final
        var cambioId = Guid.NewGuid();
        var oldPlan  = MakePlan(OldPlanId, "Plan Cobre", 100m);
        var newPlan  = MakePlan(NewPlanId, "Plan Plata", 150m);
        var cli      = MakeClient(OldPlanId, oldPlan);
        var hoy      = DateTime.UtcNow;
        var factura  = new Invoice { Id = Guid.NewGuid(), ClientId = ClientId, Type = InvoiceType.Mensualidad, Status = InvoiceStatus.Pendiente, Year = hoy.Year, Month = hoy.Month, Amount = 100m, IssuedAt = hoy, DueDate = hoy.AddDays(5) };
        var pending  = new PlanChangeRequest { Id = cambioId, ClientId = ClientId, Client = cli, NewPlanId = NewPlanId, NewPlan = newPlan, Status = PlanChangeStatus.Pendiente, EffectiveDate = hoy.AddMonths(1) };

        var (svc, changeRepo, _, _, requestSvc, querySvc) = MakeService(changes: [pending], invoices: [factura]);

        await svc.ApproveChangeAsync(cambioId, midMonth: true, ActorId, "Admin", "127.0.0.1");

        // FIX-A: exactamente 1 SaveChangesAsync, no uno por cada UpdateAsync
        changeRepo.Verify(r => r.SaveChangesAsync(), Times.Once);
    }

    // ════════════════════════════════════════════════════════════════════════
    // Problema 7 — Política upgrade/downgrade + anti prorrata doble
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task AprobarCambio_Downgrade_Inmediato_EsRechazado()
    {
        var cambioId = Guid.NewGuid();
        var oldPlan  = MakePlan(OldPlanId, "Plan Plata", 150m);
        var newPlan  = MakePlan(NewPlanId, "Plan Cobre", 100m);   // downgrade
        var cli      = MakeClient(OldPlanId, oldPlan);
        var pending  = new PlanChangeRequest
        {
            Id = cambioId, ClientId = ClientId, Client = cli,
            NewPlanId = NewPlanId, NewPlan = newPlan,
            Status = PlanChangeStatus.Pendiente, EffectiveDate = DateTime.UtcNow.AddMonths(1),
        };
        var (svc, _, _, _, requestSvc, querySvc) = MakeService(changes: [pending]);

        var result = await svc.ApproveChangeAsync(cambioId, midMonth: true, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse("un downgrade no puede aplicarse de inmediato");
        result.ErrorMessage.Should().Contain("fin de mes");
    }

    [Fact]
    public async Task AprobarCambio_Downgrade_FinDeMes_EsAceptado()
    {
        var cambioId = Guid.NewGuid();
        var oldPlan  = MakePlan(OldPlanId, "Plan Plata", 150m);
        var newPlan  = MakePlan(NewPlanId, "Plan Cobre", 100m);   // downgrade
        var cli      = MakeClient(OldPlanId, oldPlan);
        var pending  = new PlanChangeRequest
        {
            Id = cambioId, ClientId = ClientId, Client = cli,
            NewPlanId = NewPlanId, NewPlan = newPlan,
            Status = PlanChangeStatus.Pendiente, EffectiveDate = DateTime.UtcNow.AddMonths(1),
        };
        var (svc, _, invoiceRepo, _, requestSvc, querySvc) = MakeService(changes: [pending]);

        var result = await svc.ApproveChangeAsync(cambioId, midMonth: false, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue("el downgrade a fin de mes es válido");
        invoiceRepo.Verify(r => r.AddAsync(It.IsAny<Invoice>()), Times.Never);
    }

    [Fact]
    public async Task AprobarCambio_MidMonth_AnulaProrrataPreviaDelMes()
    {
        var cambioId = Guid.NewGuid();
        var oldPlan  = MakePlan(OldPlanId, "Plan Cobre", 100m);
        var newPlan  = MakePlan(NewPlanId, "Plan Plata", 150m);   // upgrade → inmediato permitido
        var cli      = MakeClient(OldPlanId, oldPlan);
        var hoy      = DateTime.UtcNow;
        var prorrataPrevia = new Invoice
        {
            Id = Guid.NewGuid(), ClientId = ClientId, Type = InvoiceType.ProrrataNueva,
            Status = InvoiceStatus.Pendiente, Year = hoy.Year, Month = hoy.Month,
            Amount = 50m, IssuedAt = hoy, DueDate = hoy.AddDays(5),
        };
        var pending = new PlanChangeRequest
        {
            Id = cambioId, ClientId = ClientId, Client = cli,
            NewPlanId = NewPlanId, NewPlan = newPlan,
            Status = PlanChangeStatus.Pendiente, EffectiveDate = hoy.AddMonths(1),
        };
        var (svc, _, invoiceRepo, _, requestSvc, querySvc) = MakeService(changes: [pending], invoices: [prorrataPrevia]);

        await svc.ApproveChangeAsync(cambioId, midMonth: true, ActorId, "Admin", "127.0.0.1");

        invoiceRepo.Verify(r => r.Update(
            It.Is<Invoice>(i => i.Id == prorrataPrevia.Id && i.Status == InvoiceStatus.Anulada)),
            Times.Once);
    }

    [Fact]
    public async Task AprobarCambio_YaProcesado_RetornaError()
    {
        var cambioId = Guid.NewGuid();
        var cambio   = new PlanChangeRequest { Id = cambioId, ClientId = ClientId, Status = PlanChangeStatus.Aprobado, OldPlanId = OldPlanId, NewPlanId = NewPlanId };
        var (svc, _, _, _, requestSvc, querySvc) = MakeService(changes: [cambio]);

        var result = await svc.ApproveChangeAsync(cambioId, false, ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("procesada");
    }

    // ════════════════════════════════════════════════════════════════════════
    // RejectChangeAsync
    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task RechazarCambio_ActualizaEstadoYMotivo()
    {
        var cambioId = Guid.NewGuid();
        var pending  = new PlanChangeRequest { Id = cambioId, ClientId = ClientId, Status = PlanChangeStatus.Pendiente, OldPlanId = OldPlanId, NewPlanId = NewPlanId };
        var (svc, changeRepo, _, _, requestSvc, querySvc) = MakeService(changes: [pending]);

        var result = await svc.RejectChangeAsync(
            cambioId, "No cumple requisitos", ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        // FIX-A: MarkModifiedAsync en lugar de UpdateAsync
        changeRepo.Verify(r => r.Update(
            It.Is<PlanChangeRequest>(c =>
                c.Status          == PlanChangeStatus.Rechazado &&
                c.RejectionReason == "No cumple requisitos")),
            Times.Once);
    }

    [Fact]
    public async Task RechazarCambio_LlamaSaveChangesUnaVez()
    {
        var cambioId = Guid.NewGuid();
        var pending  = new PlanChangeRequest { Id = cambioId, ClientId = ClientId, Status = PlanChangeStatus.Pendiente, OldPlanId = OldPlanId, NewPlanId = NewPlanId };
        var (svc, changeRepo, _, _, requestSvc, querySvc) = MakeService(changes: [pending]);

        await svc.RejectChangeAsync(cambioId, "Motivo", ActorId, "Admin", "127.0.0.1");

        changeRepo.Verify(r => r.SaveChangesAsync(), Times.Once);
    }

    [Fact]
    public async Task RechazarCambio_EnviaNotificacionAlCliente()
    {
        // FIX-D: notificación cuando el cliente tiene PhoneMain cargado
        var cambioId = Guid.NewGuid();
        var oldPlan  = MakePlan(OldPlanId, "Plan Cobre", 100m);
        var cli      = MakeClient(OldPlanId, oldPlan);
        var pending  = new PlanChangeRequest { Id = cambioId, ClientId = ClientId, Client = cli, Status = PlanChangeStatus.Pendiente, OldPlanId = OldPlanId, NewPlanId = NewPlanId };
        var (svc, _, _, notifMock, requestSvc, querySvc) = MakeService(changes: [pending]);

        await svc.RejectChangeAsync(cambioId, "Motivo de prueba", ActorId, "Admin", "127.0.0.1");

        // CAMBIO DELIBERADO (auditoría 2026-08-01): el rechazo usa su propio tipo.
        // Antes se enviaba CAMBIO_PLAN con el plan solicitado, así que el cliente
        // leía "tu plan cambió a X" justo cuando se le denegaba ese cambio.
        notifMock.Verify(n => n.PublishAsync(
            NotifType.CAMBIO_PLAN_RECHAZADO, ClientId,
            It.IsAny<string>(),
            It.Is<Dictionary<string, string>>(ctx => ctx["motivo"] == "Motivo de prueba"),
            It.IsAny<Guid?>()),
            Times.Once);

        notifMock.Verify(n => n.PublishAsync(
            NotifType.CAMBIO_PLAN, It.IsAny<Guid>(),
            It.IsAny<string>(), It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()),
            Times.Never,
            "un rechazo nunca debe salir con la plantilla de cambio aplicado");
    }

    [Fact]
    public async Task RechazarCambio_YaProcesado_RetornaError()
    {
        var cambioId = Guid.NewGuid();
        var cambio   = new PlanChangeRequest { Id = cambioId, ClientId = ClientId, Status = PlanChangeStatus.Rechazado, OldPlanId = OldPlanId, NewPlanId = NewPlanId };
        var (svc, _, _, _, requestSvc, querySvc) = MakeService(changes: [cambio]);

        var result = await svc.RejectChangeAsync(cambioId, "Motivo", ActorId, "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
    }
}
