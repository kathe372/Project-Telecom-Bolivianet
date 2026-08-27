using Microsoft.Extensions.Logging.Abstractions;
﻿using FluentAssertions;
using Moq;
using NetTopologySuite.Geometries;
using TelecomBoliviaNet.Application.Coverage;
using TelecomBoliviaNet.Application.Coverage.Commands;
using TelecomBoliviaNet.Application.Coverage.Queries;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Tests unitarios para queries y commands del módulo de cobertura.
/// Cubre TC-Q01 a TC-Q06 y TC-C01 a TC-C11.
/// </summary>
public class CoverageHandlerTests
{
    private const double Lat = -17.389;
    private const double Lng = -66.156;

    private static readonly SystemConfig MaxCableConfig = new()
    {
        Id    = Guid.NewGuid(),
        Key   = SystemConfigKeys.CoverageMaxCableDropMeters,
        Value = "50",
    };

    private static CoverageZone MakeZone(string nombre = "Zona Centro",
        CoverageZoneStatus estado = CoverageZoneStatus.Activa) => new()
    {
        Id               = Guid.NewGuid(),
        Nombre           = nombre,
        Tecnologia       = "GPON",
        VelocidadMaxMbps = 100,
        Estado           = estado,
        CreadoAt         = DateTime.UtcNow,
        CreadoPorId      = Guid.NewGuid(),
        Geom             = new Polygon(new LinearRing(new[]
        {
            new Coordinate(-66.2, -17.4), new Coordinate(-66.1, -17.4),
            new Coordinate(-66.1, -17.3), new Coordinate(-66.2, -17.3),
            new Coordinate(-66.2, -17.4),
        })) { SRID = 4326 },
    };

    private static DistributionBox MakeBox(
        Guid? zoneId = null,
        int total = 8, int ocupados = 4, int reservados = 1,
        DistributionBoxStatus estado = DistributionBoxStatus.Activo) => new()
    {
        Id                  = Guid.NewGuid(),
        Codigo              = "NAP-001",
        DireccionReferencia = "Av. Principal",
        ZoneId              = zoneId ?? Guid.NewGuid(),
        Location            = new Point(Lng, Lat) { SRID = 4326 },
        PuertosTotal        = total,
        PuertosOcupados     = ocupados,
        PuertosReservados   = reservados,
        Estado              = estado,
        CreadoAt            = DateTime.UtcNow,
    };

    // ── CheckCoverageQuery (TC-Q01 a TC-Q06) ─────────────────────────────────

