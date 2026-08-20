using FluentAssertions;
using Moq;
using TelecomBoliviaNet.Application.Services.Bot;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Tests para CompanyQrService (lógica extraída de ConversationsController — hallazgo A
/// de AUDITORIA_TECNICA.md: violación de capa Presentación → Infraestructura):
///   - UploadAsync crea las 4 keys si no existen y persiste con un único SaveChanges
///   - UploadAsync actualiza el valor de keys existentes (upsert) sin duplicarlas
///   - UploadAsync resetea la marca CompanyQrAlertSentDate
///   - GetFileAsync devuelve null si no hay QR configurado
///   - GetFileAsync devuelve bytes + mime cuando hay QR (mime por defecto image/jpeg)
///   - GetInfoAsync reporta HasQr=false sin datos
///   - GetInfoAsync reporta HasQr, ExpiresAt y DaysRemaining con datos
/// </summary>
public class CompanyQrServiceTests
{
    private static readonly byte[] QrBytes  = [0x89, 0x50, 0x4E, 0x47];
    private static readonly string QrBase64 = Convert.ToBase64String(QrBytes);

    private static SystemConfig Cfg(string key, string value) => new()
    {
        Id        = Guid.NewGuid(),
        Key       = key,
        Value     = value,
        UpdatedAt = DateTime.UtcNow.AddDays(-10),
    };

    // ---------- UploadAsync ----------

    [Fact]
    public async Task UploadAsync_SinKeysPrevias_CreaLasCuatroKeys_YPersisteUnaVez()
    {
        var repo = RepoMock.Empty<SystemConfig>();
        var sut  = new CompanyQrService(repo.Object);

        var expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30));
        await sut.UploadAsync(QrBase64, "image/png", expiry);

        repo.Verify(r => r.AddAsync(It.IsAny<SystemConfig>()), Times.Exactly(4));
        repo.Verify(r => r.SaveChangesAsync(), Times.Once);

        var data = await sut.GetFileAsync();
        data.Should().NotBeNull();
        data!.Bytes.Should().Equal(QrBytes);
        data.MimeType.Should().Be("image/png");
    }

    [Fact]
    public async Task UploadAsync_ConKeysExistentes_ActualizaValores_SinDuplicar()
    {
        var repo = RepoMock.Of(
            Cfg(SystemConfigKeys.CompanyQrData,          "viejo-base64"),
            Cfg(SystemConfigKeys.CompanyQrMime,          "image/jpeg"),
            Cfg(SystemConfigKeys.CompanyQrExpiresAt,     "2026-01-01"),
            Cfg(SystemConfigKeys.CompanyQrAlertSentDate, "2026-06-01"));
        var sut = new CompanyQrService(repo.Object);

        var expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(15));
        await sut.UploadAsync(QrBase64, "image/webp", expiry);

        // Upsert sobre existentes: muta tracked entities, no agrega nuevas
        repo.Verify(r => r.AddAsync(It.IsAny<SystemConfig>()), Times.Never);
        repo.Verify(r => r.SaveChangesAsync(), Times.Once);

        var file = await sut.GetFileAsync();
        file!.Bytes.Should().Equal(QrBytes);
        file.MimeType.Should().Be("image/webp");

        var info = await sut.GetInfoAsync();
        info.ExpiresAt.Should().Be(expiry.ToString("yyyy-MM-dd"));
    }

    [Fact]
    public async Task UploadAsync_ReseteaMarcaDeAlertaDeVencimiento()
    {
        var alertCfg = Cfg(SystemConfigKeys.CompanyQrAlertSentDate, "2026-06-01");
        var repo     = RepoMock.Of(alertCfg);
        var sut      = new CompanyQrService(repo.Object);

        await sut.UploadAsync(QrBase64, "image/png",
            DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)));

        alertCfg.Value.Should().BeEmpty();
    }

    // ---------- GetFileAsync ----------

    [Fact]
    public async Task GetFileAsync_SinQrConfigurado_DevuelveNull()
    {
        var sut = new CompanyQrService(RepoMock.Empty<SystemConfig>().Object);

        (await sut.GetFileAsync()).Should().BeNull();
    }

    [Fact]
    public async Task GetFileAsync_SinMime_UsaImageJpegPorDefecto()
    {
        var repo = RepoMock.Of(Cfg(SystemConfigKeys.CompanyQrData, QrBase64));
        var sut  = new CompanyQrService(repo.Object);

        var file = await sut.GetFileAsync();

        file.Should().NotBeNull();
        file!.Bytes.Should().Equal(QrBytes);
        file.MimeType.Should().Be("image/jpeg");
    }

    // ---------- GetInfoAsync ----------

    [Fact]
    public async Task GetInfoAsync_SinDatos_ReportaHasQrFalse()
    {
        var sut = new CompanyQrService(RepoMock.Empty<SystemConfig>().Object);

        var info = await sut.GetInfoAsync();

        info.HasQr.Should().BeFalse();
        info.UpdatedAt.Should().BeNull();
        info.ExpiresAt.Should().BeNull();
        info.DaysRemaining.Should().BeNull();
    }

    [Fact]
    public async Task GetInfoAsync_ConDatos_ReportaVencimientoYDiasRestantes()
    {
        var expiry = DateOnly.FromDateTime(DateTime.UtcNow.Date.AddDays(20));
        var repo   = RepoMock.Of(
            Cfg(SystemConfigKeys.CompanyQrData,      QrBase64),
            Cfg(SystemConfigKeys.CompanyQrExpiresAt, expiry.ToString("yyyy-MM-dd")));
        var sut = new CompanyQrService(repo.Object);

        var info = await sut.GetInfoAsync();

        info.HasQr.Should().BeTrue();
        info.UpdatedAt.Should().NotBeNull();
        info.ExpiresAt.Should().Be(expiry.ToString("yyyy-MM-dd"));
        info.DaysRemaining.Should().Be(20);
    }

    [Fact]
    public async Task GetInfoAsync_ConDataVacia_ReportaHasQrFalse()
    {
        var repo = RepoMock.Of(Cfg(SystemConfigKeys.CompanyQrData, string.Empty));
        var sut  = new CompanyQrService(repo.Object);

        var info = await sut.GetInfoAsync();

        info.HasQr.Should().BeFalse();
    }
}
