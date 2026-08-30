using TelecomBoliviaNet.Application.Interfaces;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace TelecomBoliviaNet.Application.Services.Bot;

/// <summary>
/// Documentos que alimentan el RAG del chatbot. Ver <see cref="BotProxyBase"/>
/// para qué ocurre cuando el chatbot no responde.
/// </summary>
public class BotRagProxy : BotProxyBase, IBotRagProxy
{
    public BotRagProxy(
        IHttpClientFactory    httpFactory,
        IConfiguration        cfg,
        ILogger<BotRagProxy>  log)
        : base(httpFactory, cfg, log) { }

    public Task<object?> RagListDocumentsAsync()
        => SinRomperElPanelAsync<object?>(
            null,
            async () =>
            {
                var res = await _http.SendAsync(Auth(HttpMethod.Get, "rag/documents"));
                res.EnsureSuccessStatusCode();
                return await res.Content.ReadFromJsonAsync<object>();
            },
            "BotProxy: error al listar documentos RAG");

    public Task<object?> RagUploadDocumentAsync(IFormFile file, string? title)
        => SinRomperElPanelAsync<object?>(
            null,
            async () =>
            {
                using var content    = new MultipartFormDataContent();
                using var fileStream = file.OpenReadStream();
                var fileContent      = new StreamContent(fileStream);
                fileContent.Headers.ContentType =
                    new System.Net.Http.Headers.MediaTypeHeaderValue(file.ContentType);
                content.Add(fileContent, "file", file.FileName);
                if (!string.IsNullOrWhiteSpace(title))
                    content.Add(new StringContent(title), "title");

                var req = Auth(HttpMethod.Post, "rag/documents");
                req.Content = content;
                var res = await _http.SendAsync(req);
                res.EnsureSuccessStatusCode();
                return await res.Content.ReadFromJsonAsync<object>();
            },
            "BotProxy: error al subir documento RAG");

    public Task<BotResult> RagDeleteDocumentAsync(string id)
        => IntentarAsync(
            async () =>
            {
                var res = await _http.SendAsync(Auth(HttpMethod.Delete, $"rag/documents/{id}"));
                return res.IsSuccessStatusCode;
            },
            "BotProxy: error al eliminar documento RAG {Id}", id);
}
