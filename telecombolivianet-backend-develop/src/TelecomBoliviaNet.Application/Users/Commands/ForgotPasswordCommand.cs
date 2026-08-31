using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Users.Commands;

public record ForgotPasswordCommand(string Email) : IRequest<Result<ForgotPasswordResultDto>>;

public class ForgotPasswordHandler : IRequestHandler<ForgotPasswordCommand, Result<ForgotPasswordResultDto>>
{
    private readonly IGenericRepository<UserSystem>         _repo;
    private readonly IGenericRepository<PasswordResetToken> _resetRepo;
    private readonly IEmailService                          _email;
    private readonly IConfiguration                        _config;
    private readonly ILogger<ForgotPasswordHandler>         _logger;

    public ForgotPasswordHandler(
        IGenericRepository<UserSystem>         repo,
        IGenericRepository<PasswordResetToken> resetRepo,
        IEmailService                          email,
        IConfiguration                         config,
        ILogger<ForgotPasswordHandler>         logger)
    {
        _repo      = repo;
        _resetRepo = resetRepo;
        _email     = email;
        _config    = config;
        _logger    = logger;
    }

    public async Task<Result<ForgotPasswordResultDto>> Handle(
        ForgotPasswordCommand cmd, CancellationToken ct)
    {
        // ── La respuesta es SIEMPRE la misma, exista la cuenta o no ───────────
        //
        // Antes este endpoint distinguía cuatro situaciones para quien llamaba
        // sin credenciales: cuenta inexistente (400), desactivada (400),
        // pendiente de activación (400) y éxito (200). Con eso, cualquiera podía
        // probar direcciones y averiguar cuáles tienen cuenta en el sistema —y
        // hasta en qué estado está—.
        //
        // No es una fuga menor aquí: tres intentos fallidos bloquean una cuenta,
        // así que enumerar al personal permite después dejarlo a todo fuera.
        //
        // El motivo real se registra en el log del servidor, donde sí interesa.
        //
        // Lo que SÍ se sigue rechazando es una dirección mal formada: eso no
        // filtra nada —se puede decidir sin mirar la base— y sin la comprobación
        // se devolvía un 200 con un enmascarado sin sentido («***@»).
        if (string.IsNullOrWhiteSpace(cmd.Email) ||
            !System.Text.RegularExpressions.Regex.IsMatch(
                cmd.Email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
        {
            return Result<ForgotPasswordResultDto>.Failure(
                "El correo electrónico no tiene un formato válido.");
        }

        var respuestaUniforme = Result<ForgotPasswordResultDto>.Success(
            new ForgotPasswordResultDto(
                $"Si existe una cuenta con {UserMapper.MaskEmail(cmd.Email)}, " +
                "te enviamos el enlace de recuperación. Revisa tu correo.",
                "Email",
                UserMapper.MaskEmail(cmd.Email)));

        var user = await _repo.FirstOrDefaultAsync(u => u.Email.ToLower() == cmd.Email.ToLower());

        if (user is null)
        {
            _logger.LogInformation(
                "PASSWORD_RESET pedido para un correo sin cuenta: {Email}", cmd.Email);
            return respuestaUniforme;
        }

        if (user.Status is UserStatus.Inactivo or UserStatus.PendienteActivacion)
        {
            _logger.LogInformation(
                "PASSWORD_RESET pedido para cuenta en estado {Estado}: {Email}",
                user.Status, user.Email);
            return respuestaUniforme;
        }

        var prevTokens = await _resetRepo.ListAsync(
            t => t.UserId == user.Id && !t.Used && t.ExpiresAt > DateTime.UtcNow);

        foreach (var pt in prevTokens)
        {
            pt.Used = true;
            _resetRepo.Update(pt);
        }

        var token = Guid.NewGuid().ToString("N");
        var resetToken = new PasswordResetToken
        {
            UserId    = user.Id,
            Token     = token,
            ExpiresAt = DateTime.UtcNow.AddHours(1),
            Channel   = "Email",
            SentTo    = UserMapper.MaskEmail(user.Email),
        };
        await _resetRepo.AddAsync(resetToken);

        // D-13 — Un solo guardado para invalidar los enlaces anteriores y emitir
        // el nuevo. Antes se confirmaba uno por cada token viejo dentro del bucle
        // y otro al final: si fallaba el último, el usuario se quedaba con todos
        // sus enlaces anulados y ninguno nuevo, sin poder recuperar la cuenta
        // hasta volver a pedirlo. De paso desaparece el guardado por iteración.
        await _resetRepo.SaveChangesAsync();

        var frontendUrl = _config["App:FrontendUrl"]?.TrimEnd('/') ?? "http://localhost";
        var resetLink   = $"{frontendUrl}/reset-password?token={token}";

        try
        {
            await _email.SendPasswordResetAsync(user.Email, user.FullName, resetLink);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enviando email de reset a {Email}", user.Email);
        }

        _logger.LogInformation("PASSWORD_RESET solicitado para {Email}", user.Email);

        // La misma respuesta del caso «no existe»: desde fuera, indistinguible.
        return respuestaUniforme;
    }
}
