"use client";

import {
  LiveKitRoom,
  VideoTrack,
  useTracks,
  useRoomContext,
  useConnectionState,
  RoomAudioRenderer,
  useLocalParticipant,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { useCallback, useEffect, useState } from "react";

interface AvatarRoomProps {
  token: string;
  wsUrl: string;
  roomName: string;
  onDisconnect: () => void;
}

function AvatarDisplay() {
  // Get all video tracks in the room
  const tracks = useTracks([Track.Source.Camera]);

  // Find the avatar's video track (it's the only non-local camera track)
  const avatarTrack = tracks.find(
    (track) => !track.participant.isLocal && track.source === Track.Source.Camera
  );

  if (!avatarTrack) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <div className="animate-pulse mb-2">Waiting for avatar...</div>
          <div className="text-sm">The avatar will appear when the agent connects</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <VideoTrack
        trackRef={avatarTrack}
        className="w-full h-full object-cover rounded-2xl"
      />
    </div>
  );
}

function ConnectionStatus() {
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();

  const statusColors: Record<ConnectionState, string> = {
    [ConnectionState.Connected]: "bg-green-500",
    [ConnectionState.Connecting]: "bg-yellow-500",
    [ConnectionState.Disconnected]: "bg-red-500",
    [ConnectionState.Reconnecting]: "bg-yellow-500",
    [ConnectionState.SignalReconnecting]: "bg-yellow-500",
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className={`w-2 h-2 rounded-full ${statusColors[connectionState] || "bg-gray-500"}`}
      />
      <span className="text-gray-300">
        {connectionState === ConnectionState.Connected
          ? `Connected as ${localParticipant.identity}`
          : connectionState}
      </span>
    </div>
  );
}

function MicrophoneToggle() {
  const { localParticipant } = useLocalParticipant();
  const [isMuted, setIsMuted] = useState(false);

  const toggleMicrophone = useCallback(async () => {
    if (!localParticipant) return;

    await localParticipant.setMicrophoneEnabled(isMuted);
    setIsMuted(!isMuted);
  }, [localParticipant, isMuted]);

  // Enable microphone on mount
  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(true);
    }
  }, [localParticipant]);

  return (
    <button
      onClick={toggleMicrophone}
      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
        isMuted
          ? "bg-red-600 hover:bg-red-700 text-white"
          : "bg-green-600 hover:bg-green-700 text-white"
      }`}
    >
      {isMuted ? "Unmute" : "Muted"}
    </button>
  );
}

function RoomContent({ onDisconnect }: { onDisconnect: () => void }) {
  const room = useRoomContext();

  const handleDisconnect = useCallback(() => {
    room.disconnect();
    onDisconnect();
  }, [room, onDisconnect]);

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <h1 className="text-xl font-semibold text-white">Nora</h1>
        <ConnectionStatus />
      </header>

      {/* Main content - Avatar display */}
      <main className="flex-1 p-6">
        <div className="h-full max-w-4xl mx-auto bg-gray-800 rounded-2xl overflow-hidden">
          <AvatarDisplay />
        </div>
      </main>

      {/* Controls */}
      <footer className="flex items-center justify-center gap-4 px-6 py-4 border-t border-gray-800">
        <MicrophoneToggle />
        <button
          onClick={handleDisconnect}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
        >
          Leave
        </button>
      </footer>

      {/* Audio renderer - plays remote audio tracks */}
      <RoomAudioRenderer />
    </div>
  );
}

export default function AvatarRoom({
  token,
  wsUrl,
  roomName,
  onDisconnect,
}: AvatarRoomProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={wsUrl}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={onDisconnect}
    >
      <RoomContent onDisconnect={onDisconnect} />
    </LiveKitRoom>
  );
}
