from webcam import WebcamStream
import cv2


wc_stream = WebcamStream().start()

while True:
    cv2.imshow("webcam", wc_stream.read())
    if cv2.waitKey(1) in [27, ord("q")]:
        break

wc_stream.stop()
cv2.destroyAllWindows()