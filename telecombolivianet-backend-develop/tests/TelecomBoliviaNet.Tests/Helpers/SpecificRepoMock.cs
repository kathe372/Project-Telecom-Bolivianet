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
