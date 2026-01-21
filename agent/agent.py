"""
Nora: AI Voice Agent with Beyond Presence Avatar + Orgo Browser Control
========================================================================

Based on the official bey-examples livekit-agent implementation.
Uses OpenAI's Realtime API for voice-to-voice conversation.
Integrates Orgo.ai for browser control capabilities.

Updated to use LiveKit Agents v1.0 API patterns.
"""

import asyncio
import base64
import json
import os
import sys
import logging

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    RunContext,
    WorkerOptions,
    WorkerType,
    cli,
    function_tool,
)
from livekit.plugins import bey, openai
from orgo import Computer

# Load environment variables from parent directory's .env file
load_dotenv(dotenv_path="../.env")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("nora-agent")

# System prompt for Nora's personality with browser capabilities
SYSTEM_PROMPT = """You are Nora, a friendly AI assistant with the ability to control a web browser.

CAPABILITIES:
- You can browse the web, search for information, shop online, fill forms, etc.
- When the user asks you to do something on the web, use the browse_and_act tool.
- Describe what you're doing as you work ("I'm opening Amazon now...", "Adding that to your cart...")

CONVERSATION STYLE:
- Be concise and natural. Aim for 1-3 sentences per response.
- When performing browser tasks, give brief status updates.
- If a task fails, explain what went wrong simply.

BROWSER TASKS:
- For shopping: Navigate to the site, search, and add items to cart (don't checkout without permission)
- For research: Search and summarize findings verbally
- For forms: Ask for any information you need before filling

IMPORTANT - BEFORE USING BROWSER:
- You CANNOT speak while the browser is working (it takes 10-30 seconds)
- ALWAYS tell the user you're starting BEFORE calling the browse_and_act tool
- Example: "Okay, I'm heading to Amazon to find those bananas. Give me a moment to browse." -> then call tool
- This prevents users from thinking the system crashed during silence

ACTIVE LISTENING:
- When the user pauses mid-thought, use brief acknowledgments like "mhm", "right", "I see"

PERSONALITY:
- Warm and approachable, like talking to a knowledgeable friend
- Proactive about offering to help with web tasks
- Honest about limitations

IMPORTANT:
- Never use emojis in speech (they can't be spoken)
- Avoid bullet points or lists - speak in natural sentences
- Don't start responses with filler phrases like "Great question!"
"""


class NoraAgent(Agent):
    """Nora voice agent with browser control capabilities via Orgo.ai"""

    def __init__(self, computer: Computer = None, room=None):
        super().__init__(instructions=SYSTEM_PROMPT)
        self.computer = computer
        self.room = room

    async def publish_browser_status(self, status_type: str):
        """Publish browser task status to frontend via data channel."""
        if not self.room:
            logger.warning("No room available to publish browser status")
            return
        try:
            status_data = json.dumps({"type": status_type})
            await self.room.local_participant.publish_data(
                status_data.encode(),
                reliable=True
            )
            logger.info(f"Published browser status: {status_type}")
        except Exception as e:
            logger.error(f"Failed to publish browser status: {e}")

    @function_tool()
    async def browse_and_act(self, context: RunContext, instruction: str) -> str:
        """
        Execute a multi-step browser task.
        Use this for shopping, research, navigation, or any web interaction.
        Example: "Go to Amazon and add bananas to cart"

        Args:
            instruction: The task to perform in the browser, e.g. "Go to Amazon and add bananas to cart"
        """
        logger.info(f"Starting browser task: {instruction}")

        if not self.computer:
            logger.error("No Orgo computer available for browser tasks")
            return "I'm sorry, the browser is not available right now."

        # Notify frontend that browser task is starting
        await self.publish_browser_status("browser_task_started")

        try:
            # Use Orgo's hosted agent service for reliable execution
            result = await asyncio.to_thread(
                self.computer.prompt,
                instruction=instruction,
                model="claude-sonnet-4-5-20250929",  # Claude Sonnet 4.5
                provider="orgo"  # Use Orgo's hosted service instead of local Anthropic
            )

            logger.info(f"Browser task completed successfully")
            return result
        except Exception as e:
            logger.error(f"Browser task failed: {e}")
            return f"I encountered an error while trying to do that: {str(e)}"
        finally:
            # Always notify frontend that browser task is done
            await self.publish_browser_status("browser_task_completed")

    @function_tool()
    async def take_screenshot(self, context: RunContext) -> str:
        """Take a screenshot of the current browser state."""
        if not self.computer:
            return "Browser is not available."
        try:
            # Run blocking I/O in thread
            image_bytes = await asyncio.to_thread(self.computer.screenshot)

            # Convert bytes to base64 string
            base64_image = base64.b64encode(image_bytes).decode('utf-8')
            return f"data:image/png;base64,{base64_image}"
        except Exception as e:
            logger.error(f"Screenshot failed: {e}")
            return f"Failed to take screenshot: {str(e)}"


