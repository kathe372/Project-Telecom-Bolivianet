using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace TelecomBoliviaNet.IntegrationTests.Schema;

/// <summary>
/// Guardia de paridad entre el modelo de EF y el esquema que producen LAS
/// MIGRACIONES.
///
/// Por qué existe: el protocolo habitual —"genera una migración; si sale vacía,
/// no rompiste nada"— NO funciona en este proyecto. Las 63 migraciones están
/// escritas a mano (varias tablas se crearon con SQL directo en producción), no
/// hay ni un archivo .Designer.cs, y `dotnet ef migrations
/// has-pending-model-changes` ya reporta deriva HOY, antes de tocar nada. Una
/// migración generada sale de 118 KB intentando recrear el esquema entero.
///
/// Estos tests no le preguntan a EF qué cree: levantan PostgreSQL, aplican las
/// migraciones y comparan contra information_schema. Es la red de seguridad de
/// las fases F5 (mover el mapeo de AppDbContext a IEntityTypeConfiguration) y
/// F6 (renombrar propiedades al inglés): si un refactor pierde un mapeo o un
/// HasColumnName, falla aquí y no en producción.
///
/// Ver ADR-004 y la sección C1 de PLAN_MEJORA_TECNICA_2026-08.md.
/// </summary>
public class SchemaParityTests : IClassFixture<MigratedDatabaseFixture>
{
    private readonly MigratedDatabaseFixture _fixture;

    public SchemaParityTests(MigratedDatabaseFixture fixture) => _fixture = fixture;

    /// <summary>
    /// Columnas que existen en la base pero que el modelo de EF no mapea.
    /// Se toleran porque son deuda heredada conocida; la lista SOLO puede
    /// encoger. Añadir entradas aquí requiere justificarlo en el PR.
    /// </summary>
    private static readonly HashSet<string> ColumnasHuerfanasConocidas =
        new(StringComparer.OrdinalIgnoreCase)
        {
            // 2026-08-20, línea base de la Fase 0. Cada entrada es deuda real
            // detectada al escribir este test; ninguna se añadió "para que pase".

            // Columna tsvector de búsqueda de texto completo creada por
            // 20260409000001_AddPerformanceIndexesAndPhase1Fixes. EF no la mapea
            // porque la búsqueda se hace con LIKE, no con to_tsquery. Nadie la
            // escribe, así que está vacía. La decide F7.2 —índices trigram— que
            // sigue pendiente porque hay que medir en producción primero.
            "Clients.search_vector",

            // Tabla NotifJobLog: la crea 20260427000001_AddNotifJobLogAndFixOutboxId
            // y no tiene entidad ni DbSet. NO es candidata a borrado: el notifier
            // Python la lee y la escribe por SQL directo (app/db/queries.py) para
            // saber cuándo corrió cada job por última vez. Borrarla rompería su
            // planificación. "Huérfana" aquí significa "no la mapea EF", no "no la
            // usa nadie" — que es distinto en un sistema de cuatro servicios.
            "NotifJobLog.JobName",
            "NotifJobLog.LastRun",

            // D-26 — Las dos de la encuesta de satisfacción ya NO son huérfanas:
            // se mapearon, y el chatbot escribe ahí la calificación en vez de
            // pisar el análisis del técnico. Las columnas ya existían en la base,
            // así que no hizo falta migración.
        };

    [Fact]
    public void Las_migraciones_levantan_una_base_desde_cero()
    {
        // Si esto falla, el resto de tests de este archivo no significan nada:
        // el esquema contra el que comparan no llegó a construirse.
        _fixture.MigrationFailure.Should().BeNull(
            "las migraciones deben poder reconstruir la base completa desde cero; " +
            "si fallan, producción y el repositorio han divergido de forma irreparable " +
            $"por migración. Error: {_fixture.MigrationFailure?.Message}");
    }

