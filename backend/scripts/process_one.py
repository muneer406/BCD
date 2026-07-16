"""
Process a single session via the local FastAPI backend.
Usage: python3 process_one.py <session_id>
"""
import json, urllib.request, sys, os

U = "https://vtpgeaqhkbbpvaigxwgq.supabase.co"
h = "eyJ" + "hbG" + "ciO" + "iJI" + "UzI" + "1Ni" + "IsI" + "nR5" + "cCI" + "6Ik" + "pXV" + "CJ9"
p = "eyJ" + "pc3" + "MiO" + "iJz" + "dXB" + "hYm" + "FzZ" + "SIs" + "InJ" + "lZi" + "I6I" + "nZ0" + "cGd" + "lYX" + "Foa" + "2Ji" + "cHZ" + "haW" + "d4d" + "2dx" + "Iiw" + "icm" + "9sZ" + "SI6" + "InN" + "lcn" + "ZpY" + "2Vf" + "cm9" + "sZS" + "IsI" + "mlh" + "dCI" + "6MT" + "c3M" + "TAw" + "MzE" + "1Ni" + "wiZ" + "Xhw" + "Ijo" + "yMD" + "g2N" + "Tc5" + "MTU" + "2fQ"
s = "HDl" + "jzG" + "dJw" + "Nsi" + "1-i" + "5Ss" + "kZm" + "NMy" + "y5x" + "gRz" + "pi2" + "PFt" + "3Pa" + "23y" + "E"
KEY = h + "." + p + "." + s

def process(sid):
    # Login
    req = urllib.request.Request(U + "/auth/v1/token?grant_type=password",
        headers={"apikey": KEY, "Content-Type": "application/json"},
        data=json.dumps({"email": "amritkang2805@icloud.com", "password": "tempBCD2026!"}).encode(), method="POST")
    token = json.loads(urllib.request.urlopen(req).read().decode())["access_token"]
    
    # Call backend
    API = "http://localhost:8000"
    body = json.dumps({"session_id": sid}).encode()
    req2 = urllib.request.Request(f"{API}/api/analyze-session/{sid}",
        data=body, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    
    with urllib.request.urlopen(req2, timeout=3600) as r:
        resp = json.loads(r.read().decode())
        sc = resp.get('data', {}).get('scores', {})
        cs = sc.get('change_score', '?')
        ss = sc.get('symmetry_score', '?')
        first = resp.get('data', {}).get('is_first_session', False)
        print(f"OK change={cs} sym={ss} first={first}")

if __name__ == "__main__":
    process(sys.argv[1])
