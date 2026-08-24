using MediatR;
using TelecomBoliviaNet.Application.Clients.Helpers;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Clients.Queries;

public record SearchClientsQuery(ClientSearchDto Dto) : IRequest<ClientSearchResultDto>;

public class SearchClientsHandler : IRequestHandler<SearchClientsQuery, ClientSearchResultDto>
{
    private readonly IClientRepository _clientRepo;

    public SearchClientsHandler(IClientRepository clientRepo) => _clientRepo = clientRepo;

    public async Task<ClientSearchResultDto> Handle(SearchClientsQuery q, CancellationToken ct)
    {
        var dto = q.Dto;

        var (clients, total) = await _clientRepo.GetPagedAsync(new ClientListFilter(
            Search:     dto.Query,
            Status:     dto.Status,
            PlanId:     Guid.TryParse(dto.PlanId, out var planId) ? planId : null,
            Zone:       dto.Zone,
            HasEmail:   dto.HasEmail,
            DebtFilter: dto.HasDebt is bool hasDebt ? (hasDebt ? "debt" : "paid") : null,
            Page:       dto.Page,
            PageSize:   dto.PageSize), ct);

        var items = clients.Select(c => new ClientListItemDto(
            c.Id, c.TbnCode, c.FullName, c.Zone,
            c.PhoneMain, c.Plan?.Name ?? "—",
            c.HasTvCable, c.Status.ToString(),
            ClientProjectionHelpers.CalcDebt(c.Invoices),
            ClientProjectionHelpers.CalcPendingMonths(c.Invoices),
            c.SuspendedAt)).ToList();

        return new ClientSearchResultDto(items, total, dto.Page, dto.PageSize, dto.Query);
    }
}
