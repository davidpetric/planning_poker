using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace PlanningPoker.Server;

public sealed class WebSocketHandler
{
    private readonly RoomStore _store;
    private readonly JsonSerializerOptions _json;
    private readonly ILogger<WebSocketHandler> _log;

    public WebSocketHandler(RoomStore store, JsonSerializerOptions json, ILogger<WebSocketHandler> log)
    {
        _store = store;
        _json = json;
        _log = log;
    }

    public async Task HandleAsync(WebSocket socket, CancellationToken ct)
    {
        RoomSession? session = null;
        string? playerId = null;

        try
        {
            while (socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var payload = await ReceiveAsync(socket, ct);
                if (payload is null) break;

                using var doc = JsonDocument.Parse(payload);
                var root = doc.RootElement;
                var type = root.TryGetProperty("type", out var t) ? t.GetString() : null;
                if (string.IsNullOrEmpty(type)) continue;

                if (session is null)
                {
                    (session, playerId) = await HandleHandshakeAsync(socket, type!, root, ct);
                    if (session is null) break;
                }
                else
                {
                    await HandleActionAsync(session, playerId!, type!, root, ct);
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException ex)
        {
            _log.LogDebug(ex, "WebSocket closed unexpectedly");
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "WebSocket handler error");
        }
        finally
        {
            if (session is not null && playerId is not null)
            {
                if (session.Connections.TryGetValue(playerId, out var current) &&
                    ReferenceEquals(current, socket))
                {
                    session.Connections.TryRemove(playerId, out _);
                    _log.LogInformation("Disconnected player {PlayerId} from room {RoomId}", playerId, session.Room.Id);
                }
            }
            if (socket.State == WebSocketState.Open)
            {
                try
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                }
                catch { }
            }
        }
    }

    private async Task<(RoomSession?, string?)> HandleHandshakeAsync(
        WebSocket socket, string type, JsonElement root, CancellationToken ct)
    {
        switch (type)
        {
            case "create":
            {
                var playerName = root.TryGetProperty("playerName", out var p) ? p.GetString() : null;
                var roomName = root.TryGetProperty("roomName", out var r) ? r.GetString() : null;
                if (string.IsNullOrWhiteSpace(playerName))
                {
                    await Error(socket, "Player name is required", ct);
                    return (null, null);
                }

                var session = _store.CreateRoom(roomName ?? "");
                var playerId = RoomStore.GenerateId();
                await session.Lock.WaitAsync(ct);
                try
                {
                    session.Room.Players.Add(new Player
                    {
                        Id = playerId,
                        Name = playerName!,
                        Vote = null,
                        IsHost = true,
                    });
                    session.Connections[playerId] = socket;
                }
                finally { session.Lock.Release(); }

                await SendJoined(socket, playerId, session.Room, ct);
                await _store.BroadcastAsync(session, new { type = "state", room = session.Room }, ct);
                return (session, playerId);
            }

            case "join":
            {
                var roomId = root.TryGetProperty("roomId", out var rid) ? rid.GetString() : null;
                var playerName = root.TryGetProperty("playerName", out var pn) ? pn.GetString() : null;
                if (string.IsNullOrWhiteSpace(roomId) || string.IsNullOrWhiteSpace(playerName))
                {
                    await Error(socket, "roomId and playerName are required", ct);
                    return (null, null);
                }

                var session = _store.GetRoom(roomId!);
                if (session is null)
                {
                    await Error(socket, "Room not found", ct);
                    return (null, null);
                }

                string? playerId = null;
                bool nameTaken = false;
                await session.Lock.WaitAsync(ct);
                try
                {
                    var nameClash = session.Room.Players.Any(p =>
                        string.Equals(p.Name, playerName, StringComparison.OrdinalIgnoreCase));
                    if (nameClash)
                    {
                        nameTaken = true;
                    }
                    else
                    {
                        playerId = RoomStore.GenerateId();
                        session.Room.Players.Add(new Player
                        {
                            Id = playerId,
                            Name = playerName!,
                            Vote = null,
                            IsHost = session.Room.Players.Count == 0,
                        });
                        session.Connections[playerId] = socket;
                    }
                }
                finally { session.Lock.Release(); }

                if (nameTaken)
                {
                    await Error(socket, "That name is already taken in this room", ct);
                    return (null, null);
                }

                await SendJoined(socket, playerId!, session.Room, ct);
                await _store.BroadcastAsync(session, new { type = "state", room = session.Room }, ct);
                return (session, playerId);
            }

            case "reconnect":
            {
                var roomId = root.TryGetProperty("roomId", out var rid) ? rid.GetString() : null;
                var existingId = root.TryGetProperty("playerId", out var pid) ? pid.GetString() : null;
                if (string.IsNullOrWhiteSpace(roomId) || string.IsNullOrWhiteSpace(existingId))
                {
                    await Error(socket, "roomId and playerId are required", ct);
                    return (null, null);
                }

                var session = _store.GetRoom(roomId!);
                if (session is null)
                {
                    await Error(socket, "Room not found", ct);
                    return (null, null);
                }

                Player? player;
                await session.Lock.WaitAsync(ct);
                try
                {
                    player = session.Room.Players.FirstOrDefault(p => p.Id == existingId);
                    if (player is not null)
                    {
                        session.Connections[existingId!] = socket;
                    }
                }
                finally { session.Lock.Release(); }

                if (player is null)
                {
                    await Error(socket, "Player not found in room", ct);
                    return (null, null);
                }

                await SendJoined(socket, existingId!, session.Room, ct);
                return (session, existingId);
            }

            default:
                await Error(socket, $"First message must be create, join, or reconnect (got '{type}')", ct);
                return (null, null);
        }
    }

