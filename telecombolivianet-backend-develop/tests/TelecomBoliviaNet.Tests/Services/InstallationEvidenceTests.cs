using TelecomBoliviaNet.Domain.Interfaces;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Installations.Commands;
using TelecomBoliviaNet.Application.Installations.Services;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Tests TC-EVID-01 a TC-EVID-04: evidencia de cierre de instalación
/// (Fase 5 nivel comercial — checklist, equipo, materiales y fotos).
/// </summary>
public class InstallationEvidenceTests
{
    private static readonly Guid ActorId = Guid.NewGuid();

    private static AuditService MakeAudit()
        => new(RepoMock.Empty<AuditLog>().Object, NullLogger<AuditService>.Instance);

    private static Installation MakeInstallation(
        InstallationStatus status = InstallationStatus.EnProceso) => new()
    {
        Id          = Guid.NewGuid(),
        ClientId    = Guid.NewGuid(),
        PlanId      = Guid.NewGuid(),
        Fecha       = DateTime.UtcNow.Date,
        HoraInicio  = new TimeOnly(10, 0),
        Direccion   = "Av. Test 123",
        Status      = status,
    };

    private static CompleteInstallationHandler MakeCompleteHandler(Installation inst)
        => new(RepoMock.Of(inst).Object,
               RepoMock.Empty<SupportTicket>().Object,
               RepoMock.Empty<DistributionBox>().Object,
               MakeAudit(),
               new Mock<IUnitOfWork>().Object,
               NullLogger<CompleteInstallationHandler>.Instance);

