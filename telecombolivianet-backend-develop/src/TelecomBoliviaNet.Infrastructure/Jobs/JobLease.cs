using System.Data;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Jobs;

/// <summary>
/// Exclusión mutua entre réplicas para las tareas periódicas, apoyada en los
/// <i>advisory locks</i> de PostgreSQL.
///
/// <para><b>El problema que resuelve.</b> Los jobs de este proyecto siguen el
/// patrón leer → decidir → ejecutar → marcar, y marcan AL FINAL
/// (<see cref="JobRunTracker"/>). Con dos instancias del backend —escalado
/// horizontal, o los segundos en que conviven la vieja y la nueva durante un
/// despliegue— ambas leen "última corrida = ayer" y ambas ejecutan:</para>
///
/// <code>
/// t=0    Réplica A: lee lastRun=ayer → decide ejecutar
/// t=0    Réplica B: lee lastRun=ayer → decide ejecutar     ← nadie se lo impide
/// t=0-5  Ambas facturan / suspenden / envían el mismo WhatsApp
/// t=5    Ambas marcan lastRun=hoy
/// </code>
///
/// <para>El resultado sería doble facturación y clientes recibiendo dos veces el
/// aviso de corte. Por eso el sistema tenía un techo de UNA réplica.</para>
///
/// <para><b>Por qué un advisory lock y no una tabla de locks.</b>
/// <c>pg_try_advisory_lock</c> es no bloqueante (devuelve false en vez de esperar)
/// y vive atado a la SESIÓN: si el contenedor muere a mitad de la ejecución,
/// PostgreSQL libera el lock solo, al cerrarse la conexión. No hay TTL que
/// calibrar ni filas zombis que limpiar — que es justo lo que se complica con una
/// tabla propia.</para>
///
/// <para>Tampoco hace falta Hangfire ni Quartz: el proyecto ya usa este mismo
/// patrón en el worker Python del notifier. Ver ADR-002.</para>
/// </summary>
public static class JobLease
{
    /// <summary>
    /// Ejecuta <paramref name="work"/> solo si esta instancia consigue el lock de
    /// <paramref name="jobKey"/>.
    /// </summary>
    /// <returns>
    /// <c>true</c> si se ejecutó; <c>false</c> si otra réplica tenía el lease.
    /// Devolver <c>false</c> NO es un error: es el caso normal en la instancia
    /// que no toca.
    /// </returns>
    public static async Task<bool> TryRunExclusiveAsync(
        AppDbContext db, string jobKey, Func<Task> work, CancellationToken ct = default)
    {
        var lockId = StableHash(jobKey);

        // El lock vive en la SESIÓN, así que la conexión debe permanecer abierta
        // durante todo el trabajo. EF la abre y la cierra por comando, de modo que
        // hay que tomarla explícitamente: si se dejara a EF, el lock se liberaría
        // al terminar el primer SELECT y la exclusión sería ficticia.
        var conn      = db.Database.GetDbConnection();
        var wasClosed = conn.State != ConnectionState.Open;
        if (wasClosed) await conn.OpenAsync(ct);

        try
        {
            if (!await TryLockAsync(conn, lockId, ct)) return false;

            try
            {
                await work();
                return true;
            }
            finally
            {
                // En finally a propósito: si el trabajo lanza, el lock DEBE
                // liberarse igual o el job quedaría bloqueado hasta que se
                // reiniciara el contenedor.
                await UnlockAsync(conn, lockId, ct);
            }
        }
        finally
        {
            if (wasClosed) await conn.CloseAsync();
        }
    }

    private static async Task<bool> TryLockAsync(DbConnection conn, long id, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT pg_try_advisory_lock(@id)";
        AddIdParameter(cmd, id);
        return (bool)(await cmd.ExecuteScalarAsync(ct))!;
    }

    private static async Task UnlockAsync(DbConnection conn, long id, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT pg_advisory_unlock(@id)";
        AddIdParameter(cmd, id);

        // Sin token: liberar el lock no debe cancelarse aunque el job se esté
        // apagando por SIGTERM. Si se cancelara aquí, el lock quedaría tomado
        // hasta que la conexión se cerrara por su cuenta.
        await cmd.ExecuteScalarAsync(CancellationToken.None);
    }

    private static void AddIdParameter(DbCommand cmd, long id)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = "@id";
        p.Value         = id;
        cmd.Parameters.Add(p);
    }

    /// <summary>
    /// Hash determinista (FNV-1a de 64 bits) del nombre del job.
    ///
    /// <b>No usar <c>string.GetHashCode()</c>:</b> en .NET Core está aleatorizado
    /// por proceso, así que dos réplicas calcularían identificadores de lock
    /// distintos, cada una tomaría el suyo y la exclusión no serviría de nada —
    /// con el agravante de que en local, con un solo proceso, todo parecería
    /// funcionar.
    /// </summary>
    internal static long StableHash(string s)
    {
        unchecked
        {
            const ulong offsetBasis = 14695981039346656037;
            const ulong prime        = 1099511628211;

            var hash = offsetBasis;
            foreach (var c in s)
            {
                hash ^= c;
                hash *= prime;
            }
            return (long)hash;
        }
    }
}
