using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace TelecomBoliviaNet.IntegrationTests.Configuration;

/// <summary>
/// Guardia del contenedor de dependencias.
///
/// Un registro que falta en <c>DependencyInjection.cs</c> NO rompe la
/// compilación: revienta en tiempo de ejecución, con un 500 la primera vez que
/// alguien abre la pantalla afectada. Estos tests construyen todos los
/// controladores y resuelven todos los servicios registrados, así que ese fallo
/// aparece en CI y no en producción.
///
/// Es la red de seguridad del paso F1.1, que sustituye 44 registros manuales de
/// <c>IGenericRepository&lt;T&gt;</c> por un único registro abierto. Ese cambio es
/// correcto pero invisible para el compilador: si un tipo se quedara fuera, solo
/// se notaría al usarlo.
/// </summary>
public class DependencyResolutionTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public DependencyResolutionTests(CustomWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public void Todos_los_controladores_se_pueden_construir()
    {
        using var scope = _factory.Services.CreateScope();
        var sp = scope.ServiceProvider;

        var controladores = typeof(Program).Assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract)
            .OrderBy(t => t.Name)
            .ToList();

        controladores.Should().NotBeEmpty("si esto sale vacío, el test no está probando nada");

        var fallos = new List<string>();
        foreach (var tipo in controladores)
        {
            try
            {
                // Los controladores no están en el contenedor (los activa MVC), pero
                // ActivatorUtilities resuelve su árbol de dependencias completo,
                // que es justo lo que interesa comprobar.
                ActivatorUtilities.CreateInstance(sp, tipo);
            }
            catch (Exception ex)
            {
                fallos.Add($"{tipo.Name}: {ex.InnerException?.Message ?? ex.Message}");
            }
        }

        fallos.Should().BeEmpty(
            "todo controlador debe poder construirse con lo registrado en DI:\n{0}",
            string.Join("\n", fallos));
    }

    [Fact]
    public void El_repositorio_generico_se_resuelve_para_TODAS_las_entidades_del_modelo()
    {
        using var scope = _factory.Services.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<TelecomBoliviaNet.Infrastructure.Data.AppDbContext>();

        // Ésta es la aserción que hace seguro el registro abierto de F1.1: en vez
        // de confiar en una lista escrita a mano, se recorre el modelo de EF y se
        // exige que exista repositorio para cada entidad real.
        var entidades = db.Model.GetEntityTypes()
            .Select(e => e.ClrType)
            .Where(t => typeof(TelecomBoliviaNet.Domain.Primitives.Entity).IsAssignableFrom(t))
            .Distinct()
            .OrderBy(t => t.Name)
            .ToList();

        entidades.Should().NotBeEmpty();

        var fallos = new List<string>();
        foreach (var entidad in entidades)
        {
            var repoType = typeof(TelecomBoliviaNet.Domain.Interfaces.IGenericRepository<>)
                .MakeGenericType(entidad);
            try
            {
                if (sp.GetService(repoType) is null)
                    fallos.Add($"{entidad.Name}: sin registro");
            }
            catch (Exception ex) { fallos.Add($"{entidad.Name}: {ex.Message}"); }
        }

        fallos.Should().BeEmpty(
            "toda entidad del modelo debe tener IGenericRepository<T> resoluble:\n{0}",
            string.Join("\n", fallos));
    }
}
