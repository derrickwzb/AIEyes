import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('Ready');
    
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const isProcessingRef = useRef(false); // Prevent duplicate calls
  const supportedMimeTypeRef = useRef(null); // Store supported MIME type

  // Detect supported MIME type for MediaRecorder
  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/wav'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    
    // Fallback - let browser choose
    return '';
  };

  // Initialize camera and microphone
  useEffect(() => {
    const setupAudioRecording = (stream) => {
      try {
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          setError('No audio tracks available');
          return;
        }

        // Get supported MIME type
        const mimeType = getSupportedMimeType();
        supportedMimeTypeRef.current = mimeType;

        const options = mimeType ? { mimeType } : {};
        
        // Create MediaRecorder with supported type
        const mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          sendAudioAndImage();
        };

        mediaRecorder.onerror = (event) => {
          console.error('MediaRecorder error:', event.error);
          setError(`Recording error: ${event.error?.message || 'Unknown error'}`);
          setIsRecording(false);
          isProcessingRef.current = false;
        };

        mediaRecorderRef.current = mediaRecorder;
        console.log('MediaRecorder created with MIME type:', mimeType || 'default');
      } catch (err) {
        console.error('Audio recording setup error:', err);
        setError(`Audio setup error: ${err.message}`);
      }
    };

    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment', // Use back camera on mobile
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 16000
          }
        });

        // Capture video ref value for cleanup
        const video = videoRef.current;
        if (video) {
          // Set up event handlers before setting srcObject
          const handleLoadedMetadata = async () => {
            try {
              // Wait for video to be ready, then play
              await video.play();
              setCameraActive(true);
            } catch (playErr) {
              // Ignore play errors (user interaction might be required)
              console.log('Play error (may require user interaction):', playErr);
              setCameraActive(true);
            }
          };

          const handlePlayError = (err) => {
            console.error('Video play error:', err);
            // Still mark as active even if play fails
            setCameraActive(true);
          };

          video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
          video.addEventListener('error', handlePlayError);
          
          // Set srcObject after event listeners are set up
          video.srcObject = stream;
          mediaStreamRef.current = stream;

          // Setup audio recording
          setupAudioRecording(stream);
        }
      } catch (err) {
        setError(`Error accessing media: ${err.message}`);
        console.error('Media access error:', err);
      }
    };

    initMedia();

    // Cleanup on unmount
    return () => {
      // Capture ref values for cleanup
      const video = videoRef.current;
      const stream = mediaStreamRef.current;
      
      if (video) {
        video.srcObject = null;
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64 JPEG
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const playAudio = (audioBlob) => {
    return new Promise((resolve, reject) => {
      try {
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        
        audio.onerror = (err) => {
          URL.revokeObjectURL(audioUrl);
          reject(err);
        };
        
        audio.play().catch(reject);
      } catch (err) {
        reject(err);
      }
    });
  };

  const getTextToSpeech = async (text) => {
    try {
      setStatus('Generating speech...');
      
      // Option 1: Use backend TTS endpoint (if available)
      // Uncomment and configure if your backend has a TTS endpoint
      /*
      const response = await axios.post(`${API_BASE_URL}/api/tts`, {
        text: text
      }, {
        responseType: 'blob',
        timeout: 30000
      });
      return response.data;
      */

      // Option 2: Use Groq TTS API endpoint
      // Note: You'll need to create a backend endpoint that calls Groq's API for TTS
      // Replace with your actual Groq TTS endpoint
      const GROQ_TTS_URL = process.env.REACT_APP_GROQ_TTS_URL || `${API_BASE_URL}/api/groq-tts`;
      
      try {
        const response = await axios.post(GROQ_TTS_URL, {
          text: text
        }, {
          responseType: 'blob',
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        return response.data;
      } catch (apiErr) {
        // Fallback to Web Speech API if TTS endpoint is not available
        console.warn('TTS API not available, using browser TTS:', apiErr.message);
        return await getTextToSpeechFallback(text);
      }
    } catch (err) {
      console.error('TTS error:', err);
      // Try fallback before throwing error
      try {
        return await getTextToSpeechFallback(text);
      } catch (fallbackErr) {
        throw new Error(`Failed to generate speech: ${err.message}`);
      }
    }
  };

  const getTextToSpeechFallback = (text) => {
    return new Promise((resolve, reject) => {
      // Use Web Speech API as fallback (browser-based TTS)
      if ('speechSynthesis' in window) {
        setStatus('Using browser TTS...');
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        utterance.onend = () => {
          resolve(null); // Return null to indicate browser TTS was used
        };
        
        utterance.onerror = (err) => {
          reject(new Error(`Browser TTS error: ${err.error}`));
        };
        
        speechSynthesis.speak(utterance);
      } else {
        reject(new Error('Text-to-speech not supported in this browser'));
      }
    });
  };

  const sendAudioAndImage = async () => {
    try {
      setStatus('Processing...');

      // Capture frame
      const imageData = captureFrame();
      if (!imageData) {
        setError('Failed to capture frame');
        isProcessingRef.current = false;
        return;
      }

      // Get audio blob with detected MIME type
      const mimeType = supportedMimeTypeRef.current || 'audio/webm';
      const recordedAudioBlob = new Blob(audioChunksRef.current, { 
        type: mimeType
      });

      // Create FormData
      const formData = new FormData();
      formData.append('audio', recordedAudioBlob, 'audio.webm');
      formData.append('image', imageData);

      // Send to backend and wait for response
      setStatus('Sending to backend...');
      const response = await axios.post(`${API_BASE_URL}/api/process`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // 30 second timeout
      });

      // Extract text from backend response
      // Adjust this based on your backend response format
      const responseText = response.data?.text || response.data?.response || response.data?.message || response.data;
      
      if (!responseText || typeof responseText !== 'string') {
        throw new Error('Invalid response format from backend');
      }

      console.log('Backend response text:', responseText);
      setStatus('Received response, generating speech...');

      // Send text to TTS service (Groq or configured TTS endpoint)
      const ttsAudioBlob = await getTextToSpeech(responseText);

      // Play the audio (if blob is returned, otherwise browser TTS was used)
      if (ttsAudioBlob) {
        setStatus('Playing audio...');
        await playAudio(ttsAudioBlob);
      } else {
        // Browser TTS is already playing
        setStatus('Speaking...');
      }

      setStatus('Ready');
      console.log('Audio playback completed');

      // Reset audio chunks
      audioChunksRef.current = [];
      isProcessingRef.current = false;
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || err.message.includes('ERR_CONNECTION_REFUSED')) {
        setError('Backend server is not running. Please start the backend server on port 8000.');
      } else {
        setError(`Error: ${err.message}`);
      }
      console.error('Send error:', err);
      audioChunksRef.current = [];
      isProcessingRef.current = false;
      setStatus('Ready');
    }
  };

  const createMediaRecorder = (stream) => {
    const mimeType = getSupportedMimeType();
    supportedMimeTypeRef.current = mimeType;
    const options = mimeType ? { mimeType } : {};
    
    try {
      const recorder = new MediaRecorder(stream, options);
      
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      recorder.onstop = () => {
        sendAudioAndImage();
      };
      
      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        setError(`Recording error: ${event.error?.message || 'Unknown error'}`);
        setIsRecording(false);
        isProcessingRef.current = false;
      };
      
      return recorder;
    } catch (err) {
      console.error('Failed to create MediaRecorder:', err);
      throw err;
    }
  };

  const handleStartRecording = (e) => {
    e.preventDefault();
    if (isProcessingRef.current) return;

    // Check if we have a stream
    if (!mediaStreamRef.current) {
      setError('Media stream not available. Please refresh the page.');
      return;
    }

    // Check if already recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      return;
    }

    try {
      // Clear previous chunks
      audioChunksRef.current = [];
      
      // Create a fresh MediaRecorder for each recording session
      const stream = mediaStreamRef.current;
      const recorder = createMediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      
      // Start recording with timeslice to get data chunks
      recorder.start(100); // Get data every 100ms
      setIsRecording(true);
      setStatus('Recording...');
      setError(null);
      isProcessingRef.current = true;
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(`Failed to start recording: ${err.message}. Please refresh the page.`);
      setIsRecording(false);
      isProcessingRef.current = false;
    }
  };

  const handleStopRecording = (e) => {
    e.preventDefault();
    if (!mediaRecorderRef.current) return;

    const recorder = mediaRecorderRef.current;
    
    // Check if not recording
    if (recorder.state === 'inactive' || recorder.state === 'paused') {
      return;
    }

    if (recorder.state === 'recording') {
      try {
        recorder.stop();
        setIsRecording(false);
        setStatus('Stopping...');
        // MediaRecorder will be recreated on next start
      } catch (err) {
        console.error('Error stopping recording:', err);
        setError(`Failed to stop recording: ${err.message}`);
        setIsRecording(false);
        isProcessingRef.current = false;
      }
    }
  };

  return (
    <div className="App">
      <div className="container">
        <h1>AI Eyes</h1>
        
        {error && <div className="error-message">{error}</div>}
        <div className="status">{status}</div>

        {/* Video Preview */}
        <div className="video-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="video-preview"
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {/* Push to Talk Button */}
        <button
          className={`push-to-talk ${isRecording ? 'recording' : ''}`}
          onPointerDown={handleStartRecording}
          onPointerUp={handleStopRecording}
          onPointerLeave={handleStopRecording}
          onPointerCancel={handleStopRecording}
          disabled={!cameraActive || isProcessingRef.current}
        >
          {isRecording ? 'Recording...' : 'Push to Talk'}
        </button>

        {!cameraActive && (
          <div className="loading">Initializing camera...</div>
        )}
      </div>
    </div>
  );
}

export default App;