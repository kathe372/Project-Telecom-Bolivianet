using MediatR;
using TelecomBoliviaNet.Application.Clients.Helpers;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Clients.Queries;

public record GetClientsQuery(ClientFilterDto Filter) : IRequest<PagedResult<ClientListItemDto>>;

public class GetClientsHandler : IRequestHandler<GetClientsQuery, PagedResult<ClientListItemDto>>
{
    private readonly IClientRepository _clientRepo;

    public GetClientsHandler(IClientRepository clientRepo) => _clientRepo = clientRepo;

    public async Task<PagedResult<ClientListItemDto>> Handle(GetClientsQuery q, CancellationToken ct)
    {
        var filter = q.Filter;

        // Los dados de baja solo aparecen si el operador no filtra por estado o
        // los pide explícitamente; el resto de vistas los deja fuera.
        var includeBaja = string.IsNullOrWhiteSpace(filter.Status)
                          || filter.Status == "all"
                          || filter.Status == "DadoDeBaja";

        var (clients, total) = await _clientRepo.GetPagedAsync(new ClientListFilter(
            Search:         filter.Search,
            Status:         filter.Status,
            PlanId:         filter.PlanId,
            DebtFilter:     filter.DebtFilter,
            SortBy:         filter.SortBy,
            IncludeDeleted: includeBaja,
            Page:           filter.PageNumber,
            PageSize:       filter.PageSize), ct);

        var items = clients.Select(c => new ClientListItemDto(
            c.Id, c.TbnCode, c.FullName, c.Zone,
            c.PhoneMain, c.Plan?.Name ?? "—",
            c.HasTvCable, c.Status.ToString(),
            ClientProjectionHelpers.CalcDebt(c.Invoices),
            ClientProjectionHelpers.CalcPendingMonths(c.Invoices),
            c.SuspendedAt));

        return new PagedResult<ClientListItemDto>(items, total, filter.PageNumber, filter.PageSize);
    }
}
