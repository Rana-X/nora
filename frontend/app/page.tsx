"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";

// Dynamically import AvatarRoom to avoid SSR issues with LiveKit
const AvatarRoom = dynamic(() => import("@/components/AvatarRoom"), {
  ssr: false,
});

interface RoomCredentials {
  token: string;
  wsUrl: string;
  roomName: string;
}

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomCredentials, setRoomCredentials] = useState<RoomCredentials | null>(
    null
  );

  const joinRoom = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // Generate a unique room name and participant identity
      const roomName = `nora-room-${Date.now()}`;
      const participantName = `user-${Math.random().toString(36).substring(7)}`;

      const response = await fetch("/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomName,
          participantName,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to get token");
      }

      const { token, wsUrl } = await response.json();

      setRoomCredentials({
        token,
        wsUrl,
        roomName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    setRoomCredentials(null);
  }, []);

  // If connected to a room, show the avatar room
  if (roomCredentials) {
    return (
      <AvatarRoom
        token={roomCredentials.token}
        wsUrl={roomCredentials.wsUrl}
        roomName={roomCredentials.roomName}
        onDisconnect={handleDisconnect}
      />
    );
  }

  // Landing page with join button
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900">
      <div className="text-center">
        {/* Logo/Title */}
        <h1 className="text-5xl font-bold text-white mb-4">Nora</h1>
        <p className="text-gray-400 mb-8 max-w-md">
          AI Voice Agent with realistic avatar. Click below to start a conversation.
        </p>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* Join button */}
        <button
          onClick={joinRoom}
          disabled={isConnecting}
          className={`px-8 py-4 text-lg font-semibold rounded-full transition-all ${
            isConnecting
              ? "bg-gray-700 text-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white hover:scale-105"
          }`}
        >
          {isConnecting ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Connecting...
            </span>
          ) : (
            "Start Conversation"
          )}
        </button>

        {/* Instructions */}
        <div className="mt-12 text-sm text-gray-500">
          <p>Make sure your microphone is enabled.</p>
          <p className="mt-1">The AI agent will join automatically.</p>
        </div>
      </div>
    </div>
  );
}
