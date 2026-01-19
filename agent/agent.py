"""
Nora: AI Voice Agent with Beyond Presence Avatar
================================================

Based on the official bey-examples livekit-agent implementation.
Uses OpenAI's Realtime API for voice-to-voice conversation.
"""

import os
import sys
import logging

from dotenv import load_dotenv
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    WorkerType,
    cli,
)
from livekit.agents.voice import Agent, AgentSession
from livekit.plugins import bey, openai

# Load environment variables from parent directory's .env file
load_dotenv(dotenv_path="../.env")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("nora-agent")

# System prompt for Nora's personality
SYSTEM_PROMPT = """You are Nora, a friendly and engaging AI assistant with a warm personality.

CONVERSATION STYLE:
- Be concise and natural. Aim for 1-3 sentences per response unless more detail is needed.
- Use conversational language, not formal or robotic phrasing.
- Show genuine interest in what the user is saying.

ACTIVE LISTENING:
- When the user pauses mid-thought, use brief acknowledgments like "mhm", "right", "I see", or "go on".
- These should feel natural, not forced. Only use them when appropriate.

PERSONALITY:
- Be warm and approachable, like talking to a knowledgeable friend.
- Use light humor when appropriate, but don't force it.
- Be helpful without being overly eager.
- If you don't know something, say so honestly.

IMPORTANT:
- Never use emojis in speech (they can't be spoken).
- Avoid bullet points or lists - speak in natural sentences.
- Don't start responses with filler phrases like "Great question!"
"""


async def entrypoint(ctx: JobContext) -> None:
    """Main entry point for the agent."""
    logger.info(f"Agent connecting to room: {ctx.room.name}")

    # Connect to room, only subscribing to audio
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("Connected to room")

    # Create the voice agent session using OpenAI's Realtime API
    # This handles STT, LLM, and TTS in one integrated model
    voice_agent_session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            voice="shimmer",  # Options: alloy, echo, fable, onyx, nova, shimmer
        ),
    )

    # Create the agent with personality instructions
    voice_agent = Agent(instructions=SYSTEM_PROMPT)

    # Initialize Beyond Presence avatar
    avatar_id = os.environ.get("BEY_AVATAR_ID")
    if not avatar_id:
        logger.error("BEY_AVATAR_ID not set in environment")
        return

    logger.info(f"Initializing Beyond Presence avatar: {avatar_id}")
    bey_avatar_session = bey.AvatarSession(avatar_id=avatar_id)

    # Start the voice agent session
    await voice_agent_session.start(agent=voice_agent, room=ctx.room)
    logger.info("Voice agent session started")

    # Start the avatar session (connects avatar to the voice agent's audio)
    await bey_avatar_session.start(voice_agent_session, room=ctx.room)
    logger.info("Avatar session started")


if __name__ == "__main__":
    load_dotenv()

    # Override args for LiveKit CLI if running directly
    if len(sys.argv) == 1:
        sys.argv = [sys.argv[0], "dev"]

    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            worker_type=WorkerType.ROOM,
        )
    )
