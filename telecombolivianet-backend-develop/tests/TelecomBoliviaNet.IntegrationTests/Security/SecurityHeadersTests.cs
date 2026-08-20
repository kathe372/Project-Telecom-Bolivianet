using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Hosting;
using System.Net;
using System.Net.Http.Json;

namespace TelecomBoliviaNet.IntegrationTests.Security;

/// <summary>
/// FASE 4 regression tests — verify security headers, CORS, rate-limiting and
/// input validation behave correctly without regressions after refactoring.
/// </summary>
public class SecurityHeadersTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public SecurityHeadersTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
    }

    // SEC-T01: HSTS header present in Production
    [Fact]
    public async Task SecurityHeaders_Production_IncludesHSTS()
    {
        var factory = _factory.WithWebHostBuilder(b => b.UseEnvironment("Production"));
        var response = await factory.CreateClient().GetAsync("/health");

        response.Headers.Should().ContainKey("Strict-Transport-Security");
        var hsts = response.Headers.GetValues("Strict-Transport-Security").First();
        hsts.Should().Contain("max-age=31536000");
    }

    // SEC-T02: CORS rejects unauthorized origins
    [Fact]
    public async Task Cors_UnauthorizedOrigin_ReturnsNoAllowOriginHeader()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "https://evil.com");

        var response = await client.GetAsync("/api/clients");

        response.Headers.Should().NotContainKey("Access-Control-Allow-Origin");
    }

    // SEC-T03: Rate limiting blocks after threshold
    [Fact]
    public async Task RateLimit_AuthEndpoint_BlocksAfterLimit()
    {
        var client = _factory.CreateClient();
        const int limit = 10;

        for (int i = 0; i < limit; i++)
        {
            await client.PostAsJsonAsync("/api/auth/login",
                new { Email = "wrong@test.com", Password = "wrong" });
        }

        var blocked = await client.PostAsJsonAsync("/api/auth/login",
            new { Email = "user@test.com", Password = "pass" });

        blocked.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }

    // SEC-T04: Health endpoint accessible without auth
    [Fact]
    public async Task Health_NoAuth_Returns200()
    {
        var response = await _factory.CreateClient().GetAsync("/health");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
