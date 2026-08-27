namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Cuándo se bloquea una cuenta por intentos fallidos y cuándo se rehabilita.
///
/// <para>Estaba escrita en línea dentro de <c>AuthService.LoginAsync</c> (F5).
/// Es una regla pura —cuenta intentos y compara fechas, sin base de datos ni
/// reloj propio— y es la parte del inicio de sesión con consecuencias de
/// seguridad, así que merece probarse con una tabla de casos en vez de montando
/// un servicio con siete dependencias.</para>
///
/// <para>El bloqueo es <b>temporal</b> a propósito. Antes era permanente
/// (<c>Status = Bloqueado</c>): si el bloqueado era el único Admin, la única
/// salida era la variable <c>ADMIN_RESET_PASSWORD</c> y un redespliegue.</para>
/// </summary>
public static class LoginLockoutPolicy
{
    /// <summary>¿Sigue vigente el bloqueo en este instante?</summary>
    public static bool IsLockedAt(DateTime? lockedUntil, DateTime now)
        => lockedUntil is { } hasta && hasta > now;

    /// <summary>
    /// El bloqueo caducó y hay que limpiarlo: la cuenta se rehabilita sola y el
    /// contador arranca de cero.
    /// </summary>
    public static bool ShouldClearExpiredLock(DateTime? lockedUntil, DateTime now)
        => lockedUntil is not null && !IsLockedAt(lockedUntil, now);

    /// <summary>
    /// Estado del contador tras una contraseña incorrecta.
    /// </summary>
    /// <returns>
    /// El nuevo número de intentos y, si se alcanzó el tope, hasta cuándo queda
    /// bloqueada la cuenta. <c>null</c> en <c>LockedUntil</c> significa que aún
    /// le quedan oportunidades.
    /// </returns>
    public static (int FailedAttempts, DateTime? LockedUntil) RegisterFailure(
        int failedAttemptsSoFar, int maxAttempts, DateTime now, int lockoutMinutes)
    {
        var intentos = failedAttemptsSoFar + 1;

        return intentos >= maxAttempts
            ? (intentos, now.AddMinutes(lockoutMinutes))
            : (intentos, null);
    }
}
