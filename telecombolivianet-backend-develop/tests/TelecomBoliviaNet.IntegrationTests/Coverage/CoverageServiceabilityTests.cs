using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NetTopologySuite.Geometries;
using TelecomBoliviaNet.Application.Coverage;
using TelecomBoliviaNet.Application.Coverage.Queries;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Coverage;

/// <summary>
/// BUG-05 (IT-05): serviciabilidad de cajas NAP contra PostGIS real.
/// Verifica que `CoverageQueryService.QueryAvailableBoxAsync` respeta el
/// alcance PROPIO de cada caja (DistanciaMaxCableMetros) con el global como
/// techo — el SQL con `LEAST(...)` no es cubrible con mocks, requiere PostGIS.
/// </summary>
public class CoverageServiceabilityTests : IClassFixture<CustomWebApplicationFactory>
{
    private const double Lat = -17.389;
    private const double Lng = -66.156;
    private const double MetersPerDegLat = 110_574.0;

    private readonly CustomWebApplicationFactory _factory;
    public CoverageServiceabilityTests(CustomWebApplicationFactory factory) => _factory = factory;

    /// Siembra una zona (que contiene el punto) + una caja a `boxOffsetMeters` al
    /// norte del punto, y ejecuta CheckAsync con el techo global `globalMax`.
    private async Task<CoverageCheckResult> CheckWithBoxAsync(
        int? distanciaMaxCableMetros, double boxOffsetMeters, int globalMax, double sinuosity = 1.0)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Aislamiento entre tests (fixture compartido): limpiar cobertura.
        await db.Database.ExecuteSqlRawAsync(
            "DELETE FROM \"PortReservations\"; DELETE FROM \"NapPorts\"; " +
            "DELETE FROM \"Installations\"; " +
            "DELETE FROM \"DistributionBoxes\"; DELETE FROM \"CoverageZones\";");

        var zone = NewZone();
        db.Set<CoverageZone>().Add(zone);
        db.Set<DistributionBox>().Add(NewBox(
            zone.Id, "NAP-IT-" + Guid.NewGuid().ToString()[..8],
            boxOffsetMeters, total: 8, ocupados: 0, distancia: distanciaMaxCableMetros));
        await db.SaveChangesAsync();

