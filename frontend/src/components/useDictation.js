import { useEffect, useRef, useState } from "react";

// Wraps the browser's Web Speech API (SpeechRecognition) so the app can
// actually "listen" to the microphone. This runs entirely client-side;
// the transcript text is then sent to the backend for parsing/organizing.
export default function useDictation() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript + " ";
        }
      }
      if (finalText) {
        setTranscript((prev) => (prev + " " + finalText).trim());
      }
    };

    recognition.onerror = (event) => {
      setError(event.error || "Speech recognition error");
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, []);

  function start() {
    setError("");
    setTranscript("");
    if (recognitionRef.current) {
      recognitionRef.current.start();
      setListening(true);
    }
  }

  function stop() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
    }
  }

  function reset() {
    setTranscript("");
  }

  return { listening, transcript, supported, error, start, stop, reset };
}
