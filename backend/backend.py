import json
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from agent import graph, MAX_ROUNDS

app = FastAPI(title="Multi-Agent Debate API")

class DebateRequest(BaseModel):
    thread_id: str
    topic: str
    force_stop: bool
    is_new: bool

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://multi-agent-debate-system-eta.vercel.app"], # Replace with your React app's URL if different
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/stream_debate")
async def stream_debate(req: DebateRequest):
    config = {"configurable": {"thread_id": req.thread_id}}
    
    if req.is_new:
        initial_state = {"topic": req.topic, "turns_count": 0, "should_stop": req.force_stop}
    else:
        graph.update_state(config, {"should_stop": req.force_stop})
        initial_state = None

    def event_generator():
        for event in graph.stream(initial_state, config=config, stream_mode="updates"):
            for node_name, state_update in event.items():
                if "messages" in state_update and len(state_update["messages"]) > 0:
                    latest_msg = state_update["messages"][-1]
                    
                    if latest_msg.content:
                        raw_content = latest_msg.content
                        if isinstance(raw_content, list):
                            content_str = "".join([b.get("text", "") if isinstance(b, dict) else str(b) for b in raw_content])
                        else:
                            content_str = str(raw_content)

                        payload = {
                            "node": node_name,
                            "name": latest_msg.name or node_name,
                            "content": content_str, # Use the safe string here
                            "verdict": state_update.get("verdict", ""),
                            "should_stop": state_update.get("should_stop", False) or state_update.get("turns_count", 0) >= MAX_ROUNDS
                        }
                        yield json.dumps(payload) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=True)