        var coverage = scope.ServiceProvider.GetRequiredService<ICoverageQueryService>();
        return await coverage.CheckAsync(Lat, Lng, globalMax, sinuosity, 0, CancellationToken.None);
    }

    private static CoverageZone NewZone(CoverageZoneStatus estado = CoverageZoneStatus.Activa) => new()
    {
        Id               = Guid.NewGuid(),
        Nombre           = "Zona IT " + Guid.NewGuid().ToString()[..8],
        Tecnologia       = "GPON",
        VelocidadMaxMbps = 100,
        Estado           = estado,
        CreadoAt         = DateTime.UtcNow,
        CreadoPorId      = Guid.NewGuid(),
        Geom = new Polygon(new LinearRing(new[]
        {
            new Coordinate(Lng - 0.02, Lat - 0.02), new Coordinate(Lng + 0.02, Lat - 0.02),
            new Coordinate(Lng + 0.02, Lat + 0.02), new Coordinate(Lng - 0.02, Lat + 0.02),
            new Coordinate(Lng - 0.02, Lat - 0.02),
        })) { SRID = 4326 },
    };

    private static DistributionBox NewBox(
        Guid zoneId, string codigo, double offsetMeters, int total, int ocupados, int? distancia,
        int reservados = 0, DistributionBoxStatus estado = DistributionBoxStatus.Activo) => new()
    {
        Id                      = Guid.NewGuid(),
        Codigo                  = codigo,
        DireccionReferencia     = "IT",
        ZoneId                  = zoneId,
        Location                = new Point(Lng, Lat + offsetMeters / MetersPerDegLat) { SRID = 4326 },
        PuertosTotal            = total,
        PuertosOcupados         = ocupados,
        PuertosReservados       = reservados,
        DistanciaMaxCableMetros = distancia,
        Estado                  = estado,
        CreadoAt                = DateTime.UtcNow,
    };

    /// Limpia cobertura, ejecuta el `seed` sobre el DbContext y devuelve el scope abierto
    /// (el caller resuelve servicios y hace las aserciones dentro del `using`).
    private async Task<IServiceScope> SeedAsync(Func<AppDbContext, Task> seed)
    {
        var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            "DELETE FROM \"CoverageQueries\"; DELETE FROM \"PortReservations\"; " +
            "DELETE FROM \"NapPorts\"; " +
            "DELETE FROM \"Installations\"; DELETE FROM \"GeocodeCaches\"; " +
            "DELETE FROM \"DistributionBoxes\"; DELETE FROM \"CoverageZones\"; " +
            "DELETE FROM \"SystemConfigs\" WHERE \"Key\" LIKE 'Coverage:%';");
        await seed(db);
        await db.SaveChangesAsync();
        return scope;
    }

    private static SystemConfig Cfg(string key, string value) => new()
    {
        Id = Guid.NewGuid(), Key = key, Value = value,
        Description = "IT", IsSecret = false, UpdatedAt = DateTime.UtcNow,
    };

    // IT-05a: caja con alcance propio 200 m, punto a ~110 m → Confirmed
    // (caso "nap 5": antes daba NO_CAPACITY porque el global de 50 la recortaba).
    [Fact]
    public async Task Caja_ConAlcancePropio200_Punto110m_Confirmed()
    {
        var r = await CheckWithBoxAsync(distanciaMaxCableMetros: 200, boxOffsetMeters: 110, globalMax: 250);
        r.Outcome.Should().Be(CoverageOutcome.Confirmed);
        r.RecommendedBoxId.Should().NotBeNull();
    }

    // IT-05b: caja SIN alcance propio (NULL) → usa el global (LEAST ignora NULL) → Confirmed
    [Fact]
    public async Task Caja_SinAlcancePropio_UsaGlobal_Confirmed()
    {
        var r = await CheckWithBoxAsync(distanciaMaxCableMetros: null, boxOffsetMeters: 110, globalMax: 250);
        r.Outcome.Should().Be(CoverageOutcome.Confirmed);
    }

    // IT-05c: caja con alcance propio 50 m, punto a ~110 m → NO_CAPACITY
    // (prueba que se honra el límite PROPIO de la caja, no solo el global de 250).
    [Fact]
    public async Task Caja_ConAlcancePropio50_Punto110m_NoCapacity()
    {
        var r = await CheckWithBoxAsync(distanciaMaxCableMetros: 50, boxOffsetMeters: 110, globalMax: 250);
        r.Outcome.Should().Be(CoverageOutcome.Escalate);
        r.EscalationReason.Should().Be("NO_CAPACITY");
    }

    // IT-05d: caja con alcance 300 m pero punto a ~280 m con techo global 250 → NO_CAPACITY
    // (prueba que el global actúa como TECHO que recorta el alcance de la caja).
    [Fact]
    public async Task Caja_Alcance300_Punto280m_TechoGlobal250_NoCapacity()
    {
        var r = await CheckWithBoxAsync(distanciaMaxCableMetros: 300, boxOffsetMeters: 280, globalMax: 250);
        r.Outcome.Should().Be(CoverageOutcome.Escalate);
        r.EscalationReason.Should().Be("NO_CAPACITY");
    }

    // ── Mejora 2: factor de sinuosidad ────────────────────────────────────────

    // Caja con alcance 200, punto a ~150 m recto. Sin sinuosidad (1.0) → 150<200 → Confirmed.
    // Con sinuosidad 1.4 → efectivo 200/1.4≈143 < 150 → NO_CAPACITY (el cable real no llega).
    [Fact]
    public async Task Sinuosidad_ExcluyeCajaQueEnRectaLlegariaPeroPorCableNo()
    {
        var sinFactor = await CheckWithBoxAsync(200, boxOffsetMeters: 150, globalMax: 250, sinuosity: 1.0);
        sinFactor.Outcome.Should().Be(CoverageOutcome.Confirmed);

        var conFactor = await CheckWithBoxAsync(200, boxOffsetMeters: 150, globalMax: 250, sinuosity: 1.4);
        conFactor.Outcome.Should().Be(CoverageOutcome.Escalate);
        conFactor.EscalationReason.Should().Be("NO_CAPACITY");
    }

    // ── Mejora 4: balanceo hacia más puertos libres + alternativas ────────────

    [Fact]
    public async Task Balanceo_RecomiendaCajaConMasPuertosLibres_NoLaMasCercana()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            "DELETE FROM \"PortReservations\"; DELETE FROM \"NapPorts\"; " +
            "DELETE FROM \"Installations\"; " +
            "DELETE FROM \"DistributionBoxes\"; DELETE FROM \"CoverageZones\";");

        var zone = NewZone();
        db.Set<CoverageZone>().Add(zone);
        // Cerca (80 m) pero pocos libres (2); Lejos (150 m) pero muchos libres (8).
        var cercaPocos  = NewBox(zone.Id, "NAP-CERCA", offsetMeters: 80,  total: 8, ocupados: 6, distancia: 250);
        var lejosMuchos = NewBox(zone.Id, "NAP-LEJOS", offsetMeters: 150, total: 8, ocupados: 0, distancia: 250);
        db.Set<DistributionBox>().AddRange(cercaPocos, lejosMuchos);
        await db.SaveChangesAsync();

        var coverage = scope.ServiceProvider.GetRequiredService<ICoverageQueryService>();
        var r = await coverage.CheckAsync(Lat, Lng, 250, 1.0, 0, CancellationToken.None);

        r.Outcome.Should().Be(CoverageOutcome.Confirmed);
        r.RecommendedBoxId.Should().Be(lejosMuchos.Id, "se balancea hacia la de más puertos libres");
        r.Alternatives.Should().NotBeNull();
        r.Alternatives!.Should().HaveCount(2);
        r.Alternatives![0].Codigo.Should().Be("NAP-LEJOS");   // recomendada = más libres, primera
        r.Alternatives![0].FreePorts.Should().Be(8);
        r.Alternatives![1].Codigo.Should().Be("NAP-CERCA");
    }

    // ── Outcomes de ZONA ──────────────────────────────────────────────────────

    [Fact]
    public async Task PuntoFueraDeTodaZona_NoCoverage()
    {
        using var scope = await SeedAsync(_ => Task.CompletedTask); // sin zonas
        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(Lat, Lng, 250, 1.0, 0, CancellationToken.None);
        r.Outcome.Should().Be(CoverageOutcome.NoCoverage);
    }

    [Fact]
    public async Task ZonaEnExpansion_Escalate_ZoneInExpansion()
    {
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone(CoverageZoneStatus.EnExpansion);
            db.Set<CoverageZone>().Add(z);
            db.Set<DistributionBox>().Add(NewBox(z.Id, "NAP-EXP", 80, 8, 0, 250)); // hay caja, pero la zona manda
            return Task.CompletedTask;
        });
        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(Lat, Lng, 250, 1.0, 0, CancellationToken.None);
        r.Outcome.Should().Be(CoverageOutcome.Escalate);
        r.EscalationReason.Should().Be("ZONE_IN_EXPANSION");
    }

    [Theory]
    [InlineData(CoverageZoneStatus.Planificada)]
    [InlineData(CoverageZoneStatus.Inactiva)]
    public async Task ZonaNoOperativa_NoSeConsidera_NoCoverage(CoverageZoneStatus estado)
    {
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone(estado);
            db.Set<CoverageZone>().Add(z);
            db.Set<DistributionBox>().Add(NewBox(z.Id, "NAP-X", 50, 8, 0, 250));
            return Task.CompletedTask;
        });
        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(Lat, Lng, 250, 1.0, 0, CancellationToken.None);
        r.Outcome.Should().Be(CoverageOutcome.NoCoverage);
    }

    // ── PASO 11: cerca del borde (umbral de negocio = 200m, 2026-08-02) ────────

    /// Punto directamente al norte del borde superior de NewZone(), a
    /// `metersBeyondEdge` metros más allá (fuera de la zona) — mismo truco de
    /// conversión grados↔metros que ya usa NewBox() para offsets de caja.
    private static (double Lat, double Lng) PointNorthOfZoneEdge(double metersBeyondEdge) =>
        (Lat + 0.02 + metersBeyondEdge / MetersPerDegLat, Lng);

    [Fact]
    public async Task PuntoA100mDelBorde_UmbralDefault200_Escalate_NearZoneBoundary()
    {
        using var scope = await SeedAsync(db =>
        {
            db.Set<CoverageZone>().Add(NewZone());
            return Task.CompletedTask;
        });
        var (lat, lng) = PointNorthOfZoneEdge(100);

        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(lat, lng, 250, 1.0, 200, CancellationToken.None);

        r.Outcome.Should().Be(CoverageOutcome.Escalate);
        r.EscalationReason.Should().Be("NEAR_ZONE_BOUNDARY");
        r.ZoneName.Should().NotBeNullOrEmpty(); // el cliente sabe de qué zona está cerca
    }

    [Fact]
    public async Task PuntoA5kmDelBorde_UmbralDefault200_NoCoverage()
    {
        using var scope = await SeedAsync(db =>
        {
            db.Set<CoverageZone>().Add(NewZone());
            return Task.CompletedTask;
        });
        var (lat, lng) = PointNorthOfZoneEdge(5_000);

        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(lat, lng, 250, 1.0, 200, CancellationToken.None);

        r.Outcome.Should().Be(CoverageOutcome.NoCoverage);
    }

    // Mismo punto que el primer test (100m, adentro del umbral 200) pero con
    // nearZoneBoundaryMeters=0 — confirma que 0 desactiva la búsqueda por
    // completo, exactamente el contrato que usa BoxReservationService.
    [Fact]
    public async Task PuntoA100mDelBorde_ConUmbralCero_NoCoverage()
    {
        using var scope = await SeedAsync(db =>
        {
            db.Set<CoverageZone>().Add(NewZone());
            return Task.CompletedTask;
        });
        var (lat, lng) = PointNorthOfZoneEdge(100);

        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(lat, lng, 250, 1.0, 0, CancellationToken.None);

        r.Outcome.Should().Be(CoverageOutcome.NoCoverage);
    }

    // Una zona Planificada/Inactiva cerca NO cuenta como "cerca del borde" —
    // mismo filtro Estado IN ('Activa','EnExpansion') que ya usa QueryZoneAsync.
    [Fact]
    public async Task ZonaPlanificadaCerca_NoCuentaComoNearZoneBoundary_NoCoverage()
    {
        using var scope = await SeedAsync(db =>
        {
            db.Set<CoverageZone>().Add(NewZone(CoverageZoneStatus.Planificada));
            return Task.CompletedTask;
        });
        var (lat, lng) = PointNorthOfZoneEdge(100);

        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(lat, lng, 250, 1.0, 200, CancellationToken.None);

        r.Outcome.Should().Be(CoverageOutcome.NoCoverage);
    }

    // Sin ninguna zona en la base y umbral activo → NoCoverage sin excepción
    // (la consulta de "zona más cercana" no encuentra filas, debe manejarlo).
    [Fact]
    public async Task SinNingunaZona_ConUmbralActivo_NoCoverageSinExcepcion()
    {
        using var scope = await SeedAsync(_ => Task.CompletedTask);

        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(Lat, Lng, 250, 1.0, 200, CancellationToken.None);

        r.Outcome.Should().Be(CoverageOutcome.NoCoverage);
    }

    // End-to-end vía el handler real: confirma que SystemConfig:Coverage:NearZoneBoundaryMeters
    // sembrado en BD efectivamente cambia el resultado (mismo patrón que
    // Handler_LeeConfigsDeBD_DevuelveConfirmedDto para MaxCableDropMeters/SinuosityFactor).
    [Fact]
    public async Task Handler_LeeNearZoneBoundaryDeBD_YEscala()
    {
        using var scope = await SeedAsync(db =>
        {
            db.Set<CoverageZone>().Add(NewZone());
            db.Set<SystemConfig>().Add(Cfg(SystemConfigKeys.CoverageNearZoneBoundaryMeters, "300"));
            return Task.CompletedTask;
        });
        var (lat, lng) = PointNorthOfZoneEdge(250); // fuera del default (200) pero dentro del configurado (300)

        var result = await scope.ServiceProvider.GetRequiredService<IMediator>()
            .Send(new CheckCoverageQuery(lat, lng), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Outcome.Should().Be("ESCALATE");
        result.Value.EscalationReason.Should().Be("NEAR_ZONE_BOUNDARY");
    }

    // ── Estados de CAJA ───────────────────────────────────────────────────────

    [Fact]
    public async Task CajaEnMantenimiento_NoBoxesRegistered()
    {
        // Mantenimiento se excluye tanto de "disponibles" como del "hasAnyBox".
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone();
            db.Set<CoverageZone>().Add(z);
            db.Set<DistributionBox>().Add(NewBox(z.Id, "NAP-MANT", 50, 8, 0, 250,
                estado: DistributionBoxStatus.Mantenimiento));
            return Task.CompletedTask;
        });
        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(Lat, Lng, 250, 1.0, 0, CancellationToken.None);
        r.Outcome.Should().Be(CoverageOutcome.Escalate);
        r.EscalationReason.Should().Be("NO_BOXES_REGISTERED");
    }

    [Fact]
    public async Task CajaSaturadaSinPuertosLibres_NoCapacity()
    {
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone();
            db.Set<CoverageZone>().Add(z);
            // Activo pero 0 libres (ocupados = total) → no disponible, pero cuenta para hasAnyBox.
            db.Set<DistributionBox>().Add(NewBox(z.Id, "NAP-FULL", 50, total: 8, ocupados: 8, distancia: 250));
            return Task.CompletedTask;
        });
        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(Lat, Lng, 250, 1.0, 0, CancellationToken.None);
        r.Outcome.Should().Be(CoverageOutcome.Escalate);
        r.EscalationReason.Should().Be("NO_CAPACITY");
    }

    [Fact]
    public async Task CajaConTodosPuertosReservados_NoCapacity()
    {
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone();
            db.Set<CoverageZone>().Add(z);
            db.Set<DistributionBox>().Add(NewBox(z.Id, "NAP-RES", 50, total: 8, ocupados: 0, distancia: 250, reservados: 8));
            return Task.CompletedTask;
        });
        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(Lat, Lng, 250, 1.0, 0, CancellationToken.None);
        r.Outcome.Should().Be(CoverageOutcome.Escalate);
        r.EscalationReason.Should().Be("NO_CAPACITY");
    }

    // ── Bordes de BALANCEO ────────────────────────────────────────────────────

    [Fact]
    public async Task Balanceo_MasPuertosPeroFueraDeAlcance_RecomiendaLaEnAlcance()
    {
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone();
            db.Set<CoverageZone>().Add(z);
            db.Set<DistributionBox>().AddRange(
                NewBox(z.Id, "NAP-ENALCANCE", offsetMeters: 100, total: 8, ocupados: 6, distancia: 250), // 2 libres, dentro
                NewBox(z.Id, "NAP-LEJANA",    offsetMeters: 400, total: 8, ocupados: 0, distancia: 250)); // 8 libres, FUERA (>250)
            return Task.CompletedTask;
        });
        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(Lat, Lng, 250, 1.0, 0, CancellationToken.None);
        r.Outcome.Should().Be(CoverageOutcome.Confirmed);
        r.Alternatives.Should().ContainSingle();                    // la lejana no califica
        r.Alternatives![0].Codigo.Should().Be("NAP-ENALCANCE");
    }

    [Fact]
    public async Task Balanceo_EmpateEnPuertosLibres_GanaLaMasCercana()
    {
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone();
            db.Set<CoverageZone>().Add(z);
            db.Set<DistributionBox>().AddRange(
                NewBox(z.Id, "NAP-CERCA", offsetMeters: 60,  total: 8, ocupados: 4, distancia: 250),  // 4 libres
                NewBox(z.Id, "NAP-LEJOS", offsetMeters: 140, total: 8, ocupados: 4, distancia: 250)); // 4 libres
            return Task.CompletedTask;
        });
        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(Lat, Lng, 250, 1.0, 0, CancellationToken.None);
        r.Outcome.Should().Be(CoverageOutcome.Confirmed);
        r.Alternatives![0].Codigo.Should().Be("NAP-CERCA");         // empate → desempata cercanía
    }

    [Fact]
    public async Task Confirmed_AlternativasTraenCodigoDistanciaYPuertos()
    {
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone();
            db.Set<CoverageZone>().Add(z);
            db.Set<DistributionBox>().Add(NewBox(z.Id, "NAP-DATA", offsetMeters: 100, total: 10, ocupados: 3, distancia: 250)); // 7 libres
            return Task.CompletedTask;
        });
        var r = await scope.ServiceProvider.GetRequiredService<ICoverageQueryService>()
            .CheckAsync(Lat, Lng, 250, 1.0, 0, CancellationToken.None);
        r.Outcome.Should().Be(CoverageOutcome.Confirmed);
        var opt = r.Alternatives!.Single();
        opt.Codigo.Should().Be("NAP-DATA");
        opt.FreePorts.Should().Be(7);
        opt.DistanceMeters.Should().BeInRange(90, 115);            // ~100 m
        r.NearestBoxDistanceMeters.Should().BeInRange(90, 115);
    }

    // ── Sinuosidad (factor alto) ──────────────────────────────────────────────

    [Fact]
    public async Task Sinuosidad_FactorAlto_ExcluyeCajaQueEstariaEnAlcanceSinFactor()
    {
        // Caja alcance 200 a 120 m: factor 1.0 → 120<200 Confirmed; factor 2.0 → efectivo 100<120 → NO_CAPACITY.
        var sinFactor = await CheckWithBoxAsync(200, boxOffsetMeters: 120, globalMax: 250, sinuosity: 1.0);
        sinFactor.Outcome.Should().Be(CoverageOutcome.Confirmed);

        var conFactor = await CheckWithBoxAsync(200, boxOffsetMeters: 120, globalMax: 250, sinuosity: 2.0);
        conFactor.Outcome.Should().Be(CoverageOutcome.Escalate);
        conFactor.EscalationReason.Should().Be("NO_CAPACITY");
    }

    // ── End-to-end por el HANDLER (lee config de SystemConfigs vía MediatR) ────

    [Fact]
    public async Task Handler_LeeConfigsDeBD_DevuelveConfirmedDto()
    {
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone();
            db.Set<CoverageZone>().Add(z);
            db.Set<DistributionBox>().Add(NewBox(z.Id, "NAP-H", 100, 8, 0, 250));
            db.Set<SystemConfig>().Add(Cfg(SystemConfigKeys.CoverageMaxCableDropMeters, "250"));
            return Task.CompletedTask;
        });
        var result = await scope.ServiceProvider.GetRequiredService<IMediator>()
            .Send(new CheckCoverageQuery(Lat, Lng), CancellationToken.None);
        result.IsSuccess.Should().BeTrue();
        result.Value!.Outcome.Should().Be("CONFIRMED");
    }

    [Fact]
    public async Task Handler_LeeSinuosityFactorDeBD_YExcluye()
    {
        // Con SinuosityFactor=3.0 en la BD, una caja alcance 250 a 120 m → efectivo ~83 < 120 → NO_CAPACITY.
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone();
            db.Set<CoverageZone>().Add(z);
            db.Set<DistributionBox>().Add(NewBox(z.Id, "NAP-SIN", offsetMeters: 120, total: 8, ocupados: 0, distancia: 250));
            db.Set<SystemConfig>().Add(Cfg(SystemConfigKeys.CoverageMaxCableDropMeters, "250"));
            db.Set<SystemConfig>().Add(Cfg(SystemConfigKeys.CoverageSinuosityFactor, "3.0"));
            return Task.CompletedTask;
        });
        var result = await scope.ServiceProvider.GetRequiredService<IMediator>()
            .Send(new CheckCoverageQuery(Lat, Lng), CancellationToken.None);
        result.Value!.Outcome.Should().Be("ESCALATE");
        result.Value.EscalationReason.Should().Be("NO_CAPACITY");
    }

    // ── Reserva end-to-end (IBoxReservationService contra PostGIS) ─────────────

    [Fact]
    public async Task Reserva_TryReserve_ReservaPuertoEnLaCajaRecomendada()
    {
        Guid boxId = Guid.Empty, zoneId = Guid.Empty;
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone(); zoneId = z.Id;
            db.Set<CoverageZone>().Add(z);
            var b = NewBox(z.Id, "NAP-RSV", offsetMeters: 80, total: 8, ocupados: 0, distancia: 250);
            boxId = b.Id;
            db.Set<DistributionBox>().Add(b);
            return Task.CompletedTask;
        });

        var instId = Guid.NewGuid();
        var reserva = await scope.ServiceProvider.GetRequiredService<IBoxReservationService>()
            .TryReserveAsync(Lat, Lng, instId, CancellationToken.None);

        reserva.Should().NotBeNull();
        reserva!.BoxId.Should().Be(boxId);
        reserva.ZoneId.Should().Be(zoneId);

        // Verificar en BD que el puerto quedó reservado y que existe la fila de
        // PortReservation Active con TTL futuro (nueva conexión/scope).
        using var verify = _factory.Services.CreateScope();
        var db = verify.ServiceProvider.GetRequiredService<AppDbContext>();
        var box = await db.Set<DistributionBox>().FindAsync(boxId);
        box!.PuertosReservados.Should().Be(1);

        var rsv = await db.Set<PortReservation>()
            .SingleAsync(r => r.InstallationId == instId);
        rsv.Status.Should().Be(PortReservationStatus.Active);
        rsv.DistributionBoxId.Should().Be(boxId);
        rsv.ExpiresAt.Should().BeAfter(DateTime.UtcNow);
    }

    [Fact]
    public async Task Reserva_SinCobertura_DevuelveNull()
    {
        using var scope = await SeedAsync(_ => Task.CompletedTask); // sin zonas ni cajas
        var reserva = await scope.ServiceProvider.GetRequiredService<IBoxReservationService>()
            .TryReserveAsync(Lat, Lng, Guid.NewGuid(), CancellationToken.None);
        reserva.Should().BeNull();
    }

    // Concurrencia real: dos reservas compiten por el ÚLTIMO puerto (total 1).
    // El SELECT … FOR UPDATE del store serializa → exactamente una gana.
    [Fact]
    public async Task Reserva_DosConcurrentesUltimoPuerto_SoloUnaGana()
    {
        Guid boxId = Guid.Empty;
        using var seedScope = await SeedAsync(db =>
        {
            var z = NewZone();
            db.Set<CoverageZone>().Add(z);
            var b = NewBox(z.Id, "NAP-RACE", offsetMeters: 80, total: 1, ocupados: 0, distancia: 250);
            boxId = b.Id;
            db.Set<DistributionBox>().Add(b);
            return Task.CompletedTask;
        });

        // Cada reserva en su propio scope (DbContext/conexión independiente).
        async Task<BoxReservation?> Reserve()
        {
            using var s = _factory.Services.CreateScope();
            return await s.ServiceProvider.GetRequiredService<IBoxReservationService>()
                .TryReserveAsync(Lat, Lng, Guid.NewGuid(), CancellationToken.None);
        }

        var results = await Task.WhenAll(Reserve(), Reserve());

        results.Count(r => r is not null).Should().Be(1, "solo un puerto disponible");
        results.Count(r => r is null).Should().Be(1);

        using var verify = _factory.Services.CreateScope();
        var db2 = verify.ServiceProvider.GetRequiredService<AppDbContext>();
        var box = await db2.Set<DistributionBox>().FindAsync(boxId);
        box!.PuertosReservados.Should().Be(1);
        (await db2.Set<PortReservation>()
            .CountAsync(r => r.DistributionBoxId == boxId
                          && r.Status == PortReservationStatus.Active))
            .Should().Be(1);
    }

    // Release: la reserva vigente se cancela y el puerto vuelve al pool.
    [Fact]
    public async Task Reserva_Release_LiberaPuertoYMarcaCancelled()
    {
        Guid boxId = Guid.Empty;
        var instId = Guid.NewGuid();
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone();
            db.Set<CoverageZone>().Add(z);
            var b = NewBox(z.Id, "NAP-REL", offsetMeters: 80, total: 4, ocupados: 0, distancia: 250);
            boxId = b.Id;
            db.Set<DistributionBox>().Add(b);
            return Task.CompletedTask;
        });

        var svc = scope.ServiceProvider.GetRequiredService<IBoxReservationService>();
        var reserva = await svc.TryReserveAsync(Lat, Lng, instId, CancellationToken.None);
        reserva.Should().NotBeNull();

        var inst = new Installation
        {
            Id = instId, ClientId = Guid.NewGuid(), PlanId = Guid.NewGuid(),
            Status = InstallationStatus.EnProceso, DistributionBoxId = boxId,
            Fecha = DateTime.UtcNow.Date, HoraInicio = new TimeOnly(10, 0),
            Direccion = "IT", CreadoPorId = Guid.NewGuid(),
        };
        await svc.ReleaseAsync(inst, CancellationToken.None);

        inst.DistributionBoxId.Should().BeNull();
        using var verify = _factory.Services.CreateScope();
        var db = verify.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Set<DistributionBox>().FindAsync(boxId))!.PuertosReservados.Should().Be(0);
        (await db.Set<PortReservation>().SingleAsync(r => r.InstallationId == instId))
            .Status.Should().Be(PortReservationStatus.Cancelled);
    }

    // Job de expiración: libera la reserva VENCIDA (puerto vuelve a libre) y NO
    // toca la vigente ni la de una instalación ya completada (Converted).
    [Fact]
    public async Task ExpireDue_LiberaVencidaConservaVigenteYConvierteCompletada()
    {
        Guid boxId = Guid.Empty;
        var instVencida    = Guid.NewGuid();
        var instVigente    = Guid.NewGuid();
        var instCompletada = Guid.NewGuid();
        var past   = DateTime.UtcNow.AddHours(-1);
        var future = DateTime.UtcNow.AddHours(48);

        using var seedScope = await SeedAsync(db =>
        {
            var z = NewZone();
            db.Set<CoverageZone>().Add(z);
            // 3 reservas activas ocupan 3 de los 5 puertos.
            var b = NewBox(z.Id, "NAP-EXP", offsetMeters: 80, total: 5, ocupados: 0,
                distancia: 250, reservados: 3);
            boxId = b.Id;
            db.Set<DistributionBox>().Add(b);

            var plan = new Plan { Name = "IT Plan", SpeedMb = 100, MonthlyPrice = 200m };
            db.Set<Plan>().Add(plan);

            // Instalación completada (prospecto, ClientId null): su puerto ya está
            // ocupado, la reserva debe cerrarse como Converted (no re-liberar).
            db.Set<Installation>().Add(new Installation
            {
                Id = instCompletada, ClientId = null, PlanId = plan.Id,
                ProspectName = "IT Prospect", ProspectPhone = "70000000",
                Status = InstallationStatus.Completada, DistributionBoxId = boxId,
                Fecha = DateTime.UtcNow.Date, HoraInicio = new TimeOnly(9, 0),
                Direccion = "IT", CreadoPorId = Guid.NewGuid(),
            });

            db.Set<PortReservation>().AddRange(
                new PortReservation { DistributionBoxId = boxId, InstallationId = instVencida,
                    ReservedAt = past.AddHours(-72), ExpiresAt = past, Status = PortReservationStatus.Active },
                new PortReservation { DistributionBoxId = boxId, InstallationId = instVigente,
                    ReservedAt = DateTime.UtcNow, ExpiresAt = future, Status = PortReservationStatus.Active },
                new PortReservation { DistributionBoxId = boxId, InstallationId = instCompletada,
                    ReservedAt = past.AddHours(-72), ExpiresAt = past, Status = PortReservationStatus.Active });
            return Task.CompletedTask;
        });

        using var runScope = _factory.Services.CreateScope();
        var freed = await runScope.ServiceProvider.GetRequiredService<IPortReservationStore>()
            .ExpireDueAsync(DateTime.UtcNow, CancellationToken.None);

        freed.Should().Be(1, "solo la abandonada vencida libera puerto");

        using var verify = _factory.Services.CreateScope();
        var db = verify.ServiceProvider.GetRequiredService<AppDbContext>();
        // 3 reservados − 1 liberado (vencida abandonada) = 2. La completada NO libera
        // (su puerto ya está ocupado), la vigente sigue reservada.
        (await db.Set<DistributionBox>().FindAsync(boxId))!.PuertosReservados.Should().Be(2);

        async Task<PortReservationStatus> St(Guid id)
            => (await db.Set<PortReservation>().SingleAsync(r => r.InstallationId == id)).Status;
        (await St(instVencida)).Should().Be(PortReservationStatus.Expired);
        (await St(instVigente)).Should().Be(PortReservationStatus.Active);
        (await St(instCompletada)).Should().Be(PortReservationStatus.Converted);
    }

    // ── PR-2: log de demanda (coverage_queries) end-to-end ────────────────────

    [Fact]
    public async Task Demanda_SeRegistraTrasLaConsulta_ConResultadoUbicacionYContacto()
    {
        using var scope = await SeedAsync(db =>
        {
            db.Set<CoverageZone>().Add(NewZone()); // zona sin cajas → NO_BOXES_REGISTERED
            return Task.CompletedTask;
        });

        await scope.ServiceProvider.GetRequiredService<IMediator>()
            .Send(new CheckCoverageQuery(Lat, Lng, Channel: "WhatsApp", ContactPhone: "71000000", ContactName: "Ana"),
                  CancellationToken.None);

        using var verify = _factory.Services.CreateScope();
        var db = verify.ServiceProvider.GetRequiredService<AppDbContext>();
        var log = await db.Set<CoverageQuery>().OrderByDescending(x => x.QueriedAt).FirstOrDefaultAsync();

        log.Should().NotBeNull();
        log!.Result.Should().Be("NO_BOXES_REGISTERED");
        log.Channel.Should().Be(CoverageQueryChannel.WhatsApp);
        log.ContactPhone.Should().Be("71000000");
        log.ContactName.Should().Be("Ana");
        log.Location.Y.Should().BeApproximately(Lat, 0.0001);   // lat
        log.Location.X.Should().BeApproximately(Lng, 0.0001);   // lng
    }

    [Fact]
    public async Task Demanda_ReporteFiltraPorResultado()
    {
        using var scope = await SeedAsync(db =>
        {
            db.Set<CoverageZone>().Add(NewZone()); // sin cajas → NO_BOXES_REGISTERED
            return Task.CompletedTask;
        });
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();
        await mediator.Send(new CheckCoverageQuery(Lat, Lng), CancellationToken.None); // genera 1 registro

        var todos = await mediator.Send(new GetCoverageQueriesQuery(), CancellationToken.None);
        todos.Should().ContainSingle();
        todos[0].Result.Should().Be("NO_BOXES_REGISTERED");

        var filtrado = await mediator.Send(new GetCoverageQueriesQuery(Result: "CONFIRMED"), CancellationToken.None);
        filtrado.Should().BeEmpty();
    }

    // ── PR-4a: geocoding con caché end-to-end (PostGIS) ───────────────────────

    [Fact]
    public async Task Geocoding_SegundaConsultaSaleDeCache_NoRellamaProveedor()
    {
        using var scope = await SeedAsync(_ => Task.CompletedTask); // limpia GeocodeCaches
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var fake = new CountingGeocoder(new GeocodeResult(-17.78, -63.18, 0.6, "Av. Cache"));
        var svc = new AddressGeocodingService(
            fake,
            scope.ServiceProvider.GetRequiredService<IGenericRepository<GeocodeCache>>(),
            scope.ServiceProvider.GetRequiredService<IGenericRepository<SystemConfig>>());

        var r1 = await svc.ResolveAsync("Av Cache 100");
        var r2 = await svc.ResolveAsync("  AV   cache   100 "); // misma clave normalizada

        r1.Should().NotBeNull();
        r2.Should().NotBeNull();
        r2!.Lat.Should().Be(-17.78);
        fake.Calls.Should().Be(1, "la segunda consulta se sirve de la caché");

        using var verify = _factory.Services.CreateScope();
        var db2 = verify.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db2.Set<GeocodeCache>().CountAsync(g => g.NormalizedQuery == "av cache 100"))
            .Should().Be(1);
    }

    // ── PR-4b: read-model de puertos (NapPort) ────────────────────────────────

    private Installation CompletedInstall(Guid boxId, Guid planId, string? onu) => new()
    {
        Id = Guid.NewGuid(), ClientId = null, PlanId = planId,
        ProspectName = "IT", ProspectPhone = "70000000", EquipoOnuSerial = onu,
        Status = InstallationStatus.Completada, DistributionBoxId = boxId,
        Fecha = DateTime.UtcNow.Date, HoraInicio = new TimeOnly(9, 0),
        Direccion = "IT", CreadoPorId = Guid.NewGuid(),
    };

    [Fact]
    public async Task NapPorts_Reconcilia_UnUsedUnReservedRestoFree()
    {
        Guid boxId = Guid.Empty;
        var instUsed = Guid.NewGuid();
        var instRes  = Guid.NewGuid();
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone(); db.Set<CoverageZone>().Add(z);
            var b = NewBox(z.Id, "NAP-RM", offsetMeters: 80, total: 5, ocupados: 1,
                distancia: 250, reservados: 1);
            boxId = b.Id; db.Set<DistributionBox>().Add(b);
            var plan = new Plan { Name = "P", SpeedMb = 100, MonthlyPrice = 100m };
            db.Set<Plan>().Add(plan);
            var used = CompletedInstall(boxId, plan.Id, "ONU-123");
            instUsed = used.Id;
            db.Set<Installation>().Add(used);
            db.Set<PortReservation>().Add(new PortReservation
            {
                DistributionBoxId = boxId, InstallationId = instRes,
                ReservedAt = DateTime.UtcNow, ExpiresAt = DateTime.UtcNow.AddHours(48),
                Status = PortReservationStatus.Active,
            });
            return Task.CompletedTask;
        });

        var ports = await scope.ServiceProvider
            .GetRequiredService<INapPortService>().GetBoxPortsAsync(boxId);

        ports.Should().HaveCount(5);
        ports.Count(p => p.Status == NapPortStatus.Used).Should().Be(1);
        ports.Count(p => p.Status == NapPortStatus.Reserved).Should().Be(1);
        ports.Count(p => p.Status == NapPortStatus.Free).Should().Be(3);
        var used = ports.Single(p => p.Status == NapPortStatus.Used);
        used.OnuSerial.Should().Be("ONU-123");
        used.InstallationId.Should().Be(instUsed);
        ports.Single(p => p.Status == NapPortStatus.Reserved).InstallationId.Should().Be(instRes);
    }

    [Fact]
    public async Task NapPorts_DanarReducePuertosTotal_YRepararRestituye()
    {
        Guid boxId = Guid.Empty;
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone(); db.Set<CoverageZone>().Add(z);
            var b = NewBox(z.Id, "NAP-DMG", offsetMeters: 80, total: 4, ocupados: 0, distancia: 250);
            boxId = b.Id; db.Set<DistributionBox>().Add(b);
            return Task.CompletedTask;
        });
        var svc = scope.ServiceProvider.GetRequiredService<INapPortService>();

        (await svc.GetBoxPortsAsync(boxId)).Should().HaveCount(4); // 4 libres

        (await svc.MarkDamagedAsync(boxId, 1)).Should().BeTrue();

        using (var v = _factory.Services.CreateScope())
            (await v.ServiceProvider.GetRequiredService<AppDbContext>()
                .Set<DistributionBox>().FindAsync(boxId))!.PuertosTotal.Should().Be(3);

        var afterDamage = await svc.GetBoxPortsAsync(boxId);
        afterDamage.Count(p => p.Status == NapPortStatus.Damaged).Should().Be(1);
        afterDamage.Count(p => p.Status == NapPortStatus.Free).Should().Be(3);
        afterDamage.Single(p => p.Status == NapPortStatus.Damaged).Numero.Should().Be(1);

        (await svc.RepairAsync(boxId, 1)).Should().BeTrue();

        using (var v = _factory.Services.CreateScope())
            (await v.ServiceProvider.GetRequiredService<AppDbContext>()
                .Set<DistributionBox>().FindAsync(boxId))!.PuertosTotal.Should().Be(4);
        (await svc.GetBoxPortsAsync(boxId)).Count(p => p.Status == NapPortStatus.Free).Should().Be(4);
    }

    [Fact]
    public async Task NapPorts_NoSePuedeDanarPuertoOcupado()
    {
        Guid boxId = Guid.Empty;
        using var scope = await SeedAsync(db =>
        {
            var z = NewZone(); db.Set<CoverageZone>().Add(z);
            var b = NewBox(z.Id, "NAP-USED", offsetMeters: 80, total: 2, ocupados: 1, distancia: 250);
            boxId = b.Id; db.Set<DistributionBox>().Add(b);
            var plan = new Plan { Name = "P", SpeedMb = 100, MonthlyPrice = 100m };
            db.Set<Plan>().Add(plan);
            db.Set<Installation>().Add(CompletedInstall(boxId, plan.Id, "ONU-X"));
            return Task.CompletedTask;
        });
        var svc = scope.ServiceProvider.GetRequiredService<INapPortService>();

        var ports  = await svc.GetBoxPortsAsync(boxId);
        var usedNum = ports.Single(p => p.Status == NapPortStatus.Used).Numero;

        (await svc.MarkDamagedAsync(boxId, usedNum)).Should().BeFalse("no se daña un puerto ocupado");
    }

    private sealed class CountingGeocoder : IGeocoder
    {
        private readonly GeocodeResult? _result;
        public int Calls { get; private set; }
        public CountingGeocoder(GeocodeResult? result) => _result = result;
        public Task<GeocodeResult?> GeocodeAsync(string address, CancellationToken ct = default)
        {
            Calls++;
            return Task.FromResult(_result);
        }
    }
}
