using MediatR;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Installations.Queries;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Installations.Commands;

public record CreateInstallationAdminCommand(
    CreateInstallationAdminDto Dto,
    Guid   ActorId,
    string ActorName,
    string ClientIp) : IRequest<Result<InstallationDetailDto>>;

public class CreateInstallationAdminHandler
    : IRequestHandler<CreateInstallationAdminCommand, Result<InstallationDetailDto>>
{
    private readonly ISender _sender;

    public CreateInstallationAdminHandler(ISender sender) => _sender = sender;

    public async Task<Result<InstallationDetailDto>> Handle(
        CreateInstallationAdminCommand cmd, CancellationToken ct)
    {
        var dto     = cmd.Dto;
        var dtoBase = new CreateInstallationDto
        {
            ClienteId  = dto.ClienteId,
            PlanId     = dto.PlanId,
            Fecha      = dto.Fecha,
            HoraInicio = dto.HoraInicio,
            Direccion  = dto.Direccion,
            Notas      = dto.Notas,
        };

        var crearResult = await _sender.Send(
            new CreateInstallationCommand(dtoBase, cmd.ActorId, cmd.ActorName, cmd.ClientIp), ct);

        if (!crearResult.IsSuccess)
            return Result<InstallationDetailDto>.Failure(crearResult.ErrorMessage!);

        var instId = Guid.Parse(crearResult.Value!.InstalacionId);

        if (dto.TecnicoId.HasValue)
        {
            await _sender.Send(
                new AssignTechnicianCommand(
                    instId,
                    new AssignTechnicianDto { TecnicoId = dto.TecnicoId.Value },
                    cmd.ActorId, cmd.ActorName, cmd.ClientIp), ct);
        }

        var detalle = await _sender.Send(new GetInstallationDetailQuery(instId), ct);
        return detalle is not null
            ? Result<InstallationDetailDto>.Success(detalle)
            : Result<InstallationDetailDto>.Failure("Error al obtener detalle.");
    }
}