async def publish_vnc_credentials_with_retry(room, max_retries: int = 5, delay: float = 1.0):
    """
    Publish VNC credentials with retries to handle race condition.

    VNC credentials are read from environment variables:
    - ORGO_VNC_HOST: The VNC hostname (e.g., orgo-computer-p9noby06.orgo.dev)
    - ORGO_VNC_PASSWORD: The VNC password (from Orgo dashboard -> Computer Settings)
    """
    vnc_host = os.environ.get("ORGO_VNC_HOST")
    vnc_password = os.environ.get("ORGO_VNC_PASSWORD")
    
    if not vnc_host or not vnc_password:
        logger.warning("VNC credentials not configured. Set ORGO_VNC_HOST and ORGO_VNC_PASSWORD in .env")
        logger.warning("Get these from Orgo dashboard -> Computer Settings")
        return False
    
    browser_data = json.dumps({
        "type": "browser_ready",
        "hostname": vnc_host,
        "password": vnc_password
    })

    for attempt in range(max_retries):
        try:
            await room.local_participant.publish_data(
                browser_data.encode(),
                reliable=True
            )
            logger.info(f"VNC credentials published (attempt {attempt + 1}/{max_retries})")

            # Publish multiple times to ensure frontend receives it
            if attempt < 2:
                await asyncio.sleep(delay)
                continue
            return True
        except Exception as e:
            logger.warning(f"Failed to publish VNC credentials (attempt {attempt + 1}): {e}")
            await asyncio.sleep(delay)

    logger.error("Failed to publish VNC credentials after all retries")
    return False


async def entrypoint(ctx: JobContext) -> None:
    """Main entry point for the agent."""
    logger.info(f"Agent connecting to room: {ctx.room.name}")

    # Connect to room, only subscribing to audio
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("Connected to room")

    # Initialize Orgo Computer for browser control
    computer = None
    try:
        # Use existing persistent computer if ID provided
        computer_id = os.environ.get("ORGO_COMPUTER_ID")
        api_key = os.environ.get("ORGO_API_KEY")
        
        if not api_key:
            logger.error("ORGO_API_KEY not set in environment")
            raise ValueError("ORGO_API_KEY required for browser control")
        
        if computer_id:
            # Explicitly pass api_key to ensure SDK uses correct credentials
            computer = Computer(computer_id=computer_id, api_key=api_key)
            logger.info(f"Connected to existing Orgo Computer: {computer_id}")
        else:
            computer = Computer(api_key=api_key)
            logger.info(f"Created new Orgo Computer")
        logger.info(f"Orgo Computer URL: {computer.url}")
    except Exception as e:
        logger.warning(f"Failed to initialize Orgo Computer: {e}")
        logger.warning("Browser control will not be available")

    # Create the voice agent session using OpenAI's Realtime API
    # This handles STT, LLM, and TTS in one integrated model
    voice_agent_session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            voice="shimmer",  # Options: alloy, echo, fable, onyx, nova, shimmer
        ),
    )

    # Create the Nora agent with browser tools
    # In v1.0, tools decorated with @function_tool() are automatically registered
    nora_agent = NoraAgent(computer=computer, room=ctx.room)
    
    if computer:
        logger.info(f"NoraAgent created with browser capabilities")
        logger.info(f"  - Tools: browse_and_act, take_screenshot")
    else:
        logger.info("NoraAgent created without browser tools (Orgo not available)")

    # Initialize Beyond Presence avatar
    avatar_id = os.environ.get("BEY_AVATAR_ID")
    if not avatar_id:
        logger.error("BEY_AVATAR_ID not set in environment")
        return

    logger.info(f"Initializing Beyond Presence avatar: {avatar_id}")
    bey_avatar_session = bey.AvatarSession(avatar_id=avatar_id)

    # Start the voice agent session
    await voice_agent_session.start(agent=nora_agent, room=ctx.room)
    logger.info("Voice agent session started")

    # Start the avatar session (connects avatar to the voice agent's audio)
    await bey_avatar_session.start(voice_agent_session, room=ctx.room)
    logger.info("Avatar session started")

    # Publish VNC credentials AFTER sessions start to avoid race condition
    # VNC credentials are read from ORGO_VNC_HOST and ORGO_VNC_PASSWORD env vars
    await asyncio.sleep(0.5)  # Small delay for frontend listener setup
    asyncio.create_task(publish_vnc_credentials_with_retry(ctx.room))


if __name__ == "__main__":
    load_dotenv()

    # Override args for LiveKit CLI if running directly
    if len(sys.argv) == 1:
        sys.argv = [sys.argv[0], "dev"]

    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            worker_type=WorkerType.ROOM,
            agent_name="nora-voice-agent",
        )
    )
