import re
import json

def extract_json(text):
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        return match.group(0)
    return text.strip()

# Mock responses
resp1 = "Sure! Here is the JSON:\n```json\n{\"root\": {\"label\": \"Root\", \"children\": []}}\n```\nHope this helps!"
resp2 = "{\"root\": {\"label\": \"Root\", \"children\": []}}"
resp3 = "Some conversational text. {\"root\": {\"label\": \"Root\", \"children\": []}} and some more text."

for r in [resp1, resp2, resp3]:
    clean = extract_json(r)
    try:
        data = json.loads(clean)
        print(f"PASS: {data['root']['label']}")
    except Exception as e:
        print(f"FAIL: {e}")
        print(f"Cleaned output: '{clean}'")
