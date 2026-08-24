using TelecomBoliviaNet.Application.Services.Notifications;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Installations.Commands;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Tickets;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>Tests TC-CREAR-01 a TC-CREAR-10 para CreateInstallationHandler (Fase 4).</summary>
public class CreateInstallationHandlerTests
{
    private static readonly Guid ClientId = Guid.NewGuid();
    private static readonly Guid PlanId   = Guid.NewGuid();
    private static readonly Guid ActorId  = Guid.NewGuid();

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static AuditService MakeAudit()
    {
        var repo = RepoMock.Empty<AuditLog>();
        return new AuditService(repo.Object, NullLogger<AuditService>.Instance);
    }

    private static TicketNumberService MakeTicketNumSvc()
    {
        var seq = new Mock<ISequenceGenerator>();
        seq.Setup(s => s.NextTicketNumberAsync()).ReturnsAsync("TK-2026-0001");
        return new TicketNumberService(seq.Object);
    }

    private static Client MakeClient(Guid? id = null)
        => TestEntityFactory.MakeClient(id: id ?? ClientId, planId: PlanId);

    private static Plan MakePlan(bool active = true, int duracion = 120, int tecReq = 1) => new()
    {
        Id                    = PlanId,
        Name                  = "Plan Fibra",
        SpeedMb               = 100,
        MonthlyPrice          = 200,
        IsActive              = active,
        DuracionInstalacionMin = duracion,
        TecnicosRequeridos    = tecReq,
    };

    private static UserSystem MakeTecnico() => new()
    {
        Id       = Guid.NewGuid(),
        Role     = UserRole.Tecnico,
        Status   = UserStatus.Activo,
        FullName = "Técnico Test",
    };

    private static CreateInstallationHandler MakeHandler(
        IGenericRepository<Installation>  instRepo,
        IGenericRepository<Client>        clientRepo,
        IGenericRepository<Plan>          planRepo,
        IGenericRepository<UserSystem>    userRepo,
        IGenericRepository<SupportTicket> ticketRepo,
        int                               committedCapacity = 0,
        IBoxReservationService?           boxReservation    = null)
        => new(instRepo, clientRepo, planRepo, userRepo, ticketRepo,
               RepoMock.Empty<TicketVisit>().Object,
               RepoMock.Empty<DistributionBox>().Object,
               MakeAudit(),
               FixedCapacity(committedCapacity),
               boxReservation ?? new Mock<IBoxReservationService>().Object,
               MakeTicketNumSvc(),
               new TicketBalancingService(ticketRepo, userRepo));

