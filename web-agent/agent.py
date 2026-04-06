import os
import asyncio
from datetime import datetime
from typing import TypedDict, Annotated
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_core.tools import tool
from tavily import TavilyClient
from dotenv import load_dotenv

load_dotenv()

# We will use Tavily for search since DDGS is inefficient and blocks requests.
# Tavily is a search engine built specifically for AI agents: fast, accurate, and reliable.
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]

@tool
def robust_web_search(query: str) -> str:
    """
    Perform an accurate, real-time web search for the given query.
    Returns summarized and highly accurate results.
    """
    if not TAVILY_API_KEY:
        return "Error: TAVILY_API_KEY is not set. Please provide the key for accurate web search."
    
    print(f"DEBUG LOG: [robust_web_search] Called with query: '{query}'")
    try:
        # Provide efficient and quick web search
        client = TavilyClient(api_key=TAVILY_API_KEY)
        response = client.search(
            query=query,
            search_depth="advanced", # Uses advanced depth to ensure maximum accuracy
            max_results=10,
            include_answer=False, # Disable synthesized answer to avoid stale/cached AI summaries
            include_raw_content=True,
            include_images=False,
        )
        
        results = response.get("results", [])
        
        print(f"DEBUG LOG: [robust_web_search] Data source used: Tavily. Results found: {len(results)}. Timestamp: {datetime.now().isoformat()}")
        
        # Format results concisely to fit within LLM context for quick reasoning
        formatted = ["Search Results:"]
            
        for i, res in enumerate(results, 1):
            source_info = f"Source [{i}]: {res.get('title')}\nURL: {res.get('url')}\nSummary: {res.get('content')}"
            if res.get('published_date'):
                source_info += f"\nPublished Date: {res.get('published_date')}"
            formatted.append(source_info)
            
        return "\n\n".join(formatted)
        
    except Exception as e:
        print(f"DEBUG LOG: [robust_web_search] Search failed: {str(e)}")
        return "Unable to fetch latest data right now. Please try again."

class WebSearchAgent:
    def __init__(self):
        # Using a low temperature for strict accuracy in answering
        self.llm = ChatOpenAI(
            api_key=OPENAI_API_KEY,
            base_url="https://openrouter.ai/api/v1",
            model="gpt-4o-mini",
            temperature=0.1, 
        )
        self.tools = [robust_web_search]
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        
        graph = StateGraph(AgentState)
        graph.add_node("agent", self.agent_node)
        graph.add_edge(START, "agent")
        graph.add_edge("agent", END)
        self.agent = graph.compile()

    async def agent_node(self, state: AgentState):
        messages = list(state["messages"])
        now_dt = datetime.now()
        current_date_str = now_dt.strftime("%A, %B %d, %Y, %I:%M %p")

        # REAL-TIME TRIGGER CHECK
        real_time_keywords = ["latest", "today", "current", "2026", "now", "updated"]
        last_user_query = ""
        for m in reversed(messages):
            if isinstance(m, HumanMessage):
                last_user_query = str(m.content).lower()
                break
        
        is_real_time_query = any(kw in last_user_query for kw in real_time_keywords)
        
        # System instructions configured for optimal accuracy, time constraints, and moderate description
        sys_msg = SystemMessage(
            content=(
                f"You are an efficient and highly accurate Web Search Agent. Today is {current_date_str}.\n"
                "### REAL-TIME DATA ENFORCEMENT (CRITICAL)\n"
                f"1. For any query involving news, sports results (IPL 2026), stocks, or weather, you MUST use 'robust_web_search'.\n"
                "2. FORMULATE QUERIES: Always include the current year (2026) and today's date in your search strings.\n"
                "3. DATE VERIFICATION: You MUST cross-check 'Published Date' in results. If results are from 2024/2025, inform the user you could only find old data.\n"
                "4. NO INTERNAL MEMORY: DO NOT reuse cached, hardcoded, or training-based responses for dynamic data.\n"
                "5. NO HALLUCINATION: If 'robust_web_search' fails or results are stale, return: 'Unable to fetch latest data right now. Please try again.'\n"
                f"6. RESPONSE PREFIX: Every response MUST begin with: 'As of {current_date_str}, here is the latest data:' followed by your findings.\n\n"
                "Constraints & Guidelines:\n"
                "1. Provide a moderate description for your answers. Do not be excessively verbose, but explain the core facts fully.\n"
                "2. Prioritize accuracy above all else. Base your response purely on the search results you retrieve.\n"
                "3. Work quickly. Synthesize the tool responses directly without making multiple repetitive search loops.\n"
                "4. Cite sources (e.g. [1], [2]) if providing factual claims.\n"
            )
        )

        if is_real_time_query:
            messages.append(SystemMessage(content=f"URGENT: This query requires fresh 2026 data. Formulate a search that includes '2026' and today's date '{current_date_str}'. Verify results relate to 2026."))
        
        # Limit steps to max 3 iterations to ensure fast execution time (< 1 min)
        steps = 0
        while steps < 3: 
            response = await self.llm_with_tools.ainvoke([sys_msg] + messages)
            
            if not getattr(response, "tool_calls", None):
                return {"messages": [response]}
                
            messages.append(response)
            
            for call in response.tool_calls:
                if call["name"] == "robust_web_search":
                    query = call["args"].get("query")
                    # Execute tool call sync to async
                    tool_res = await asyncio.to_thread(robust_web_search.invoke, {"query": query})
                    messages.append(ToolMessage(content=tool_res, tool_call_id=call["id"]))
            
            steps += 1
            
        # Fallback if loops exceeded (prevents long waiting times)
        return {"messages": [SystemMessage(content="Finalizing to prevent timeouts due to maximum search depth.")]}

    async def query(self, user_prompt: str) -> str:
        """
        Public method to invoke the web search agent.
        """
        inputs = {"messages": [HumanMessage(content=user_prompt)]}
        result = await self.agent.ainvoke(inputs)
        return result["messages"][-1].content

# Async testing entry point
if __name__ == "__main__":
    async def main():
        agent = WebSearchAgent()
        print("Running web search agent...")
        ans = await agent.query("What are the latest breakthroughs in fusion energy?")
        print("\n=== Output ===")
        print(ans)

    asyncio.run(main())
