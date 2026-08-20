using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Moq;
using TelecomBoliviaNet.Infrastructure.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Auditoría 2026-08-06 (m5) — <c>DeleteAsync</c> no validaba el confinamiento al directorio de
/// subidas que <c>ReadAsync</c> sí comprobaba: una ruta con "../" almacenada en la base borraba
/// archivos fuera de uploads/. Ambas operaciones resuelven ahora por el mismo punto.
/// </summary>
public sealed class LocalFileStorageTests : IDisposable
{
    private readonly string          _webRoot;
    private readonly LocalFileStorage _storage;

    public LocalFileStorageTests()
    {
        _webRoot = Path.Combine(Path.GetTempPath(), $"tbn-storage-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_webRoot);

        var env = new Mock<IWebHostEnvironment>();
        env.SetupGet(e => e.WebRootPath).Returns(_webRoot);

        _storage = new LocalFileStorage(env.Object);
    }

    public void Dispose()
    {
        if (Directory.Exists(_webRoot)) Directory.Delete(_webRoot, recursive: true);
    }

    private string CrearArchivoFueraDeUploads(string nombre)
    {
        var ruta = Path.Combine(_webRoot, nombre);
        File.WriteAllText(ruta, "contenido sensible");
        return ruta;
    }

    // ── Confinamiento ────────────────────────────────────────────────────────

    [Theory]
    [InlineData("/uploads/../secreto.txt")]
    [InlineData("uploads/../secreto.txt")]
    [InlineData("/uploads/receipts/../../secreto.txt")]
    public async Task DeleteAsync_RutaQueSeEscapaDeUploads_NoBorraYRechaza(string rutaMaliciosa)
    {
        var externo = CrearArchivoFueraDeUploads("secreto.txt");

        var act = () => _storage.DeleteAsync(rutaMaliciosa);

        await act.Should().ThrowAsync<UnauthorizedAccessException>();
        File.Exists(externo).Should().BeTrue("el archivo está fuera del directorio de subidas");
    }

    [Fact]
    public async Task ReadAsync_RutaQueSeEscapaDeUploads_Rechaza()
    {
        CrearArchivoFueraDeUploads("secreto.txt");

        var act = () => _storage.ReadAsync("/uploads/../secreto.txt");

        await act.Should().ThrowAsync<UnauthorizedAccessException>();
    }

    // ── Comportamiento normal ────────────────────────────────────────────────

    [Fact]
    public async Task GuardarLeerYBorrar_DentroDeUploads_FuncionaNormalmente()
    {
        using var contenido = new MemoryStream("imagen"u8.ToArray());

        var url = await _storage.SaveAsync(contenido, "comprobante.png", "receipts");

        url.Should().StartWith("/uploads/receipts/");

        var (bytes, contentType) = await _storage.ReadAsync(url);
        bytes.Should().NotBeEmpty();
        contentType.Should().Be("image/png");

        await _storage.DeleteAsync(url);

        var act = () => _storage.ReadAsync(url);
        await act.Should().ThrowAsync<FileNotFoundException>();
    }

    [Fact]
    public async Task DeleteAsync_UrlVacia_NoHaceNada()
    {
        var act = () => _storage.DeleteAsync(string.Empty);

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task SaveAsync_ExtensionNoPermitida_Rechaza()
    {
        using var contenido = new MemoryStream("MZ"u8.ToArray());

        var act = () => _storage.SaveAsync(contenido, "malicioso.exe");

        await act.Should().ThrowAsync<InvalidOperationException>();
    }
}
