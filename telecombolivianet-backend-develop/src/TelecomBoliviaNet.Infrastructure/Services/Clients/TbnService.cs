using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Services.Clients;

public class TbnService : ITbnService
{
    private readonly AppDbContext _context;

    public TbnService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<string> GenerateNextAsync()
    {
        // UPDATE ... RETURNING no es composable, por lo que no puede ejecutarse
        // vía SqlQueryRaw (EF envuelve el SQL en un SELECT externo). Se usa
        // ADO.NET directo para mantener el incremento atómico en una sola ida.
        var conn = _context.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open)
            await conn.OpenAsync();

        await using var cmd = conn.CreateCommand();
        cmd.CommandText =
            "UPDATE \"TbnSequences\" SET \"LastValue\" = \"LastValue\" + 1 " +
            "WHERE \"Id\" = 1 RETURNING \"LastValue\", \"Prefix\"";
        cmd.Transaction = _context.Database.CurrentTransaction?.GetDbTransaction();

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            throw new InvalidOperationException("TbnSequence no inicializada.");

        var newValue = reader.GetInt32(0);
        var prefix   = reader.GetString(1);
        return $"{prefix}-{newValue:D4}";
    }

    public async Task<string> PeekNextAsync()
    {
        var seq = await _context.TbnSequences.FindAsync(1)
            ?? throw new InvalidOperationException("La secuencia TBN no está inicializada.");
        return $"{seq.Prefix}-{(seq.LastValue + 1):D4}";
    }
}
