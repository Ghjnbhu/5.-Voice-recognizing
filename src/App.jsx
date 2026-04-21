import React, { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const recognitionRef = useRef(null)

  useEffect(() => {
    // Check if browser supports speech recognition
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Your browser does not support speech recognition. Please use Chrome, Edge, or Safari.')
      return
    }

    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    recognitionRef.current = new SpeechRecognition()
    recognitionRef.current.continuous = true
    recognitionRef.current.interimResults = true
    recognitionRef.current.lang = 'en-US'

    // Handle recognition results
    recognitionRef.current.onresult = (event) => {
      let interimTranscript = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPart + ' '
        } else {
          interimTranscript += transcriptPart
        }
      }

      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript)
      } else if (interimTranscript) {
        setTranscript(prev => prev + interimTranscript)
      }
    }

    // Handle errors
    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      let errorMessage = ''
      switch (event.error) {
        case 'not-allowed':
          errorMessage = 'Microphone access denied. Please allow microphone access and try again.'
          break
        case 'no-speech':
          errorMessage = 'No speech detected. Please try again.'
          break
        case 'audio-capture':
          errorMessage = 'No microphone found. Please connect a microphone.'
          break
        case 'network':
          errorMessage = 'Network error occurred. Please check your connection.'
          break
        default:
          errorMessage = `Error: ${event.error}`
      }
      setError(errorMessage)
      setIsListening(false)
    }

    recognitionRef.current.onend = () => {
      setIsListening(false)
    }

    // Cleanup on component unmount
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  const startListening = () => {
    if (!recognitionRef.current) {
      setError('Speech recognition not supported')
      return
    }

    setError('')
    setTranscript('')
    recognitionRef.current.start()
    setIsListening(true)
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }

  const clearText = () => {
    setTranscript('')
  }

  
  // Add at the top of your App component
useEffect(() => {
  const originalError = console.error;
  console.error = (...args) => {
    if (args[0]?.includes?.('microphone') || args[0]?.includes?.('Microphone')) {
      console.log('Caught microphone error (non-critical):', args[0]);
      return;
    }
    originalError.apply(console, args);
  };
  
  return () => {
    console.error = originalError;
  };
}, []);


  return (
    <div className="container">
      <h1>🎙️ Voice Recognition App</h1>
      <p className="subtitle">Speak into your microphone and see the text appear</p>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="button-group">
        <button 
          onClick={startListening} 
          disabled={isListening}
          className="btn btn-start"
        >
          🎤 Start Listening
        </button>
        
        <button 
          onClick={stopListening} 
          disabled={!isListening}
          className="btn btn-stop"
        >
          ⏹️ Stop Listening
        </button>
        
        <button 
          onClick={clearText}
          className="btn btn-clear"
        >
          🗑️ Clear Text
        </button>
      </div>

      <div className="status">
        Status: {isListening ? '🔴 Listening...' : '⚪ Idle'}
      </div>

      <div className="transcript-container">
        <h3>Recognized Text:</h3>
        <div className="transcript-box">
          {transcript || 'Click "Start Listening" and speak into your microphone...'}
        </div>
      </div>

      <div className="info">
        <p>💡 Tips:</p>
        <ul>
          <li>Make sure your microphone is connected and allowed</li>
          <li>Speak clearly and at a normal pace</li>
          <li>Works best in Chrome, Edge, or Safari</li>
          <li>Supports multiple languages (change the 'lang' property in code)</li>
        </ul>
      </div>
    </div>
  )
}

export default App