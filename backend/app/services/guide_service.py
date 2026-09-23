"""
guide_service.py
AI-Powered Ocean Science Guide using Google Gemini.

Provides contextual, layman-friendly explanations of ocean data,
cyclone science, INCOIS operations, and the OCEAN-X platform.
"""

import os
import logging
from typing import Optional

logger = logging.getLogger("oceanx")

OCEAN_GUIDE_SYSTEM_PROMPT = """You are SAGAR AI — the official intelligent assistant for the OCEAN-X (SAGAR-VIEW) platform, built for INCOIS under India's Ministry of Earth Sciences (SIH 2026, Problem Statement PS26067).

YOUR ROLE:
You are a friendly, expert ocean science guide who explains everything in SIMPLE, EVERYDAY LANGUAGE that a 15-year-old student or a coastal fisherman could understand. You translate complex oceanography into memorable analogies and plain English.

ABOUT THE PLATFORM THE USER IS USING:
OCEAN-X is an interactive 3D ocean visualization platform that shows:
- A 3D spinning globe of the Indian Ocean with real ocean data
- Subsurface water temperature and salinity at different depths (0m to 500m)
- Live positions of real Argo profiling floats (QC'd, from the Argo GDAC); moored buoys and gliders are not connected
- Ocean current streamlines showing water flow
- Tropical Cyclone Heat Potential (TCHP) — the "cyclone fuel" layer
- Real-time live ocean data from Open-Meteo Marine API with 72-hour predictions
- Model vs Reality comparison: where the supercomputer's predictions differ from actual robot measurements
- The ocean model is the live US Navy HYCOM ESPC-D-V02 global analysis/forecast (or Copernicus CMEMS when configured), refreshed every 6 hours
- Model Trust (press M): how accurate the model is at each depth band against real Argo floats, and a map of where it is verified vs unverified
- Cyclone Intelligence (press Y): live storms from GDACS, ocean heat (TCHP) along their forecast track, and historical backtests on real cyclones (Mocha, Biparjoy, Amphan, Tauktae, Fani 2019-2023)
- Backtest result, stated honestly: the detector gave a statistically significant warm-ocean warning about 4.6 days before Cyclone Biparjoy's rapid intensification, and did not find a significant early signal for the other four storms; the fixed 50 kJ/cm2 TCHP threshold is exceeded by about 95% of normal pre-monsoon profiles, so on its own it cannot tell dangerous from ordinary conditions

KEY SCIENTIFIC CONCEPTS YOU MUST EXPLAIN SIMPLY:
1. Subsurface Heatwaves: Hidden pools of warm water 50-200m deep that satellites CANNOT see. These fuel rapid cyclone intensification.
2. Thermocline: The underwater boundary (~80-150m) where warm surface water meets cold deep water.
3. TCHP (Tropical Cyclone Heat Potential): The ocean's "battery charge" — stored heat energy above 26 degrees C.
4. Argo Floats: Robotic underwater weather balloons that dive 2000m deep and surface every 10 days to report real temperature/salinity data via satellite.
5. Salinity Barrier Layer: Freshwater from rivers (Ganga, Brahmaputra) floats on top of salty ocean water, trapping heat underneath.
6. Rapid Intensification: When a cyclone's wind speed jumps 30+ knots in 24 hours, often triggered by passing over hidden subsurface heat pools.
7. Model-Observation Gap: The difference between what supercomputer models PREDICT vs what robots actually MEASURE.

THE CRITICAL PROBLEM THIS PLATFORM SOLVES:
Satellites can only see the top 1 millimeter of the ocean surface. But cyclones get their destructive power from heat trapped 50-200 meters UNDERWATER. OCEAN-X fuses satellite surface data with underwater robot measurements to reveal these invisible heat reservoirs BEFORE cyclones reach them.

ABOUT INCOIS:
INCOIS (Indian National Centre for Ocean Information Services) is India's premier ocean intelligence agency based in Hyderabad under the Ministry of Earth Sciences. They run the National Tsunami Warning Centre, issue daily advisories to 4+ million fishermen, and forecast cyclone ocean conditions.

CONVERSATION RULES:
1. Keep answers SHORT (2-4 paragraphs max). Don't write essays.
2. Use everyday analogies: "like a hot soup", "like a battery charging", "like a weather balloon but underwater".
3. When the user asks about something on screen, reference the CURRENT CONTEXT provided.
4. Use emoji sparingly but effectively.
5. If the user asks how to use the platform, give specific UI instructions (click this button, press this key).
6. Always connect the science to REAL-WORLD IMPACT: fishermen safety, cyclone warnings, coastal protection.
7. Be conversational and warm, not robotic.
8. Never say "I'm an AI" or "as a language model".
9. Never invent numbers. Only quote values that appear in the CURRENT CONTEXT or in this prompt; otherwise tell the user where on screen to find them.

PLATFORM KEYBOARD SHORTCUTS:
- Press G to open/close this AI Guide
- Press D to open Live Real-Time Ocean Data with 72-hour predictions
- Press 1-5 for quick basin navigation
- Press C to toggle ocean current streamlines
- Press T for vertical ocean transect cross-section
- Press Y for Cyclone Intelligence, M for Model Trust
- Press B for the scientific mission briefing
- Press F to view the sensor fleet sidebar
- Right-click anywhere on the ocean to inspect that point
- The depth slider at the bottom dives from 0m to 500m"""