    private async Task HandleActionAsync(
        RoomSession session, string playerId, string type, JsonElement root, CancellationToken ct)
    {
        var room = session.Room;
        var broadcast = true;

        await session.Lock.WaitAsync(ct);
        try
        {
            switch (type)
            {
                case "vote":
                {
                    if (room.Revealed) { broadcast = false; break; }
                    var value = root.TryGetProperty("value", out var v) ? v.GetString() : null;
                    var player = room.Players.FirstOrDefault(p => p.Id == playerId);
                    if (player is null) { broadcast = false; break; }
                    player.Vote = player.Vote == value ? null : value;
                    break;
                }
                case "reveal":
                {
                    if (room.HostOnlyControls)
                    {
                        var caller = room.Players.FirstOrDefault(p => p.Id == playerId);
                        if (caller is null || !caller.IsHost) { broadcast = false; break; }
                    }
                    room.Revealed = true;
                    break;
                }
                case "reset":
                {
                    if (room.HostOnlyControls)
                    {
                        var caller = room.Players.FirstOrDefault(p => p.Id == playerId);
                        if (caller is null || !caller.IsHost) { broadcast = false; break; }
                    }
                    room.Revealed = false;
                    foreach (var p in room.Players) p.Vote = null;
                    break;
                }
                case "remove":
                {
                    var targetId = root.TryGetProperty("playerId", out var pid) ? pid.GetString() : null;
                    var caller = room.Players.FirstOrDefault(p => p.Id == playerId);
                    if (caller is null || !caller.IsHost || string.IsNullOrEmpty(targetId))
                    {
                        broadcast = false;
                        break;
                    }
                    room.Players.RemoveAll(p => p.Id == targetId);
                    if (session.Connections.TryRemove(targetId!, out var removedSocket))
                    {
                        _ = CloseSocketAsync(removedSocket);
                    }
                    break;
                }
                case "leave":
                {
                    room.Players.RemoveAll(p => p.Id == playerId);
                    session.Connections.TryRemove(playerId, out _);
                    if (room.Players.Count > 0 && !room.Players.Any(p => p.IsHost))
                    {
                        room.Players[0].IsHost = true;
                    }
                    break;
                }
                case "rename":
                {
                    var raw = root.TryGetProperty("name", out var n) ? n.GetString() : null;
                    if (string.IsNullOrWhiteSpace(raw)) { broadcast = false; break; }
                    var trimmed = raw.Trim();
                    if (trimmed.Length > 30) { broadcast = false; break; }
                    var caller = room.Players.FirstOrDefault(p => p.Id == playerId);
                    if (caller is null) { broadcast = false; break; }
                    var clash = room.Players.Any(p =>
                        p.Id != playerId &&
                        string.Equals(p.Name, trimmed, StringComparison.OrdinalIgnoreCase));
                    if (clash) { broadcast = false; break; }
                    caller.Name = trimmed;
                    break;
                }
                case "configure":
                {
                    var caller = room.Players.FirstOrDefault(p => p.Id == playerId);
                    if (caller is null || !caller.IsHost)
                    {
                        broadcast = false;
                        break;
                    }

                    var changed = false;

                    if (root.TryGetProperty("cardValues", out var cv) && cv.ValueKind == JsonValueKind.Array)
                    {
                        var values = new List<string>();
                        var seen = new HashSet<string>(StringComparer.Ordinal);
                        foreach (var el in cv.EnumerateArray())
                        {
                            if (el.ValueKind != JsonValueKind.String) continue;
                            var s = el.GetString();
                            if (string.IsNullOrWhiteSpace(s)) continue;
                            var trimmed = s.Trim();
                            if (trimmed.Length > 8) continue;
                            if (seen.Add(trimmed)) values.Add(trimmed);
                            if (values.Count >= 16) break;
                        }
                        if (values.Count >= 2)
                        {
                            var newArr = values.ToArray();
                            if (!room.CardValues.SequenceEqual(newArr))
                            {
                                room.CardValues = newArr;
                                foreach (var p in room.Players) p.Vote = null;
                                room.Revealed = false;
                            }
                            changed = true;
                        }
                    }

                    if (root.TryGetProperty("hostOnlyControls", out var hoc) &&
                        (hoc.ValueKind == JsonValueKind.True || hoc.ValueKind == JsonValueKind.False))
                    {
                        room.HostOnlyControls = hoc.GetBoolean();
                        changed = true;
                    }

                    if (!changed) broadcast = false;
                    break;
                }
                default:
                    broadcast = false;
                    break;
            }
        }
        finally { session.Lock.Release(); }

        if (broadcast)
        {
            await _store.BroadcastAsync(session, new { type = "state", room }, ct);
        }
    }

