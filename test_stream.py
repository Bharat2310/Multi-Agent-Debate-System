import requests
import json

url = "http://localhost:8000/stream_debate"
payload = {
    "thread_id": "script_test",
    "topic": "Is AI doing more harm than good?",
    "force_stop": False,
    "is_new": True
}

response = requests.post(url, json=payload, stream=True)

print("🚀 Starting streaming test...\n")
for line in response.iter_lines():
    if line:
        decoded_line = line.decode("utf-8")
        try:
            # Try to parse as JSON
            data = json.loads(decoded_line)
            name = data.get("name", "Unknown")
            content = data.get("content", "")
            print(f"=== {name.upper()} ===")
            print(content)
            print("\n" + "-"*40 + "\n")
        except json.JSONDecodeError:
            print("❌ SERVER ERROR DETECTED:")
            print(decoded_line)