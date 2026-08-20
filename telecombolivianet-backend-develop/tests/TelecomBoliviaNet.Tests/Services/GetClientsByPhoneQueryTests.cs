using FluentAssertions;
using TelecomBoliviaNet.Application.Clients.Queries;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// 2026-08-05: PhoneMain no tiene constraint único — dos clientes distintos
/// (dos CIs) pueden compartir el mismo teléfono de contacto. Estos tests
/// cubren la detección de esa ambigüedad, que antes GetClientByPhoneQuery
/// (single, FirstOrDefaultAsync) resolvía en silencio eligiendo uno al azar.
/// </summary>
public class GetClientsByPhoneQueryTests
{
    private static GetClientByPhoneHandler MakeHandler(params Client[] clients)
        => new(RepoMock.Of(clients).Object);

    [Fact]
    public async Task SinCoincidencias_DevuelveListaVacia()
    {
        var handler = MakeHandler(TestEntityFactory.MakeClient(phoneMain: "70000001"));

        var result = await handler.Handle(
            new GetClientsByPhoneQuery("70000099"), CancellationToken.None);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task UnaSolaCoincidencia_DevuelveListaDeUno()
    {
        var handler = MakeHandler(TestEntityFactory.MakeClient(phoneMain: "70000001"));

        var result = await handler.Handle(
            new GetClientsByPhoneQuery("70000001"), CancellationToken.None);

        result.Should().HaveCount(1);
    }

    [Fact]
    public async Task DosClientesConMismoTelefono_DevuelveAmbos()
    {
        // Caso real: dos familiares (dos CIs distintos, ver TestEntityFactory)
        // con contratos separados que comparten el mismo teléfono de contacto.
        var c1 = TestEntityFactory.MakeClient(tbnCode: "TBN-001", fullName: "Juan Pérez", phoneMain: "70000001");
        var c2 = TestEntityFactory.MakeClient(tbnCode: "TBN-002", fullName: "María Pérez", phoneMain: "70000001");
        var handler = MakeHandler(c1, c2);

        var result = await handler.Handle(
            new GetClientsByPhoneQuery("70000001"), CancellationToken.None);

        result.Should().HaveCount(2);
        result.Select(c => c.TbnCode).Should().BeEquivalentTo("TBN-001", "TBN-002");
    }

    [Fact]
    public async Task CoincidePorPhoneSecondary_TambienSeIncluye()
    {
        var c1 = TestEntityFactory.MakeClient(tbnCode: "TBN-001", phoneMain: "70000001");
        var c2 = TestEntityFactory.MakeClient(tbnCode: "TBN-002", phoneMain: "70000002");
        c2.PhoneSecondary = "70000001";
        var handler = MakeHandler(c1, c2);

        var result = await handler.Handle(
            new GetClientsByPhoneQuery("70000001"), CancellationToken.None);

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task PrefijoPais591_SeNormalizaIgualQueLaVersionSingle()
    {
        var handler = MakeHandler(TestEntityFactory.MakeClient(phoneMain: "70000001"));

        var result = await handler.Handle(
            new GetClientsByPhoneQuery("59170000001"), CancellationToken.None);

        result.Should().HaveCount(1);
    }

    [Fact]
    public async Task GetClientByPhoneQuery_Single_SigueDevolviendoUnoSoloAunqueHayaDos()
    {
        // Compatibilidad hacia atrás: los callers que ya asumen 1 resultado
        // (ej. admin-notify.controller del chatbot) no deben romperse.
        var c1 = TestEntityFactory.MakeClient(tbnCode: "TBN-001", phoneMain: "70000001");
        var c2 = TestEntityFactory.MakeClient(tbnCode: "TBN-002", phoneMain: "70000001");
        var handler = MakeHandler(c1, c2);

        var result = await handler.Handle(
            new GetClientByPhoneQuery("70000001"), CancellationToken.None);

        result.Should().NotBeNull();
    }
}