    private Task SendJoined(WebSocket socket, string playerId, Room room, CancellationToken ct)
    {
        _log.LogInformation("Player {PlayerId} connected to room {RoomId} (total players: {Count})",
            playerId, room.Id, room.Players.Count);
        return RoomStore.SendAsync(socket, new { type = "joined", playerId, room }, _json, ct);
    }

    private Task Error(WebSocket socket, string message, CancellationToken ct) =>
        RoomStore.SendAsync(socket, new { type = "error", message }, _json, ct);

    private static async Task<string?> ReceiveAsync(WebSocket socket, CancellationToken ct)
    {
        var buffer = new byte[4096];
        using var ms = new MemoryStream();
        WebSocketReceiveResult result;
        do
        {
            result = await socket.ReceiveAsync(buffer, ct);
            if (result.MessageType == WebSocketMessageType.Close) return null;
            ms.Write(buffer, 0, result.Count);
        }
        while (!result.EndOfMessage);

        if (result.MessageType != WebSocketMessageType.Text) return null;
        return Encoding.UTF8.GetString(ms.ToArray());
    }

    private static async Task CloseSocketAsync(WebSocket socket)
    {
        if (socket.State != WebSocketState.Open) return;
        try
        {
            await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "removed", CancellationToken.None);
        }
        catch { }
    }
}
