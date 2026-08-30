using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NetTopologySuite.Geometries;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Installations.Commands;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Characterization;

/// <summary>
/// TEST DE CARACTERIZACIÓN — Fase 0.
///
/// Congela qué ocurre al completar una instalación: estado, evidencia de cierre,
/// resolución del ticket asociado y consumo del puerto reservado en la caja NAP.
///
/// Es el test que protege el paso <b>F3.3</b>, el único hallazgo del plan que HOY
/// puede dejar datos inconsistentes en producción: el handler hace tres
/// <c>UpdateAsync</c> —caja, instalación y ticket— y cada uno confirma por su
/// cuenta, sin transacción. Si falla el tercero, el puerto queda consumido y la
/// instalación completada, pero el ticket abierto para siempre.
///
/// Estos tests congelan el resultado del <b>camino feliz</b>. Cuando F3.3 meta la
/// transacción, deben seguir pasando exactamente igual: la atomicidad no cambia
/// lo que ocurre cuando todo va bien, solo lo que ocurre cuando algo falla.
/// </summary>
public class InstallationCompleteCharacterizationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public InstallationCompleteCharacterizationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private const double Lat = -17.389;
    private const double Lng = -66.156;

    private sealed record Escenario(
        IServiceScope Scope, AppDbContext Db, Guid ActorId,
        Guid InstalacionId, Guid TicketId, Guid CajaId);

    /// <summary>
    /// Instalación pendiente, con ticket abierto y un puerto YA RESERVADO en una
    /// caja NAP (que es como llega al técnico tras agendar desde el bot).
    /// </summary>
    private async Task<Escenario> SeedAsync()
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync("""
            DELETE FROM "InstallationTechnicians";
            DELETE FROM "PortReservations";
            DELETE FROM "NapPorts";
            DELETE FROM "Installations";
            DELETE FROM "TicketWorkLogs";
            DELETE FROM "TicketComments";
            DELETE FROM "VisitTechnicians";
            DELETE FROM "TicketVisits";
            DELETE FROM "SupportTickets";
            DELETE FROM "DistributionBoxes";
            DELETE FROM "CoverageZones";
            DELETE FROM "PaymentInvoices";
            DELETE FROM "Payments";
            DELETE FROM "Invoices";
            DELETE FROM "CreditMovements";
            DELETE FROM "Clients";
            DELETE FROM "Plans";
            DELETE FROM "UserSystems";
            """);

        var userId = Guid.NewGuid();
        var planId = Guid.NewGuid();

        db.Set<UserSystem>().Add(new UserSystem
        {
            Id = userId, FullName = "Técnico Caracterización",
            Email = $"inst-{userId:N}@test.bo", PasswordHash = "x",
            Role = UserRole.Tecnico, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = planId, Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149m, IsActive = true,
        });

        var client = Client.Create("TBN-I001", "Cliente Instalacion", "6100001", "59171000500",
                                   "Zona Oeste", DateTime.UtcNow, userId, planId);
        client.WinboxNumber = "WB-I001";
        db.Set<Client>().Add(client);

        var zona = new CoverageZone
        {
            Id = Guid.NewGuid(), Nombre = "Zona Caracterización", Tecnologia = "GPON",
            VelocidadMaxMbps = 100, Estado = CoverageZoneStatus.Activa,
            CreadoAt = DateTime.UtcNow, CreadoPorId = userId,
            Geom = new Polygon(new LinearRing(new[]
            {
                new Coordinate(Lng - 0.02, Lat - 0.02), new Coordinate(Lng + 0.02, Lat - 0.02),
                new Coordinate(Lng + 0.02, Lat + 0.02), new Coordinate(Lng - 0.02, Lat + 0.02),
                new Coordinate(Lng - 0.02, Lat - 0.02),
            })) { SRID = 4326 },
        };
        db.Set<CoverageZone>().Add(zona);

        // Puerto ya reservado: 8 totales, 0 ocupados, 1 reservado.
        var caja = new DistributionBox
        {
            Id = Guid.NewGuid(), Codigo = "NAP-CAR-01", DireccionReferencia = "Esquina",
            ZoneId = zona.Id, Location = new Point(Lng, Lat) { SRID = 4326 },
            PuertosTotal = 8, PuertosOcupados = 0, PuertosReservados = 1,
            DistanciaMaxCableMetros = 250, Estado = DistributionBoxStatus.Activo,
            CreadoAt = DateTime.UtcNow,
        };
        db.Set<DistributionBox>().Add(caja);

        var ticket = new SupportTicket
        {
            Id = Guid.NewGuid(), TicketNumber = "TBN-T-CAR01", ClientId = client.Id,
            Subject = "Instalación", Description = "Instalación de caracterización",
            Type = TicketType.InstalacionNueva, Priority = TicketPriority.Media,
            Status = TicketStatus.Abierto, Origin = TicketOrigin.Manual,
            CreatedByUserId = userId, CreatedAt = DateTime.UtcNow,
            DueDate = DateTime.UtcNow.AddDays(2),
        };
        db.Set<SupportTicket>().Add(ticket);

        var inst = new Installation
        {
            Id = Guid.NewGuid(), ClientId = client.Id, PlanId = planId,
            Fecha = DateTime.UtcNow.Date, HoraInicio = new TimeOnly(9, 0), DuracionMin = 120,
            Direccion = "Av. Siempre Viva 742", Status = InstallationStatus.Pendiente,
            TecnicoId = userId, TicketId = ticket.Id,
            DistributionBoxId = caja.Id,          // ← reserva previa
            CoverageZoneId = zona.Id,
            CreadoAt = DateTime.UtcNow, CreadoPorId = userId,
        };
        db.Set<Installation>().Add(inst);

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Escenario(scope, db, userId, inst.Id, ticket.Id, caja.Id);
    }

    private static Task<TelecomBoliviaNet.Domain.Primitives.Result> CompletarAsync(
        Escenario esc, CompleteInstallationDto? dto = null) =>
        esc.Scope.ServiceProvider.GetRequiredService<IMediator>().Send(
            new CompleteInstallationCommand(
                esc.InstalacionId,
                dto ?? new CompleteInstallationDto { NotasTecnico = "Instalación sin novedad" },
                esc.ActorId, "Técnico Caracterización", "::1"));

    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Completar_marca_la_instalacion_y_resuelve_su_ticket()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var res = await CompletarAsync(esc);

        res.IsSuccess.Should().BeTrue(res.ErrorMessage);
        esc.Db.ChangeTracker.Clear();

        var inst = await esc.Db.Set<Installation>().AsNoTracking().SingleAsync(i => i.Id == esc.InstalacionId);
        inst.Status.Should().Be(InstallationStatus.Completada);
        inst.ActualizadoAt.Should().NotBeNull();

        var ticket = await esc.Db.Set<SupportTicket>().AsNoTracking().SingleAsync(t => t.Id == esc.TicketId);
        ticket.Status.Should().Be(TicketStatus.Resuelto);
        ticket.ResolutionMessage.Should().Be("Instalación sin novedad");
        ticket.ResolvedAt.Should().NotBeNull();
        ticket.SlaCompliant.Should().BeTrue("se completó antes del vencimiento del SLA");
    }

    [Fact]
    public async Task Completar_consume_la_reserva_y_ocupa_el_puerto()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await CompletarAsync(esc);
        esc.Db.ChangeTracker.Clear();

        // DistributionBox.Ocupar() consume la reserva previa si existe: el puerto
        // pasa de reservado a ocupado, NO se suman dos.
        var caja = await esc.Db.Set<DistributionBox>().AsNoTracking().SingleAsync(b => b.Id == esc.CajaId);
        caja.PuertosReservados.Should().Be(0);
        caja.PuertosOcupados.Should().Be(1);
        caja.PuertosTotal.Should().Be(8, "completar no cambia la capacidad total");
    }

    [Fact]
    public async Task La_evidencia_de_cierre_se_guarda_en_la_instalacion()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await CompletarAsync(esc, new CompleteInstallationDto
        {
            NotasTecnico    = "Cable por fachada",
            EquipoOnuSerial = "ONU-ZXHN-998877",
            MetrosDrop      = 45,
            ChecklistJson   = """{"señal_ok":true,"cable_ordenado":true}""",
            FotosUrls       = new List<string> { "https://x/1.jpg", "https://x/2.jpg" },
        });
        esc.Db.ChangeTracker.Clear();

        var inst = await esc.Db.Set<Installation>().AsNoTracking().SingleAsync(i => i.Id == esc.InstalacionId);
        inst.EquipoOnuSerial.Should().Be("ONU-ZXHN-998877");
        inst.MetrosDrop.Should().Be(45);
        inst.ChecklistJson.Should().Contain("señal_ok");
        inst.FotosUrlsJson.Should().Contain("1.jpg").And.Contain("2.jpg");
    }

    [Fact]
    public async Task El_serial_de_la_ONU_se_copia_al_cliente()
    {
        // D-09 CORREGIDO. Este test congelaba a propósito el comportamiento
        // anterior —el serial se quedaba solo en la instalación— y se actualiza
        // aquí conscientemente, que es justo para lo que estaba puesto.
        //
        // Por qué importaba: CancelClientCommand crea el ticket de recolección
        // leyendo Client.OnuSerialNumber. Con el campo vacío, al dar de baja a
        // alguien el ticket salía sin el número del equipo que hay que recuperar.
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await CompletarAsync(esc, new CompleteInstallationDto
        {
            NotasTecnico = "ok", EquipoOnuSerial = "ONU-ZXHN-998877",
        });
        esc.Db.ChangeTracker.Clear();

        var inst    = await esc.Db.Set<Installation>().AsNoTracking().SingleAsync(i => i.Id == esc.InstalacionId);
        var cliente = await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == inst.ClientId!.Value);

        inst.EquipoOnuSerial.Should().Be("ONU-ZXHN-998877");
        cliente.OnuSerialNumber.Should().Be("ONU-ZXHN-998877",
            "el ticket de recolección lee este campo, no el de la instalación");
    }

    [Fact]
    public async Task Cerrar_sin_serial_no_borra_el_que_el_cliente_ya_tenia()
    {
        // Que el técnico no lo anote no significa "este cliente no tiene ONU".
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var inst0 = await esc.Db.Set<Installation>().AsNoTracking().SingleAsync(i => i.Id == esc.InstalacionId);
        var previo = await esc.Db.Set<Client>().SingleAsync(c => c.Id == inst0.ClientId!.Value);
        previo.OnuSerialNumber = "ONU-ANTERIOR-111";
        await esc.Db.SaveChangesAsync();
        esc.Db.ChangeTracker.Clear();

        await CompletarAsync(esc, new CompleteInstallationDto { NotasTecnico = "sin equipo anotado" });
        esc.Db.ChangeTracker.Clear();

        var cliente = await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == inst0.ClientId!.Value);
        cliente.OnuSerialNumber.Should().Be("ONU-ANTERIOR-111");
    }

    [Fact]
    public async Task No_se_puede_completar_dos_veces()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await CompletarAsync(esc);
        esc.Db.ChangeTracker.Clear();

        var segunda = await CompletarAsync(esc);

        segunda.IsSuccess.Should().BeFalse();
        segunda.ErrorMessage.Should().Contain("ya está completada");

        // Y el puerto no se consume dos veces.
        var caja = await esc.Db.Set<DistributionBox>().AsNoTracking().SingleAsync(b => b.Id == esc.CajaId);
        caja.PuertosOcupados.Should().Be(1);
    }
}
