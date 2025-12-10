from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import base64
import cv2
import numpy as np

from dotenv import load_dotenv

from assistant import Assistant

from langchain_groq import ChatGroq

from speech_recognition import Recognizer, AudioFile

load_dotenv()

#init fastapi
app  = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # set specific domains in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# initialize  model 
model = ChatGroq(model="meta-llama/llama-4-scout-17b-16e-instruct")
assistant = Assistant(model)

def speech_to_text(audio_bytes):
    recognizer = Recognizer()

    # Save audio bytes temporarily in-memory
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    # Use Whisper STT
    with AudioFile(tmp_path) as source:
        audio_data = recognizer.record(source)

    try:
        text = recognizer.recognize_whisper(audio_data, model="base", language="english")
        print("🗣️ Recognized Speech:", text)
        return text
    except Exception as e:
        print("STT Error:", e)
        return ""

def preprocess_image(img_bytes):
    # Decode raw bytes
    np_img = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(np_img, cv2.IMREAD_COLOR)

    # Resize to safe dimensions (512px max)
    height, width = img.shape[:2]
    max_dim = 512

    if max(height, width) > max_dim:
        scale = max_dim / max(height, width)
        img = cv2.resize(img, (int(width * scale), int(height * scale)))

    # Recompress to lower quality
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 60]  # 60% quality
    success, buffer = cv2.imencode(".jpg", img, encode_param)

    # Convert to base64
    return base64.b64encode(buffer).decode()

#endpoint api 

@app.post("/analyze")
async def analyze(
    audio: UploadFile = File(...),
    image: UploadFile = File(None)      # optional
):
    """
    Receives audio blob + optional image.
    Does NOT do STT or TTS.
    Calls your assistant model and returns a pure text response.
    """

    # Read audio bytes (you may parse it later if needed)
    audio_bytes = await audio.read()

    # If image provided → decode to base64
    base64_image = None
    if image is not None:
        img_bytes = await image.read()
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        _, buf = cv2.imencode(".jpeg", img)
        # base64_image = base64.b64encode(buf).decode()
        base64_image = preprocess_image(img_bytes)

    # 1. Convert audio into text
    prompt_text = speech_to_text(audio_bytes)

    # 2. Call LLM with real prompt 
    result_text = assistant.answer_backend(
        prompt=prompt_text,
        image_base64=base64_image
    )

    return {"text": result_text}