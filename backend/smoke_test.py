import json

import requests

BASE = "http://127.0.0.1:8000/api"
out = {}

out["health"] = requests.get(f"{BASE}/health").json()
out["stats"] = requests.get(f"{BASE}/cards/stats").json()

cards = requests.get(f"{BASE}/cards").json()
out["card_count"] = len(cards)
out["first_card_title"] = cards[0]["title"] if cards else None

search = requests.post(
    f"{BASE}/search", json={"query": "邀请奖励 防刷 成本", "top_k": 5}
).json()
out["search_top"] = [
    {"title": h["card"]["title"], "score": h["score"]} for h in search
]

risk = requests.post(
    f"{BASE}/risk-check",
    json={
        "requirement": "邀请奖励功能：老用户邀请新用户，双方各得现金奖励",
        "context": "面向新用户拉新，预算有限",
        "top_k": 5,
    },
).json()
out["risk_matched"] = [
    {"id": m["id"], "title": m["title"], "similarity": m["similarity"]}
    for m in risk.get("matched_failures", [])
]
out["risk_alerts"] = risk.get("risk_alerts", [])
out["risk_checklist"] = risk.get("pre_launch_checklist", [])
out["risk_questions"] = risk.get("questions_to_think", [])
out["risk_llm_used"] = risk.get("llm_used")

with open("smoke_result.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print("health:", out["health"])
print("card_count:", out["card_count"])
print("search hits:", len(out["search_top"]))
print("risk matched:", len(out["risk_matched"]))
print("risk checklist items:", len(out["risk_checklist"]))
print("wrote smoke_result.json")
