using HIkOptimizer;
using System.Security.Cryptography;
using System.Text;

if (args.Contains("--self-test")) { SelfTests.Run(); return; }
if (args.Length == 3 && args[0] == "--solve-file") {
    var json = new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web);
    var input = System.Text.Json.JsonSerializer.Deserialize<Input>(File.ReadAllText(args[1]), json)
        ?? throw new ArgumentException("Missing input.");
    File.WriteAllText(args[2], System.Text.Json.JsonSerializer.Serialize(Scheduler.Solve(input), json));
    return;
}
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 2_000_000);
var app = builder.Build();
var secret = Environment.GetEnvironmentVariable("OPTIMIZER_API_KEY");
if (string.IsNullOrWhiteSpace(secret) || secret.Length < 32) throw new InvalidOperationException("Set OPTIMIZER_API_KEY to a secret of at least 32 characters.");
using var gate = new SemaphoreSlim(1);
app.MapGet("/health", () => Results.Ok(new { service = "OR-Tools CP-SAT", version = "9.15.6755", scoringVersion = "match-and-same-team-v1" }));
app.MapPost("/solve", async (HttpContext context, Input input) => {
    var expected = SHA256.HashData(Encoding.UTF8.GetBytes($"Bearer {secret}"));
    var actual = SHA256.HashData(Encoding.UTF8.GetBytes(context.Request.Headers.Authorization.ToString()));
    if (!CryptographicOperations.FixedTimeEquals(actual, expected)) return Results.Unauthorized();
    if (!await gate.WaitAsync(0, context.RequestAborted)) return Results.Json(new { error = "Beregningstjenesten er optaget. Prøv igen om lidt." }, statusCode: 429);
    try { return Results.Ok(await Task.Run(() => Scheduler.Solve(input, cancellation: context.RequestAborted), context.RequestAborted)); }
    catch (ArgumentException error) { return Results.BadRequest(new { error = error.Message }); }
    finally { gate.Release(); }
});
app.Run();