    // TC-Q01: lee MaxCableDropMeters de SystemConfig y lo pasa a ICoverageQueryService
    [Fact]
    public async Task CheckCoverageQuery_LeaMaxMetrosDeConfig_YPasaAlServicio()
    {
        var coverageMock = new Mock<ICoverageQueryService>();
        coverageMock.Setup(s => s.CheckAsync(Lat, Lng, 50, It.IsAny<double>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CoverageCheckResult(
                CoverageOutcome.Confirmed, "Centro", "GPON", null, Guid.NewGuid(), 30));

        var configRepo = RepoMock.Of(MaxCableConfig);
        var handler    = new CheckCoverageQueryHandler(coverageMock.Object, configRepo.Object, SpecificRepoMock.Boxes().Object, new Mock<ICoverageDemandRecorder>().Object);

        var result = await handler.Handle(new CheckCoverageQuery(Lat, Lng), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Outcome.Should().Be("CONFIRMED");
        coverageMock.Verify(s => s.CheckAsync(Lat, Lng, 50, It.IsAny<double>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    // PASO 11: lee CoverageNearZoneBoundaryMeters de SystemConfig y lo pasa a ICoverageQueryService
    [Fact]
    public async Task CheckCoverageQuery_LeaNearZoneBoundaryDeConfig_YPasaAlServicio()
    {
        var coverageMock = new Mock<ICoverageQueryService>();
        coverageMock.Setup(s => s.CheckAsync(
                Lat, Lng, It.IsAny<int>(), It.IsAny<double>(), 150, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CoverageCheckResult(CoverageOutcome.NoCoverage, null, null, null, null, null));

        var boundaryConfig = new SystemConfig
        {
            Id = Guid.NewGuid(), Key = SystemConfigKeys.CoverageNearZoneBoundaryMeters, Value = "150",
        };
        var configRepo = RepoMock.Of(boundaryConfig);
        var handler    = new CheckCoverageQueryHandler(
            coverageMock.Object, configRepo.Object,
            SpecificRepoMock.Boxes().Object, new Mock<ICoverageDemandRecorder>().Object);

        await handler.Handle(new CheckCoverageQuery(Lat, Lng), CancellationToken.None);

        coverageMock.Verify(s => s.CheckAsync(
            Lat, Lng, It.IsAny<int>(), It.IsAny<double>(), 150, It.IsAny<CancellationToken>()), Times.Once);
    }

    // PASO 11: sin SystemConfig, usa el default de negocio (200m, decisión 2026-08-02)
    [Fact]
    public async Task CheckCoverageQuery_SinConfigDeNearZoneBoundary_UsaDefault200()
    {
        var coverageMock = new Mock<ICoverageQueryService>();
        coverageMock.Setup(s => s.CheckAsync(
                Lat, Lng, It.IsAny<int>(), It.IsAny<double>(), 200, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CoverageCheckResult(CoverageOutcome.NoCoverage, null, null, null, null, null));

        var handler = new CheckCoverageQueryHandler(
            coverageMock.Object, RepoMock.Empty<SystemConfig>().Object,
            SpecificRepoMock.Boxes().Object, new Mock<ICoverageDemandRecorder>().Object);

        await handler.Handle(new CheckCoverageQuery(Lat, Lng), CancellationToken.None);

        coverageMock.Verify(s => s.CheckAsync(
            Lat, Lng, It.IsAny<int>(), It.IsAny<double>(), 200, It.IsAny<CancellationToken>()), Times.Once);
    }

    // PASO 11: propaga NEAR_ZONE_BOUNDARY igual que los demás motivos de escalación
    [Fact]
    public async Task CheckCoverageQuery_PropagaNearZoneBoundary_ConNombreDeZonaCercana()
    {
        var coverageMock = new Mock<ICoverageQueryService>();
        coverageMock.Setup(s => s.CheckAsync(It.IsAny<double>(), It.IsAny<double>(),
                It.IsAny<int>(), It.IsAny<double>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CoverageCheckResult(
                CoverageOutcome.Escalate, "Zona Norte", "GPON", "NEAR_ZONE_BOUNDARY", null, null));

        var handler = new CheckCoverageQueryHandler(
            coverageMock.Object, RepoMock.Empty<SystemConfig>().Object,
            SpecificRepoMock.Boxes().Object, new Mock<ICoverageDemandRecorder>().Object);

        var result = await handler.Handle(new CheckCoverageQuery(Lat, Lng), CancellationToken.None);

        result.Value!.Outcome.Should().Be("ESCALATE");
        result.Value.EscalationReason.Should().Be("NEAR_ZONE_BOUNDARY");
        result.Value.ZoneName.Should().Be("Zona Norte");
    }

    // PASO 11: NEAR_ZONE_BOUNDARY se registra en CoverageQuery como cualquier otro motivo
    // (mismo camino ya existente `_ => result.EscalationReason ?? "ESCALATE"`, sin cambios de código).
    [Fact]
    public async Task CheckCoverageQuery_RegistraDemanda_ConNearZoneBoundary()
    {
        var coverageMock = new Mock<ICoverageQueryService>();
        coverageMock.Setup(s => s.CheckAsync(It.IsAny<double>(), It.IsAny<double>(),
                It.IsAny<int>(), It.IsAny<double>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CoverageCheckResult(
                CoverageOutcome.Escalate, "Zona Norte", "GPON", "NEAR_ZONE_BOUNDARY", null, null));

        var recorder = new Mock<ICoverageDemandRecorder>();
        var handler  = new CheckCoverageQueryHandler(
            coverageMock.Object, RepoMock.Empty<SystemConfig>().Object,
            SpecificRepoMock.Boxes().Object, recorder.Object);

        await handler.Handle(new CheckCoverageQuery(Lat, Lng), CancellationToken.None);

        recorder.Verify(r => r.RecordAsync(
            It.Is<CoverageQuery>(q => q.Result == "NEAR_ZONE_BOUNDARY"),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    // TC-Q06: propaga correctamente el resultado de ICoverageQueryService
    [Fact]
    public async Task CheckCoverageQuery_PropagaEscalate_Correcctamente()
    {
        var coverageMock = new Mock<ICoverageQueryService>();
        coverageMock.Setup(s => s.CheckAsync(It.IsAny<double>(), It.IsAny<double>(),
                It.IsAny<int>(), It.IsAny<double>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CoverageCheckResult(
                CoverageOutcome.Escalate, "Norte", "WIMAX", "NO_CAPACITY", null, null));

        var handler = new CheckCoverageQueryHandler(
            coverageMock.Object, RepoMock.Empty<SystemConfig>().Object,
            SpecificRepoMock.Boxes().Object, new Mock<ICoverageDemandRecorder>().Object);

        var result = await handler.Handle(new CheckCoverageQuery(Lat, Lng), CancellationToken.None);

        result.Value!.Outcome.Should().Be("ESCALATE");
        result.Value.EscalationReason.Should().Be("NO_CAPACITY");
    }

    // PR-2: el handler registra la demanda con el resultado y el canal/contacto correctos
    [Fact]
    public async Task CheckCoverageQuery_RegistraDemanda_ConResultadoYContacto()
    {
        var coverageMock = new Mock<ICoverageQueryService>();
        coverageMock.Setup(s => s.CheckAsync(It.IsAny<double>(), It.IsAny<double>(),
                It.IsAny<int>(), It.IsAny<double>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CoverageCheckResult(
                CoverageOutcome.Escalate, "Norte", "GPON", "NO_CAPACITY", null, null));

        var recorder = new Mock<ICoverageDemandRecorder>();
        var handler  = new CheckCoverageQueryHandler(
            coverageMock.Object, RepoMock.Empty<SystemConfig>().Object,
            SpecificRepoMock.Boxes().Object, recorder.Object);

        await handler.Handle(
            new CheckCoverageQuery(Lat, Lng, Channel: "WhatsApp", ContactPhone: "71435981"),
            CancellationToken.None);

        recorder.Verify(r => r.RecordAsync(
            It.Is<CoverageQuery>(q =>
                q.Result       == "NO_CAPACITY" &&
                q.Channel      == CoverageQueryChannel.WhatsApp &&
                q.ContactPhone == "71435981" &&
                q.ZoneName     == "Norte"),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    // ── CreateCoverageZoneCommand (TC-C01, TC-C02) ────────────────────────────

    // TC-C02: nombre duplicado → Failure
    [Fact]
    public async Task CreateZone_NombreDuplicado_RetornaFailure()
    {
        var zone     = MakeZone("Zona Centro");
        var zoneRepo = RepoMock.Of(zone);
        var handler  = new CreateCoverageZoneHandler(zoneRepo.Object);

        var result = await handler.Handle(
            new CreateCoverageZoneCommand(
                new CreateCoverageZoneRequest("Zona Centro", "GPON", 100, "Activa", null,
                    "{\"type\":\"Polygon\",\"coordinates\":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}"),
                Guid.NewGuid()),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("Zona Centro");
    }

    // TC-C01: GeoJSON válido → zona creada correctamente
    [Fact]
    public async Task CreateZone_GeoJsonValido_RetornaSuccess()
    {
        var zoneRepo = RepoMock.Empty<CoverageZone>();
        var handler  = new CreateCoverageZoneHandler(zoneRepo.Object);

        const string geojson = """
            {"type":"Polygon","coordinates":[[[-66.2,-17.4],[-66.1,-17.4],[-66.1,-17.3],[-66.2,-17.3],[-66.2,-17.4]]]}
            """;

        var result = await handler.Handle(
            new CreateCoverageZoneCommand(
                new CreateCoverageZoneRequest("Nueva Zona", "GPON", 100, "Activa", null, geojson),
                Guid.NewGuid()),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Nombre.Should().Be("Nueva Zona");
        zoneRepo.Verify(r => r.AddAsync(It.IsAny<CoverageZone>()), Times.Once);
    }

    // ── CreateDistributionBoxCommand (TC-C03, TC-C04) ────────────────────────

    // TC-C04: código duplicado → Failure
    [Fact]
    public async Task CreateBox_CodigoDuplicado_RetornaFailure()
    {
        var zone    = MakeZone();
        var box     = MakeBox(zoneId: zone.Id);
        var boxRepo = RepoMock.Of(box);
        var handler = new CreateDistributionBoxHandler(boxRepo.Object, RepoMock.Of(zone).Object);

        var result = await handler.Handle(
            new CreateDistributionBoxCommand(
                new CreateDistributionBoxRequest("NAP-001", "Ref", zone.Id, Lat, Lng, 8, null)),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("NAP-001");
    }

    // TC-C03: lat/lng válidos → Point creado y zona asociada
    [Fact]
    public async Task CreateBox_LatLngValidos_GuardaPointYAsociaZona()
    {
        var zone    = MakeZone();
        var boxRepo = SpecificRepoMock.Boxes();
        var handler = new CreateDistributionBoxHandler(boxRepo.Object, RepoMock.Of(zone).Object);

        var result = await handler.Handle(
            new CreateDistributionBoxCommand(
                new CreateDistributionBoxRequest("NAP-002", "Calle Loa", zone.Id, Lat, Lng, 16, 40)),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Codigo.Should().Be("NAP-002");
        result.Value.ZoneId.Should().Be(zone.Id);
        boxRepo.Verify(r => r.AddAsync(
            It.Is<DistributionBox>(b =>
                b.Location.X == Lng && b.Location.Y == Lat &&
                b.DistanciaMaxCableMetros == 40)),
            Times.Once);
    }

    // ── UpdateDistributionBoxCommand (TC-C06) ─────────────────────────────────

    // TC-C06: PuertosTotal < Ocupados+Reservados → Failure
    [Fact]
    public async Task UpdateBox_TotalMenorQueOcupadosMasReservados_RetornaFailure()
    {
        var box     = MakeBox(total: 8, ocupados: 5, reservados: 2); // libre: 1
        var handler = new UpdateDistributionBoxHandler(RepoMock.Of(box).Object);

        var result = await handler.Handle(
            new UpdateDistributionBoxCommand(box.Id,
                new UpdateDistributionBoxRequest("NAP-001", "Ref", 6, 5, null, "Activo")),
            CancellationToken.None);

        // PuertosTotal=6, PuertosOcupados=5, PuertosReservados actual=2 → 5+2>6 → Failure
        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("Puertos");
    }

    // ── DeleteCoverageZoneCommand (TC-C07) ────────────────────────────────────

    // TC-C07: zona con cajas activas → Failure
    [Fact]
    public async Task DeleteZone_ConCajasActivas_RetornaFailure()
    {
        var zone    = MakeZone();
        var box     = MakeBox(zoneId: zone.Id, estado: DistributionBoxStatus.Activo);
        var handler = new DeleteCoverageZoneHandler(
            RepoMock.Of(zone).Object, RepoMock.Of(box).Object);

        var result = await handler.Handle(
            new DeleteCoverageZoneCommand(zone.Id), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("cajas distribuidoras activas");
    }

    // ── CompleteInstallationWithBoxCommand (TC-C10) ───────────────────────────

    private static Installation MakeInstalacionEnProceso(Guid? reservedBoxId = null) => new()
    {
        Id               = Guid.NewGuid(),
        ClientId         = Guid.NewGuid(),
        PlanId           = Guid.NewGuid(),
        Status           = InstallationStatus.EnProceso,
        DistributionBoxId = reservedBoxId,
        Fecha            = DateTime.UtcNow.Date,
        HoraInicio       = new TimeOnly(10, 0),
        Direccion        = "Test",
        CreadoPorId      = Guid.NewGuid(),
    };

    // TC-C10a: sin reserva previa → ocupa puerto LIBRE sin tocar reservas ajenas,
    // y NO completa (eso es responsabilidad de CompleteInstallationCommand)
    [Fact]
    public async Task CompleteWithBox_SinReservaPrevia_OcupaPuertoLibreSinTocarReservas()
    {
        var box  = MakeBox(total: 8, ocupados: 4, reservados: 2);
        var inst = MakeInstalacionEnProceso();

        var instRepo = SpecificRepoMock.Installations(inst);
        var boxRepo  = RepoMock.Of(box);
        var handler  = new CompleteInstallationWithBoxHandler(
            instRepo.Object, boxRepo.Object, TestUow.Noop(),
            NullLogger<CompleteInstallationWithBoxHandler>.Instance);

        var result = await handler.Handle(
            new CompleteInstallationWithBoxCommand(inst.Id, box.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        boxRepo.Verify(r => r.Update(
            It.Is<DistributionBox>(b =>
                b.PuertosOcupados == 5 && b.PuertosReservados == 2)), Times.Once);
        instRepo.Verify(r => r.Update(
            It.Is<Installation>(i =>
                i.Status == InstallationStatus.EnProceso &&
                i.DistributionBoxId == box.Id)), Times.Once);
    }

    // TC-C10b: con reserva propia en la misma caja → consume la reserva
    [Fact]
    public async Task CompleteWithBox_ConReservaPropia_ConsumeReserva()
    {
        var box  = MakeBox(total: 8, ocupados: 4, reservados: 2);
        var inst = MakeInstalacionEnProceso(reservedBoxId: box.Id);

        var handler = new CompleteInstallationWithBoxHandler(
            SpecificRepoMock.Installations(inst).Object, RepoMock.Of(box).Object,
            TestUow.Noop(), NullLogger<CompleteInstallationWithBoxHandler>.Instance);

        var result = await handler.Handle(
            new CompleteInstallationWithBoxCommand(inst.Id, box.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        box.PuertosOcupados.Should().Be(5);
        box.PuertosReservados.Should().Be(1, "la reserva propia se consume al ocupar");
    }

    // ── BoxReservationService (TC-C11) ────────────────────────────────────────

    // BoxReservationService (Application) solo ORQUESTA: la mutación de la caja y
    // el lock viven en IPortReservationStore (Infrastructure), que aquí se mockea.
    // La reserva atómica real se prueba en integración contra PostGIS.
    private static BoxReservationService MakeReservationService(
        Mock<IPortReservationStore> store,
        CoverageCheckResult?        checkResult = null)
    {
        var coverage = new Mock<ICoverageQueryService>();
        // PASO 11: BoxReservationService siempre pasa 0 (desactiva la búsqueda de
        // zona cercana) — el mock exige exactamente ese valor como regresión.
        coverage.Setup(c => c.CheckAsync(
                It.IsAny<double>(), It.IsAny<double>(), It.IsAny<int>(), It.IsAny<double>(),
                0, It.IsAny<CancellationToken>()))
            .ReturnsAsync(checkResult ?? new CoverageCheckResult(
                CoverageOutcome.NoCoverage, null, null, null, null, null));

        return new BoxReservationService(
            coverage.Object, store.Object, RepoMock.Empty<SystemConfig>().Object);
    }

    // TC-C11a: sin DistributionBoxId → Release no toca el store
    [Fact]
    public async Task Release_SinBoxAsignado_EsIdempotente()
    {
        var inst    = MakeInstalacionEnProceso(reservedBoxId: null);
        var store   = new Mock<IPortReservationStore>();
        var service = MakeReservationService(store);

        await service.ReleaseAsync(inst, CancellationToken.None);

        store.Verify(s => s.ReleaseByInstallationAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // TC-C11b: con reserva → delega la liberación al store y desvincula la caja
    [Fact]
    public async Task Release_ConReserva_LiberaPuertoYDesvincula()
    {
        var boxId   = Guid.NewGuid();
        var inst    = MakeInstalacionEnProceso(reservedBoxId: boxId);
        var store   = new Mock<IPortReservationStore>();
        var service = MakeReservationService(store);

        await service.ReleaseAsync(inst, CancellationToken.None);

        store.Verify(s => s.ReleaseByInstallationAsync(
            inst.Id, boxId, It.IsAny<CancellationToken>()), Times.Once);
        inst.DistributionBoxId.Should().BeNull();
    }

    // TC-C11c: cobertura confirmada → reserva vía store y devuelve ids
    [Fact]
    public async Task TryReserve_CoberturaConfirmada_ReservaPuerto()
    {
        var boxId   = Guid.NewGuid();
        var zoneId  = Guid.NewGuid();
        var instId  = Guid.NewGuid();
        var store   = new Mock<IPortReservationStore>();
        store.Setup(s => s.TryReserveAsync(
                boxId, instId, It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(zoneId);
        var service = MakeReservationService(store,
            new CoverageCheckResult(CoverageOutcome.Confirmed, "Zona Test", "FTTH",
                null, boxId, 25.0));

        var reserva = await service.TryReserveAsync(-17.39, -66.15, instId, CancellationToken.None);

        reserva.Should().NotBeNull();
        reserva!.BoxId.Should().Be(boxId);
        reserva.ZoneId.Should().Be(zoneId);
        store.Verify(s => s.TryReserveAsync(
            boxId, instId, It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    // TC-C11c2: la caja se llenó entre el check y la reserva (store devuelve null) → null
    [Fact]
    public async Task TryReserve_CarreraPerdida_DevuelveNull()
    {
        var boxId   = Guid.NewGuid();
        var store   = new Mock<IPortReservationStore>();
        store.Setup(s => s.TryReserveAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid?)null);
        var service = MakeReservationService(store,
            new CoverageCheckResult(CoverageOutcome.Confirmed, "Zona Test", "FTTH",
                null, boxId, 25.0));

        var reserva = await service.TryReserveAsync(
            -17.39, -66.15, Guid.NewGuid(), CancellationToken.None);

        reserva.Should().BeNull();
    }

    // TC-C11d: sin cobertura → null y no toca el store
    [Fact]
    public async Task TryReserve_SinCobertura_DevuelveNull()
    {
        var store   = new Mock<IPortReservationStore>();
        var service = MakeReservationService(store);

        var reserva = await service.TryReserveAsync(
            -17.39, -66.15, Guid.NewGuid(), CancellationToken.None);

        reserva.Should().BeNull();
        store.Verify(s => s.TryReserveAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    // ── F7: serviciabilidad enriquecida y reubicación de cajas ────────────────

    // TC-F7-01: check confirmado incluye código y puertos de la caja recomendada
    [Fact]
    public async Task CheckCoverage_Confirmed_IncludesRecommendedBoxInfo()
    {
        var box = MakeBox(total: 8, ocupados: 4, reservados: 1); // 3 libres

        var coverageMock = new Mock<ICoverageQueryService>();
        coverageMock.Setup(s => s.CheckAsync(
                It.IsAny<double>(), It.IsAny<double>(), It.IsAny<int>(), It.IsAny<double>(),
                It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CoverageCheckResult(
                CoverageOutcome.Confirmed, "Centro", "GPON", null, box.Id, 32.5));

        var handler = new CheckCoverageQueryHandler(
            coverageMock.Object, RepoMock.Empty<SystemConfig>().Object,
            RepoMock.Of(box).Object, new Mock<ICoverageDemandRecorder>().Object);

        var result = await handler.Handle(new CheckCoverageQuery(Lat, Lng), CancellationToken.None);

        result.Value!.RecommendedBoxCodigo.Should().Be("NAP-001");
        result.Value.RecommendedBoxPuertosLibres.Should().Be(3);
        result.Value.NearestBoxDistanceMeters.Should().Be(32.5);
    }

    // TC-F7-02: update de caja con lat/lng reubica el Point
    [Fact]
    public async Task UpdateBox_ConLatLng_ReubicaElPin()
    {
        var box     = MakeBox(total: 8, ocupados: 2, reservados: 0);
        var handler = new UpdateDistributionBoxHandler(RepoMock.Of(box).Object);

        var result = await handler.Handle(
            new UpdateDistributionBoxCommand(box.Id,
                new UpdateDistributionBoxRequest("NAP-001", "Ref", 8, 2, 50, "Activo",
                    Lat: -17.40, Lng: -66.20)),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue(result.ErrorMessage);
        box.Location.Y.Should().Be(-17.40);
        box.Location.X.Should().Be(-66.20);
        box.Location.SRID.Should().Be(4326);
    }

    // TC-F7-03: update sin lat/lng NO toca la ubicación existente
    [Fact]
    public async Task UpdateBox_SinLatLng_MantieneUbicacion()
    {
        var box     = MakeBox(total: 8, ocupados: 2, reservados: 0);
        var lat0    = box.Location.Y;
        var lng0    = box.Location.X;
        var handler = new UpdateDistributionBoxHandler(RepoMock.Of(box).Object);

        var result = await handler.Handle(
            new UpdateDistributionBoxCommand(box.Id,
                new UpdateDistributionBoxRequest("NAP-001", "Ref", 8, 2, 50, "Activo")),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        box.Location.Y.Should().Be(lat0);
        box.Location.X.Should().Be(lng0);
    }

    // ── D-13 · las escrituras de puertos van todas o ninguna ────────────────
    //
    // Estas dos operaciones mueven puertos entre cajas. Antes cada escritura
    // confirmaba por su cuenta: un fallo a mitad dejaba un puerto liberado en una
    // caja y ocupado en otra, sin que ninguna instalación lo reclamara.

    [Fact]
    public async Task AsignarCaja_SiFallaElGuardado_DeshaceTodoYNoConfirma()
    {
        var inst = new Installation
        {
            Id                = Guid.NewGuid(),
            Status            = InstallationStatus.Completada,
            DistributionBoxId = Guid.NewGuid(),
        };
        var nueva = new DistributionBox { Id = Guid.NewGuid(), PuertosTotal = 8 };

        var instRepo = SpecificRepoMock.Installations(inst);
        instRepo.Setup(r => r.SaveChangesAsync())
                .ThrowsAsync(new InvalidOperationException("base caída"));

        var uow = TestUow.Mock();

        var handler = new AssignBoxToInstallationHandler(
            instRepo.Object, RepoMock.Of(nueva).Object, uow.Object,
            NullLogger<AssignBoxToInstallationHandler>.Instance);

        var result = await handler.Handle(
            new AssignBoxToInstallationCommand(inst.Id, nueva.Id), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("ningún cambio");
        uow.Verify(u => u.RollbackAsync(It.IsAny<CancellationToken>()), Times.Once);
        uow.Verify(u => u.CommitAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task VincularCajaAlCompletar_SiFallaElGuardado_DeshaceTodoYNoConfirma()
    {
        var inst = new Installation
        {
            Id                = Guid.NewGuid(),
            Status            = InstallationStatus.Pendiente,
            DistributionBoxId = Guid.NewGuid(),
        };
        var caja = new DistributionBox { Id = Guid.NewGuid(), PuertosTotal = 8 };

        var instRepo = SpecificRepoMock.Installations(inst);
        instRepo.Setup(r => r.SaveChangesAsync())
                .ThrowsAsync(new InvalidOperationException("base caída"));

        var uow = TestUow.Mock();

        var handler = new CompleteInstallationWithBoxHandler(
            instRepo.Object, RepoMock.Of(caja).Object, uow.Object,
            NullLogger<CompleteInstallationWithBoxHandler>.Instance);

        var result = await handler.Handle(
            new CompleteInstallationWithBoxCommand(inst.Id, caja.Id), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        uow.Verify(u => u.RollbackAsync(It.IsAny<CancellationToken>()), Times.Once);
        uow.Verify(u => u.CommitAsync(It.IsAny<CancellationToken>()), Times.Never);
    }
}
