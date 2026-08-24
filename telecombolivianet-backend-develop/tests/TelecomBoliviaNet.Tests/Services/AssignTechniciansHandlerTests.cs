using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Installations.Commands;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Tests TC-TECS-01 a TC-TECS-06 para AssignTechniciansHandler (Fase 3).
/// </summary>
public class AssignTechniciansHandlerTests
{
    private static readonly Guid ActorId   = Guid.NewGuid();
    private const           string ActorName = "Admin Test";
    private const           string Ip        = "127.0.0.1";

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static AuditService MakeAudit()
    {
        var auditRepo = RepoMock.Empty<AuditLog>();
        return new AuditService(auditRepo.Object, NullLogger<AuditService>.Instance);
    }

    private static AssignTechniciansHandler MakeHandler(
        IInstallationRepository                    instRepo,
        IGenericRepository<InstallationTechnician> techRepo,
        IGenericRepository<UserSystem>             userRepo)
    {
        var asignacion = new TechnicianAssignmentService(techRepo, userRepo);
        return new(instRepo, asignacion, MakeAudit());
    }

    private static Installation MakeInstallation(Guid? id = null,
        IEnumerable<InstallationTechnician>? technicians = null)
    {
        var inst = new Installation
        {
            Id         = id ?? Guid.NewGuid(),
            ClientId   = Guid.NewGuid(),
            PlanId     = Guid.NewGuid(),
            Fecha      = DateTime.UtcNow.AddDays(2),
            HoraInicio = new TimeOnly(9, 0),
            Direccion  = "Calle Falsa 123",
            Status     = InstallationStatus.Pendiente,
        };
        if (technicians is not null)
            foreach (var t in technicians) inst.Technicians.Add(t);
        return inst;
    }

    private static UserSystem MakeTecnico(Guid? id = null, UserRole role = UserRole.Tecnico)
        => new() { Id = id ?? Guid.NewGuid(), Role = role, Status = UserStatus.Activo, FullName = "Técnico Test" };

    private static AssignTechniciansCommand Cmd(Guid instalacionId, List<Guid> ids, Guid leadId)
        => new(instalacionId, new AssignTechniciansDto { TecnicoIds = ids, TecnicoLeadId = leadId },
               ActorId, ActorName, Ip);