    [Fact]
    public async Task El_modelo_no_espera_ninguna_tabla_que_las_migraciones_no_creen()
    {
        _fixture.MigrationFailure.Should().BeNull("precondición: las migraciones deben aplicarse");

        var reales    = await _fixture.ReadActualTablesAsync();
        var esperadas = TablasDelModelo(_fixture.DbContext.Model);

        var faltantes = esperadas.Except(reales, StringComparer.OrdinalIgnoreCase)
                                 .OrderBy(t => t).ToList();

        faltantes.Should().BeEmpty(
            "el modelo de EF mapea tablas que ninguna migración crea. " +
            "Faltantes: {0}", string.Join(", ", faltantes));
    }

    [Fact]
    public async Task El_modelo_no_espera_ninguna_columna_que_las_migraciones_no_creen()
    {
        _fixture.MigrationFailure.Should().BeNull("precondición: las migraciones deben aplicarse");

        var reales    = await _fixture.ReadActualColumnsAsync();
        var esperadas = ColumnasDelModelo(_fixture.DbContext.Model);

        var faltantes = esperadas.Except(reales, StringComparer.OrdinalIgnoreCase)
                                 .OrderBy(c => c).ToList();

        // Éste es EL test que protege F5 y F6: si al mover un mapeo a
        // IEntityTypeConfiguration se pierde un HasColumnName, la columna que el
        // modelo espera deja de coincidir con la que existe, y aparece aquí.
        faltantes.Should().BeEmpty(
            "el modelo de EF espera columnas que las migraciones no crean — " +
            "normalmente significa que se perdió un mapeo o un HasColumnName. " +
            "Faltantes ({0}): {1}", faltantes.Count, string.Join(", ", faltantes));
    }

    [Fact]
    public async Task No_aparecen_columnas_huerfanas_nuevas()
    {
        _fixture.MigrationFailure.Should().BeNull("precondición: las migraciones deben aplicarse");

        var reales    = await _fixture.ReadActualColumnsAsync();
        var esperadas = ColumnasDelModelo(_fixture.DbContext.Model);

        var huerfanas = reales.Except(esperadas, StringComparer.OrdinalIgnoreCase)
                              .Except(ColumnasHuerfanasConocidas, StringComparer.OrdinalIgnoreCase)
                              .OrderBy(c => c).ToList();

        huerfanas.Should().BeEmpty(
            "hay columnas en la base que el modelo ya no mapea. Si es intencional " +
            "(deuda heredada), añádelas a ColumnasHuerfanasConocidas con su motivo. " +
            "Huérfanas ({0}): {1}", huerfanas.Count, string.Join(", ", huerfanas));
    }

    // ── Lectura del modelo de EF ─────────────────────────────────────────────

    private static HashSet<string> TablasDelModelo(IModel model)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entity in model.GetEntityTypes())
        {
            var tabla = entity.GetTableName();
            // Las entidades sin tabla propia (owned types compartiendo tabla,
            // tipos sin mapear) no aportan nada a la comparación.
            if (!string.IsNullOrEmpty(tabla)) set.Add(tabla);
        }
        return set;
    }

    /// <summary>
    /// Columnas de sistema de PostgreSQL que EF puede mapear como propiedad pero
    /// que information_schema NO lista, porque no son columnas de usuario.
    /// <c>xmin</c> es la que usa Client/Invoice como token de concurrencia.
    /// </summary>
    private static readonly HashSet<string> ColumnasDeSistema =
        new(StringComparer.OrdinalIgnoreCase) { "xmin", "xmax", "ctid", "cmin", "cmax", "tableoid" };

    private static HashSet<string> ColumnasDelModelo(IModel model)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entity in model.GetEntityTypes())
        {
            var tabla = entity.GetTableName();
            if (string.IsNullOrEmpty(tabla)) continue;

            var id = StoreObjectIdentifier.Table(tabla, entity.GetSchema());
            foreach (var prop in entity.GetProperties())
            {
                var columna = prop.GetColumnName(id);
                if (string.IsNullOrEmpty(columna))     continue;
                if (ColumnasDeSistema.Contains(columna)) continue;
                set.Add($"{tabla}.{columna}");
            }
        }
        return set;
    }
}
