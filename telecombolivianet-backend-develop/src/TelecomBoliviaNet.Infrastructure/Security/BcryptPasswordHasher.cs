using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;

namespace TelecomBoliviaNet.Infrastructure.Security;

public sealed class BcryptPasswordHasher : IPasswordHasher
{
    private const int WorkFactor = 12;

    private readonly ILogger<BcryptPasswordHasher> _logger;

    public BcryptPasswordHasher(ILogger<BcryptPasswordHasher> logger)
        => _logger = logger;

    public string Hash(string plainPassword)
        => BCrypt.Net.BCrypt.HashPassword(plainPassword, WorkFactor);

    public bool Verify(string plainPassword, string hash)
    {
        try   { return BCrypt.Net.BCrypt.Verify(plainPassword, hash); }
        catch (Exception ex)
        {
            // Hash con formato inválido/corrupto: la verificación falla (correcto),
            // pero se registra porque suele indicar datos dañados (el usuario nunca podrá autenticarse).
            _logger.LogWarning(ex, "Hash almacenado con formato inválido — la verificación falla.");
            return false;
        }
    }
}
