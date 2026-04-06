from typing import TypedDict
import os
import cv2
import requests
import base64
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from langgraph.graph import StateGraph, END


# ==================================================
# LOAD ENV VARIABLES
# ==================================================
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OCR_API_KEY = os.getenv("OCR_API_KEY")

OCR_URL = "https://api.ocr.space/parse/image"

if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY not found in .env")

if not OCR_API_KEY:
    raise ValueError("OCR_API_KEY not found in .env")


# ==================================================
# LLM CONFIG
# ==================================================
llm = ChatOpenAI(
    api_key=OPENAI_API_KEY,
    base_url="https://openrouter.ai/api/v1",
    model="openai/gpt-4o-mini",
    temperature=0,
    max_tokens=2000
)


# ==================================================
# VISION OCR (GPT-4o-mini)
# ==================================================
def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def vision_ocr_extract(image_path: str) -> str:
    """Uses GPT-4o-mini to extract handwritten text from an image."""
    base64_image = encode_image(image_path)
    
    message = HumanMessage(
        content=[
            {"type": "text", "text": "Extract all text from this handwritten exam answer. Provide only the extracted text, no explanations or headers."},
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
            },
        ]
    )
    
    response = llm.invoke([message])
    return response.content.strip()


# ==================================================
# STATE
# ==================================================
class EvalState(TypedDict):
    image_path: str
    question: str
    extracted_text: str
    evaluation: str


# ==================================================
# OCR NODE
# ==================================================
def ocr_node(state: EvalState):
    """Bypasses traditional OCR and uses GPT-4o-vision for better results."""
    text = vision_ocr_extract(state["image_path"])
    return {"extracted_text": text}


# ==================================================
# CLEANUP NODE
# ==================================================
def cleanup_node(state: EvalState):
    """Redundant since GPT-4o-mini handles OCR cleanly, but kept for flow."""
    if not state["extracted_text"]:
        return {"extracted_text": ""}
    return {"extracted_text": state["extracted_text"]}


# ==================================================
# EVALUATION NODE
# ==================================================
def evaluation_node(state: EvalState):

    prompt = f"""
You are an expert exam evaluator.

Question:
{state['question']}

Student Answer:
{state['extracted_text']}

Instructions:
1. First, generate the IDEAL CORRECT ANSWER for the question based on your general knowledge and the context of an academic exam.
2. Compare the student's answer with the ideal answer.
3. Be fair but strict. Assign a score out of 5 based on key concepts covered.
4. In the Feedback, you MUST include:
   - "Correct Answer: [Provide the ideal answer here]"
   - "Explanation: [Explain why the student's answer was correct or incorrect, and highlight missing concepts if any]"

Evaluation rules:
- Incorrect or Empty answer → score 0
- Partially correct → 1-3
- Mostly correct → 4
- Fully correct → 5

Return format:

Score: X/5
Feedback: 
Correct Answer: [Ideal Answer]
Explanation: [Detailed explanation]
"""

    response = llm.invoke(prompt)

    return {"evaluation": response.content.strip()}


# ==================================================
# GRAPH
# ==================================================
graph = StateGraph(EvalState)

graph.add_node("ocr", ocr_node)
graph.add_node("cleanup", cleanup_node)
graph.add_node("evaluate", evaluation_node)

graph.set_entry_point("ocr")

graph.add_edge("ocr", "cleanup")
graph.add_edge("cleanup", "evaluate")
graph.add_edge("evaluate", END)

app = graph.compile()


# ==================================================
# RUN
# ==================================================
if __name__ == "__main__":

    result = app.invoke({
        "image_path": "image.jpg"
    })

    print("\n--- CLEANED ANSWER ---")
    print(result["extracted_text"])

    print("\n--- EVALUATION ---")
    print(result["evaluation"])


# ==================================================
# PUBLIC FUNCTION FOR FRONTEND
# ==================================================
def evaluate_image_answer(image_path: str, question: str):

    result = app.invoke({
        "image_path": image_path,
        "question": question
    })

    return {
        "cleaned_answer": result["extracted_text"],
        "evaluation": result["evaluation"]
    }