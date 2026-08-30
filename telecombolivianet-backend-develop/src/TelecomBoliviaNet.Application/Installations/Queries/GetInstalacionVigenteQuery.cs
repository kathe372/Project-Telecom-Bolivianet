using MediatR;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Installations.Queries;

/// <summary>
/// La instalación vigente de una persona, por su id de cliente o por su teléfono.
/// </summary>
/// <remarks>
/// OBS-04 — Existe para que el chatbot deje de resolver esto pidiendo el listado
/// general con <c>PageSize=100</c> y filtrando en memoria: para atender a una
/// persona leía los datos de las últimas cien que pasaron por la agenda. Con esta
/// consulta, el rol Bot ya no necesita acceso al listado general.
///
/// <para>El teléfono cubre también a los prospectos, que aún no son clientes y
/// por tanto no tienen id que pasar.</para>
/// </remarks>
public record GetInstalacionVigenteQuery(Guid? ClienteId, string? Telefono)
    : IRequest<InstallationDetailDto?>;

public class GetInstalacionVigenteHandler
    : IRequestHandler<GetInstalacionVigenteQuery, InstallationDetailDto?>
{
    private readonly IInstallationRepository _repo;

    public GetInstalacionVigenteHandler(IInstallationRepository repo) => _repo = repo;

    public async Task<InstallationDetailDto?> Handle(
        GetInstalacionVigenteQuery q, CancellationToken ct)
    {
        // Con prefijo de país y sin él: un mismo número puede estar guardado de
        // las dos formas. La regla es la misma que usa la búsqueda de clientes.
        var telefonos = PhoneLookup.Candidatos(q.Telefono);

        var inst = await _repo.GetVigenteAsync(q.ClienteId, telefonos, ct);
        return inst is null ? null : InstallationMapper.ToDetail(inst);
    }
}
