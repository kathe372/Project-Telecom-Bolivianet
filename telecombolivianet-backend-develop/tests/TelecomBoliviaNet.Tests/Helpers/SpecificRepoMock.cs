using System.Linq.Expressions;
using Moq;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
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
        var mock  = RepoMock.Of<IInstallationRepository, Installation>(items);

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
        var mock  = RepoMock.Of<IClientRepository, Client>(items);

        mock.Setup(r => r.GetWithPlanAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, CancellationToken _) => lista.FirstOrDefault(c => c.Id == id));

        mock.Setup(r => r.GetWithGpsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ClientMapPoint>());

        return mock;
    }

    public static Mock<IDistributionBoxRepository> Boxes(params DistributionBox[] items)
    {
        var lista = items.ToList();
        var mock  = RepoMock.Of<IDistributionBoxRepository, DistributionBox>(items);

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
