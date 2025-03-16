// server.js
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer();
const io = new Server(server, {
    cors: { origin: "*" },
});

// In-memory store for each room
// roomData[roomId] = {
//   video: { videoId, videoUrl, currentTime, isPlaying },
//   chat: [ { username, message }, ... ],
// }
const roomData = {};

io.on("connection", (socket) => {
    console.log("New client:", socket.id);

    // 1) Join a room
    socket.on("joinRoom", ({ roomId, username }) => {
        socket.join(roomId);
        socket.data.username = username || "Anonymous";

        // If this room doesn't exist yet, initialize it
        if (!roomData[roomId]) {
            roomData[roomId] = {
                video: {
                    videoId: "",
                    videoUrl: "",
                    currentTime: 0,
                    isPlaying: false,
                },
                chat: [],
            };
        }

        // Send the existing room data (chat + video) to the new user
        socket.emit("roomData", roomData[roomId]);

        // Broadcast updated members
        broadcastMembers(roomId);
    });

    // 2) Chat messages
    socket.on("chatMessage", ({ roomId, message }) => {
        const username = socket.data.username || "Anonymous";
        // Store in room's chat history
        roomData[roomId].chat.push({ username, message });
        // Broadcast to others
        socket.to(roomId).emit("chatMessage", { username, message });
    });

    // 3) Video load
    socket.on("videoLoad", ({ roomId, videoId, videoUrl }) => {
        const videoState = roomData[roomId].video;
        videoState.videoId = videoId;
        videoState.videoUrl = videoUrl;
        videoState.currentTime = 0; // reset to start
        videoState.isPlaying = false;

        // Broadcast to others
        socket.to(roomId).emit("videoLoad", { videoId, videoUrl });
    });

    // 4) Video control (play, pause, seek)
    socket.on("videoControl", ({ roomId, action, currentTime }) => {
        const videoState = roomData[roomId].video;
        if (action === "play") {
            videoState.isPlaying = true;
            videoState.currentTime = currentTime;
        } else if (action === "pause") {
            videoState.isPlaying = false;
            videoState.currentTime = currentTime;
        } else if (action === "seek") {
            videoState.currentTime = currentTime;
        }

        // Broadcast to others
        socket.to(roomId).emit("videoControl", { roomId, action, currentTime });
    });

    // 5) Disconnect
    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        // Let others know the members changed
        for (const roomId of socket.rooms) {
            if (roomId !== socket.id) {
                broadcastMembers(roomId);
            }
        }
    });

    function broadcastMembers(roomId) {
        const members = getMembersInRoom(io, roomId);
        io.to(roomId).emit("roomMembers", members);
    }
});

// Helper to get the members in a room
function getMembersInRoom(io, roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (!room) return [];
    const members = [];
    for (const clientId of room) {
        const clientSocket = io.sockets.sockets.get(clientId);
        if (clientSocket && clientSocket.data.username) {
            members.push(clientSocket.data.username);
        }
    }
    return members;
}

server.listen(3001, () => {
    console.log("Socket.IO server running on port 3001");
});
