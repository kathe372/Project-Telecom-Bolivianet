using System.Linq.Expressions;
using Moq;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Tests.Helpers;

/// <summary>
/// Mocks de los repositorios ESPECÍFICOS por agregado que introdujo la Fase 4.
///
/// Cada uno parte del mock genérico —que ya sabe responder a GetAll, ListAsync,
/// Update…— y añade los métodos con nombre de negocio, resolviéndolos sobre la
/// misma lista en memoria. Así un test sigue escribiéndose en una línea.
/// </summary>
public static class SpecificRepoMock
{
    public static Mock<IInstallationRepository> Installations(params Installation[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<IInstallationRepository, Installation>(lista);

        mock.Setup(r => r.GetForCommandAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(i => i.Id == id));

        var abiertos = new[]
        {
            InstallationStatus.Pendiente,
            InstallationStatus.EnProceso,
            InstallationStatus.Reprogramada,
        };

        mock.Setup(r => r.HasOpenForClientAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid clientId, CancellationToken _) =>
                lista.Any(i => i.ClientId == clientId && abiertos.Contains(i.Status)));

        mock.Setup(r => r.HasOpenForProspectAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string phone, CancellationToken _) =>
                lista.Any(i => i.ClientId == null && i.ProspectPhone == phone
                            && abiertos.Contains(i.Status)));

        mock.Setup(r => r.GetLatestBoxCodeByClientAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, string>());

        mock.Setup(r => r.GetDetailAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(i => i.Id == id));

