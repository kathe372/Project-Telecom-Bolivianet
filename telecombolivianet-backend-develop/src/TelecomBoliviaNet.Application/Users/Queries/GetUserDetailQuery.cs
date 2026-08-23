using MediatR;
using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Users.Queries;

public record GetUserDetailQuery(Guid Id) : IRequest<UserSystemDetailDto?>;

public class GetUserDetailHandler : IRequestHandler<GetUserDetailQuery, UserSystemDetailDto?>
{
    private readonly IUserRepository _repo;

    public GetUserDetailHandler(IUserRepository repo) => _repo = repo;

    public async Task<UserSystemDetailDto?> Handle(GetUserDetailQuery q, CancellationToken ct)
    {
        // Incluye borrados a propósito: la ficha debe poder mostrar un usuario
        // dado de baja. Antes eso obligaba a llamar a IgnoreQueryFilters(), una
        // extensión de EF Core, desde el caso de uso.
        var user = await _repo.GetByIdIncludingDeletedAsync(q.Id, ct);

        return user is null ? null : UserMapper.ToDetailDto(user);
    }
}
