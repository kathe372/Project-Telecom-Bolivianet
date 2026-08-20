using MediatR;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Coverage.Commands;

/// <summary>Marca un puerto LIBRE como dañado (reduce la capacidad usable de la caja).</summary>
public record MarkNapPortDamagedCommand(Guid BoxId, int Numero) : IRequest<Result>;

/// <summary>Repara un puerto dañado (vuelve a LIBRE y restituye la capacidad).</summary>
public record RepairNapPortCommand(Guid BoxId, int Numero) : IRequest<Result>;

public class MarkNapPortDamagedHandler : IRequestHandler<MarkNapPortDamagedCommand, Result>
{
    private readonly INapPortService _napPorts;
    public MarkNapPortDamagedHandler(INapPortService napPorts) => _napPorts = napPorts;

    public async Task<Result> Handle(MarkNapPortDamagedCommand cmd, CancellationToken ct)
        => await _napPorts.MarkDamagedAsync(cmd.BoxId, cmd.Numero, ct)
            ? Result.Success()
            : Result.Failure("No se pudo marcar el puerto como dañado (no existe o no está libre).");
}

public class RepairNapPortHandler : IRequestHandler<RepairNapPortCommand, Result>
{
    private readonly INapPortService _napPorts;
    public RepairNapPortHandler(INapPortService napPorts) => _napPorts = napPorts;

    public async Task<Result> Handle(RepairNapPortCommand cmd, CancellationToken ct)
        => await _napPorts.RepairAsync(cmd.BoxId, cmd.Numero, ct)
            ? Result.Success()
            : Result.Failure("No se pudo reparar el puerto (no existe o no está dañado).");
}