    private static ISlotCalculatorService FixedCapacity(int count)
    {
        var m = new Mock<ISlotCalculatorService>();
        m.Setup(s => s.GetCommittedCapacityAsync(
                It.IsAny<DateOnly>(), It.IsAny<TimeOnly>(), It.IsAny<TimeOnly>(),
                It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
         .ReturnsAsync(count);
        return m.Object;
    }

    private static CreateInstallationCommand Cmd(
        Guid?    clienteId,
        Guid     planId,
        string   fecha,
        string   hora          = "10:00",
        string   dir           = "Av. Test 123",
        decimal? gpsLat        = null,
        decimal? gpsLng        = null,
        string?  prospectName  = null,
        string?  prospectPhone = null,
        string?  prospectIdentityCard = null,
        string?  prospectBackupPhone  = null)
        => new(new CreateInstallationDto
        {
            ClienteId     = clienteId,
            PlanId        = planId,
            Fecha         = fecha,
            HoraInicio    = hora,
            Direccion     = dir,
            GpsLatitude   = gpsLat,
            GpsLongitude  = gpsLng,
            LocationSource= gpsLat.HasValue ? "whatsapp_gps" : null,
            ProspectName  = prospectName,
            ProspectPhone = prospectPhone,
            // PASO 10: si el llamador no fija un valor pero SÍ es un prospecto
            // (clienteId null), asumir un CI/teléfono de respaldo de prueba
            // válidos por defecto — así los tests existentes que no son SOBRE
            // esos campos (GPS, capacidad, etc.) no se rompen por una regla de
            // negocio que no están probando.
            ProspectIdentityCard = prospectIdentityCard ?? (clienteId is null ? "1234567 LP" : null),
            ProspectBackupPhone  = prospectBackupPhone  ?? (clienteId is null ? "70000001"    : null),
        }, ActorId, "Admin", "127.0.0.1");

    // ── TC-CREAR-01: Fecha pasada → error ────────────────────────────────────
    [Fact]
    public async Task TC_CREAR_01_PastDate_ReturnsFailure()
    {
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            // D-12: la fecha se calcula en hora de BOLIVIA, igual que la validación
            // (CreateInstallationValidator compara contra hoyLocal). Con UtcNow el
            // test fallaba entre las 20:00 y las 24:00 bolivianas: a esa hora UTC ya
            // pasó de día, así que AddDays(-1) caía en HOY y "hoy" no es pasado.
            Cmd(ClientId, PlanId,
                TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, NotifShared.BoliviaZone)
                    .Date.AddDays(-1).ToString("yyyy-MM-dd")),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().ContainAny("futura", "pasada");
    }

    // ── TC-CREAR-02: Slot sin disponibilidad → error ─────────────────────────
    [Fact]
    public async Task TC_CREAR_02_NoAvailability_ReturnsFailure()
    {
        var fecha = DateTime.UtcNow.AddDays(2).ToString("yyyy-MM-dd");

        // pool = 1 técnico, capacidad comprometida = 1 → sin disponibilidad
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,   // pool = 1
            RepoMock.Empty<SupportTicket>().Object,
            committedCapacity: 1);

        var result = await handler.Handle(
            Cmd(ClientId, PlanId, fecha, "10:00"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("disponibilidad");
    }

    // ── TC-CREAR-15: Plan de 2 técnicos con solo 1 libre → error ─────────────
    [Fact]
    public async Task TC_CREAR_15_PlanNeeds2Techs_Only1Free_ReturnsFailure()
    {
        // pool = 2, comprometidos = 1 → queda 1 libre, pero el plan exige 2
        var tecnicos = new[] { MakeTecnico(), MakeTecnico() };
        var handler  = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan(tecReq: 2)).Object,
            RepoMock.Of(tecnicos).Object,
            RepoMock.Empty<SupportTicket>().Object,
            committedCapacity: 1);

        var result = await handler.Handle(
            Cmd(ClientId, PlanId, DateTime.UtcNow.AddDays(2).ToString("yyyy-MM-dd")),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("disponibilidad");
    }

    // ── PASO 10: CI/nombre obligatorios para prospecto ───────────────────────

    [Fact]
    public async Task PASO10_ProspectoSinCI_FallaValidacion()
    {
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Empty<Client>().Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var cmd = Cmd(null, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
            prospectName: "Juan Pérez", prospectIdentityCard: null);
        // Cmd() pone un CI de prueba por defecto para prospectos — se lo saca
        // explícito acá para probar justo el caso que este Paso bloquea.
        cmd.Dto.ProspectIdentityCard = null;

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().ContainAny("cédula", "identidad");
    }

    [Fact]
    public async Task PASO10_ProspectoSinTelefonoRespaldo_FallaValidacion()
    {
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Empty<Client>().Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var cmd = Cmd(null, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
            prospectName: "Juan Pérez", prospectIdentityCard: "7654321 LP");
        // Cmd() pone un teléfono de respaldo de prueba por defecto para
        // prospectos — se lo saca explícito acá para probar justo el caso
        // que esta validación bloquea.
        cmd.Dto.ProspectBackupPhone = null;

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().ContainAny("teléfono", "respaldo");
    }

    [Fact]
    public async Task PASO10_ProspectoSinNombre_FallaValidacion()
    {
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Empty<Client>().Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(null, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
                prospectName: null),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("nombre");
    }

    [Fact]
    public async Task PASO10_ClienteExistenteSinCI_Pasa_NoAplica()
    {
        Installation? captured = null;
        var instRepo = RepoMock.Empty<Installation>();
        instRepo.Setup(r => r.AddAsync(It.IsAny<Installation>()))
            .Callback<Installation>(i => captured = i)
            .Returns(Task.CompletedTask);

        var handler = MakeHandler(
            instRepo.Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        // clienteId presente, sin ProspectIdentityCard — no debe exigirse (no aplica a clientes).
        var result = await handler.Handle(
            Cmd(ClientId, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd")),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        captured!.ProspectIdentityCard.Should().BeNull();
    }

    [Fact]
    public async Task PASO10_ProspectoConNombreYCI_Pasa_YSePersisteElCI()
    {
        Installation? captured = null;
        var instRepo = RepoMock.Empty<Installation>();
        instRepo.Setup(r => r.AddAsync(It.IsAny<Installation>()))
            .Callback<Installation>(i => captured = i)
            .Returns(Task.CompletedTask);

        var handler = MakeHandler(
            instRepo.Object,
            RepoMock.Empty<Client>().Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(null, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
                prospectName: "Juan Pérez", prospectIdentityCard: "7654321 LP"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        captured!.ProspectIdentityCard.Should().Be("7654321 LP");
    }

    // ── TC-CREAR-03: Plan inactivo → error ───────────────────────────────────
    [Fact]
    public async Task TC_CREAR_03_InactivePlan_ReturnsFailure()
    {
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan(active: false)).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(ClientId, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd")),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().ContainAny("plan", "inactivo");
    }

    // ── TC-CREAR-04: Cliente con instalación pendiente → error ───────────────
    [Fact]
    public async Task TC_CREAR_04_ClientHasPendingInstallation_ReturnsFailure()
    {
        var pending = new Installation
        {
            Id        = Guid.NewGuid(),
            ClientId  = ClientId,
            PlanId    = PlanId,
            Status    = InstallationStatus.Pendiente,
            Fecha     = DateTime.UtcNow.AddDays(5),
            HoraInicio= new TimeOnly(9, 0),
            Direccion = "Calle 1",
        };

        var handler = MakeHandler(
            RepoMock.Of(pending).Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(ClientId, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd")),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("pendiente");
    }

    // ── 2026-08-05: mismo guard que TC-CREAR-04 pero para PROSPECTOS ─────────
    // (bug reportado: reprogramar vía el bot a veces derivaba en un segundo
    // create_installation en vez de reschedule_installation — sin este guard,
    // el prospecto terminaba con 2 instalaciones y 2 tickets para el mismo pedido).
    [Fact]
    public async Task ProspectoConInstalacionPendiente_MismoTelefono_FallaValidacion()
    {
        const string telefono = "70000001";
        var pending = new Installation
        {
            Id            = Guid.NewGuid(),
            ClientId      = null,
            ProspectName  = "Juan Pérez",
            ProspectPhone = telefono,
            PlanId        = PlanId,
            Status        = InstallationStatus.Pendiente,
            Fecha         = DateTime.UtcNow.AddDays(5),
            HoraInicio    = new TimeOnly(9, 0),
            Direccion     = "Calle 1",
        };

        var handler = MakeHandler(
            RepoMock.Of(pending).Object,
            RepoMock.Empty<Client>().Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(null, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
                prospectName: "Juan Pérez", prospectPhone: telefono),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().ContainAny("pendiente", "reprograma");
    }

    // ── Distinto teléfono → no bloquea (son prospectos distintos) ────────────
    [Fact]
    public async Task ProspectoConInstalacionPendiente_TelefonoDistinto_NoFallaPorEso()
    {
        var pending = new Installation
        {
            Id            = Guid.NewGuid(),
            ClientId      = null,
            ProspectName  = "Otro Prospecto",
            ProspectPhone = "70000099",
            PlanId        = PlanId,
            Status        = InstallationStatus.Pendiente,
            Fecha         = DateTime.UtcNow.AddDays(5),
            HoraInicio    = new TimeOnly(9, 0),
            Direccion     = "Calle 1",
        };

        var handler = MakeHandler(
            RepoMock.Of(pending).Object,
            RepoMock.Empty<Client>().Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(null, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
                prospectName: "Juan Pérez", prospectPhone: "70000001"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    // ── TC-CREAR-05: Éxito con CalendarLink ──────────────────────────────────
    [Fact]
    public async Task TC_CREAR_05_ValidCreation_ReturnsCalendarLink()
    {
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(ClientId, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd")),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.CalendarLink.Should().NotBeNullOrEmpty();
        result.Value.CalendarLink.Should().StartWith("https://calendar.google.com");
    }

    // ── TC-CREAR-06: Sin ClienteId (prospecto) — ticket con identidad de prospecto ──
    // (Fase 1 nivel comercial: todo agendamiento genera ticket, como Splynx/UISP)
    [Fact]
    public async Task TC_CREAR_06_NoClientId_CreatesTicketWithProspectIdentity()
    {
        SupportTicket? captured = null;
        var ticketRepo = RepoMock.Empty<SupportTicket>();
        ticketRepo.Setup(r => r.AddAsync(It.IsAny<SupportTicket>()))
            .Callback<SupportTicket>(t => captured = t)
            .Returns(Task.CompletedTask);

        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Empty<Client>().Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            ticketRepo.Object);

        var result = await handler.Handle(
            Cmd(null, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
                prospectName: "Juan Pérez", prospectPhone: "59171435981"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        captured.Should().NotBeNull();
        captured!.ClientId.Should().BeNull();
        captured.ProspectName.Should().Be("Juan Pérez");
        captured.ProspectPhone.Should().Be("59171435981");
        captured.Type.Should().Be(TicketType.InstalacionNueva);
        result.Value!.TicketId.Should().NotBe(Guid.Empty.ToString());
    }

    // ── TC-CREAR-13: GPS e identidad del prospecto se persisten en la instalación ──
    [Fact]
    public async Task TC_CREAR_13_ProspectGpsAndIdentity_PersistedOnInstallation()
    {
        Installation? captured = null;
        var instRepo = RepoMock.Empty<Installation>();
        instRepo.Setup(r => r.AddAsync(It.IsAny<Installation>()))
            .Callback<Installation>(i => captured = i)
            .Returns(Task.CompletedTask);

        var handler = MakeHandler(
            instRepo.Object,
            RepoMock.Empty<Client>().Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(null, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
                gpsLat: -17.3895000m, gpsLng: -66.1568000m,
                prospectName: "Ana Rojas", prospectPhone: "59165397071"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        captured.Should().NotBeNull();
        captured!.GpsLatitude.Should().Be(-17.3895000m);
        captured.GpsLongitude.Should().Be(-66.1568000m);
        captured.LocationSource.Should().Be("whatsapp_gps");
        captured.ProspectName.Should().Be("Ana Rojas");
        captured.ProspectPhone.Should().Be("59165397071");
        captured.ClientId.Should().BeNull();
    }

    // ── TC-CREAR-16: Con GPS y caja disponible → reserva puerto NAP (F3) ─────
    [Fact]
    public async Task TC_CREAR_16_WithGps_ReservesBoxPort()
    {
        var boxId  = Guid.NewGuid();
        var zoneId = Guid.NewGuid();
        var reservation = new Mock<IBoxReservationService>();
        reservation.Setup(r => r.TryReserveAsync(
                It.IsAny<double>(), It.IsAny<double>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BoxReservation(boxId, zoneId));

        Installation? captured = null;
        var instRepo = RepoMock.Empty<Installation>();
        instRepo.Setup(r => r.AddAsync(It.IsAny<Installation>()))
            .Callback<Installation>(i => captured = i)
            .Returns(Task.CompletedTask);

        var handler = MakeHandler(
            instRepo.Object,
            RepoMock.Empty<Client>().Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object,
            boxReservation: reservation.Object);

        var result = await handler.Handle(
            Cmd(null, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
                gpsLat: -17.39m, gpsLng: -66.15m, prospectName: "Ana"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        captured!.DistributionBoxId.Should().Be(boxId);
        captured.CoverageZoneId.Should().Be(zoneId);
    }

    // ── TC-CREAR-17: Con GPS pero sin puerto → agenda igual con nota de alerta ─
    [Fact]
    public async Task TC_CREAR_17_WithGpsNoPort_SchedulesWithWarningNote()
    {
        var reservation = new Mock<IBoxReservationService>();
        reservation.Setup(r => r.TryReserveAsync(
                It.IsAny<double>(), It.IsAny<double>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((BoxReservation?)null);

        Installation? captured = null;
        var instRepo = RepoMock.Empty<Installation>();
        instRepo.Setup(r => r.AddAsync(It.IsAny<Installation>()))
            .Callback<Installation>(i => captured = i)
            .Returns(Task.CompletedTask);

        var handler = MakeHandler(
            instRepo.Object,
            RepoMock.Empty<Client>().Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object,
            boxReservation: reservation.Object);

        var result = await handler.Handle(
            Cmd(null, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
                gpsLat: -17.39m, gpsLng: -66.15m, prospectName: "Ana"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue("sin puerto NO se bloquea el agendamiento");
        captured!.DistributionBoxId.Should().BeNull();
        captured.Notas.Should().Contain("Sin puerto NAP");
    }

    // ── TC-CREAR-18: Sin GPS → no intenta reservar ────────────────────────────
    [Fact]
    public async Task TC_CREAR_18_WithoutGps_DoesNotReserve()
    {
        var reservation = new Mock<IBoxReservationService>();
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object,
            boxReservation: reservation.Object);

        await handler.Handle(
            Cmd(ClientId, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd")),
            CancellationToken.None);

        reservation.Verify(r => r.TryReserveAsync(
            It.IsAny<double>(), It.IsAny<double>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    // ── TC-CREAR-14: Con ClienteId, los campos de prospecto NO se persisten ──
    [Fact]
    public async Task TC_CREAR_14_WithClientId_ProspectFieldsIgnored()
    {
        Installation? captured = null;
        var instRepo = RepoMock.Empty<Installation>();
        instRepo.Setup(r => r.AddAsync(It.IsAny<Installation>()))
            .Callback<Installation>(i => captured = i)
            .Returns(Task.CompletedTask);

        var handler = MakeHandler(
            instRepo.Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(ClientId, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
                prospectName: "No Debe Guardarse", prospectPhone: "59100000000"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        captured!.ProspectName.Should().BeNull();
        captured.ProspectPhone.Should().BeNull();
        captured.ClientId.Should().Be(ClientId);
    }

    // ── TC-CREAR-07: Fecha con formato inválido → error ──────────────────────
    [Fact]
    public async Task TC_CREAR_07_InvalidDateFormat_ReturnsFailure()
    {
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(ClientId, PlanId, "no-es-fecha"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("fecha");
    }

    // ── TC-CREAR-08: Hora con formato inválido → error ───────────────────────
    [Fact]
    public async Task TC_CREAR_08_InvalidTimeFormat_ReturnsFailure()
    {
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(ClientId, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"), hora: "hora-rota"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("hora");
    }

    // ── TC-CREAR-09: PlanId inexistente → error ───────────────────────────────
    [Fact]
    public async Task TC_CREAR_09_PlanNotFound_ReturnsFailure()
    {
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Empty<Plan>().Object,             // plan repo vacío
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(ClientId, Guid.NewGuid(), DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd")),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().ContainAny("plan", "inactivo");
    }

    // ── TC-CREAR-10: ClienteId inexistente → error ────────────────────────────
    [Fact]
    public async Task TC_CREAR_10_ClientNotFound_ReturnsFailure()
    {
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Empty<Client>().Object,           // client repo vacío
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(Guid.NewGuid(), PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd")),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("cliente");
    }

    // ── TC-CREAR-11: CalendarLink contiene nombre del plan ───────────────────
    [Fact]
    public async Task TC_CREAR_11_CalendarLink_ContainsPlanName()
    {
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(ClientId, PlanId, DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd")),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        // "Plan Fibra" debe aparecer URL-encoded en el link
        result.Value!.CalendarLink.Should().Contain("Plan");
    }

    // ── TC-CREAR-12: Fecha hoy (hoy mismo) → permitido ───────────────────────
    [Fact]
    public async Task TC_CREAR_12_TodayDate_IsAllowed()
    {
        var handler = MakeHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(
            Cmd(ClientId, PlanId, DateTime.UtcNow.ToString("yyyy-MM-dd")),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue("hoy no es una fecha pasada — debe permitirse");
    }
}
