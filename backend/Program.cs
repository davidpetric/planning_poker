using System.Text.Json;
using PlanningPoker.Server;

var builder = WebApplication.CreateBuilder(args);

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);

builder.Services.AddSingleton(jsonOptions);
builder.Services.AddSingleton<RoomStore>();
builder.Services.AddSingleton<WebSocketHandler>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(
        policy =>
            policy
                .SetIsOriginAllowed(_ => true)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials()
    );
});

var app = builder.Build();

app.UseCors();
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30), });

app.MapGet("/", () => Results.Text("Planning Poker WebSocket server. Connect to /ws"));
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Map(
    "/ws",
    async (HttpContext ctx, WebSocketHandler handler) =>
    {
        if (!ctx.WebSockets.IsWebSocketRequest)
        {
            ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }
        using var socket = await ctx.WebSockets.AcceptWebSocketAsync();
        await handler.HandleAsync(socket, ctx.RequestAborted);
    }
);

app.Run();
