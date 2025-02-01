require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { OpenAI } = require("openai");
const fs = require("fs");
const { createWriteStream } = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("audio_stream", async (audioBuffer) => {
        try {
            // 🔥 Transcribe Speech in Real Time
            const transcribeRes = await openai.audio.transcriptions.create({
                file: fs.createReadStream(audioBuffer), // Receiving audio in chunks
                model: "whisper-1"
            });
            const userText = transcribeRes.text;
            console.log("User:", userText);

            // 🔥 GPT-4 Streaming Response
            const gptRes = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [{ role: "system", content: "You are a real-time AI assistant." },
                           { role: "user", content: userText }],
                stream: true
            });

            let aiResponse = "";
            for await (const chunk of gptRes) {
                aiResponse += chunk.choices[0].delta?.content || "";
                socket.emit("gpt_response", aiResponse); // Send real-time text response
            }

            console.log("AI:", aiResponse);

            // 🔥 Stream Text-to-Speech (TTS)
            const ttsStream = await openai.audio.speech.create({
                model: "tts-1",
                voice: "alloy",
                input: aiResponse,
                stream: true
            });

            const audioStream = createWriteStream(`outputs/audio_${Date.now()}.mp3`);
            for await (const chunk of ttsStream) {
                audioStream.write(chunk);
                socket.emit("audio_response", chunk); // Send AI voice chunks in real time
            }

        } catch (error) {
            console.error("Error:", error);
            socket.emit("error", { message: "Something went wrong." });
        }
    });

    socket.on("disconnect", () => console.log("Client disconnected"));
});

server.listen(5000, () => console.log("Server running on http://localhost:5000"));
