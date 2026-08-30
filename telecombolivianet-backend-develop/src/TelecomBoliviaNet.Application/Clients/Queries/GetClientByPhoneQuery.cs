using MediatR;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Clients.Queries;

public record GetClientByPhoneQuery(string Phone) : IRequest<ClientBotDto?>;

/// <summary>
/// 2026-08-05: PhoneMain no tiene constraint único (solo IdentityCard/TbnCode
/// la tienen) — dos clientes distintos (dos CIs, ej. familiares) pueden
/// compartir el mismo teléfono de contacto. GetClientByPhoneQuery (single,
/// FirstOrDefaultAsync) sigue existiendo para los callers que ya asumen 1
/// resultado; esta query devuelve TODOS los que coincidan, para que el bot
/// pueda detectar la ambigüedad y preguntar con cuál cuenta continuar en vez
/// de elegir una arbitrariamente y esconder la otra.
/// </summary>
public record GetClientsByPhoneQuery(string Phone) : IRequest<List<ClientBotDto>>;

public class GetClientByPhoneHandler :
    IRequestHandler<GetClientByPhoneQuery, ClientBotDto?>,
    IRequestHandler<GetClientsByPhoneQuery, List<ClientBotDto>>
{
    private readonly IClientRepository _clientRepo;

    public GetClientByPhoneHandler(IClientRepository clientRepo) => _clientRepo = clientRepo;

    public async Task<ClientBotDto?> Handle(GetClientByPhoneQuery q, CancellationToken ct)
    {
        var matches = await FindByPhoneAsync(q.Phone, ct);
        return matches.FirstOrDefault();
    }

    public async Task<List<ClientBotDto>> Handle(GetClientsByPhoneQuery q, CancellationToken ct)
        => await FindByPhoneAsync(q.Phone, ct);

    private async Task<List<ClientBotDto>> FindByPhoneAsync(string rawPhoneInput, CancellationToken ct)
    {
        // Ambas formas —con prefijo de país y sin él—: un mismo cliente puede
        // estar registrado de cualquiera de las dos maneras. La regla vive en
        // PhoneLookup porque la búsqueda de instalaciones por teléfono la
        // necesita igual (OBS-04).
        var candidatos = PhoneLookup.Candidatos(rawPhoneInput);

        var clients = await _clientRepo.GetByAnyPhoneAsync(candidatos, ct);

        return clients.Select(client =>
        {
            // La deuda usa InvoiceDomainService.UnpaidStatuses (fuente única): incluye
            // Emitida/Enviada/ParcialmentePagada, no solo Pendiente|Vencida. Antes una
            // factura recién generada (Emitida) no contaba y el bot reportaba deuda cero.
            var pendingInvoices = client.Invoices.Where(i => i.IsUnpaid).ToList();

            return new ClientBotDto(
                Id:            client.Id.ToString(),
                TbnCode:       client.TbnCode,
                FullName:      client.FullName,
                PhoneMain:     client.PhoneMain,
                Status:        client.Status.ToString(),
                PlanId:        client.PlanId.ToString(),
                PlanName:      client.Plan?.Name ?? AppConstants.Display.SinDato,
                PlanSpeedMbps: client.Plan?.SpeedMb ?? 0,
                TotalDebt:     pendingInvoices.Sum(i => i.Outstanding),
                PendingMonths: pendingInvoices.Count(i => i.Type == InvoiceType.Mensualidad),
                Zone:          client.Zone);
        }).ToList();
    }
}
