# Axiom: Neural Debate Engine ⚖️

Axiom is an advanced, full-stack multi-agent AI system that autonomously researches, formulates, and debates complex topics in real-time. Built with a sleek, minimalist UI, it orchestrates a live debate between an AI Proponent and Opponent, culminating in a final arbitration by an AI Judge.

## ✨ Key Features

- **Multi-Agent Orchestration:** Powered by LangGraph, three distinct AI agents (Proponent, Opponent, Judge) interact, search the web, and synthesize arguments asynchronously.
- **Real-Time Streaming:** A robust FastAPI backend streams agent thoughts and generated content chunk-by-chunk to the frontend using Server-Sent Events (SSE) / NDJSON.
- **Premium, Minimalist UX:** A highly polished React interface styled with Tailwind CSS, featuring a monochromatic zinc palette and glowing accents.
- **Intelligent Typewriter Engine:** Custom React hooks handle smooth character-by-character text streaming without stuttering or browser lag.
- **Adaptive Scroll-Lock:** Automatically keeps the live feed in view, but gracefully pauses auto-scrolling if the user scrolls up to read earlier arguments.
- **Interactive Source Citations:** An auto-parsing engine detects citation markers (e.g., `[1]`) and transforms them into interactive hover tooltips for instant fact-checking.
- **Live Status Feed:** A real-time telemetry bar that exposes the exact current state of the backend agents (e.g., "QUERYING VECTOR INDEX", "WEIGHING ARGUMENTS").

## 🛠️ Tech Stack

- **Frontend:** React, Tailwind CSS, Lucide React (Icons)
- **Backend:** FastAPI, Python
- **AI / LLM Orchestration:** LangGraph, LangChain, Local LLMs (Ollama) / External APIs

## 🚀 Getting Started

### Prerequisites

- Node.js (v16+)
- Python (3.9+)

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   npm install lucide-react
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   ```

3. Install Python dependencies:
   ```bash
   pip install fastapi uvicorn langgraph langchain
   ```

4. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

## 🎯 Usage

1. Ensure both the frontend development server and the FastAPI backend are running.
2. Open your browser to the frontend URL (usually `http://localhost:5173` or `http://localhost:3000`).
3. Enter a debatable thesis in the Configuration panel (e.g., *"Nuclear energy is the only viable solution to climate change."*).
4. Click **Initialize Debate** and watch the agents research and formulate their arguments in real-time.