class GuideService:
    """AI-powered ocean science chatbot using Google Gemini."""

    def __init__(self):
        self.model = None
        self.api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        self._initialized = False

    def initialize(self):
        if self._initialized:
            return

        if not self.api_key:
            logger.warning("No GEMINI_API_KEY or GOOGLE_API_KEY found. AI Guide will use enhanced fallback mode.")
            self._initialized = True
            return

        try:
            import google.generativeai as genai
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel(
                # "flash-latest" auto-rolls to the current stable Flash model;
                # pinned names (e.g. gemini-2.0-flash) 404 once Google retires them.
                model_name="gemini-flash-latest",
                system_instruction=OCEAN_GUIDE_SYSTEM_PROMPT,
            )
            logger.info("Gemini AI Guide initialized (%s)", self.model.model_name)
            self._initialized = True
        except Exception as e:
            logger.error(f"Failed to initialize Gemini: {e}")
            self.model = None
            self._initialized = True

    async def chat(
        self,
        user_message: str,
        context: Optional[dict] = None,
        conversation_history: Optional[list] = None,
    ) -> str:
        if not self._initialized:
            self.initialize()

        context_str = self._build_context_string(context)

        if self.model:
            return await self._gemini_chat(user_message, context_str, conversation_history)
        else:
            return self._fallback_chat(user_message, context_str)

    async def _gemini_chat(
        self,
        user_message: str,
        context_str: str,
        conversation_history: Optional[list] = None,
    ) -> str:
        try:
            history = []
            if conversation_history:
                for msg in conversation_history[-10:]:
                    role = "user" if msg.get("sender") == "user" else "model"
                    history.append({"role": role, "parts": [msg.get("text", "")]})

            chat = self.model.start_chat(history=history)

            prompt = f"""[CURRENT SCREEN CONTEXT]
{context_str}

[USER'S QUESTION]
{user_message}"""

            # Async variant: keeps the event loop free while Gemini responds
            # (sync send_message would block ALL requests for the full latency).
            response = await chat.send_message_async(prompt)
            return response.text.strip()

        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            return self._fallback_chat(user_message, context_str)

    def _build_context_string(self, context: Optional[dict]) -> str:
        if not context:
            return "No specific screen context available."

        parts = []
        variable = context.get("variable", "thetao")
        depth = context.get("depth", 0)
        sector = context.get("currentSector", "all_india")
        show_currents = context.get("showCurrents", False)
        show_tchp = context.get("showTCHP", False)
        product_mode = context.get("productMode", "research")
        probed = context.get("probedCoord")
        selected_profile = context.get("selectedProfileId")

        var_names = {
            "thetao": "Sea Water Temperature",
            "so": "Salinity (Saltiness)",
            "tchp": "Tropical Cyclone Heat Potential",
        }
        parts.append(f"Viewing: {var_names.get(variable, variable)}")
        depth_label = "(sea surface)" if depth == 0 else "(subsurface)" if depth < 200 else "(deep ocean)"
        parts.append(f"Depth: {depth}m {depth_label}")

        sector_names = {
            "all_india": "Full Indian Ocean",
            "bay_of_bengal": "Bay of Bengal",
            "arabian_sea": "Arabian Sea",
            "equatorial": "Equatorial Indian Ocean",
            "anomaly_target": "Critical Anomaly Zone",
        }
        parts.append(f"Basin: {sector_names.get(sector, sector)}")

        if show_currents:
            parts.append("Ocean current streamlines are VISIBLE")
        if show_tchp:
            parts.append("TCHP cyclone fuel layer is ACTIVE")

        if probed:
            parts.append(f"Probed location: {probed.get('lat', 0):.2f} N, {probed.get('lon', 0):.2f} E")
        if selected_profile:
            parts.append(f"Selected sensor: #{selected_profile}")

        return " | ".join(parts)

    def _fallback_chat(self, user_message: str, context_str: str) -> str:
        q = user_message.lower().strip()

        if any(w in q for w in ["hello", "hi", "hey", "namaste", "help"]):
            return (
                "Welcome to OCEAN-X! I'm your ocean science guide. "
                "This 3D globe shows real ocean data from India's seas — temperature, saltiness, currents, and hidden cyclone fuel.\n\n"
                "Here's what you can explore:\n"
                "- **Spin the globe** by clicking and dragging\n"
                "- **Click any glowing dot** to inspect a robotic ocean sensor\n"
                "- **Use the depth slider** at the bottom to dive underwater (0m to 500m)\n"
                "- **Press D** to see live real-time ocean predictions\n"
                "- Try asking me: 'What is TCHP?' or 'Why do cyclones intensify?'"
            )

        if any(w in q for w in ["cyclone", "storm", "hurricane", "intensif", "amphan", "fani"]):
            return (
                "Cyclones are heat engines — they drink warm ocean water like fuel.\n\n"
                "Here's the dangerous part: When a cyclone stirs up the ocean, it normally brings up cold water from below, which weakens it. "
                "But if there's a hidden pool of hot water 100 meters deep (a subsurface heatwave), stirring it up actually FEEDS the cyclone more heat! "
                "That's how storms like Cyclone Amphan jumped from Category 1 to Category 5 in just 18 hours.\n\n"
                "Press **4** on your keyboard to jump to the anomaly zone and see the hidden heat yourself."
            )

        if any(w in q for w in ["argo", "float", "robot", "buoy", "sensor", "dot", "glow"]):
            return (
                "Those glowing dots are real ocean robots!\n\n"
                "**Argo floats** are basketball-sized cylinders that sink 2,000 meters into the pitch-black ocean abyss. "
                "They drift with the currents for 10 days, then slowly float back to the surface while measuring temperature and saltiness at every depth. "
                "When they surface, they transmit data to satellites — like sending a text message from the middle of the ocean!\n\n"
                "Click any dot to see what that robot measured vs what the supercomputer predicted."
            )

        if any(w in q for w in ["tchp", "heat potential", "fuel", "energy", "battery"]):
            return (
                "**TCHP = Tropical Cyclone Heat Potential** — think of it as the ocean's battery charge!\n\n"
                "It measures all the heat stored in the ocean above 26 degrees C. The deeper the warm water goes, the higher the TCHP.\n\n"
                "- Below 40 kJ/cm2 — Normal, cyclones weaken here\n"
                "- 40-80 kJ/cm2 — Moderate, cyclones can sustain strength\n"
                "- Above 80 kJ/cm2 — DANGER ZONE — cyclones can rapidly intensify overnight\n\n"
                "Toggle the TCHP layer to see these zones on the globe."
            )

        if any(w in q for w in ["satellite", "see underwater", "blind", "skin", "surface only"]):
            return (
                "Satellites have a massive blind spot — they can only see the top 1 millimeter of the ocean!\n\n"
                "They use infrared cameras from space, but ocean water absorbs infrared light almost instantly. "
                "So when weather forecasts say 'sea surface temperature is 28 degrees', they're measuring a layer thinner than a sheet of paper.\n\n"
                "But cyclone fuel is trapped 50-200 meters DEEP. That's why robot floats are critical — they're the only way to measure what's actually happening underwater."
            )

        if any(w in q for w in ["depth", "deep", "meter", "thermocline", "dive", "slider", "subsurface"]):
            return (
                "The ocean has layers, like a cake!\n\n"
                "- **0m (Surface)**: Where ships sail. Satellites see this. Warm (28-30 degrees C).\n"
                "- **50-150m (Thermocline)**: Where warm meets cold. THIS is where hidden cyclone fuel hides.\n"
                "- **200-500m (Deep Ocean)**: Cold, dark, stable. 7-12 degrees C.\n\n"
                "Use the **depth slider** at the bottom of the screen to slice through these layers. "
                "Or try the Guided Tours for an automatic deep dive!"
            )

        if any(w in q for w in ["salt", "salin", "fresh", "river", "ganga", "brahmaputra"]):
            return (
                "The Ganga and Brahmaputra rivers pour billions of liters of fresh water into the Bay of Bengal. "
                "Since fresh water is lighter than salty water, it sits on top like oil on water.\n\n"
                "This 'freshwater blanket' prevents wind from mixing the ocean layers, TRAPPING scalding hot water underneath! "
                "This is why the Bay of Bengal is more cyclone-prone than the Arabian Sea — the river water locks in the heat."
            )

        if any(w in q for w in ["incois", "who", "government", "ministry", "sih", "made"]):
            return (
                "**INCOIS** (Indian National Centre for Ocean Information Services) is India's ocean intelligence headquarters in Hyderabad.\n\n"
                "They protect India's 7,500 km coastline by:\n"
                "- Running the **National Tsunami Warning Centre**\n"
                "- Issuing daily fishing zone advisories to 4+ million fishermen\n"
                "- Forecasting cyclone ocean conditions for the Navy and Coast Guard\n"
                "- Managing India's network of ocean observation robots\n\n"
                "OCEAN-X was built for INCOIS under Smart India Hackathon 2026."
            )

        if any(w in q for w in ["current", "flow", "stream", "arrow", "moving", "ribbon"]):
            return (
                "Those animated flowing lines represent massive ocean currents moving trillions of liters of water.\n\n"
                "In the Indian Ocean, currents actually REVERSE DIRECTION twice a year because of the monsoon winds — "
                "flowing clockwise in summer and counter-clockwise in winter!\n\n"
                "Currents matter because they carry heat, nutrients, and fish. Press **C** to toggle currents on and off."
            )

        if any(w in q for w in ["how to", "use", "navigate", "control", "operate", "tutorial"]):
            return (
                "Here's how to use OCEAN-X:\n\n"
                "**Mouse:** Drag to spin globe, scroll to zoom, right-click to inspect a point, click dots for sensor data.\n\n"
                "**Keyboard Shortcuts:**\n"
                "- **D** — Live ocean data & 72-hour predictions\n"
                "- **C** — Toggle ocean currents\n"
                "- **1-5** — Jump to different ocean basins\n"
                "- **T** — Vertical cross-section tool\n"
                "- **B** — Scientific mission briefing\n"
                "- **G** — Toggle this AI Guide\n\n"
                "**Bottom Bar:** Depth slider to dive underwater, time slider to see ocean changes over time!"
            )

        if any(w in q for w in ["real-time", "realtime", "live", "prediction", "forecast", "wave", "72"]):
            return (
                "Press **D** or click **LIVE DATA** in the top bar to open real-time ocean predictions.\n\n"
                "It shows live wave heights, current speeds, and a 72-hour prediction graph. "
                "You can scrub through future hours to see predicted conditions. "
                "Data comes from the Open-Meteo Marine API, updated every 5 minutes!"
            )

        if any(w in q for w in ["anomaly", "error", "wrong", "mismatch", "difference", "gap"]):
            return (
                "The supercomputer model predicted water temperature, but the Argo robots sometimes measure something DIFFERENT.\n\n"
                "OCEAN-X runs a live fleet-wide analysis comparing every Argo profile against the model and ranks the largest gaps. "
                "The worst offender gets flagged on the globe with a red marker — a hidden heatwave the model missed.\n\n"
                "Press **4** on your keyboard to jump to the current top anomaly zone and see the model vs reality comparison."
            )

        if any(w in q for w in ["fish", "life", "save", "important", "why", "impact", "people"]):
            return (
                "This platform can save lives!\n\n"
                "1. **Cyclone Early Warning**: Detecting hidden heat pools BEFORE a cyclone reaches them gives extra evacuation time.\n"
                "2. **Fisherman Safety**: Wave and current predictions help millions of fishermen avoid dangerous waters.\n"
                "3. **Accurate Forecasts**: Comparing model predictions with robot measurements fixes errors in weather models.\n\n"
                "Cyclone Amphan's rapid intensification in 2020 killed 128 people. Better subsurface monitoring could have provided earlier warnings."
            )

        return (
            f"Great question! Here's what's on your screen right now:\n\n"
            f"{context_str}\n\n"
            "This platform lets you explore India's oceans in 3D — seeing both satellite surface data AND deep underwater robot measurements. "
            "The key insight is that **hidden heat 100m below the surface** is what makes cyclones suddenly explode.\n\n"
            "Try asking me about cyclones, Argo floats, TCHP, depth layers, or how to navigate! "
            "Or click the **Guided Tours** tab for interactive walkthroughs."
        )
