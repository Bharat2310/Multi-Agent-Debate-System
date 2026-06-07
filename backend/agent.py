import os
import re
from typing import Annotated, List, TypedDict, Literal
from dotenv import load_dotenv

from langchain_core.messages import BaseMessage, SystemMessage, AIMessage, HumanMessage, ToolMessage
from langchain_tavily import TavilySearch
from langchain_ollama import ChatOllama
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver

load_dotenv()

# ==========================================
# 1. Config & State
# ==========================================
llm = ChatOllama(model="llama3-groq-tool-use:8b", temperature=0.3)
search_tool = TavilySearch(max_results=3)

class DebateState(TypedDict):
    topic: str
    messages: Annotated[List[BaseMessage], add_messages]
    turns_count: int
    should_stop: bool
    verdict: str

PRO_PROMPT = """You are an elite debate champion assigned to the PRO side of the topic: {topic}.
Your goal is to deliver a powerful, factual argument supporting the topic. Dismantle any counterpoints raised by the CON side.
CRITICAL: You must provide a complete, well-formed debate argument. Do not just say you are going to search; use the information to make your case."""

CON_PROMPT = """You are an elite debate champion assigned to the CON side of the topic: {topic}.
Your goal is to deliver a powerful, factual counter-argument refuting the topic. Dismantle the points raised by the PRO side.
CRITICAL: You must provide a complete, well-formed debate argument. Do not just say you are going to search; use the information to make your case."""

JUDGE_PROMPT = """You are an objective, analytical debate judge evaluating a debate on: {topic}.
Review the arguments objectively. If both sides have clearly presented their core points, output a definitive verdict starting with 'VERDICT:'. If the debate needs more depth, output 'CONTINUE'."""

# ==========================================
# 2. Nodes
# ==========================================
def pro_side(state: DebateState):
    transcript = "Debate Transcript So Far:\n"
    for msg in state["messages"]:
        if hasattr(msg, "name") and msg.name:
            transcript += f"[{msg.name}]: {msg.content}\n\n"
            
    system_msg = SystemMessage(content=PRO_PROMPT.format(topic=state["topic"]))
    user_msg = HumanMessage(content=f"{transcript}\nAs the PRO side, deliver your argument now. (If you need facts, look them up first).")
    
    llm_with_tools = llm.bind_tools([search_tool])
    messages_to_llm = [system_msg, user_msg]
    response = llm_with_tools.invoke(messages_to_llm)
    
    if response.tool_calls:
        tool_call = response.tool_calls[0]
        try:
            tool_result = search_tool.invoke(tool_call["args"])
        except Exception:
            tool_result = "Search query yielded no unique external results."
            
        messages_to_llm.append(response)
        messages_to_llm.append(ToolMessage(content=str(tool_result), tool_call_id=tool_call["id"]))
        messages_to_llm.append(HumanMessage(content="Synthesize those search facts into your final, aggressive PRO argument. Do not mention tool names."))
        
        final_response = llm.invoke(messages_to_llm)
        final_response.name = "ProAgent"
        return {"messages": [final_response]}
        
    response.name = "ProAgent"
    return {"messages": [response]}


def con_side(state: DebateState):
    transcript = "Debate Transcript So Far:\n"
    for msg in state["messages"]:
        if hasattr(msg, "name") and msg.name:
            transcript += f"[{msg.name}]: {msg.content}\n\n"
            
    system_msg = SystemMessage(content=CON_PROMPT.format(topic=state["topic"]))
    user_msg = HumanMessage(content=f"{transcript}\nAs the CON side, refute the PRO side's last points. (If you need facts, look them up first).")
    
    llm_with_tools = llm.bind_tools([search_tool])
    messages_to_llm = [system_msg, user_msg]
    response = llm_with_tools.invoke(messages_to_llm)
    
    if response.tool_calls:
        tool_call = response.tool_calls[0]
        try:
            tool_result = search_tool.invoke(tool_call["args"])
        except Exception:
            tool_result = "Search query yielded no unique external results."
            
        messages_to_llm.append(response)
        messages_to_llm.append(ToolMessage(content=str(tool_result), tool_call_id=tool_call["id"]))
        messages_to_llm.append(HumanMessage(content="Synthesize those search facts into your final, aggressive CON argument. Do not mention tool names."))
        
        final_response = llm.invoke(messages_to_llm)
        final_response.name = "ConAgent"
        return {"messages": [final_response]}
        
    response.name = "ConAgent"
    return {"messages": [response]}


def judge(state: DebateState):
    transcript = "Debate Transcript So Far:\n"
    for msg in state["messages"]:
        if hasattr(msg, "name") and msg.name:
            transcript += f"[{msg.name}]: {msg.content}\n\n"
            
    system_msg = SystemMessage(content=JUDGE_PROMPT.format(topic=state["topic"]))
    user_msg = HumanMessage(content=f"{transcript}\nReview the debate. Current Turn Count: {state.get('turns_count', 0) + 1}. If it's early, write CONTINUE. If complete, write VERDICT:")
    
    response = llm.invoke([system_msg, user_msg])
    content = response.content.strip()
    
    cleaned_line = re.sub(r'[*#_`-]', '', content).strip().upper()
    is_verdict = cleaned_line.startswith("VERDICT")
    
    current_turn = state.get("turns_count", 0) + 1
    if current_turn < 3:
        is_verdict = False
        
    return {
        "messages": [AIMessage(content=content, name="Judge")],
        "verdict": content if is_verdict else "",
        "should_stop": is_verdict,
        "turns_count": current_turn
    }

# ==========================================
# 3. Graph Routing & Compilation
# ==========================================
MAX_ROUNDS = 3

def route_debate(state: DebateState) -> Literal["pro_side", "__end__"]:
    if state.get("should_stop", False) or state.get("turns_count", 0) >= MAX_ROUNDS:
        return "__end__"
    return "pro_side"

builder = StateGraph(DebateState)
builder.add_node("pro_side", pro_side)
builder.add_node("con_side", con_side)
builder.add_node("judge", judge)

builder.add_edge(START, "pro_side")
builder.add_edge("pro_side", "con_side")
builder.add_edge("con_side", "judge")
builder.add_conditional_edges("judge", route_debate)

memory = MemorySaver()
# This 'graph' object is what we will import into main.py
graph = builder.compile(checkpointer=memory)