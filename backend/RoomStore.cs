using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace PlanningPoker.Server;

public sealed class RoomSession
{
    public Room Room { get; }
    public ConcurrentDictionary<string, WebSocket> Connections { get; } = new();
    public SemaphoreSlim Lock { get; } = new(1, 1);

    public RoomSession(Room room)
    {
        Room = room;
    }
}

public sealed class RoomStore
{
    private readonly ConcurrentDictionary<string, RoomSession> _rooms = new(StringComparer.OrdinalIgnoreCase);
    private readonly JsonSerializerOptions _json;

    public RoomStore(JsonSerializerOptions json)
    {
        _json = json;
    }

    public RoomSession CreateRoom(string roomName)
    {
        string id;
        do { id = GenerateId(); } while (_rooms.ContainsKey(id));

        var room = new Room
        {
            Id = id,
            Name = string.IsNullOrWhiteSpace(roomName) ? "Planning Poker" : roomName,
            Players = new List<Player>(),
            Revealed = false,
            CardValues = Cards.Fibonacci,
        };
        var session = new RoomSession(room);
        _rooms[id] = session;
        return session;
    }

    public RoomSession? GetRoom(string roomId) =>
        _rooms.TryGetValue(roomId, out var session) ? session : null;

    public void RemoveRoomIfEmpty(string roomId)
    {
        if (_rooms.TryGetValue(roomId, out var session) &&
            session.Room.Players.Count == 0 &&
            session.Connections.IsEmpty)
        {
            _rooms.TryRemove(roomId, out _);
        }
    }

    public async Task BroadcastAsync(RoomSession session, object message, CancellationToken ct)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(message, _json);
        var segment = new ArraySegment<byte>(bytes);

        var stale = new List<string>();
        foreach (var (playerId, socket) in session.Connections)
        {
            if (socket.State != WebSocketState.Open)
            {
                stale.Add(playerId);
                continue;
            }
            try
            {
                await socket.SendAsync(segment, WebSocketMessageType.Text, endOfMessage: true, ct);
            }
            catch
            {
                stale.Add(playerId);
            }
        }

        foreach (var id in stale)
        {
            session.Connections.TryRemove(id, out _);
        }
    }

    public static async Task SendAsync(WebSocket socket, object message, JsonSerializerOptions json, CancellationToken ct)
    {
        if (socket.State != WebSocketState.Open) return;
        var bytes = JsonSerializer.SerializeToUtf8Bytes(message, json);
        await socket.SendAsync(bytes, WebSocketMessageType.Text, endOfMessage: true, ct);
    }

    public static string GenerateId()
    {
        const string chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ23456789";
        var buf = new char[6];
        var rng = Random.Shared;
        for (int i = 0; i < buf.Length; i++) buf[i] = chars[rng.Next(chars.Length)];
        return new string(buf);
    }
}
