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
import { ConnectionState, Track, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useState } from "react";
import { BrowserDisplay } from "./BrowserDisplay";

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

  // Browser state - separate VNC credentials from active browsing state
  const [vncHostname, setVncHostname] = useState<string>("");
  const [vncPassword, setVncPassword] = useState<string>("");
  const [hasVncCredentials, setHasVncCredentials] = useState(false);
  const [browserActive, setBrowserActive] = useState(false);

  // Debug logging for state changes
  useEffect(() => {
    console.log("[DEBUG] Browser state:", { 
      hasVncCredentials, 
      browserActive, 
      vncHostname: vncHostname ? `${vncHostname.slice(0, 20)}...` : "none",
      vncPassword: vncPassword ? "***" : "none"
    });
  }, [hasVncCredentials, browserActive, vncHostname, vncPassword]);

  // Listen for browser messages from agent via data channel
  useEffect(() => {
    const handleData = (payload: Uint8Array) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        console.log("[DEBUG] Received data message:", data.type);

        if (data.type === 'browser_ready') {
          // Store VNC credentials but don't activate browser yet
          console.log("[DEBUG] Received VNC credentials:", {
            hostname: data.hostname?.slice(0, 20) + "...",
            hasPassword: !!data.password
          });
          setVncHostname(data.hostname);
          setVncPassword(data.password);
          setHasVncCredentials(true);
        } else if (data.type === 'browser_task_started') {
          // Agent started a browser task - show browser in PiP mode
          console.log("[DEBUG] Browser task started - activating PiP mode");
          setBrowserActive(true);
        } else if (data.type === 'browser_task_completed') {
          // Agent finished browser task - hide browser, restore avatar
          console.log("[DEBUG] Browser task completed - deactivating PiP mode");
          setBrowserActive(false);
        }
      } catch (e) {
        console.error("Failed to parse data message:", e);
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  const handleDisconnect = useCallback(() => {
    room.disconnect();
    onDisconnect();
  }, [room, onDisconnect]);

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-white">Nora</h1>
          {browserActive && (
            <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded-full">
              Browser Active
            </span>
          )}
        </div>
        <ConnectionStatus />
      </header>

      {/* Main content - Avatar and Browser display with PiP mode */}
      <main className="flex-1 p-6 overflow-hidden relative">
        {/* Browser - full screen when active */}
        {browserActive && hasVncCredentials && (
          <div className="absolute inset-6 z-0 transition-all duration-300">
            <BrowserDisplay
              hostname={vncHostname}
              password={vncPassword}
              isVisible={true}
            />
          </div>
        )}

        {/* Avatar - PiP (256x192) in bottom-right when browser active, full screen when not */}
        <div
          className={`transition-all duration-300 ${
            browserActive
              ? "absolute bottom-8 right-8 w-[256px] h-[192px] z-10 shadow-2xl rounded-2xl overflow-hidden border-2 border-gray-700"
              : "h-full"
          }`}
        >
          <div className="h-full bg-gray-800 rounded-2xl overflow-hidden">
            <AvatarDisplay />
          </div>
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
