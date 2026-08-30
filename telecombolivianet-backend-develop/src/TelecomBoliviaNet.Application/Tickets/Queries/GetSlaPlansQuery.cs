using MediatR;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Application.Tickets.Mapping;

namespace TelecomBoliviaNet.Application.Tickets.Queries;

public record GetSlaPlansQuery : IRequest<IEnumerable<SlaPlanDto>>;

public class GetSlaPlansHandler : IRequestHandler<GetSlaPlansQuery, IEnumerable<SlaPlanDto>>
{
    private readonly IGenericRepository<SlaPlan> _slaPlanRepo;

    public GetSlaPlansHandler(IGenericRepository<SlaPlan> slaPlanRepo) => _slaPlanRepo = slaPlanRepo;

    public async Task<IEnumerable<SlaPlanDto>> Handle(GetSlaPlansQuery _, CancellationToken ct)
        // Catálogo diminuto (un plan por prioridad): ordenar en memoria no
        // cuesta nada y evita arrastrar EF hasta el caso de uso.
        => (await _slaPlanRepo.ListAsync())
           .OrderBy(p => p.Priority)
           .Select(TicketMapper.ToSlaPlan);
}
