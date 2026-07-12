import urllib.request
import json

# Your Google Apps Script Web App URL
API_URL = "https://script.google.com/macros/s/AKfycbxwTFHNFzMQvNrf58H1ewtfQf8MoiE2yaqyUNHnRaK35RejxD7vxuR4E_URbZ2-5MVwmA/exec"

print("=" * 50)
print("Google Apps Script Connection Test")
print("=" * 50)

# Test 1: Get Products
print("\n[TEST 1] Fetching Products...")
try:
    url = API_URL + "?action=get_products"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        final_url = response.geturl()
        raw = response.read().decode('utf-8')
        print("Final URL:", final_url)
        print("Response length:", len(raw))
        print("First 500 chars of raw response:")
        print(raw[:500])
        print()
        
        # Try to parse as JSON (strip JSONP wrapper if needed)
        cleaned = raw.strip()
        if cleaned.startswith("callback(") and cleaned.endswith(");"):
            cleaned = cleaned[len("callback("):-2]
        
        try:
            data = json.loads(cleaned)
            print("[OK] Parsed JSON:", json.dumps(data, indent=2, ensure_ascii=True))
        except json.JSONDecodeError as je:
            print("[WARN] Could not parse as JSON:", str(je))
            print("This might be an HTML login page. Check deployment settings.")
            
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.reason)
    print("Response:", e.read().decode('utf-8')[:500])
except Exception as e:
    print("Error:", str(e))

# Test 2: Get Last Prices
print("\n[TEST 2] Fetching Last Prices...")
try:
    url = API_URL + "?action=get_last_prices"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        raw = response.read().decode('utf-8')
        print("Response length:", len(raw))
        print("First 500 chars:")
        print(raw[:500])
        
        cleaned = raw.strip()
        if cleaned.startswith("callback(") and cleaned.endswith(");"):
            cleaned = cleaned[len("callback("):-2]
        
        try:
            data = json.loads(cleaned)
            print("[OK] Parsed JSON:", json.dumps(data, indent=2, ensure_ascii=True))
        except json.JSONDecodeError:
            print("[WARN] Not JSON - likely an HTML page")
            
except Exception as e:
    print("Error:", str(e))

print("\n" + "=" * 50)