    // ── TC-EVID-01: completar persiste equipo, metros, checklist y fotos ─────
    [Fact]
    public async Task TC_EVID_01_Complete_PersistsEvidence()
    {
        var inst    = MakeInstallation();
        var handler = MakeCompleteHandler(inst);

        var dto = new CompleteInstallationDto
        {
            NotasTecnico    = "Todo OK",
            EquipoOnuSerial = " HWTC12345678 ",
            MetrosDrop      = 45,
            ChecklistJson   = "{\"onu_encendida\":true,\"senal_ok\":true}",
            FotosUrls       = ["https://storage/foto1.jpg", "https://storage/foto2.jpg"],
        };

        var result = await handler.Handle(
            new CompleteInstallationCommand(inst.Id, dto, ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue(result.ErrorMessage);
        inst.EquipoOnuSerial.Should().Be("HWTC12345678", "se recorta el whitespace");
        inst.MetrosDrop.Should().Be(45);
        inst.ChecklistJson.Should().Contain("onu_encendida");
        inst.FotosUrlsJson.Should().Contain("foto1.jpg").And.Contain("foto2.jpg");
    }

    // ── TC-EVID-02: sin evidencia → campos quedan null (retrocompatible) ─────
    [Fact]
    public async Task TC_EVID_02_CompleteWithoutEvidence_FieldsStayNull()
    {
        var inst    = MakeInstallation();
        var handler = MakeCompleteHandler(inst);

        var result = await handler.Handle(
            new CompleteInstallationCommand(
                inst.Id, new CompleteInstallationDto(), ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        inst.EquipoOnuSerial.Should().BeNull();
        inst.FotosUrlsJson.Should().BeNull();
    }

    // ── TC-EVID-03: subir foto a instalación cancelada → error ───────────────
    [Fact]
    public async Task TC_EVID_03_UploadPhoto_CancelledInstallation_Fails()
    {
        var inst    = MakeInstallation(InstallationStatus.Cancelada);
        var storage = new Mock<IFileStorage>();
        var service = new InstallationPhotoService(RepoMock.Of(inst).Object, storage.Object);

        var result = await service.UploadAsync(
            inst.Id, new MemoryStream([1, 2, 3]), "foto.jpg");

        result.IsSuccess.Should().BeFalse();
        storage.Verify(s => s.SaveAsync(
            It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    // ── TC-EVID-04: subir foto válida → guarda en carpeta de la instalación ──
    [Fact]
    public async Task TC_EVID_04_UploadPhoto_SavesInInstallationFolder()
    {
        var inst    = MakeInstallation();
        var storage = new Mock<IFileStorage>();
        storage.Setup(s => s.SaveAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>()))
            .ReturnsAsync("https://storage/instalaciones/foto.jpg");

        var service = new InstallationPhotoService(RepoMock.Of(inst).Object, storage.Object);

        var result = await service.UploadAsync(
            inst.Id, new MemoryStream([1, 2, 3]), "foto.jpg");

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().Contain("instalaciones");
        storage.Verify(s => s.SaveAsync(
            It.IsAny<Stream>(), "foto.jpg", $"instalaciones/{inst.Id}"), Times.Once);
    }

    // ── F3.3 · Atomicidad al completar ──────────────────────────────────────────

    [Fact]
    public async Task Completar_SiFallaElCierreDelTicket_RevierteTodoYNoConfirma()
    {
        // Antes de F3.3 las tres escrituras (caja, instalación, ticket) confirmaban
        // por separado: si fallaba la tercera, el puerto quedaba consumido y la
        // instalación completada, pero el ticket abierto PARA SIEMPRE — nadie
        // volvería a mirarlo porque la instalación ya figuraba cerrada.
        var ticket = new SupportTicket
        {
            Id = Guid.NewGuid(), Subject = "Instalación", Description = "x",
            Status = TicketStatus.Abierto, Type = TicketType.InstalacionNueva,
            Priority = TicketPriority.Media, Origin = TicketOrigin.Manual,
            CreatedByUserId = Guid.NewGuid(), CreatedAt = DateTime.UtcNow,
        };
        var inst = MakeInstallation(InstallationStatus.Pendiente);
        inst.Ticket = ticket;

        var ticketRepo = RepoMock.Of(ticket);
        ticketRepo.Setup(r => r.Update(It.IsAny<SupportTicket>()))
                  .Throws(new InvalidOperationException("fallo simulado al cerrar el ticket"));

        var uow = new Mock<IUnitOfWork>();

        var handler = new CompleteInstallationHandler(
            RepoMock.Of(inst).Object,
            ticketRepo.Object,
            RepoMock.Empty<DistributionBox>().Object,
            MakeAudit(),
            uow.Object,
            NullLogger<CompleteInstallationHandler>.Instance);

        var result = await handler.Handle(
            new CompleteInstallationCommand(
                inst.Id, new CompleteInstallationDto { NotasTecnico = "ok" },
                Guid.NewGuid(), "Técnico", "::1"),
            CancellationToken.None);

        // El fallo se convierte en un Result fallido, no en una excepción que suba
        // al controlador.
        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("No se aplicó ningún cambio");

        // Y lo esencial: se revierte y NO se confirma.
        uow.Verify(u => u.RollbackAsync(It.IsAny<CancellationToken>()), Times.Once);
        uow.Verify(u => u.CommitAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Completar_EnElCaminoFeliz_ConfirmaUnaSolaVez()
    {
        var inst = MakeInstallation(InstallationStatus.Pendiente);
        var uow  = new Mock<IUnitOfWork>();

        var handler = new CompleteInstallationHandler(
            RepoMock.Of(inst).Object,
            RepoMock.Empty<SupportTicket>().Object,
            RepoMock.Empty<DistributionBox>().Object,
            MakeAudit(),
            uow.Object,
            NullLogger<CompleteInstallationHandler>.Instance);

        var result = await handler.Handle(
            new CompleteInstallationCommand(
                inst.Id, new CompleteInstallationDto { NotasTecnico = "ok" },
                Guid.NewGuid(), "Técnico", "::1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        uow.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        uow.Verify(u => u.CommitAsync(It.IsAny<CancellationToken>()), Times.Once);
        uow.Verify(u => u.RollbackAsync(It.IsAny<CancellationToken>()), Times.Never);
    }
}
