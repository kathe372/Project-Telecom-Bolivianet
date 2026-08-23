using MediatR;
using Microsoft.Extensions.Configuration;
using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Users.Queries;

public record GetUsersListQuery(
    int     Page       = 1,
    int     PageSize   = 20,
    string? RoleFilter = null,
    string? Search     = null) : IRequest<PagedResult<UserSystemDto>>;

public class GetUsersListHandler : IRequestHandler<GetUsersListQuery, PagedResult<UserSystemDto>>
{
    private readonly IUserRepository _repo;
    private readonly string          _botEmail;

    public GetUsersListHandler(
        IUserRepository repo,
        IConfiguration  config)
    {
        _repo     = repo;
        _botEmail = (config["SISTEMA_BOT_EMAIL"] ?? "bot@telecombolivianet.bo").ToLower();
    }

    public async Task<PagedResult<UserSystemDto>> Handle(
        GetUsersListQuery q, CancellationToken ct)
    {
        UserRole? role = null;
        if (!string.IsNullOrWhiteSpace(q.RoleFilter) &&
            Enum.TryParse<UserRole>(q.RoleFilter, out var parsed))
            role = parsed;

        // El filtrado, el conteo y el Skip/Take se resuelven en SQL dentro del
        // repositorio. Antes el handler componía el IQueryable, lo que obligaba a
        // referenciar EF Core desde la capa de casos de uso.
        var (items, total) = await _repo.GetPagedAsync(
            _botEmail, role, q.Search, q.Page, q.PageSize, ct);

        return new PagedResult<UserSystemDto>(items.Select(UserMapper.ToDto), total, q.Page, q.PageSize);
    }
}
