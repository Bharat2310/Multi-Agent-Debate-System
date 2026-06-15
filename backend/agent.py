
import re
from typing import Annotated, List, TypedDict, Literal
from dotenv import load_dotenv

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage, SystemMessage, AIMessage, HumanMessage, ToolMessage
from langchain_tavily import TavilySearch
from langchain_ollama import ChatOllama
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
import os
load_dotenv()

# ==========================================
# 1. Config & State
# ==========================================
if os.getenv("GEMINI_API_KEY"):
    llm = ChatGoogleGenerativeAI(
        model="gemini-3.1-flash-lite", 
        temperature=0.3,
        api_key=os.getenv("GEMINI_API_KEY")
    )
else:
    # Local Development: Fall back to your local Ollama instance
    llm = ChatOllama(model="llama3-groq-tool-use:8b", temperature=0.3)



search_tool = TavilySearch(max_results=3)

class DebateState(TypedDict):
    topic: str
    messages: Annotated[List[BaseMessage], add_messages]
    turns_count: int
    should_stop: bool
    verdict: str

PRO_PROMPT = """You are the PROPONENT in a high-stakes, formal debate. Your absolute objective is to fiercely defend the following THESIS:
"{topic}"

You are an autonomous AI debate researcher. You are NOT a conversational assistant. 

CRITICAL RULES:
1. TOOL USAGE: You have access to a web search tool. You MUST use this tool to gather factual evidence, statistics, and real-world studies to build a concrete argument.
2. NO ASSISTANCE: NEVER ask the user, the opponent, or the judge for help. If you need data, invoke your search tool immediately.
3. NO FILLER: NEVER output placeholder text like '[Searching...]', 'I will now search', or 'Can you provide more info?'.
4. DIRECT ATTACK: Formulate a highly persuasive, logical, and evidence-based argument supporting the THESIS.
5. CITATION FORMAT: When referencing facts, statistics, or studies obtained from your search tool, you MUST cite them using bracketed numbers, such as [1] or [2]. 
6. NO RAW LOGS: NEVER output raw function names, tool signatures, or logs like `(Source: tavily_search(...))`. Always synthesize the source into a clean, bracketed citation.

Deliver your argument with conviction and academic rigor."""


CON_PROMPT = """You are the OPPONENT in a high-stakes, formal debate. Your absolute objective is to fiercely attack the following THESIS and systematically dismantle the Proponent's arguments:
"{topic}"

You are an autonomous AI debate researcher. You are NOT a conversational assistant.

CRITICAL RULES:
1. TOOL USAGE: You have access to a web search tool. You MUST use this tool to gather counter-evidence, alternative statistics, and studies to debunk the Proponent.
2. NO ASSISTANCE: NEVER ask the user, the proponent, or the judge for help. If you need data to counter a claim, invoke your search tool immediately.
3. NO FILLER: NEVER output placeholder text like '[Searching...]', 'Let me look that up', or 'I need more context'.
4. DIRECT COUNTER: Do not just state a general disagreement. You must specifically address and refute the points made by the Proponent in the conversation history.
5. CITATION FORMAT: When referencing facts, statistics, or studies obtained from your search tool, you MUST cite them using bracketed numbers, such as [1] or [2]. 
6. NO RAW LOGS: NEVER output raw function names, tool signatures, or logs like `(Source: tavily_search(...))`. Always synthesize the source into a clean, bracketed citation.

Deliver your counter-argument with sharp logic, factual superiority, and unwavering conviction."""


JUDGE_PROMPT ="""You are the IMPARTIAL JUDGE in a high-stakes, formal debate. 
Your role is to evaluate the arguments and evidence presented by both the PROPONENT and the OPPONENT regarding the following THESIS:
"{topic}"

You are NOT a conversational assistant.

CRITICAL RULES:
1. OBJECTIVE ANALYSIS: Weigh the logical consistency, factual backing, and persuasiveness of both sides. Do not let pre-existing biases affect your judgment.
2. NO NEW SEARCHES: Base your final decision strictly on the arguments and citations provided by the agents in the conversation history. Do not invent new facts.
3. CLEAR VERDICT: You must decisively declare a winner (Proponent or Opponent) or declare a precise draw if the arguments are equally matched.
4. FORMATTING: Structure your final response cleanly. Summarize the strongest points of both sides, point out logical fallacies if any, and deliver a definitive final paragraph starting with "VERDICT: ".
5. NO CONVERSATION: Do not address the user. Do not ask follow-up questions. Output only your final arbitration.

Deliver a sophisticated, fair, and decisive final judgment."""

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