        // El filtrado que antes hacía el handler vive ahora en el repositorio, así
        // que el mock lo reproduce en memoria: si no, los tests de esos handlers
        // dejarían de probar nada.
        mock.Setup(r => r.GetCalendarRangeAsync(
                It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((DateTime desde, DateTime hasta, Guid? tec, CancellationToken _) =>
                lista.Where(i => i.Fecha.Date >= desde.Date && i.Fecha.Date <= hasta.Date
                              && (tec is null || i.TecnicoId == tec))
                     .OrderBy(i => i.Fecha).ThenBy(i => i.HoraInicio)
                     .ToList());

        mock.Setup(r => r.GetTechnicianDayAsync(
                It.IsAny<Guid>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid tec, DateTime fecha, CancellationToken _) =>
                lista.Where(i => i.Fecha.Date == fecha.Date
                              && (i.TecnicoId == tec
                                  || i.Technicians.Any(t => t.TechnicianId == tec))
                              && i.Status != InstallationStatus.Cancelada)
                     .OrderBy(i => i.HoraInicio)
                     .ToList());

        mock.Setup(r => r.GetPagedAsync(
                It.IsAny<InstallationListFilter>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((InstallationListFilter f, CancellationToken _) =>
            {
                var q = lista.AsEnumerable();
                if (f.Status.HasValue)    q = q.Where(i => i.Status    == f.Status.Value);
                if (f.TecnicoId.HasValue) q = q.Where(i => i.TecnicoId == f.TecnicoId);
                if (f.ClienteId.HasValue) q = q.Where(i => i.ClientId  == f.ClienteId);
                if (f.SoloProspectos)     q = q.Where(i => i.ClientId is null && i.ProspectPhone != null);
                if (f.Fecha.HasValue)     q = q.Where(i => i.Fecha.Date == f.Fecha.Value.Date);

                var todas = q.OrderBy(i => i.Fecha).ThenBy(i => i.HoraInicio).ToList();
                var pag   = todas.Skip((f.Page - 1) * f.PageSize).Take(f.PageSize).ToList();
                return (pag, todas.Count);
            });

        return mock;
    }

    public static Mock<IClientRepository> Clients(params Client[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<IClientRepository, Client>(lista);

        mock.Setup(r => r.GetWithPlanAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(c => c.Id == id));

        mock.Setup(r => r.GetWithGpsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ClientMapPoint>());

        // Las facturas ya vienen en la colección del cliente que arma el test:
        // basta con devolver la misma instancia, igual que hace el Include real.
        mock.Setup(r => r.GetWithInvoicesAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(c => c.Id == id));

        mock.Setup(r => r.GetDetailAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(c => c.Id == id));

        mock.Setup(r => r.GetByAnyPhoneAsync(
                It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyCollection<string> phones, CancellationToken _) => lista
                .Where(c => phones.Contains(c.PhoneMain)
                         || (c.PhoneSecondary != null && phones.Contains(c.PhoneSecondary)))
                .OrderBy(c => c.CreatedAt)
                .ToList());

        return mock;
    }

    public static Mock<IInvoiceRepository> Invoices(params Invoice[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<IInvoiceRepository, Invoice>(lista);

        mock.Setup(r => r.GetForClientYearAsync(
                It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid clientId, int year, CancellationToken _) => lista
                .Where(i => i.ClientId == clientId
                         && (i.Year == year || i.Type == InvoiceType.Instalacion)
                         && i.Status != InvoiceStatus.Anulada)
                .OrderBy(i => i.Month)
                .ToList());

        mock.Setup(r => r.GetPlanSnapshotsAsync(
                It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyCollection<Guid> ids, CancellationToken _) => lista
                .Where(i => ids.Contains(i.Id))
                .Select(i => new InvoicePlanSnapshot(i.Id, i.PlanName, i.PlanPrice))
                .ToList());

        return mock;
    }

    /// <summary>
    /// Las navegaciones (Client, OldPlan, NewPlan) las puebla el test al armar
    /// la solicitud, igual que haría el Include real: aquí solo se filtra.
    /// </summary>
    public static Mock<IPlanChangeRequestRepository> PlanChanges(params PlanChangeRequest[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<IPlanChangeRequestRepository, PlanChangeRequest>(lista);

        mock.Setup(r => r.GetForCommandAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(r => r.Id == id));

        mock.Setup(r => r.GetPendingAsync(It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid? clientId, CancellationToken _) => lista
                .Where(r => r.Status == PlanChangeStatus.Pendiente
                         && (clientId == null || r.ClientId == clientId))
                .OrderBy(r => r.RequestedAt)
                .ToList());

        mock.Setup(r => r.GetHistoryForClientAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid clientId, CancellationToken _) => lista
                .Where(r => r.ClientId == clientId)
                .OrderByDescending(r => r.RequestedAt)
                .ToList());

        mock.Setup(r => r.GetForClientBetweenAsync(
                It.IsAny<Guid>(), It.IsAny<DateTime?>(), It.IsAny<DateTime?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid clientId, DateTime? from, DateTime? to, CancellationToken _) => lista
                .Where(r => r.ClientId == clientId
                         && (from == null || r.RequestedAt >= from)
                         && (to   == null || r.RequestedAt <= to))
                .ToList());

        return mock;
    }

    public static Mock<ITicketRepository> Tickets(params SupportTicket[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<ITicketRepository, SupportTicket>(lista);

        mock.Setup(r => r.GetAssignedUserIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) =>
                lista.FirstOrDefault(t => t.Id == id)?.AssignedToUserId);

        mock.Setup(r => r.GetByIdIgnoringClientFilterAsync(
                It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(t => t.Id == id));

        mock.Setup(r => r.GetForClientBetweenAsync(
                It.IsAny<Guid>(), It.IsAny<DateTime?>(), It.IsAny<DateTime?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid clientId, DateTime? from, DateTime? to, CancellationToken _) => lista
                .Where(t => t.ClientId == clientId
                         && (from == null || t.CreatedAt >= from)
                         && (to   == null || t.CreatedAt <= to))
                .ToList());

        mock.Setup(r => r.GetSummaryAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(t => t.Id == id));

        mock.Setup(r => r.GetWithClientAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(t => t.Id == id));

        mock.Setup(r => r.GetOpenLoadByTechnicianAsync(
                It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyCollection<Guid> ids, CancellationToken _) => lista
                .Where(t => t.AssignedToUserId.HasValue
                         && ids.Contains(t.AssignedToUserId.Value)
                         && TicketVivo.Contains(t.Status))
                .GroupBy(t => t.AssignedToUserId!.Value)
                .ToDictionary(
                    g => g.Key,
                    g => new TechnicianLoad(
                        g.Count(), g.Count(t => t.Priority == TicketPriority.Critica))));

        mock.Setup(r => r.GetLastAssignmentByTechnicianAsync(
                It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyCollection<Guid> ids, CancellationToken _) => lista
                .Where(t => t.AssignedToUserId.HasValue && ids.Contains(t.AssignedToUserId.Value))
                .GroupBy(t => t.AssignedToUserId!.Value)
                .ToDictionary(g => g.Key, g => g.Max(t => t.CreatedAt)));

        mock.Setup(r => r.GetDetailAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(t => t.Id == id));

        mock.Setup(r => r.GetForClientAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid clientId, CancellationToken _) => lista
                .Where(t => t.ClientId == clientId)
                .OrderByDescending(t => t.CreatedAt)
                .ToList());

        mock.Setup(r => r.GetOverdueSlaAsync(
                It.IsAny<DateTime>(), It.IsAny<DateTime?>(), It.IsAny<DateTime?>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((DateTime now, DateTime? from, DateTime? to, string? tec, CancellationToken _) => lista
                .Where(t => t.DueDate.HasValue && t.DueDate.Value < now
                         && !SlaCerrado.Contains(t.Status)
                         && (from == null || t.CreatedAt >= from)
                         && (to   == null || t.CreatedAt <= to)
                         && (string.IsNullOrWhiteSpace(tec)
                             || (t.AssignedTo != null
                                 && t.AssignedTo.FullName.ToUpper().Contains(tec.ToUpper()))))
                .OrderBy(t => t.DueDate)
                .ToList());

        mock.Setup(r => r.GetSlaTrackedAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync((CancellationToken _) => lista
                .Where(t => t.DueDate.HasValue && !SlaCerrado.Contains(t.Status))
                .Select(t => new SlaTrackedTicket(
                    t.Id, t.TicketNumber, t.Subject, t.Priority, t.Status,
                    t.Client?.FullName ?? "", t.AssignedTo?.FullName,
                    t.CreatedAt, t.DueDate!.Value))
                .ToList());

        // El filtrado real vive en el repositorio; aquí se reproduce lo que los
        // tests del listado necesitan distinguir (estado, prioridad, asignado).
        mock.Setup(r => r.GetPagedAsync(
                It.IsAny<TicketListFilter>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((TicketListFilter f, CancellationToken _) =>
            {
                var q = lista.AsEnumerable();

                if (!string.IsNullOrEmpty(f.Status) && f.Status != "all"
                    && Enum.TryParse<TicketStatus>(f.Status, out var st))
                    q = q.Where(t => t.Status == st);

                if (!string.IsNullOrEmpty(f.Priority) && f.Priority != "all"
                    && Enum.TryParse<TicketPriority>(f.Priority, out var pr))
                    q = q.Where(t => t.Priority == pr);

                if (!string.IsNullOrEmpty(f.Type) && f.Type != "all"
                    && Enum.TryParse<TicketType>(f.Type, out var tp))
                    q = q.Where(t => t.Type == tp);

                if (f.AssignedToId.HasValue)
                    q = q.Where(t => t.AssignedToUserId == f.AssignedToId.Value);

                if (f.OverdueSlaBefore is DateTime antes)
                    q = q.Where(t => t.DueDate.HasValue && t.DueDate.Value < antes
                                  && !SlaCerrado.Contains(t.Status));

                if (f.SlaCompliant.HasValue)
                    q = q.Where(t => t.SlaCompliant == f.SlaCompliant.Value);

                var todos = q.OrderBy(t => t.CreatedAt).ToList();
                var pag   = todos.Skip((f.Page - 1) * f.PageSize).Take(f.PageSize).ToList();
                return (pag, todos.Count);
            });

        return mock;
    }

    /// <summary>Estados en que el ticket sigue ocupando a un técnico.</summary>
    private static readonly TicketStatus[] TicketVivo =
    [
        TicketStatus.Abierto,
        TicketStatus.EnProceso,
        TicketStatus.PendienteCliente,
    ];

    private static readonly TicketStatus[] SlaCerrado =
    [
        TicketStatus.Resuelto,
        TicketStatus.Cerrado,
        TicketStatus.PendienteCliente,
    ];

    public static Mock<IUserRepository> Users(params UserSystem[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<IUserRepository, UserSystem>(lista);

        mock.Setup(r => r.GetByIdIncludingDeletedAsync(
                It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(u => u.Id == id));

        mock.Setup(r => r.GetNamesByIdsAsync(
                It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyCollection<Guid> ids, CancellationToken _) => lista
                .Where(u => ids.Contains(u.Id))
                .ToDictionary(u => u.Id, u => u.FullName));

        mock.Setup(r => r.GetActiveTechniciansAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(() => lista
                .Where(u => u.Role == UserRole.Tecnico && u.Status == UserStatus.Activo)
                .OrderBy(u => u.FullName)
                .ToList());

        return mock;
    }

    public static Mock<ITicketCommentRepository> Comments(params TicketComment[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<ITicketCommentRepository, TicketComment>(lista);

        mock.Setup(r => r.GetForTicketAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid ticketId, CancellationToken _) => lista
                .Where(c => c.TicketId == ticketId).OrderBy(c => c.CreatedAt).ToList());

        return mock;
    }

    public static Mock<ITicketWorkLogRepository> WorkLogs(params TicketWorkLog[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<ITicketWorkLogRepository, TicketWorkLog>(lista);

        mock.Setup(r => r.GetForTicketAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid ticketId, CancellationToken _) => lista
                .Where(w => w.TicketId == ticketId).OrderByDescending(w => w.LoggedAt).ToList());

        return mock;
    }

    public static Mock<ITicketVisitRepository> Visits(params TicketVisit[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<ITicketVisitRepository, TicketVisit>(lista);

        mock.Setup(r => r.GetForTicketAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid ticketId, CancellationToken _) => lista
                .Where(v => v.TicketId == ticketId).OrderBy(v => v.ScheduledAt).ToList());

        mock.Setup(r => r.GetLatestScheduledAsync(
                It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid ticketId, CancellationToken _) => lista
                .Where(v => v.TicketId == ticketId && v.Status == VisitStatus.Programada)
                .OrderByDescending(v => v.ScheduledAt)
                .FirstOrDefault());

        mock.Setup(r => r.GetTechnicianDayAsync(
                It.IsAny<Guid>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid tec, DateTime fecha, CancellationToken _) => lista
                .Where(v => v.TechnicianId == tec && v.ScheduledAt.Date == fecha.Date
                         && v.Status != VisitStatus.Cancelada)
                .OrderBy(v => v.ScheduledAt)
                .ToList());

        mock.Setup(r => r.GetCalendarRangeAsync(
                It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<Guid?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync((DateTime desde, DateTime hasta, Guid? tec, CancellationToken _) => lista
                .Where(v => v.Status == VisitStatus.Programada
                         && v.ScheduledAt.Date >= desde.Date && v.ScheduledAt.Date <= hasta.Date
                         && (tec == null || v.TechnicianId == tec))
                .OrderBy(v => v.ScheduledAt)
                .ToList());

        return mock;
    }

    public static Mock<ISlaPlanRepository> SlaPlans(params SlaPlan[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<ISlaPlanRepository, SlaPlan>(lista);

        mock.Setup(r => r.GetActiveByPriorityAsync(
                It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string priority, CancellationToken _) =>
                lista.FirstOrDefault(p => p.Priority == priority && p.IsActive));

        return mock;
    }

    /// <summary>
    /// IScheduleRepository no hereda del genérico —solo tiene dos lecturas— así
    /// que este mock se arma desde cero en vez de partir de RepoMock.
    /// </summary>
    public static Mock<IScheduleRepository> Schedules(BusinessSchedule? schedule = null)
    {
        var mock = new Mock<IScheduleRepository>();

        mock.Setup(r => r.GetActiveAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(schedule);

        mock.Setup(r => r.GetActiveByIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) =>
                schedule is not null && schedule.Id == id ? schedule : null);

        return mock;
    }

    public static Mock<IPaymentRepository> Payments(params Payment[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<IPaymentRepository, Payment>(lista);

        mock.Setup(r => r.GetHistoryForClientAsync(
                It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid clientId, CancellationToken _) => lista
                .Where(p => p.ClientId == clientId)
                .OrderByDescending(p => p.PaidAt)
                .ToList());

        return mock;
    }

    public static Mock<IDistributionBoxRepository> Boxes(params DistributionBox[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<IDistributionBoxRepository, DistributionBox>(lista);

        mock.Setup(r => r.GetByIdWithZoneAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(b => b.Id == id));

        mock.Setup(r => r.GetWithZoneAsync(
                It.IsAny<Guid?>(), It.IsAny<DistributionBoxStatus?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid? zone, DistributionBoxStatus? st, CancellationToken _) =>
                lista.Where(b => (zone is null || b.ZoneId == zone)
                              && (st   is null || b.Estado == st)).ToList());

        mock.Setup(r => r.CountActiveByZoneAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(lista.Where(b => b.Estado == DistributionBoxStatus.Activo)
                               .GroupBy(b => b.ZoneId)
                               .ToDictionary(g => g.Key, g => g.Count()));

        return mock;
    }
}
