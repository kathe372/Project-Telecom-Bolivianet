using TelecomBoliviaNet.Application.Interfaces;
﻿using FluentValidation;
using Microsoft.Extensions.Caching.Memory;
using TelecomBoliviaNet.Application.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Presentation.Configuration;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Auth;

[Route("api/auth")]
public class AuthController : BaseController
{
    private readonly AuthService                   _authService;
    private readonly ISessionService               _sessions;
    private readonly IPasswordChangeService        _passwords;
    private readonly IValidator<LoginDto>          _loginValidator;
    private readonly IValidator<ChangePasswordDto> _changePassValidator;
    private readonly IMemoryCache                  _cache;

    public const string RefreshTokenCookieName = "rt";

    public AuthController(
        AuthService                    authService,
        ISessionService                sessions,
        IPasswordChangeService         passwords,
        IValidator<LoginDto>           loginValidator,
        IValidator<ChangePasswordDto>  changePassValidator,
        IMemoryCache                   cache)
    {
        _authService         = authService;
        _sessions    = sessions;
        _passwords   = passwords;
        _loginValidator      = loginValidator;
        _changePassValidator = changePassValidator;
        _cache               = cache;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimitConfiguration.AuthPolicy)]
    [ProducesResponseType(typeof(LoginResponseDto), 200)]
    [ProducesResponseType(401)]
    [ProducesResponseType(429)]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        var validation = await _loginValidator.ValidateAsync(dto);
        if (!validation.IsValid)
            return BadRequest(new
            {
                success = false,
                errors  = validation.Errors.Select(e => e.ErrorMessage)
            });

        var result = await _authService.LoginAsync(dto, ClientIp);
        if (!result.IsSuccess)
            return Unauthorized(new { success = false, message = result.ErrorMessage });

        SetRefreshTokenCookie(result.Value!.RefreshToken);

        return OkResult(result.Value! with { RefreshToken = string.Empty });
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimitConfiguration.AuthPolicy)]
    [ProducesResponseType(typeof(RefreshResponseDto), 200)]
    [ProducesResponseType(401)]
    [ProducesResponseType(429)]
    public async Task<IActionResult> Refresh()
    {
        if (!Request.Cookies.TryGetValue(RefreshTokenCookieName, out var rawRefreshToken)
            || string.IsNullOrWhiteSpace(rawRefreshToken))
            return Unauthorized(new { success = false, message = "Sesión expirada. Inicia sesión nuevamente." });

        var result = await _sessions.RefreshAsync(rawRefreshToken, ClientIp);
        if (!result.IsSuccess)
        {
            DeleteRefreshTokenCookie();
            return Unauthorized(new { success = false, message = result.ErrorMessage });
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken);

        return OkResult(new { Token = result.Value!.Token });
    }

    [HttpPost("logout")]
    [Authorize]
    [ProducesResponseType(200)]
    [ProducesResponseType(401)]
    public async Task<IActionResult> Logout()
    {
        Request.Cookies.TryGetValue(RefreshTokenCookieName, out var rawRefreshToken);

        await _sessions.LogoutAsync(
            RawToken,
            rawRefreshToken,
            CurrentUserId, CurrentUserName, ClientIp);

        // Sin esto, el negativo cacheado por el middleware mantendría el token
        // utilizable hasta 2 minutos después del logout.
        Middleware.TokenBlacklistMiddleware.MarkRevoked(_cache, RawToken);

        DeleteRefreshTokenCookie();

        return OkMessage("Sesion cerrada correctamente.");
    }

    [HttpPut("change-password")]
    [Authorize]
    [ProducesResponseType(200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(401)]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
    {
        var validation = await _changePassValidator.ValidateAsync(dto);
        if (!validation.IsValid)
            return BadRequest(new
            {
                success = false,
                errors  = validation.Errors.Select(e => e.ErrorMessage)
            });

        var result = await _passwords.ChangePasswordAsync(
            CurrentUserId, dto, ClientIp);

        if (!result.IsSuccess)
            return BadRequestResult(result.ErrorMessage);

        return OkMessage("Contrasena cambiada exitosamente.");
    }

    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType(200)]
    [ProducesResponseType(401)]
    public IActionResult Me()
    {
        return OkResult(new
        {
            UserId   = CurrentUserId,
            FullName = CurrentUserName,
            Role     = CurrentUserRole
        });
    }

    [HttpPost("refresh/mobile")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimitConfiguration.AuthPolicy)]
    [ProducesResponseType(200)]
    [ProducesResponseType(401)]
    [ProducesResponseType(429)]
    public async Task<IActionResult> RefreshMobile([FromBody] MobileRefreshDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.RefreshToken))
            return Unauthorized(new { success = false, message = "Refresh token requerido." });

        var result = await _sessions.RefreshAsync(dto.RefreshToken, ClientIp);
        if (!result.IsSuccess)
            return Unauthorized(new { success = false, message = result.ErrorMessage });

        return OkResult(new
        {
            Token        = result.Value!.Token,
            RefreshToken = result.Value!.RefreshToken,
        });
    }


    private void SetRefreshTokenCookie(string refreshToken)
    {
        Response.Cookies.Append(RefreshTokenCookieName, refreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure   = !HttpContext.Request.Host.Host.Contains("localhost"),
            SameSite = SameSiteMode.Strict,
            Expires  = DateTimeOffset.UtcNow.AddDays(AppConstants.Security.RefreshTokenExpDays),
            Path     = "/api/auth",
        });
    }

    private void DeleteRefreshTokenCookie()
    {
        Response.Cookies.Delete(RefreshTokenCookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure   = !HttpContext.Request.Host.Host.Contains("localhost"),
            SameSite = SameSiteMode.Strict,
            Path     = "/api/auth",
        });
    }
}

public record RefreshTokenDto(string RefreshToken);

public record LogoutDto(string? RefreshToken);
