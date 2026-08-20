using System.Net;
using System.Text;
using FluentAssertions;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using NetTopologySuite.Geometries;
using TelecomBoliviaNet.Application.Coverage.Queries;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Infrastructure.Services.Coverage;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>PR-4a: geocodificación con caché + consulta de cobertura por dirección.</summary>
public class GeocodingTests
{
    // ── AddressGeocodingService (caché + umbral) ──────────────────────────────

    private static AddressGeocodingService MakeService(
        Mock<IGeocoder> geocoder,
        GeocodeCache?   cached = null,
        SystemConfig?   cfg    = null)
    {
        var cacheRepo  = cached is null ? RepoMock.Empty<GeocodeCache>() : RepoMock.Of(cached);
        var configRepo = cfg is null ? RepoMock.Empty<SystemConfig>() : RepoMock.Of(cfg);
        return new AddressGeocodingService(geocoder.Object, cacheRepo.Object, configRepo.Object);
    }

    [Fact]
    public async Task Resolve_CacheHit_NoLlamaAlProveedor()
    {
        var geocoder = new Mock<IGeocoder>();
        var cached = new GeocodeCache
        {
            NormalizedQuery = "av banzer 100",
            Location = new Point(-63.18, -17.78) { SRID = 4326 }, // (lng, lat)
            Confidence = 0.7, DisplayName = "Av. Banzer 100",
        };
        var svc = MakeService(geocoder, cached);

        // Distinta capitalización/espacios → misma clave normalizada → hit.
        var r = await svc.ResolveAsync("  Av   BANZER   100 ");

        r.Should().NotBeNull();
        r!.Lat.Should().Be(-17.78);
        r.Lng.Should().Be(-63.18);
        r.Confidence.Should().Be(0.7);
        geocoder.Verify(g => g.GeocodeAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Resolve_CacheMissConfiable_GeocodificaYCachea()
    {
        var geocoder = new Mock<IGeocoder>();
        geocoder.Setup(g => g.GeocodeAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GeocodeResult(-17.8, -63.2, 0.5, "Calle Test"));
        var cacheRepo  = RepoMock.Empty<GeocodeCache>();
        var svc = new AddressGeocodingService(
            geocoder.Object, cacheRepo.Object, RepoMock.Empty<SystemConfig>().Object);

        var r = await svc.ResolveAsync("Calle Test 42");

        r.Should().NotBeNull();
        r!.Lat.Should().Be(-17.8);
        cacheRepo.Verify(c => c.AddAsync(It.Is<GeocodeCache>(
            g => g.NormalizedQuery == "calle test 42" && g.Confidence == 0.5)), Times.Once);
        cacheRepo.Verify(c => c.SaveChangesAsync(), Times.Once);
    }

    [Fact]
    public async Task Resolve_ConfianzaBajaLumbral_DevuelveNullYNoCachea()
    {
        var geocoder = new Mock<IGeocoder>();
        geocoder.Setup(g => g.GeocodeAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GeocodeResult(-17.8, -63.2, 0.1, "dudoso")); // < 0.3 default
        var cacheRepo = RepoMock.Empty<GeocodeCache>();
        var svc = new AddressGeocodingService(
            geocoder.Object, cacheRepo.Object, RepoMock.Empty<SystemConfig>().Object);

        var r = await svc.ResolveAsync("direccion vaga");

        r.Should().BeNull();
        cacheRepo.Verify(c => c.AddAsync(It.IsAny<GeocodeCache>()), Times.Never);
    }

    [Fact]
    public async Task Resolve_UmbralConfigurableEnSystemConfig_SeRespeta()
    {
        var geocoder = new Mock<IGeocoder>();
        geocoder.Setup(g => g.GeocodeAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GeocodeResult(-17.8, -63.2, 0.5, "medio"));
        // Umbral subido a 0.8 → 0.5 ya no alcanza.
        var cfg = new SystemConfig { Key = SystemConfigKeys.CoverageGeocodeMinConfidence, Value = "0.8" };
        var svc = MakeService(geocoder, cached: null, cfg: cfg);

        var r = await svc.ResolveAsync("algo");

        r.Should().BeNull();
    }

    [Fact]
    public async Task Resolve_ProveedorSinResultado_DevuelveNull()
    {
        var geocoder = new Mock<IGeocoder>();
        geocoder.Setup(g => g.GeocodeAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((GeocodeResult?)null);
        var svc = MakeService(geocoder);

        (await svc.ResolveAsync("no existe")).Should().BeNull();
    }

    [Fact]
    public async Task Resolve_DireccionVacia_DevuelveNullSinLlamar()
    {
        var geocoder = new Mock<IGeocoder>();
        var svc = MakeService(geocoder);

        (await svc.ResolveAsync("   ")).Should().BeNull();
        geocoder.Verify(g => g.GeocodeAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ── CheckCoverageByAddressQueryHandler ────────────────────────────────────

    [Fact]
    public async Task CheckByAddress_NoUbicable_DevuelveFailure()
    {
        var geocoding = new Mock<IAddressGeocodingService>();
        geocoding.Setup(g => g.ResolveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((GeocodeResult?)null);
        var handler = new CheckCoverageByAddressQueryHandler(geocoding.Object, new Mock<IMediator>().Object);

        var result = await handler.Handle(new CheckCoverageByAddressQuery("nada"), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task CheckByAddress_Ubicable_DelegaEnCheckPorGpsYDevuelveCoordenadas()
    {
        var geocoding = new Mock<IAddressGeocodingService>();
        geocoding.Setup(g => g.ResolveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GeocodeResult(-17.39, -66.15, 0.6, "Av. Resuelta"));

        var mediator = new Mock<IMediator>();
        CheckCoverageQuery? sent = null;
        mediator.Setup(m => m.Send(It.IsAny<CheckCoverageQuery>(), It.IsAny<CancellationToken>()))
            .Callback<object, CancellationToken>((q, _) => sent = (CheckCoverageQuery)q)
            .ReturnsAsync(Result<CheckCoverageResponseDto>.Success(
                new CheckCoverageResponseDto("CONFIRMED", "Zona Sur", "FTTH", null)));

        var handler = new CheckCoverageByAddressQueryHandler(geocoding.Object, mediator.Object);

        var result = await handler.Handle(
            new CheckCoverageByAddressQuery("Av. X", Channel: "WhatsApp", ContactPhone: "70000000"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Lat.Should().Be(-17.39);
        result.Value.Lng.Should().Be(-66.15);
        result.Value.Confidence.Should().Be(0.6);
        result.Value.Coverage.Outcome.Should().Be("CONFIRMED");
        // Propaga coordenadas resueltas + canal/contacto al check por GPS (y su log de demanda).
        sent.Should().NotBeNull();
        sent!.Lat.Should().Be(-17.39);
        sent.Lng.Should().Be(-66.15);
        sent.Channel.Should().Be("WhatsApp");
        sent.ContactPhone.Should().Be("70000000");
    }

    // ── NominatimGeocoder (parseo de la respuesta HTTP, sin red real) ──────────

    private static NominatimGeocoder MakeNominatim(HttpStatusCode status, string body)
    {
        var handler = new StubHandler(status, body);
        var http = new HttpClient(handler);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Geocoding:NominatimBaseUrl"] = "https://nominatim.test",
            ["Geocoding:CountryCodes"]     = "bo",
        }).Build();
        return new NominatimGeocoder(http, config, NullLogger<NominatimGeocoder>.Instance);
    }

    [Fact]
    public async Task Nominatim_RespuestaValida_ParseaLatLngConfianza()
    {
        const string body = """
            [{"lat":"-17.7833","lon":"-63.1821","importance":0.42,"display_name":"Santa Cruz, Bolivia"}]
            """;
        var geocoder = MakeNominatim(HttpStatusCode.OK, body);

        var r = await geocoder.GeocodeAsync("Santa Cruz");

        r.Should().NotBeNull();
        r!.Lat.Should().BeApproximately(-17.7833, 1e-6);
        r.Lng.Should().BeApproximately(-63.1821, 1e-6);
        r.Confidence.Should().BeApproximately(0.42, 1e-6);
        r.DisplayName.Should().Be("Santa Cruz, Bolivia");
    }

    [Fact]
    public async Task Nominatim_ArrayVacio_DevuelveNull()
    {
        var geocoder = MakeNominatim(HttpStatusCode.OK, "[]");
        (await geocoder.GeocodeAsync("no existe")).Should().BeNull();
    }

    [Fact]
    public async Task Nominatim_ErrorHttp_DevuelveNull()
    {
        var geocoder = MakeNominatim(HttpStatusCode.Forbidden, "");
        (await geocoder.GeocodeAsync("bloqueado")).Should().BeNull();
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _status;
        private readonly string _body;
        public StubHandler(HttpStatusCode status, string body) { _status = status; _body = body; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(new HttpResponseMessage(_status)
            {
                Content = new StringContent(_body, Encoding.UTF8, "application/json"),
            });
    }
}
