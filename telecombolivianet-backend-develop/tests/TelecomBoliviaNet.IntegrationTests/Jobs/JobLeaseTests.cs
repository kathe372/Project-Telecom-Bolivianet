using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Infrastructure.Data;
using TelecomBoliviaNet.Infrastructure.Jobs;

namespace TelecomBoliviaNet.IntegrationTests.Jobs;

/// <summary>
/// Pruebas del lease de exclusión entre réplicas (Fase 2).
///
/// Se ejecutan contra PostgreSQL real porque lo que se prueba ES el
/// comportamiento de <c>pg_try_advisory_lock</c>: con un mock no se estaría
/// probando nada. Dos <see cref="AppDbContext"/> distintos abren dos sesiones
/// distintas, que es exactamente lo que ocurre con dos réplicas del backend.
/// </summary>
public class JobLeaseTests : IClassFixture<MigratedDatabaseFixture>
{
    private readonly MigratedDatabaseFixture _fixture;
    public JobLeaseTests(MigratedDatabaseFixture fixture) => _fixture = fixture;

    private AppDbContext NuevaSesion()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(_fixture.ConnectionString, npgsql => npgsql.UseNetTopologySuite())
            .Options;
        return new AppDbContext(options);
    }

    [Fact]
    public async Task Dos_instancias_no_ejecutan_el_mismo_job_a_la_vez()
    {
        await using var replicaA = NuevaSesion();
        await using var replicaB = NuevaSesion();

        var ejecuciones = 0;
        var dentro = new TaskCompletionSource();
        var suelta = new TaskCompletionSource();

        // La réplica A entra y se queda dentro del lock hasta que se le diga.
        var tareaA = JobLease.TryRunExclusiveAsync(replicaA, "test-exclusion", async () =>
        {
            Interlocked.Increment(ref ejecuciones);
            dentro.SetResult();
            await suelta.Task;
        });

        await dentro.Task;   // garantiza que A YA tiene el lock

        var ejecutoB = await JobLease.TryRunExclusiveAsync(replicaB, "test-exclusion",
            () => { Interlocked.Increment(ref ejecuciones); return Task.CompletedTask; });

        suelta.SetResult();

        (await tareaA).Should().BeTrue("la primera réplica debe ejecutar");
        ejecutoB.Should().BeFalse("la segunda debe encontrarse el lease tomado");
        ejecuciones.Should().Be(1, "el trabajo se hace UNA vez, no dos");
    }

    [Fact]
    public async Task El_lock_se_libera_cuando_el_trabajo_lanza_una_excepcion()
    {
        await using var replicaA = NuevaSesion();
        await using var replicaB = NuevaSesion();

        var act = () => JobLease.TryRunExclusiveAsync(replicaA, "test-excepcion",
            () => throw new InvalidOperationException("fallo simulado del job"));

        await act.Should().ThrowAsync<InvalidOperationException>();

        // Si el finally no hubiera liberado, este job quedaría bloqueado hasta
        // reiniciar el contenedor: un fallo transitorio se volvería permanente.
        var segundo = await JobLease.TryRunExclusiveAsync(replicaB, "test-excepcion",
            () => Task.CompletedTask);

        segundo.Should().BeTrue("un fallo del trabajo no puede dejar el lease tomado");
    }

    [Fact]
    public async Task El_lock_se_libera_al_terminar_bien()
    {
        await using var replicaA = NuevaSesion();
        await using var replicaB = NuevaSesion();

        (await JobLease.TryRunExclusiveAsync(replicaA, "test-secuencial", () => Task.CompletedTask))
            .Should().BeTrue();

        (await JobLease.TryRunExclusiveAsync(replicaB, "test-secuencial", () => Task.CompletedTask))
            .Should().BeTrue("terminado el primero, el segundo debe poder entrar");
    }

    [Fact]
    public async Task Jobs_distintos_no_se_bloquean_entre_si()
    {
        await using var replicaA = NuevaSesion();
        await using var replicaB = NuevaSesion();

        var dentro = new TaskCompletionSource();
        var suelta = new TaskCompletionSource();

        var tareaA = JobLease.TryRunExclusiveAsync(replicaA, "job-facturacion", async () =>
        {
            dentro.SetResult();
            await suelta.Task;
        });

        await dentro.Task;

        // Clave distinta: que la facturación esté corriendo no puede impedir que
        // se limpien tokens caducados.
        var otroJob = await JobLease.TryRunExclusiveAsync(replicaB, "job-limpieza-tokens",
            () => Task.CompletedTask);

        suelta.SetResult();
        await tareaA;

        otroJob.Should().BeTrue();
    }

    [Theory]
    [InlineData("AutoSuspendClientJob")]
    [InlineData("BillingBackgroundJob")]
    [InlineData("")]
    public void El_hash_del_nombre_es_estable_entre_procesos(string clave)
    {
        // Valores fijos calculados con FNV-1a 64. No es una comprobación
        // decorativa: si alguien sustituyera esto por string.GetHashCode(), en
        // local seguiría "funcionando" (un solo proceso) y en producción cada
        // réplica tomaría un lock distinto, sin exclusión ninguna y sin ningún
        // síntoma visible hasta la doble facturación.
        var esperado = Fnv1a64(clave);
        JobLease.StableHash(clave).Should().Be(esperado);

        // Y llamarlo dos veces da lo mismo, obviamente.
        JobLease.StableHash(clave).Should().Be(JobLease.StableHash(clave));
    }

    private static long Fnv1a64(string s)
    {
        unchecked
        {
            ulong hash = 14695981039346656037;
            foreach (var c in s) { hash ^= c; hash *= 1099511628211; }
            return (long)hash;
        }
    }
}
