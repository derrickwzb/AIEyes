import requests

url = "http://localhost:8000/analyze"

files = {
    "audio": ("test.wav", open("test.wav", "rb")),
    "image": ("test.jpg", open("test.jpg", "rb"))
}

response = requests.post(url, files=files)

print("Status:", response.status_code)
print("Raw text:", response.text)