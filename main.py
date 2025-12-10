from webcam import WebcamStream
from assistant import Assistant
import cv2
from dotenv import load_dotenv
import os

from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables.history import RunnableWithMessageHistory
# from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI

from speech_recognition import Microphone, Recognizer, UnknownValueError
from langchain_groq import ChatGroq


load_dotenv()

wc_stream = WebcamStream().start()

def audio_callback(recognizer, audio):
    try:
        prompt = recognizer.recognize_whisper(audio, model="base", language="english")
        assistant.answer(prompt, wc_stream.read(encode=True))

    except UnknownValueError:
        print("There was an error processing the audio.")



# while True:
#     cv2.imshow("webcam", wc_stream.read())
#     if cv2.waitKey(1) in [27, ord("q")]:
#         break

# wc_stream.stop()
# cv2.destroyAllWindows()

# model = ChatGoogleGenerativeAI(model= "gemini-2.5-flash")
model = ChatGroq(model="meta-llama/llama-4-scout-17b-16e-instruct", temperature=0.7)

assistant = Assistant(model)

recognizer = Recognizer()

microphone = Microphone()

with microphone as source:
    recognizer.adjust_for_ambient_noise(source)

stop_listening = recognizer.listen_in_background(microphone,audio_callback)

while True:
    cv2.imshow("webcam", wc_stream.read())
    if cv2.waitKey(1) in [27, ord("q")]:
        break

wc_stream.stop()
cv2.destroyAllWindows()
stop_listening(wait_for_stop=False)
