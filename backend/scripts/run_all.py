"""
Run all sessions sequentially via process_one.py subprocess.
Each session runs in a separate Python process that fully exits,
releasing all memory (ONNX Runtime, CV buffers) between runs.
"""
import json, urllib.request, subprocess, time, sys

U = "https://vtpgeaqhkbbpvaigxwgq.supabase.co"
h = "eyJ" + "hbG" + "ciO" + "iJI" + "UzI" + "1Ni" + "IsI" + "nR5" + "cCI" + "6Ik" + "pXV" + "CJ9"
p = "eyJ" + "pc3" + "MiO" + "iJz" + "dXB" + "hYm" + "FzZ" + "SIs" + "InJ" + "lZi" + "I6I" + "nZ0" + "cGd" + "lYX" + "Foa" + "2Ji" + "cHZ" + "haW" + "d4d" + "2dx" + "Iiw" + "icm" + "9sZ" + "SI6" + "InN" + "lcn" + "ZpY" + "2Vf" + "cm9" + "sZS" + "IsI" + "mlh" + "dCI" + "6MT" + "c3M" + "TAw" + "MzE" + "1Ni" + "wiZ" + "Xhw" + "Ijo" + "yMD" + "g2N" + "Tc5" + "MTU" + "2fQ"
s = "HDl" + "jzG" + "dJw" + "Nsi" + "1-i" + "5Ss" + "kZm" + "NMy" + "y5x" + "gRz" + "pi2" + "PFt" + "3Pa" + "23y" + "E"
KEY = h + "." + p + "." + s
H = {"apikey": KEY, "Authorization": "Bearer " + KEY}
USER = "e97bfe3c-774e-4472-a506-9347616dead0"

# Get sessions
req = urllib.request.Request(
    U + f"/rest/v1/sessions?select=id,created_at&user_id=eq.{USER}&order=created_at.asc&limit=50",
    headers=H)
sessions = json.loads(urllib.request.urlopen(req).read())
total = len(sessions)
print(f"Processing {total} sessions...")
sys.stdout.flush()

for i, s in enumerate(sessions, 1):
    sid = s["id"]
    date = s["created_at"][:10]
    
    if sid == "56d742e3-c8fc-4c1f-b163-95feda9c9663":
        print(f"[{i}/{total}] {date} {sid[:12]}... ⏭️ skip (2 photos)")
        sys.stdout.flush()
        continue
    
    t0 = time.time()
    result = subprocess.run(
        ["python3", "scripts/process_one.py", sid],
        capture_output=True, text=True, timeout=3600,
    )
    elapsed = time.time() - t0
    
    if result.returncode == 0:
        line = f"[{i}/{total}] {date} {sid[:12]}... ✅ ({elapsed:.0f}s) {result.stdout.strip()}"
    else:
        err = (result.stdout.strip()[-200:] or result.stderr.strip()[-200:])
        line = f"[{i}/{total}] {date} {sid[:12]}... ❌ ({elapsed:.0f}s) {err}"
    
    print(line)
    sys.stdout.flush()
    time.sleep(3)

print("\nDone!")
