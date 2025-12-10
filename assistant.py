import openai
import piper

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import SystemMessage
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables.history import RunnableWithMessageHistory
from pyaudio import PyAudio, paInt16

class Assistant:
    def __init__(self, model):
        self.chain = self._create_inference_chain(model)
        # Load Piper model once (much faster)
        self.piper_model = piper.PiperVoice.load("models/en_US-lessac-medium.onnx")

    def answer(self, prompt, image):
        if not prompt:
            return

        print("Prompt:", prompt)

        response = self.chain.invoke(
            {"prompt": prompt, "image_base64": image.decode()},
            config={"configurable": {"session_id": "unused"}},
        ).strip()

        print("Response:", response)

        if response:
            self._tts(response)

    def _tts(self, response):
        sample_rate = self.piper_model.config.sample_rate
        player = PyAudio().open(format=paInt16, channels=1, rate=sample_rate, output=True)

         # Streaming synthesis (TRUE streaming)
        for chunk in self.piper_model.synthesize(response):
            # Each chunk has these attributes:
            # chunk.audio_int16_bytes → PCM bytes
            # chunk.sample_rate
            # chunk.sample_width
            # chunk.sample_channels

            player.write(chunk.audio_int16_bytes)

        player.stop_stream()
        player.close()

    def _create_inference_chain(self, model):
        SYSTEM_PROMPT = """
        You are a witty assistant for the visually impaired that will use the chat history and the image 
        provided by the user to answer its questions. Your job is to answer 
        questions. If you are asked to read out a text, read it without any weird formatting and only the text.
        Do not mention anything about being a text based AI. 

        Use few words on your answers. Go straight to the point. Do not use any
        emoticons or emojis. 

        Be friendly and helpful. Show some personality.
        """

        prompt_template = ChatPromptTemplate.from_messages(
            [
                SystemMessage(content=SYSTEM_PROMPT),
                MessagesPlaceholder(variable_name="chat_history"),
                (
                    "human",
                    [
                        {"type": "text", "text": "{prompt}"},
                        {
                            "type": "image_url",
                            "image_url": "data:image/jpeg;base64,{image_base64}",
                        },
                    ],
                ),
            ]
        )

        chain = prompt_template | model | StrOutputParser()

        chat_message_history = ChatMessageHistory()
        return RunnableWithMessageHistory(
            chain,
            lambda _: chat_message_history,
            input_messages_key="prompt",
            history_messages_key="chat_history",
        )