    // ── TC-TECS-01: Asignar 2 técnicos con lead ──────────────────────────────
    [Fact]
    public async Task TC_TECS_01_Assign2Technicians_WithLead_Succeeds()
    {
        var tec1 = MakeTecnico();
        var tec2 = MakeTecnico();
        var inst = MakeInstallation();

        var instRepo = SpecificRepoMock.Installations(inst);
        var techRepo = RepoMock.Empty<InstallationTechnician>();
        var userRepo = RepoMock.Of(tec1, tec2);

        var handler = MakeHandler(instRepo.Object, techRepo.Object, userRepo.Object);
        var result  = await handler.Handle(Cmd(inst.Id, [tec1.Id, tec2.Id], tec1.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        // TecnicoId del lead sincronizado
        inst.TecnicoId.Should().Be(tec1.Id);
        inst.Status.Should().Be(InstallationStatus.EnProceso);
        // Se llamó AddAsync dos veces (uno por técnico)
        techRepo.Verify(r => r.AddAsync(It.IsAny<InstallationTechnician>()), Times.Exactly(2));
    }

    // ── TC-TECS-02: Lead no incluido en la lista ──────────────────────────────
    [Fact]
    public async Task TC_TECS_02_LeadNotInList_ReturnsFailure()
    {
        var tec1    = MakeTecnico();
        var wrongId = Guid.NewGuid();
        var inst    = MakeInstallation();

        var instRepo = SpecificRepoMock.Installations(inst);
        var techRepo = RepoMock.Empty<InstallationTechnician>();
        var userRepo = RepoMock.Of(tec1);

        var handler = MakeHandler(instRepo.Object, techRepo.Object, userRepo.Object);
        var result  = await handler.Handle(Cmd(inst.Id, [tec1.Id], wrongId), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("lead");
    }

    // ── TC-TECS-03: Instalación no encontrada ─────────────────────────────────
    [Fact]
    public async Task TC_TECS_03_InstallationNotFound_ReturnsFailure()
    {
        var tec1 = MakeTecnico();

        var instRepo = SpecificRepoMock.Installations();   // vacío — no hay instalación
        var techRepo = RepoMock.Empty<InstallationTechnician>();
        var userRepo = RepoMock.Of(tec1);

        var handler = MakeHandler(instRepo.Object, techRepo.Object, userRepo.Object);
        var result  = await handler.Handle(Cmd(Guid.NewGuid(), [tec1.Id], tec1.Id), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("no encontrada");
    }

    // ── TC-TECS-04: Técnico con rol incorrecto ───────────────────────────────
    [Fact]
    public async Task TC_TECS_04_WrongRole_ReturnsFailure()
    {
        var cliente = MakeTecnico(role: UserRole.Operador);
        var inst    = MakeInstallation();

        var instRepo = SpecificRepoMock.Installations(inst);
        var techRepo = RepoMock.Empty<InstallationTechnician>();
        var userRepo = RepoMock.Of(cliente);

        var handler = MakeHandler(instRepo.Object, techRepo.Object, userRepo.Object);
        var result  = await handler.Handle(Cmd(inst.Id, [cliente.Id], cliente.Id), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("rol");
    }

    // ── TC-TECS-05: Técnico ya asignado (duplicado) ───────────────────────────
    [Fact]
    public async Task TC_TECS_05_DuplicateTechnician_ReturnsFailure()
    {
        var tec1 = MakeTecnico();
        var existing = new InstallationTechnician
        {
            Id             = Guid.NewGuid(),
            TechnicianId   = tec1.Id,
            IsLead         = true,
            AssignedBy     = ActorId,
        };
        var inst = MakeInstallation(technicians: [existing]);
        existing.InstallationId = inst.Id;

        var instRepo = SpecificRepoMock.Installations(inst);
        var techRepo = RepoMock.Empty<InstallationTechnician>();
        var userRepo = RepoMock.Of(tec1);

        var handler = MakeHandler(instRepo.Object, techRepo.Object, userRepo.Object);
        var result  = await handler.Handle(Cmd(inst.Id, [tec1.Id], tec1.Id), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("ya está asignado");
    }

    // ── TC-TECS-06: Un solo técnico (también el lead) — éxito ────────────────
    [Fact]
    public async Task TC_TECS_06_SingleTechnicianAsLead_Succeeds_IsLeadTrue()
    {
        var tec1 = MakeTecnico();
        var inst = MakeInstallation();

        var instRepo = SpecificRepoMock.Installations(inst);
        var techRepo = RepoMock.Empty<InstallationTechnician>();
        var userRepo = RepoMock.Of(tec1);

        var handler = MakeHandler(instRepo.Object, techRepo.Object, userRepo.Object);
        var result  = await handler.Handle(Cmd(inst.Id, [tec1.Id], tec1.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        inst.TecnicoId.Should().Be(tec1.Id);
        inst.Status.Should().Be(InstallationStatus.EnProceso);
        techRepo.Verify(r => r.AddAsync(It.Is<InstallationTechnician>(t =>
            t.TechnicianId == tec1.Id && t.IsLead)), Times.Once);
    }

    // ── TC-TECS-07: Rol Admin también puede asignarse como técnico ────────────
    [Fact]
    public async Task TC_TECS_07_AdminRole_CanBeAssignedAsTechnician()
    {
        var admin = MakeTecnico(role: UserRole.Admin);
        var inst  = MakeInstallation();

        var instRepo = SpecificRepoMock.Installations(inst);
        var techRepo = RepoMock.Empty<InstallationTechnician>();
        var userRepo = RepoMock.Of(admin);

        var handler = MakeHandler(instRepo.Object, techRepo.Object, userRepo.Object);
        var result  = await handler.Handle(Cmd(inst.Id, [admin.Id], admin.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue("rol Admin es válido para asignación de técnico");
    }

    // ── TC-TECS-08: TecnicoId en instalación queda como el lead ──────────────
    [Fact]
    public async Task TC_TECS_08_TecnicoIdSync_AlwaysMatchesLead()
    {
        var tec1 = MakeTecnico();
        var tec2 = MakeTecnico();
        var inst = MakeInstallation();

        var instRepo = SpecificRepoMock.Installations(inst);
        var techRepo = RepoMock.Empty<InstallationTechnician>();
        var userRepo = RepoMock.Of(tec1, tec2);

        var handler = MakeHandler(instRepo.Object, techRepo.Object, userRepo.Object);
        // tec2 es el lead
        await handler.Handle(Cmd(inst.Id, [tec1.Id, tec2.Id], tec2.Id), CancellationToken.None);

        inst.TecnicoId.Should().Be(tec2.Id, because: "TecnicoId debe ser el lead para retrocompatibilidad");
    }
}
