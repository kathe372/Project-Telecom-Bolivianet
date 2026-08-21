using Microsoft.Extensions.Logging.Abstractions;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Payments;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.UnitTests.Services;

/// <summary>
/// Problema 2 — Adjuntar comprobante:
///  - El tercer argumento de IFileStorage.SaveAsync es la CARPETA ("receipts"),
///    no el contentType. Debe llamarse sin colar el mime como folder.
///  - Un fallo de almacenamiento debe devolverse como Result.Failure (mensaje legible),
///    nunca propagarse como excepción (500).
/// </summary>
public class ReceiptImageServiceTests
{
    private readonly Mock<IFileStorage> _storage = new(MockBehavior.Loose);

    private (ReceiptImageService svc, Payment payment) Build()
    {
        var payment = new Payment
        {
            ClientId = Guid.NewGuid(),
            PaidAt   = new DateTime(2026, 5, 1, 0, 0, 0, DateTimeKind.Utc),
            Amount   = 99m,
            Client   = TestEntityFactory.MakeClient(tbnCode: "TBN-0002"),
        };

        var repo = RepoMockLocal(payment);
        var svc  = new ReceiptImageService(
            repo.Object, _storage.Object,
            TestAudit.Real(), NullLogger<ReceiptImageService>.Instance);
        return (svc, payment);
    }

    private static Mock<IGenericRepository<Payment>> RepoMockLocal(Payment payment)
    {
        var mock = new Mock<IGenericRepository<Payment>>(MockBehavior.Loose);
        mock.Setup(r => r.GetAll()).Returns(new[] { payment }.AsQueryable().BuildMock());
        mock.Setup(r => r.Update(It.IsAny<Payment>()));
        return mock;
    }

    [Fact]
    public async Task Attach_SavesToReceiptsFolder_NotUsingContentTypeAsFolder()
    {
        var (svc, payment) = Build();
        string? folderUsed = null;
        _storage.Setup(s => s.SaveAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>()))
            .Callback<Stream, string, string>((_, _, folder) => folderUsed = folder)
            .ReturnsAsync("https://storage/receipts/x.jpg");

        var result = await svc.AttachReceiptImageAsync(
            payment.Id, new MemoryStream([1, 2, 3]), "foto.jpg", "image/jpeg",
            Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        folderUsed.Should().Be("receipts",
            "el contentType (image/jpeg) nunca debe usarse como carpeta destino");
    }

    [Fact]
    public async Task Attach_WhenStorageFails_ReturnsFailure_NotThrows()
    {
        var (svc, payment) = Build();
        _storage.Setup(s => s.SaveAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>()))
            .ThrowsAsync(new InvalidOperationException("Supabase 403 RLS"));

        var result = await svc.AttachReceiptImageAsync(
            payment.Id, new MemoryStream([1, 2, 3]), "foto.jpg", "image/jpeg",
            Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse("un error de storage no debe propagarse como 500");
        result.ErrorMessage.Should().Contain("comprobante");
    }
}
